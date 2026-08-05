// HASHTEAM Security Lab — SUID 签名评分检查器
//
// 职责（VM 内以 4755 root:root 安装为 /usr/local/bin/htcheck）：
//   1. run：以提交者身份运行当前关卡的 check.sh，只有退出码为 0 时才用
//      root-only 会话密钥对结果做 HMAC-SHA256 签名并输出协议行；
//      学生直接调用本程序等同于运行真实 check，无法取得未验证的签名。
//   2. level-ready：为 hashteamctl 的关卡切换签发签名协议行
//      （前端仍按顺序解锁不变量门控，签名只防伪、不授权）。
//
// 信任边界：
//   - 会话密钥 /etc/hashteam/protocol.key（0600 root，init 每次启动随机生成）。
//   - 提权生效（SUID）时忽略 HASHTEAM_LEVELS_DIR / HASHTEAM_KEY_FILE 等
//     环境变量，全部使用硬编码路径，防止学生用伪造目录替换官方 check.sh。
//   - 子进程执行 check.sh 前降权到调用者（ruid/rgid），check.sh 永不以 root 运行。
//   - 非提权（宿主机测试直接运行）时允许环境变量覆盖路径，便于沙箱测试。
//
// 本文件不依赖任何第三方库：SHA-256 / HMAC 为标准算法的最小实现，
// `htcheck selftest` 用 RFC 4231 与 FIPS 180-4 向量自检。

#include <errno.h>
#include <grp.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

/* ---------------- SHA-256（FIPS 180-4） ---------------- */

typedef struct {
    uint32_t state[8];
    uint64_t bitlen;
    uint8_t block[64];
    size_t block_used;
} sha256_ctx;

static uint32_t rotr32(uint32_t x, unsigned n) { return (x >> n) | (x << (32 - n)); }

static const uint32_t SHA256_K[64] = {
    0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u,
    0x923f82a4u, 0xab1c5ed5u, 0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u,
    0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u, 0xe49b69c1u, 0xefbe4786u,
    0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
    0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u,
    0x06ca6351u, 0x14292967u, 0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u,
    0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u, 0xa2bfe8a1u, 0xa81a664bu,
    0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
    0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au,
    0x5b9cca4fu, 0x682e6ff3u, 0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u,
    0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u,
};

static void sha256_init(sha256_ctx *ctx) {
    static const uint32_t initial[8] = {
        0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
        0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u,
    };
    memcpy(ctx->state, initial, sizeof(initial));
    ctx->bitlen = 0;
    ctx->block_used = 0;
}

static void sha256_compress(sha256_ctx *ctx, const uint8_t block[64]) {
    uint32_t w[64];
    for (int i = 0; i < 16; i++) {
        w[i] = ((uint32_t)block[i * 4] << 24) | ((uint32_t)block[i * 4 + 1] << 16) |
               ((uint32_t)block[i * 4 + 2] << 8) | (uint32_t)block[i * 4 + 3];
    }
    for (int i = 16; i < 64; i++) {
        uint32_t s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >> 3);
        uint32_t s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    uint32_t a = ctx->state[0], b = ctx->state[1], c = ctx->state[2], d = ctx->state[3];
    uint32_t e = ctx->state[4], f = ctx->state[5], g = ctx->state[6], h = ctx->state[7];
    for (int i = 0; i < 64; i++) {
        uint32_t s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
        uint32_t ch = (e & f) ^ (~e & g);
        uint32_t t1 = h + s1 + ch + SHA256_K[i] + w[i];
        uint32_t s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
        uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
        uint32_t t2 = s0 + maj;
        h = g; g = f; f = e; e = d + t1;
        d = c; c = b; b = a; a = t1 + t2;
    }
    ctx->state[0] += a; ctx->state[1] += b; ctx->state[2] += c; ctx->state[3] += d;
    ctx->state[4] += e; ctx->state[5] += f; ctx->state[6] += g; ctx->state[7] += h;
}

