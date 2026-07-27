import type { LevelDef } from '../types/lab'

/** 全部关卡文案集中在此文件，页面组件不写死任何关卡内容 */
export const LEVELS: LevelDef[] = [
  {
    id: 1,
    name: '欢迎来到服务器',
    tagline: '初次登录：认识你的终端',
    story:
      '你刚刚拿到了 HASHTEAM 实验室测试服务器的最低权限账号。' +
      '管理员在系统里留下了一份说明文件，里面写着你的「通行证」。' +
      '先确认一下自己的身份和位置，然后读一读这份说明。',
    goals: [
      '确认当前登录的用户身份',
      '查看当前所在的目录',
      '阅读管理员留下的 README 文件',
      '找到通行证并完成验证',
    ],
    suggestedCommands: ['whoami', 'pwd', 'ls', 'cat README'],
    hints: [
      '先试试 whoami 和 pwd，弄清楚「我是谁、我在哪」。',
      '用 ls 看看目录里有什么文件，再用 cat 把 README 的内容读出来。',
      'README 里有一行写着通行证，把它作为参数传给 check，例如：check <通行证>',
    ],
    teaches: ['认识 Shell', '文件与目录', '当前用户与当前路径'],
    checkUsage: 'check <通行证>',
  },
  {
    id: 2,
    name: '消失的文件',
    tagline: '隐藏的信息：看不见 ≠ 不存在',
    story:
      '管理员信誓旦旦地说，你的主目录里放着一条给你的消息，' +
      '可不管怎么 ls 都看不到它。文件真的不存在吗？' +
      '在 Linux 里，有些文件只是「低调」而已。',
    goals: [
      '列出目录中的全部文件（包括隐藏的）',
      '找到那个「消失」的文件',
      '确认它的类型并读取其中的验证信息',
    ],
    suggestedCommands: ['ls -la', 'file .message', 'cat .message'],
    hints: [
      '以点（.）开头的文件在默认的 ls 中是看不见的，试试给 ls 加上 -a 或 -la 参数。',
      '找到隐藏文件后，可以用 file 看看它是什么类型，再用 cat 读出来。',
      '文件里有一行「验证信息」，把冒号后面的内容交给 check。',
    ],
    teaches: ['隐藏文件', '文件类型识别', '「不可见」不等于「不存在」'],
    checkUsage: 'check <验证信息>',
  },
  {
    id: 3,
    name: '谁在攻击服务器',
    tagline: '异常登录分析：日志会说实话',
    story:
      '值班同学发现服务器最近总有人尝试暴力破解登录。' +
      '你面前是一份认证日志 auth.log，里面混杂着正常登录和大量失败尝试。' +
      '作为安全运维新人，你的第一个任务是：找出失败登录次数最多的那个 IP。',
    goals: [
      '浏览 auth.log，了解日志的大致结构',
      '筛选出所有失败的登录记录',
      '统计每个来源 IP 的失败次数',
      '找出失败次数最多的 IP 并完成验证',
    ],
    suggestedCommands: [
      'grep "Failed password" auth.log',
      'grep "Failed password" auth.log | awk \'{print $11}\'',
      'grep "Failed password" auth.log | awk \'{print $11}\' | sort | uniq -c | sort -nr | head',
    ],
    hints: [
      '失败的登录记录里都包含固定字样 Failed password，先用 grep 把它们捞出来。',
      'awk 可以按空格切分每一行，IP 地址就在其中一列，数一数是第几列。',
      '把 IP 提取出来后，sort | uniq -c 可以统计每个 IP 出现几次，再 sort -nr 按次数从大到小排序。',
    ],
    teaches: ['日志分析', '管道', '文本筛选与统计', '基础安全运维'],
    checkUsage: 'check <IP地址>',
  },
  {
    id: 4,
    name: '看不懂的消息',
    tagline: '可疑数据：编码不是加密',
    story:
      '你在服务器上发现了两个可疑文件：message.b64 看起来像一堆乱码，' +
      'secret.bin 更是一个打不开的「二进制」。' +
      '别急——它们只是经过了「编码」，而编码从来都不是加密。' +
      '两块碎片拼起来，才是完整的暗号。',
    goals: [
      '查看 message.b64 的内容并还原它',
      '用合适的工具从 secret.bin 中提取可读字符串',
      '把两块碎片按提示拼成完整暗号',
    ],
    suggestedCommands: ['cat message.b64', 'base64 -d message.b64', 'file secret.bin', 'strings secret.bin', 'xxd secret.bin | head'],
    hints: [
      'message.b64 是 Base64 编码的文本，base64 -d 可以把它还原出来。',
      '二进制文件里往往藏着可读字符串，strings 命令能把它们挑出来；xxd 可以看到文件的十六进制全貌。',
      '两块碎片各自是暗号的一半，用连字符（-）按顺序拼接，就是最终答案。',
    ],
    teaches: ['编码不等于加密', '文本与二进制', '基础取证思维'],
    checkUsage: 'check <完整暗号>',
  },
  {
    id: 5,
    name: '被遗忘的调试接口',
    tagline: '本地 Web 服务：信息泄露就在身边',
    story:
      '开发同学在虚拟机内部（127.0.0.1:8080）起了一个测试用的 Web 服务，' +
      '首页空空如也，看起来没什么问题。' +
      '但上线前忘记清理的调试文件，往往才是漏洞的起点。' +
      '注意：本实验中的所有请求都只发往虚拟机内部，请勿对任何真实网站尝试。',
    goals: [
      '访问本地服务的首页，观察返回内容',
      '查看 robots.txt，寻找被「隐藏」的路径',
      '顺藤摸瓜找到泄露的调试令牌',
    ],
    suggestedCommands: [
      'curl http://127.0.0.1:8080/',
      'curl http://127.0.0.1:8080/robots.txt',
      'curl http://127.0.0.1:8080/debug',
    ],
    hints: [
      'curl 可以直接发起 HTTP 请求，先看看首页返回了什么。',
      'robots.txt 本来是写给搜索引擎看的，但经常会暴露管理员不想被收录的路径。',
      'robots.txt 里提到的路径都值得访问一遍，令牌就在其中一个里面。',
    ],
    teaches: ['HTTP 基础', '信息泄露', 'Web 安全观察能力', '只在授权的本地环境中测试'],
    checkUsage: 'check <令牌>',
  },
  {
    id: 6,
    name: '发现漏洞之后',
    tagline: '修复问题：安全的完整闭环',
    story:
      '你在前几关发现了信息泄露问题。真正的安全工作不止是「找到问题」，' +
      '还要验证、修复、再复查。现在，一份存在多个安全隐患的配置文件 server.conf 摆在你面前：' +
      '调试模式开着、访客访问开着、还监听在所有网卡上。请把它修复为安全配置。',
    goals: [
      '阅读 server.conf，找出其中的不安全配置项',
      '将 debug 和 allow_guest 改为 false',
      '将 listen 改为只监听本机 127.0.0.1',
      '运行 check 复查修复结果',
    ],
    suggestedCommands: [
      'cat server.conf',
      'grep -n . server.conf',
      'sed -i \'s/debug=true/debug=false/\' server.conf',
      'vi server.conf',
    ],
    hints: [
      '先用 cat 或 grep -n 看清每一行配置，共有三处需要修改。',
      'sed -i 可以直接在文件里做替换，例如把 debug=true 替换成 debug=false。',
      'listen=0.0.0.0 表示对所有网卡开放，改成 listen=127.0.0.1 就只允许本机访问。改完后运行 check 复查。',
    ],
    teaches: ['安全不仅是发现问题', '验证、修复与复查的闭环', '引出实验室的真实工作方向'],
    checkUsage: 'check（自动检查配置文件最终状态）',
  },
]

