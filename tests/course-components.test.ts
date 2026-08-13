// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
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
        currentLabId: 'memory-addresses-01',
        completedLabIds: [],
        completedLevels: [],
        completionRecords: {},
      },
    })

    expect(wrapper.get('[data-lab-id="memory-addresses-01"]').attributes('aria-current')).toBe(
      'step',
    )
    await wrapper.get('.chapter-button').trigger('click')
    const chapters = wrapper.findAll('.chapter-menu > button')
    expect(chapters).toHaveLength(7)
    expect(chapters[0].attributes('aria-disabled')).toBeUndefined()
    for (const index of [1, 2]) {
      expect(chapters[index].attributes('disabled')).toBeUndefined()
      expect(chapters[index].attributes('aria-disabled')).toBe('true')
    }
    for (const index of [3, 4, 5, 6]) {
      expect(chapters[index].attributes('disabled')).toBeDefined()
    }

    await wrapper.get('[data-lab-id="memory-addresses-01"]').trigger('click')
    expect(wrapper.emitted('select')?.[0]).toEqual(['memory-addresses-01'])
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
    const assemblyChapter = wrapper.findAll('.chapter-menu > button')[1]
    for (let count = 0; count < 5; count += 1) await assemblyChapter.trigger('click')
    expect(wrapper.emitted('debug-unlock-chapter')?.[0]).toEqual(['asm-reading'])

    await wrapper.setProps({
      debugUnlockedLabIds: ['memory-layout-01'],
      debugUnlockedChapterIds: ['asm-reading'],
    })
    expect(lockedLab.attributes('aria-disabled')).toBeUndefined()
  })

  it('章节菜单用圆环显示本章进度，完成后改为对勾', async () => {
    const memoryIds = COURSE.chapters[0].labIds
    const assemblyIds = COURSE.chapters[1].labIds
    const wrapper = mount(CourseRail, {
      props: {
        course: COURSE,
        currentLabId: 'asm-registers-01',
        completedLabIds: memoryIds,
        completedLevels: [],
        completionRecords: {},
      },
    })

    await wrapper.get('.chapter-button').trigger('click')
    const chapters = wrapper.findAll('.chapter-menu > button')
    expect(chapters[0].find('.chapter-complete').exists()).toBe(true)
    expect(chapters[1].find('.chapter-progress-ring').exists()).toBe(true)
    expect(chapters[1].text()).toContain('0 / 5 个实验')

    await wrapper.setProps({ completedLabIds: [...memoryIds, 'asm-registers-01'] })
    expect(wrapper.findAll('.chapter-menu > button')[1].find('.chapter-complete').exists()).toBe(false)
    expect(wrapper.findAll('.chapter-menu > button')[1].text()).toContain('1 / 5 个实验')

    await wrapper.setProps({ completedLabIds: [...memoryIds, ...assemblyIds] })
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
})