static void sha256_update(sha256_ctx *ctx, const void *data, size_t len) {
    const uint8_t *p = (const uint8_t *)data;
    ctx->bitlen += (uint64_t)len * 8;
    while (len > 0) {
        size_t take = 64 - ctx->block_used;
        if (take > len) take = len;
        memcpy(ctx->block + ctx->block_used, p, take);
        ctx->block_used += take;
        p += take;
        len -= take;
        if (ctx->block_used == 64) {
            sha256_compress(ctx, ctx->block);
            ctx->block_used = 0;
        }
    }
}

static void sha256_final(sha256_ctx *ctx, uint8_t out[32]) {
    uint64_t bitlen = ctx->bitlen;
    uint8_t pad = 0x80;
    sha256_update(ctx, &pad, 1);
    uint8_t zero = 0;
    while (ctx->block_used != 56) sha256_update(ctx, &zero, 1);
    uint8_t lenbuf[8];
    for (int i = 0; i < 8; i++) lenbuf[i] = (uint8_t)(bitlen >> (56 - i * 8));
    // 长度域追加刚好填满一个分组；不再触发额外的位计数问题（bitlen 已不再使用）
    ctx->bitlen = 0;
    sha256_update(ctx, lenbuf, 8);
    for (int i = 0; i < 8; i++) {
        out[i * 4] = (uint8_t)(ctx->state[i] >> 24);
        out[i * 4 + 1] = (uint8_t)(ctx->state[i] >> 16);
        out[i * 4 + 2] = (uint8_t)(ctx->state[i] >> 8);
        out[i * 4 + 3] = (uint8_t)(ctx->state[i]);
    }
}

/* ---------------- HMAC-SHA256（RFC 2104） ---------------- */

static void hmac_sha256(const uint8_t *key, size_t key_len,
                        const uint8_t *msg, size_t msg_len,
                        uint8_t out[32]) {
    uint8_t key_block[64];
    memset(key_block, 0, sizeof(key_block));
    if (key_len > 64) {
        sha256_ctx kctx;
        sha256_init(&kctx);
        sha256_update(&kctx, key, key_len);
        sha256_final(&kctx, key_block);
    } else {
        memcpy(key_block, key, key_len);
    }
    uint8_t inner_pad[64], outer_pad[64];
    for (int i = 0; i < 64; i++) {
        inner_pad[i] = key_block[i] ^ 0x36;
        outer_pad[i] = key_block[i] ^ 0x5c;
    }
    sha256_ctx ctx;
    uint8_t inner_hash[32];
    sha256_init(&ctx);
    sha256_update(&ctx, inner_pad, 64);
    sha256_update(&ctx, msg, msg_len);
    sha256_final(&ctx, inner_hash);
    sha256_init(&ctx);
    sha256_update(&ctx, outer_pad, 64);
    sha256_update(&ctx, inner_hash, 32);
    sha256_final(&ctx, out);
}

static void hex_encode(const uint8_t *bytes, size_t len, char *out) {
    static const char digits[] = "0123456789abcdef";
    for (size_t i = 0; i < len; i++) {
        out[i * 2] = digits[bytes[i] >> 4];
        out[i * 2 + 1] = digits[bytes[i] & 0x0f];
    }
    out[len * 2] = '\0';
}

/* ---------------- 终端语义着色（与 colors.sh 的 ht_render_result 一致） ---------------- */

#define COL_GREEN_BOLD "\033[1;92m"
#define COL_YELLOW "\033[1;93m"
#define COL_RED_BOLD "\033[1;91m"
#define COL_RESET "\033[0m"

static int color_enabled(void) {
    const char *force = getenv("HASHTEAM_FORCE_COLOR");
    if (force != NULL && strcmp(force, "1") == 0) return 1;
    if (force != NULL && strcmp(force, "0") == 0) return 0;
    const char *no_color = getenv("NO_COLOR");
    if (no_color != NULL && no_color[0] != '\0') return 0;
    const char *term = getenv("TERM");
    if (term != NULL && strcmp(term, "dumb") == 0) return 0;
    return isatty(STDOUT_FILENO) ? 1 : 0;
}

