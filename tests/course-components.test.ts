// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { CourseLabDef } from '../src/types/lab'
import { parseCourseLabManifest } from '../src/services/course-manifest'
import CourseRail from '../src/components/CourseRail.vue'
import EvidenceForm from '../src/components/EvidenceForm.vue'
import MissionPanel from '../src/components/PwnHubMissionPanel.vue'
import StepRenderer from '../src/components/StepRenderer.vue'
import { COURSE, getCourseLab } from '../src/modules/pwnhub/course'

describe('chapter-first course components', () => {
  it('CourseRail 展示稳定 labId，并把未发布章节保持禁用', async () => {
    const wrapper = mount(CourseRail, {
      props: {
        course: COURSE,
        currentLabId: 'num-bases-01',
        completedLabIds: [],
        completedLevels: [],
        completionRecords: {},
      },
    })

    expect(wrapper.get('[data-lab-id="num-bases-01"]').attributes('aria-current')).toBe(
      'step',
    )
    await wrapper.get('.chapter-button').trigger('click')
    const chapters = wrapper.findAll('.chapter-menu > button')
    expect(chapters).toHaveLength(6)
    expect(chapters[0].attributes('aria-disabled')).toBeUndefined()
    for (const index of [1, 2, 3, 4, 5]) {
      expect(chapters[index].attributes('disabled')).toBeUndefined()
      expect(chapters[index].attributes('aria-disabled')).toBe('true')
    }
    expect(chapters.every((chapter) => chapter.attributes('disabled') === undefined)).toBe(true)

    await wrapper.get('[data-lab-id="num-bases-01"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['num-bases-01'])
  })

  it('章节内实验按钮显示课程全局序号，与头部和终端横幅一致', () => {
    const wrapper = mount(CourseRail, {
      props: {
        course: COURSE,
        currentLabId: 'vuln-weak-random-01',
        completedLabIds: ['num-bases-01', 'num-wrap-01'],
        completedLevels: [],
        completionRecords: {},
      },
    })

    const first = wrapper.get('[data-lab-id="vuln-weak-random-01"]')
    expect(first.text()).toContain('3')
    expect(first.attributes('aria-label')).toContain('实验 3：会重播的口令')
    const last = wrapper.get('[data-lab-id="vuln-race-condition-01"]')
    expect(last.attributes('aria-label')).toContain('实验 5：')
    wrapper.unmount()
  })

  it('章节菜单点击外部或按 Escape 即关闭', async () => {
    const wrapper = mount(CourseRail, {
      attachTo: document.body,
      props: {
        course: COURSE,
        currentLabId: 'memory-addresses-01',
        completedLabIds: [],
        completedLevels: [],
        completionRecords: {},
      },
    })

    await wrapper.get('.chapter-button').trigger('click')
    expect(wrapper.find('.chapter-menu').exists()).toBe(true)
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.chapter-menu').exists()).toBe(false)

    await wrapper.get('.chapter-button').trigger('click')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.chapter-menu').exists()).toBe(false)
    wrapper.unmount()
  })

  it('连续点击五次可临时放行锁定的实验或可用章节', async () => {
    const wrapper = mount(CourseRail, {
      props: {
        course: COURSE,
        currentLabId: 'memory-addresses-01',
        completedLabIds: [],
        completedLevels: [],
        completionRecords: {},
      },
    })

    const lockedLab = wrapper.get('[data-lab-id="memory-layout-01"]')
    for (let count = 0; count < 4; count += 1) await lockedLab.trigger('click')
    expect(wrapper.emitted('debug-unlock-lab')).toBeUndefined()
    await lockedLab.trigger('click')
    expect(wrapper.emitted('debug-unlock-lab')?.[0]).toEqual(['memory-layout-01'])

    await wrapper.get('.chapter-button').trigger('click')
    const assemblyChapter = wrapper.findAll('.chapter-menu > button')[4]
    for (let count = 0; count < 5; count += 1) await assemblyChapter.trigger('click')
    expect(wrapper.emitted('debug-unlock-chapter')?.[0]).toEqual(['asm-reading'])

    await wrapper.setProps({
      debugUnlockedLabIds: ['memory-layout-01'],
      debugUnlockedChapterIds: ['asm-reading'],
    })
    expect(lockedLab.attributes('aria-disabled')).toBeUndefined()
  })

  it('外部逆向实验在任务简介顶部直接提供锁定样本下载', () => {
    const manifestPath = 'vm/labs/pwnhub/rev-strings-xrefs-01/manifest.json'
    const manifest = parseCourseLabManifest(
      JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>,
      manifestPath,
    )
    const { type: verificationType, ...verification } = manifest.verification
    const lab = {
      ...manifest,
      id: 1,
      name: manifest.title,
      tagline: manifest.summary,
      storySummary: manifest.summary,
      story: manifest.story ?? manifest.summary,
      newConcepts: manifest.concepts.map((concept: { term: string }) => concept.term),
      verificationType,
      verification,
      legacyLevel: 1,
    }
    const wrapper = mount(MissionPanel, {
      props: {
        level: lab as unknown as CourseLabDef,
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'guided',
        guideStep: 0,
        completedSteps: [],
      },
    })

    const download = wrapper.get('.sample-download')
    expect(download.attributes('href')).toBe(
      '/artifacts/a1d48129804d6eee16ddf44e8697b780dc47a9b2b088503bc5a41fe7543d66cb/reverse-companion',
    )
    expect(download.attributes('download')).toBe('')
    expect(download.text()).toContain('a1d48129804d6eee16ddf44e8697b780dc47a9b2b088503bc5a41fe7543d66cb')
    wrapper.unmount()
  })

  it('任务摘要与展开背景相同时只显示一次', () => {
    const lab = getCourseLab('memory-addresses-01')!
    const wrapper = mount(MissionPanel, {
      props: {
        level: { ...lab, story: lab.storySummary },
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'guided',
        guideStep: 0,
        completedSteps: [],
      },
    })

    expect(wrapper.get('.story-details').findAll('p')).toHaveLength(1)
    wrapper.unmount()
  })

  it('章节菜单用圆环显示本章进度，完成后改为对勾', async () => {
    const numberBasesIds = COURSE.chapters[0].labIds
    const vulnLogicIds = COURSE.chapters[1].labIds
    const wrapper = mount(CourseRail, {
      props: {
        course: COURSE,
        currentLabId: 'vuln-weak-random-01',
        completedLabIds: numberBasesIds,
        completedLevels: [],
        completionRecords: {},
      },
    })

    await wrapper.get('.chapter-button').trigger('click')
    const chapters = wrapper.findAll('.chapter-menu > button')
    expect(chapters[0].find('.chapter-complete').exists()).toBe(true)
    expect(chapters[1].find('.chapter-progress-ring').exists()).toBe(true)
    expect(chapters[1].text()).toContain('0 / 3 个实验')

    await wrapper.setProps({ completedLabIds: [...numberBasesIds, 'vuln-weak-random-01'] })
    expect(wrapper.findAll('.chapter-menu > button')[1].find('.chapter-complete').exists()).toBe(false)
    expect(wrapper.findAll('.chapter-menu > button')[1].text()).toContain('1 / 3 个实验')

    await wrapper.setProps({ completedLabIds: [...numberBasesIds, ...vulnLogicIds] })
    expect(wrapper.findAll('.chapter-menu > button')[1].find('.chapter-complete').exists()).toBe(true)
  })

  it('EvidenceForm 只发送归一化且替换过占位符的 check 命令', async () => {
    const wrapper = mount(EvidenceForm, {
      props: {
        verification: {
          usage: 'check <value>',
          instruction: '填写真实值',
          placeholders: [{ token: '<value>', meaning: '观察值' }],
          feedback: { empty: '空', incorrect: '错', success: '对' },
        },
        available: true,
        totalSteps: 2,
        labId: 'test-lab-01',
      },
    })

    await wrapper.get('input').setValue('check <value>')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('仍有尖括号占位符')
    expect(wrapper.emitted('run-command')).toBeUndefined()

    await wrapper.get('input').setValue('　check 0x10　')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.emitted('run-command')?.[0]).toEqual(['check 0x10'])
  })

  it('EvidenceForm 将多个验证参数按 usage 顺序组合，并把参数放在按钮上方', async () => {
    const wrapper = mount(EvidenceForm, {
      props: {
        verification: {
          usage: 'check <地址> <数量> <寄存器>',
          instruction: '填写三项观察值。',
          placeholders: [
            { token: '<地址>', meaning: '十六进制地址' },
            { token: '<数量>', meaning: '十进制数量' },
            { token: '<寄存器>', meaning: '寄存器名称' },
          ],
          feedback: { empty: '空', incorrect: '错', success: '对' },
        },
        available: true,
        totalSteps: 1,
        labId: 'multi-parameter-lab',
      },
    })

    const inputs = wrapper.findAll<HTMLInputElement>('[data-verification-parameter]')
    expect(inputs).toHaveLength(3)
    expect(inputs.map((input) => input.attributes('placeholder'))).toEqual([
      '地址',
      '数量',
      '寄存器',
    ])
    expect(inputs[0].attributes('title')).toBe('十六进制地址')
    expect(wrapper.get('.verification-details').text()).toContain('第1项“地址”：十六进制地址')
    expect(wrapper.findAll('.verification-detail-line').map((line) => line.text())).toEqual([
      '第1项“地址”：十六进制地址；',
      '第2项“数量”：十进制数量；',
      '第3项“寄存器”：寄存器名称。',
    ])
    expect(wrapper.text()).not.toContain('check <地址>')
    expect(wrapper.find('.verification-token').exists()).toBe(false)
    expect(wrapper.get('.verification-form').element.lastElementChild?.tagName).toBe('BUTTON')

    await inputs[0].setValue('0x1000')
    await inputs[1].setValue('7')
    await inputs[2].setValue('ESP')
    await wrapper.get('.verification-form').trigger('submit')
    expect(wrapper.emitted('run-command')?.[0]).toEqual(['check 0x1000 7 ESP'])
  })

  it('EvidenceForm 将超长参数提示压缩到输入框可用的短文本', () => {
    const wrapper = mount(EvidenceForm, {
      props: {
        verification: {
          usage: 'check <第二个值入栈后的栈顶地址>',
          instruction: '填写观察值。',
          placeholders: [{
            token: '<第二个值入栈后的栈顶地址>',
            meaning: '第二个值入栈后那一行的栈顶地址（八位十六进制）',
          }],
          feedback: { empty: '空', incorrect: '错', success: '对' },
        },
        available: true,
        totalSteps: 1,
        labId: 'long-parameter-lab',
      },
    })

    const input = wrapper.get<HTMLInputElement>('[data-verification-parameter]')
    expect(input.attributes('placeholder')).toBe('栈顶地址')
    expect(input.attributes('title')).toContain('八位十六进制')
    expect(wrapper.get('.verification-details').text()).toContain('第二个值入栈后的栈顶地址')
    expect(input.attributes('placeholder')).not.toContain('…')
    expect(wrapper.text()).not.toContain('check <第二个值入栈后的栈顶地址>')
  })

  it('EvidenceForm 无参数时不显示输入框，并直接发送 check', async () => {
    for (const labId of [
      'vuln-race-condition-01',
      'vuln-overwrite-variable-01',
      'vuln-string-overflow-01',
    ]) {
      const lab = getCourseLab(labId)!
      const wrapper = mount(EvidenceForm, {
        props: {
          verification: lab.verification,
          available: true,
          totalSteps: lab.steps.length,
          labId: lab.labId,
        },
      })

      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.get('button').text()).toBe('在终端验证')
      await wrapper.get('button').trigger('click')
      expect(wrapper.emitted('run-command')?.[0]).toEqual(['check'])
      wrapper.unmount()
    }
  })

  it('第 19 关使用简短字段提示，并保留完整参数说明', () => {
    const lab = getCourseLab('elf-symbols-01')!
    const wrapper = mount(EvidenceForm, {
      props: {
        verification: lab.verification,
        available: true,
        totalSteps: lab.steps.length,
        labId: lab.labId,
      },
    })

    const inputs = wrapper.findAll<HTMLInputElement>('[data-verification-parameter]')
    expect(inputs.map((input) => input.attributes('placeholder'))).toEqual([
      '地址',
      '类型',
      '类型',
      '类型',
    ])
    expect(wrapper.get('.verification-details').text()).toContain(
      '第1项“compute_total地址”：compute_total 行第一列的十六进制地址',
    )
  })

  it('所有已发布参数提示都保持简短且不含填写前缀', () => {
    for (const lab of COURSE.labs) {
      const wrapper = mount(EvidenceForm, {
        props: {
          verification: lab.verification,
          available: true,
          totalSteps: lab.steps.length,
          labId: lab.labId,
        },
      })
      for (const input of wrapper.findAll<HTMLInputElement>('[data-verification-parameter]')) {
        const prompt = input.attributes('placeholder') ?? ''
        expect(prompt).not.toContain('填写')
        expect(prompt.length).toBeLessThanOrEqual(4)
      }
      wrapper.unmount()
    }
  })

  it('生产关卡面板不显示带尖括号占位符的 check 命令', () => {
    for (const lab of COURSE.labs.filter(({ labId }) => labId !== 'vuln-weak-random-01')) {
      const panelText = [
        lab.name,
        lab.tagline,
        lab.storySummary,
        lab.story,
        ...lab.goals,
        ...lab.prerequisites,
        lab.title,
        lab.summary,
        ...lab.steps.flatMap((step) => [
          step.title,
          step.objective,
          step.instruction,
          step.command,
          step.commandTemplate,
          step.observation,
          step.question?.prompt,
          step.question?.success,
          ...(step.question?.choices.map((choice) => choice.label) ?? []),
          ...(step.introduces?.flatMap((concept) => [concept.term, concept.explanation]) ?? []),
          ...(step.fields?.flatMap((field) => [field.label, field.placeholder]) ?? []),
          ...(step.commonErrors ?? []),
          step.reinforcement,
        ]),
        ...lab.hints.map((hint) => hint.text),
        lab.verification.instruction,
        ...lab.verification.placeholders.map((placeholder) => placeholder.meaning),
        lab.completionSummary.solved,
        ...lab.completionSummary.mastered,
        lab.completionSummary.next,
      ]
        .filter((text): text is string => Boolean(text))
        .join('\n')

      expect({ labId: lab.labId, residue: panelText.match(/check\s*[<＜]/i) }).toEqual({
        labId: lab.labId,
        residue: null,
      })
    }
  })

  it('debugger-state 关卡显示本关引导与最终验证字段', () => {
    const lab = getCourseLab('asm-registers-01')!
    const wrapper = mount(MissionPanel, {
      props: {
        level: lab,
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'guided',
        guideStep: lab.steps.length - 1,
        completedSteps: lab.steps.map((step) => step.id),
        debuggerState: 'idle',
      },
    })

    expect(wrapper.get('.debugger-guide').text()).toContain('启动 debugger')
    expect(wrapper.get('.debugger-guide').text()).toContain('registers_checkpoint')
    expect(wrapper.get('.verification').text()).toContain('最终验证')
    expect(wrapper.findAll('.verification-field')).toHaveLength(3)
    wrapper.unmount()
  })

  it('尾部 confirm 步骤不会锁住 num-bases、num-wrap 和 integer-overflow 的最终验证', () => {
    for (const labId of ['num-bases-01', 'num-wrap-01', 'vuln-integer-overflow-01']) {
      const lab = getCourseLab(labId)!
      const wrapper = mount(MissionPanel, {
        props: {
          level: lab,
          completed: false,
          hintsUsed: 0,
          isLast: false,
          mode: 'guided',
          guideStep: lab.steps.length - 1,
          completedSteps: lab.steps.slice(0, -1).map((step) => step.id),
        },
      })

      expect(wrapper.get('.verification').classes()).not.toContain('locked')
      wrapper.unmount()
    }
  })

  it('整数回绕第二步改为概念说明，不再渲染内存工作台', () => {
    const lab = getCourseLab('vuln-integer-overflow-01')!
    expect(lab.steps[1]?.type).toBe('concept')
    const wrapper = mount(MissionPanel, {
      props: {
        level: lab,
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'guided',
        guideStep: 1,
        completedSteps: [1],
      },
    })

    expect(wrapper.find('.binary-workbench').exists()).toBe(false)
    expect(wrapper.text()).toContain('2^32')
    wrapper.unmount()
  })

  it('引导步骤可返回，进入内存步骤后仍可查看已经解锁的字节快照', async () => {
    const memoryLab = getCourseLab('memory-addresses-01')!
    const wrapper = mount(MissionPanel, {
      props: {
        level: memoryLab,
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'guided',
        guideStep: 1,
        completedSteps: [1],
      },
    })

    expect(wrapper.get('#binary-tab-memory').attributes('aria-selected')).toBe('true')
    expect(wrapper.get('#binary-tab-bytes').attributes('disabled')).toBeUndefined()
    await wrapper.get('#binary-tab-bytes').trigger('click')
    expect(wrapper.get('#binary-tab-bytes').attributes('aria-selected')).toBe('true')

    await wrapper.get('.btn-step-back').trigger('click')
    expect(wrapper.get('.action-header h3').text()).toContain('第 1 / 3 步')
    expect(wrapper.get('#binary-tab-bytes').attributes('aria-selected')).toBe('true')
    await wrapper.get('.btn-advance').trigger('click')
    expect(wrapper.get('.action-header h3').text()).toContain('第 2 / 3 步')
  })

  it('内存栈实验只展示后入先出的栈快照', () => {
    const lab = getCourseLab('memory-register-stack-01')!
    const wrapper = mount(MissionPanel, {
      props: {
        level: lab,
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'guided',
        guideStep: 2,
        completedSteps: [1, 2],
      },
    })

    expect(wrapper.find('.stack-table').exists()).toBe(true)
    expect(wrapper.findAll('.stack-table tbody tr')).toHaveLength(3)
    expect(wrapper.text()).toContain('0x0804c158')
    expect(wrapper.text()).toContain('0x22222222')
    expect(wrapper.find('.register-diff').exists()).toBe(false)
    expect(wrapper.get('#binary-tab-registers').attributes('disabled')).toBeDefined()
    expect(wrapper.get('#binary-tab-memory').attributes('disabled')).toBeDefined()
  })

  it('StepRenderer 按扩展步骤类型渲染预测与进度', () => {
    const wrapper = mount(StepRenderer, {
      props: {
        step: {
          id: 1,
          type: 'prediction',
          title: '预测 EAX',
          objective: '写下执行后的值',
          instruction: '先预测，再运行。',
          completion: 'answer',
          allowRun: false,
          evidence: 'prediction',
        },
        stepIndex: 0,
        totalSteps: 3,
        completedStepIds: [],
      },
    })

    expect(wrapper.attributes('data-step-type')).toBe('prediction')
    expect(wrapper.text()).toContain('预测')
    expect(wrapper.findAll('.step-progress i')).toHaveLength(3)
  })

  it('汇编首关先讲寄存器职责，再提交 mov 预测并核对自动运行证据', async () => {
    const asmLab = getCourseLab('asm-registers-01')!
    const wrapper = mount(MissionPanel, {
      props: {
        level: asmLab,
        completed: false,
        hintsUsed: 0,
        isLast: true,
        mode: 'guided',
        guideStep: 0,
        completedSteps: [],
      },
    })

    expect(wrapper.text()).toContain('常见寄存器职责')
    await wrapper.get('.btn-evidence').trigger('click')
    expect(wrapper.emitted('complete-step')?.[0]).toEqual(['asm-registers-01', 1])

    await wrapper.setProps({ guideStep: 1, completedSteps: [1] })
    expect(wrapper.get('.question').text()).toContain('执行 mov 后')
    await wrapper.get('input[value="copied"]').setValue()
    await wrapper.get('.question button').trigger('click')
    expect(wrapper.emitted('complete-step')?.at(-1)).toEqual(['asm-registers-01', 2])

    await wrapper.setProps({ guideStep: 4, completedSteps: [1, 2, 3, 4] })
    expect(wrapper.find('.manual-form').exists()).toBe(false)
    expect(wrapper.get('.auto-run-state').text()).toContain('样本已自动运行')
    await wrapper.get('.btn-evidence').trigger('click')
    expect(wrapper.emitted('complete-step')?.at(-1)).toEqual(['asm-registers-01', 5])
  })

  it('ELF 实验依次运行 file、hexdump、ByteView 和 strings', async () => {
    const lab = getCourseLab('elf-bytes-01')!
    const wrapper = mount(MissionPanel, {
      props: {
        level: lab,
        completed: false,
        hintsUsed: 0,
        isLast: true,
        mode: 'guided',
        guideStep: 1,
        completedSteps: [1],
      },
    })

    expect(wrapper.get('.command-run code').text()).toBe('file ./elf-bytes')
    await wrapper.get('.command-run').trigger('click')
    expect(wrapper.emitted('run-command')?.at(-1)).toEqual(['file ./elf-bytes'])

    await wrapper.setProps({ guideStep: 2, completedSteps: [1, 2] })
    expect(wrapper.get('.command-run code').text()).toBe('hexdump -C -n 16 ./elf-bytes')
    await wrapper.get('.command-run').trigger('click')
    expect(wrapper.emitted('run-command')?.at(-1)).toEqual(['hexdump -C -n 16 ./elf-bytes'])

    await wrapper.setProps({ guideStep: 3, completedSteps: [1, 2, 3] })
    expect(wrapper.find('.byte-view').exists()).toBe(true)
    expect(wrapper.text()).toContain('7f')
    expect(wrapper.text()).toContain('45')

    await wrapper.setProps({ guideStep: 4, completedSteps: [1, 2, 3, 4] })
    expect(wrapper.get('.command-run code').text()).toContain('strings')
    await wrapper.get('.command-run').trigger('click')
    expect(wrapper.emitted('run-command')?.at(-1)).toEqual([
      "strings /opt/pwnhub/labs/elf-bytes-01/elf-bytes | grep '^PwnHub_ELF_marker:'",
    ])
  })

  it('条件分支实验提交 test 预测并保留自动运行的真实 ELF 证据', async () => {
    const branchesLab = getCourseLab('asm-branches-01')!
    const wrapper = mount(MissionPanel, {
      props: {
        level: branchesLab,
        completed: false,
        hintsUsed: 0,
        isLast: true,
        mode: 'guided',
        guideStep: 0,
        completedSteps: [],
      },
    })

    expect(wrapper.get('.question').text()).toContain('test eax,eax')
    await wrapper.get('input[value="zero"]').setValue()
    await wrapper.get('.question button').trigger('click')
    expect(wrapper.emitted('complete-step')?.[0]).toEqual(['asm-branches-01', 1])

    await wrapper.setProps({ guideStep: 4, completedSteps: [1, 2, 3, 4] })
    expect(wrapper.find('.manual-form').exists()).toBe(false)
    expect(wrapper.get('.auto-run-state').text()).toContain('样本已自动运行')
    await wrapper.get('.btn-evidence').trigger('click')
    expect(wrapper.emitted('complete-step')?.at(-1)).toEqual(['asm-branches-01', 5])
  })

  it('call/ret 实验展示栈帧表格并提交真实 ELF 证据', async () => {
    const lab = getCourseLab('asm-call-stack-01')!
    const wrapper = mount(MissionPanel, {
      props: {
        level: lab,
        completed: false,
        hintsUsed: 0,
        isLast: true,
        mode: 'guided',
        guideStep: 2,
        completedSteps: [1, 2],
      },
    })

    expect(wrapper.find('.stack-table').exists()).toBe(true)
    expect(wrapper.findAll('.stack-table tbody tr')).toHaveLength(4)
    expect(wrapper.text()).toContain('EBP+4 · return to caller')
    expect(wrapper.text()).toContain('0x08049081')

    await wrapper.setProps({ guideStep: 4, completedSteps: [1, 2, 3, 4] })
    expect(wrapper.find('.manual-form').exists()).toBe(false)
    expect(wrapper.get('.auto-run-state').text()).toContain('样本已自动运行')
    await wrapper.get('.btn-evidence').trigger('click')
    expect(wrapper.emitted('complete-step')?.at(-1)).toEqual(['asm-call-stack-01', 5])
  })

  it('手动命令运行后输入框清空，仍可一键带入上一条', async () => {
    const lab = getCourseLab('num-bases-01')!
    const wrapper = mount(MissionPanel, {
      props: {
        level: lab,
        completed: false,
        hintsUsed: 0,
        isLast: false,
        mode: 'guided',
        guideStep: 1,
        completedSteps: [1],
      },
    })

    const input = wrapper.get<HTMLInputElement>('.manual-form input')
    await input.setValue('./bases')
    await wrapper.get('.manual-form').trigger('submit')
    expect(wrapper.emitted('run-command')?.at(-1)).toEqual(['./bases'])
    expect(wrapper.get<HTMLInputElement>('.manual-form input').element.value).toBe('')

    await wrapper.get('.btn-reuse-command').trigger('click')
    expect(wrapper.get<HTMLInputElement>('.manual-form input').element.value).toBe('./bases')
    wrapper.unmount()
  })
})