export const TOTAL_LEVELS = LEVELS.length

export function getLevel(id: number): LevelDef | undefined {
  return LEVELS.find((l) => l.id === id)
}

/** 实验室方向（结束页与「关于实验室」共用） */
export interface LabDirection {
  name: string
  description: string
}

export const LAB_DIRECTIONS: LabDirection[] = [
  {
    name: '漏洞挖掘',
    description: '在真实软件与系统中寻找安全缺陷，从代码审计到模糊测试，把「奇怪的崩溃」变成可复现的漏洞。',
  },
  {
    name: '渗透攻防',
    description: '在授权范围内模拟攻击者的完整链路，理解防御盲区，也为校园系统做安全评估。',
  },
  {
    name: '安全开发',
    description: '把安全能力做成工具与平台：扫描器、蜜罐、自动化分析系统，让工程能力放大研究效率。',
  },
  {
    name: '校园安全运维',
    description: '参与校园网络与系统的日常安全值守：日志巡检、应急响应、基线加固，守护身边的真实环境。',
  },
]

export const CTF_POSITIONING =
  'CTF 是很好的安全入门方式——它用游戏化的关卡帮你建立手感。' +
  '但它不是实验室的最终方向：真正的目标，是把在这里练出的基本功，' +
  '用到漏洞挖掘、渗透攻防、安全开发与校园安全运维的真实世界中去。'