static const char *line_color(const char *line, size_t len, const char *default_color) {
    size_t i = 0;
    while (i < len && (line[i] == ' ' || line[i] == '\t')) i++;
    const char *p = line + i;
    size_t rest = len - i;
    if (rest >= 3 && memcmp(p, "\xe2\x9c\x93", 3) == 0) return COL_GREEN_BOLD; // ✓
    if (rest >= 3 && memcmp(p, "\xe2\x9c\x97", 3) == 0) return COL_RED_BOLD;   // ✗
    if (rest >= 9 && memcmp(p, "\xe7\x94\xa8\xe6\xb3\x95\xef\xbc\x9a", 9) == 0) {
        return COL_YELLOW; // 用法：
    }
    return default_color;
}

// 复刻 ht_render_result：printf '%s\n' "$output" 逐行着色；末尾必定再处理一个
// （可能为空的）末行，与 awk 对尾部换行的记录语义完全一致。
static void render_result(int rc, const char *output, size_t output_len) {
    const char *default_color =
        rc == 0 ? COL_GREEN_BOLD : (rc == 2 ? COL_YELLOW : COL_RED_BOLD);
    const int use_color = color_enabled();
    size_t start = 0;
    for (;;) {
        size_t end = start;
        while (end < output_len && output[end] != '\n') end++;
        const char *color = use_color ? line_color(output + start, end - start, default_color) : "";
        const char *reset = use_color ? COL_RESET : "";
        printf("%s%.*s%s\n", color, (int)(end - start), output + start, reset);
        if (end >= output_len) break;
        start = end + 1;
    }
}

/* ---------------- 路径与运行环境 ---------------- */

#define VM_LEVELS_DIR "/opt/hashteam/levels"
#define VM_KEY_FILE "/etc/hashteam/protocol.key"
#define VM_STATE_DIR "/home/guest/.hashteam"
#define MAX_CAPTURE (1024 * 1024)
#define MAX_KEY_LEN 128

typedef struct {
    int suid_active;            // 提权生效中（VM 内 SUID 调用）
    const char *levels_dir;     // check.sh 根目录
    const char *key_file;       // 会话密钥文件
    char state_dir[512];        // VM 固定 guest 状态目录（非 SUID 测试可覆盖）
} run_env;

static int resolve_run_env(run_env *env) {
    env->suid_active = getuid() != geteuid() ? 1 : 0;
    if (env->suid_active) {
        // 提权时忽略一切可被学生控制的路径环境变量。HOME 同样不能信任：
        // 后续状态更新发生在用户目录，若跟随环境值会把 SUID 写入导向任意路径。
        env->levels_dir = VM_LEVELS_DIR;
        env->key_file = VM_KEY_FILE;
        strcpy(env->state_dir, VM_STATE_DIR);
    } else {
        env->levels_dir = getenv("HASHTEAM_LEVELS_DIR");
        if (env->levels_dir == NULL || env->levels_dir[0] == '\0') env->levels_dir = VM_LEVELS_DIR;
        env->key_file = getenv("HASHTEAM_KEY_FILE");
        if (env->key_file == NULL || env->key_file[0] == '\0') env->key_file = VM_KEY_FILE;
        const char *state_override = getenv("HASHTEAM_STATE_DIR");
        if (state_override != NULL && state_override[0] != '\0') {
            if (strlen(state_override) >= sizeof(env->state_dir)) return -1;
            strcpy(env->state_dir, state_override);
        } else {
            const char *home = getenv("HOME");
            if (home == NULL) home = "/home/guest";
            if (snprintf(env->state_dir, sizeof(env->state_dir), "%s/.hashteam", home) >=
                (int)sizeof(env->state_dir)) {
                return -1;
            }
        }
    }
    return 0;
}

// 读取关卡号文件；缺失或非法（非 1-2 位数字）时回退/拒绝，杜绝路径穿越
static int read_current_level(const run_env *env) {
    char path[600];
    snprintf(path, sizeof(path), "%s/level", env->state_dir);
    FILE *fp = fopen(path, "rb");
    if (fp == NULL) return 1;
    char buf[16] = {0};
    size_t n = fread(buf, 1, sizeof(buf) - 1, fp);
    fclose(fp);
    while (n > 0 && (buf[n - 1] == '\n' || buf[n - 1] == '\r' || buf[n - 1] == ' ')) n--;
    buf[n] = '\0';
    if (n == 0 || n > 2) return -1;
    for (size_t i = 0; i < n; i++) {
        if (buf[i] < '0' || buf[i] > '9') return -1;
    }
    int level = atoi(buf);
    return level >= 1 && level <= 99 ? level : -1;
}

static int read_key(const run_env *env, uint8_t *key, size_t *key_len) {
    FILE *fp = fopen(env->key_file, "rb");
    if (fp == NULL) return -1;
    size_t n = fread(key, 1, MAX_KEY_LEN, fp);
    fclose(fp);
    if (n < 16) return -1; // 密钥过短视为不可用（init 固定写入 32 字节）
    *key_len = n;
    return 0;
}

static void sign_and_print(const char *message, const uint8_t *key, size_t key_len) {
    uint8_t mac[32];
    char hex[65];
    hmac_sha256(key, key_len, (const uint8_t *)message, strlen(message), mac);
    hex_encode(mac, 32, hex);
    printf("\"sig\":\"%s\"}\n", hex);
}

// check 通过后记录已完成的最大关卡号（与原 hashteamctl mark-completed 语义一致：
// 只升不降；状态目录由关卡切换流程先行创建，不存在时跳过）
static void update_max_completed(const run_env *env, int level) {
    struct stat st;
    if (stat(env->state_dir, &st) != 0 || !S_ISDIR(st.st_mode)) return;
    char path[600];
    snprintf(path, sizeof(path), "%s/max-completed", env->state_dir);
    int current = 0;
    FILE *fp = fopen(path, "rb");
    if (fp != NULL) {
        char buf[16] = {0};
        size_t n = fread(buf, 1, sizeof(buf) - 1, fp);
        fclose(fp);
        buf[n] = '\0';
        int parsed = atoi(buf);
        if (parsed > 0) current = parsed;
    }
    if (level <= current) return;
    fp = fopen(path, "wb");
    if (fp == NULL) return;
    fprintf(fp, "%d\n", level);
    fclose(fp);
}

// SUID 父进程必须一直保有 root 身份，稍后才能安全读取签名密钥；状态写入则放到
// 单独子进程并永久降权，避免学生通过 HOME/符号链接把 fopen 导向 root 文件。
static int drop_to_caller(void) {
    uid_t ruid = getuid();
    gid_t rgid = getgid();
    return setgroups(1, &rgid) == 0 && setgid(rgid) == 0 && setuid(ruid) == 0 ? 0 : -1;
}

static void update_max_completed_as_caller(const run_env *env, int level) {
    if (!env->suid_active) {
        update_max_completed(env, level);
        return;
    }
    pid_t pid = fork();
    if (pid < 0) return;
    if (pid == 0) {
        if (drop_to_caller() != 0) _exit(1);
        update_max_completed(env, level);
        _exit(0);
    }
    int status = 0;
    while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {
    }
}

static int run_check(int argc, char **argv) {
    run_env env;
    if (resolve_run_env(&env) != 0) {
        fprintf(stderr, "✗ 评分组件故障（运行环境路径过长），请联系助教。\n");
        return 3;
    }
    int level = read_current_level(&env);
    char script[640];
    if (level < 0 ||
        snprintf(script, sizeof(script), "%s/level-%d/check.sh", env.levels_dir, level) >=
            (int)sizeof(script)) {
        level = 0; // 仅为错误信息保留输出
        script[0] = '\0';
    }
    struct stat st;
    if (script[0] == '\0' || stat(script, &st) != 0 || !S_ISREG(st.st_mode)) {
        fprintf(stderr, "✗ 当前关卡没有检查脚本。\n");
        return 2;
    }

    int pipefd[2];
    if (pipe(pipefd) != 0) {
        fprintf(stderr, "✗ 评分组件故障（无法创建输出管道），请联系助教。\n");
        return 3;
    }
    pid_t pid = fork();
    if (pid < 0) {
        fprintf(stderr, "✗ 评分组件故障（无法创建检查进程），请联系助教。\n");
        return 3;
    }
    if (pid == 0) {
        // 子进程：先降权到调用者，再以 /bin/sh 执行官方 check.sh
        close(pipefd[0]);
        if (dup2(pipefd[1], STDOUT_FILENO) < 0 || dup2(pipefd[1], STDERR_FILENO) < 0) _exit(127);
        close(pipefd[1]);
        const char *shell = "/bin/sh";
        if (env.suid_active) {
            if (drop_to_caller() != 0) _exit(127);
        } else {
            // 仅宿主机测试可用 HASHTEAM_TEST_SHELL 换成 busybox sh 以贴近 VM 行为；
            // SUID 激活时忽略该变量，提权路径的解释器不可被环境变量替换。
            const char *test_shell = getenv("HASHTEAM_TEST_SHELL");
            if (test_shell != NULL && test_shell[0] == '/') shell = test_shell;
        }
        char **child_argv = calloc((size_t)argc + 2, sizeof(char *));
        if (child_argv == NULL) _exit(127);
        child_argv[0] = (char *)"sh";
        child_argv[1] = script;
        // argv[0] 是 "run"，check 参数从 argv[1] 开始
        for (int i = 1; i < argc; i++) child_argv[i + 1] = argv[i];
        if (env.suid_active) {
            // check.sh 的退出码决定是否签名，因此它调用的命令与读取的 HOME/答案目录
            // 都属于信任边界。SUID 路径只传入固定最小环境，禁止 PATH 劫持以及
            // HASHTEAM_LEVELS_DIR/HASHTEAM_HTTP_PORT/HASHTEAM_USER 等测试覆盖泄漏进生产。
            char *const child_env[] = {
                (char *)"HOME=/home/guest",
                (char *)"PATH=/usr/local/bin:/bin:/usr/bin:/sbin",
                (char *)"USER=guest",
                (char *)"LOGNAME=guest",
                (char *)"SHELL=/bin/sh",
                (char *)"LC_ALL=C",
                NULL,
            };
            execve(shell, child_argv, child_env);
        } else {
            if (getenv("PATH") == NULL) {
                setenv("PATH", "/usr/local/bin:/bin:/usr/bin:/sbin", 1);
            }
            execv(shell, child_argv);
        }
        _exit(127);
    }

    close(pipefd[1]);
    char *output = malloc(MAX_CAPTURE + 1);
    if (output == NULL) {
        fprintf(stderr, "✗ 评分组件故障（内存不足），请联系助教。\n");
        return 3;
    }
    size_t used = 0;
    for (;;) {
        char buf[4096];
        ssize_t n = read(pipefd[0], buf, sizeof(buf));
        if (n <= 0) break;
        if (used < MAX_CAPTURE) {
            size_t take = (size_t)n;
            if (take > MAX_CAPTURE - used) take = MAX_CAPTURE - used;
            memcpy(output + used, buf, take);
            used += take;
        }
    }
    close(pipefd[0]);
    int status = 0;
    while (waitpid(pid, &status, 0) < 0 && errno == EINTR) {
    }
    int rc = WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);

    // 与原包装器 output=$(...) 一致：剥掉末尾换行再渲染，避免多出空行
    while (used > 0 && output[used - 1] == '\n') used--;
    render_result(rc, output, used);
    free(output);

    if (rc == 0) {
        update_max_completed_as_caller(&env, level);
        // 仅在检查已经通过、所有降权子进程均退出后读取 root-only 密钥，避免
        // fork 出来的 guest 进程短暂继承含密钥的地址空间。
        uint8_t key[MAX_KEY_LEN];
        size_t key_len = 0;
        if (read_key(&env, key, &key_len) != 0) {
            fprintf(stderr, "✗ 评分组件故障（签名密钥不可用），请联系助教。\n");
            printf("@@HASHTEAM:{\"type\":\"error\",\"message\":\"grading signer unavailable\"}\n");
            return 3;
        }
        char message[64];
        snprintf(message, sizeof(message), "level-result:%d:passed", level);
        printf("@@HASHTEAM:{\"type\":\"level-result\",\"level\":%d,\"status\":\"passed\",", level);
        sign_and_print(message, key, key_len);
    } else {
        printf("@@HASHTEAM:{\"type\":\"error\",\"message\":\"level %d check failed\"}\n", level);
    }
    return rc;
}

static int emit_level_ready(const char *level_arg) {
    if (level_arg == NULL || level_arg[0] == '\0' || strlen(level_arg) > 2) {
        fprintf(stderr, "✗ 无效的关卡编号: %s\n", level_arg != NULL ? level_arg : "");
        return 2;
    }
    for (const char *p = level_arg; *p != '\0'; p++) {
        if (*p < '0' || *p > '9') {
            fprintf(stderr, "✗ 无效的关卡编号: %s\n", level_arg);
            return 2;
        }
    }
    int level = atoi(level_arg);
    if (level < 1 || level > 99) {
        fprintf(stderr, "✗ 无效的关卡编号: %s\n", level_arg);
        return 2;
    }
    run_env env;
    if (resolve_run_env(&env) != 0) {
        fprintf(stderr, "✗ 评分组件故障（运行环境路径过长），请联系助教。\n");
        return 3;
    }
    uint8_t key[MAX_KEY_LEN];
    size_t key_len = 0;
    if (read_key(&env, key, &key_len) != 0) {
        fprintf(stderr, "✗ 评分组件故障（签名密钥不可用），请联系助教。\n");
        return 3;
    }
    char message[64];
    snprintf(message, sizeof(message), "level-ready:%d", level);
    printf("@@HASHTEAM:{\"type\":\"level-ready\",\"level\":%d,", level);
    sign_and_print(message, key, key_len);
    return 0;
}

/* ---------------- selftest：标准向量自检 ---------------- */

static int selftest(void) {
    int failures = 0;
    char hex[65];

    sha256_ctx ctx;
    uint8_t digest[32];
    sha256_init(&ctx);
    sha256_update(&ctx, "abc", 3);
    sha256_final(&ctx, digest);
    hex_encode(digest, 32, hex);
    if (strcmp(hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") != 0) {
        printf("FAIL sha256(\"abc\") = %s\n", hex);
        failures++;
    }
    sha256_init(&ctx);
    sha256_final(&ctx, digest);
    hex_encode(digest, 32, hex);
    if (strcmp(hex, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855") != 0) {
        printf("FAIL sha256(\"\") = %s\n", hex);
        failures++;
    }

    uint8_t key1[20];
    memset(key1, 0x0b, sizeof(key1));
    hmac_sha256(key1, sizeof(key1), (const uint8_t *)"Hi There", 8, digest);
    hex_encode(digest, 32, hex);
    if (strcmp(hex, "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7") != 0) {
        printf("FAIL RFC4231-1 = %s\n", hex);
        failures++;
    }
    hmac_sha256((const uint8_t *)"Jefe", 4,
                (const uint8_t *)"what do ya want for nothing?", 28, digest);
    hex_encode(digest, 32, hex);
    if (strcmp(hex, "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843") != 0) {
        printf("FAIL RFC4231-2 = %s\n", hex);
        failures++;
    }
    uint8_t key3[131];
    memset(key3, 0xaa, sizeof(key3));
    hmac_sha256(key3, sizeof(key3),
                (const uint8_t *)"Test Using Larger Than Block-Size Key - Hash Key First", 54,
                digest);
    hex_encode(digest, 32, hex);
    if (strcmp(hex, "60e431591ee0b67f0d8a26aacbf5b77f8e0bc6213728c5140546040f0ee37f54") != 0) {
        printf("FAIL RFC4231-6 = %s\n", hex);
        failures++;
    }

    if (failures == 0) {
        printf("selftest OK\n");
        return 0;
    }
    printf("selftest FAILED (%d)\n", failures);
    return 1;
}

int main(int argc, char **argv) {
    const char *mode = argc >= 2 ? argv[1] : "";
    if (strcmp(mode, "run") == 0) {
        // htcheck run [传给 check.sh 的参数...]
        return run_check(argc - 1, argv + 1);
    }
    if (strcmp(mode, "level-ready") == 0) {
        return emit_level_ready(argc >= 3 ? argv[2] : NULL);
    }
    if (strcmp(mode, "selftest") == 0) {
        return selftest();
    }
    fprintf(stderr, "用法：htcheck run [check 参数...] | htcheck level-ready <关卡号> | htcheck selftest\n");
    return 2;
}
