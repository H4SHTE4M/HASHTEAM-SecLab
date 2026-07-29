// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import AboutModal from '../src/components/AboutModal.vue'
import LoadingScreen from '../src/components/LoadingScreen.vue'
import MissionPanel from '../src/components/MissionPanel.vue'
import OnboardingDialog from '../src/components/OnboardingDialog.vue'
import TopBar from '../src/components/TopBar.vue'
import type { LevelDef } from '../src/types/lab'

const level: LevelDef = {
  id: 1,
  name: '测试关卡',
  tagline: '测试副标题',
  storySummary: '这是不会泄露答案的短背景。',
  story: '这是可以完整展开、不会被不可恢复截断的长故事内容。',
  goals: ['观察输出', '自己补全', '完成判断'],
  prerequisites: [],
  newConcepts: ['提示符'],
  steps: [
    {
      id: 1,
      type: 'explain',
      title: '认识提示符',
      objective: '先理解输入区域',
      instruction: '提示符后面才是输入区。',
      completion: 'acknowledge',
      allowRun: false,
      introduces: [{ id: 'prompt', term: '提示符', explanation: '不要把 $ 当成命令。' }],
      reinforcement: '从光标处输入。',
    },
    {
      id: 2,
      type: 'observe',
      title: '观察身份',
      objective: '运行并观察用户名',
      instruction: '运行后查看下一行。',
      completion: 'run',
      allowRun: true,
      command: 'whoami',
      observation: '只观察用户名，不复制提示符。',
      reinforcement: '命令和输出是两件事。',
    },
    {
      id: 3,
      type: 'partial-command',
      title: '补全读取命令',
      objective: '填写真实文件名',
      instruction: '根据 ls 输出填写。',
      completion: 'input',
      allowRun: false,
      commandTemplate: 'cat {{file}}',
      fields: [{ id: 'file', label: '文件名', placeholder: '从输出填写' }],
      observation: '确认输出是文件内容。',
      commonErrors: ['不要照抄提示文字。'],
      reinforcement: '参数来自观察。',
    },
    {
      id: 4,
      type: 'question',
      title: '判断复制范围',
      objective: '选择真实值',
      instruction: '根据输出判断。',
      completion: 'answer',
      allowRun: false,
      question: {
        prompt: '应该提交哪一段？',
        choices: [
          { id: 'value', label: '真实值' },
          { id: 'placeholder', label: '<结果>' },
        ],
        answer: 'value',
        success: '正确，只提交真实值。',
      },
      reinforcement: '占位符要替换。',
    },
  ],
  hints: [
    { level: 1, kind: 'direction', text: '先观察什么' },
    { level: 2, kind: 'tool', text: '可使用哪个工具' },
    { level: 3, kind: 'structure', text: '命令结构仍留空位' },
  ],
  verification: {
    usage: 'check <结果>',
    instruction: '替换占位符并手动输入。',
    placeholders: [{ token: '<结果>', meaning: '从终端发现的真实值' }],
    feedback: { empty: '未填写', incorrect: '不匹配', success: '正确' },
  },
  completionSummary: {
    solved: '你完成了真实环境检查。',
    mastered: ['观察输出', '补全参数', '根据结果判断'],
    next: '下一关继续复用观察能力。',
  },
}

function missionProps(overrides: Record<string, unknown> = {}) {
  return {
    level,
    completed: false,
    hintsUsed: 0,
    isLast: false,
    mode: 'guided' as const,
    guideStep: 0,
    completedSteps: [],
    ...overrides,
  }
}

describe('accessible components', () => {
  it('关于弹窗接管焦点、支持 Escape，并在卸载时恢复焦点', async () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()

    const wrapper = mount(AboutModal, { attachTo: document.body })
    await nextTick()

    const dialog = wrapper.get('[role="dialog"]')
    expect(dialog.attributes('aria-modal')).toBe('true')
    expect(document.activeElement).toBe(wrapper.get('.btn-close').element)
    expect(wrapper.get('.build-info code').attributes('title')).toBe(__SOURCE_ID__)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(wrapper.emitted('close')).toHaveLength(1)

    wrapper.unmount()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })

  it('加载状态可被读屏感知，日志按钮公开展开状态', async () => {
    const wrapper = mount(LoadingScreen, {
      props: { stage: 'loading-assets', errorMessage: null },
    })

    expect(wrapper.get('.loading-overlay').attributes('role')).toBe('status')
    const toggle = wrapper.get('.log-toggle')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    await wrapper.setProps({ stage: 'error', errorMessage: 'failed' })
    expect(wrapper.get('.loading-overlay').attributes('role')).toBe('alert')
  })

  it('重新开始按钮需要二次点击才发送事件', async () => {
    const wrapper = mount(TopBar, {
      props: { completedCount: 2, total: 10, mode: 'guided' },
    })
    const restart = wrapper.findAll('button').find((button) => button.text() === '重新开始')
    expect(restart).toBeDefined()

    await restart!.trigger('click')
    expect(wrapper.emitted('reset-all')).toBeUndefined()
    expect(restart!.text()).toContain('确认')
    await restart!.trigger('click')
    expect(wrapper.emitted('reset-all')).toHaveLength(1)
  })

  it('Onboarding 覆盖提示符、按键、命令结构、占位符、复制、提示与重置', async () => {
    const wrapper = mount(OnboardingDialog, {
      props: { mode: null, progressResetNotice: true },
      attachTo: document.body,
    })

    expect(wrapper.text()).toContain('你希望怎样完成新手村')
    expect(wrapper.text()).toContain('旧版步骤进度已重置')
    await wrapper.get('.mode-card-recommended').trigger('click')
    expect(wrapper.emitted('select-mode')?.[0]).toEqual(['guided'])
    expect(wrapper.text()).toContain('提示符后面才是输入区')
    expect(wrapper.text()).toContain('Backspace')
    expect(wrapper.text()).toContain('↑ / ↓')

    await wrapper.get('.btn-primary').trigger('click')
    expect(wrapper.text()).toContain('命令、选项和参数靠空格分开')
    expect(wrapper.get<HTMLButtonElement>('.btn-primary').element.disabled).toBe(true)
    await wrapper.get('.demo-command').trigger('click')
    expect(wrapper.emitted('run-demo')).toHaveLength(1)
    await wrapper.get('.btn-primary').trigger('click')
    expect(wrapper.text()).toContain('占位符必须换成真实值')
    expect(wrapper.text()).toContain('不要带上提示符')

    await wrapper.get('.btn-primary').trigger('click')
    expect(wrapper.text()).toContain('按需提示')
    expect(wrapper.text()).toContain('重置本关')
    await wrapper.get('.btn-primary').trigger('click')
    expect(wrapper.emitted('complete')).toHaveLength(1)
    wrapper.unmount()
  })

  it('关键步骤未留下证据时不能推进，运行示例后仍需确认观察点', async () => {
    const wrapper = mount(MissionPanel, { props: missionProps() })

    expect(wrapper.find('.btn-advance').exists()).toBe(false)
    await wrapper.get('.btn-evidence').trigger('click')
    expect(wrapper.emitted('complete-step')?.[0]).toEqual([1, 1])
    expect(wrapper.find('.btn-advance').exists()).toBe(true)
    await wrapper.get('.btn-advance').trigger('click')
    expect(wrapper.emitted('advance-guide')?.[0]).toEqual([1, 4])

    await wrapper.setProps({ guideStep: 1, completedSteps: [1] })
    await wrapper.get('.command-run').trigger('click')
    expect(wrapper.emitted('run-command')?.at(-1)).toEqual(['whoami'])
    expect(wrapper.emitted('complete-step')).toHaveLength(1)
    expect(wrapper.find('.btn-advance').exists()).toBe(false)
    await wrapper.get('.btn-evidence').trigger('click')
    expect(wrapper.emitted('complete-step')?.at(-1)).toEqual([1, 2])
  })

  it('补全步骤没有一键答案，字段为空不能运行，填写后仍需观察确认', async () => {
    const wrapper = mount(MissionPanel, {
      props: missionProps({ guideStep: 2, completedSteps: [1, 2] }),
    })

    expect(wrapper.get('.command-template').text()).toContain('cat {{file}}')
    expect(wrapper.find('.command-run').exists()).toBe(false)
    await wrapper.get('.structured-form').trigger('submit')
    expect(wrapper.text()).toContain('请先填写“文件名”')
    const emittedBefore = wrapper.emitted('run-command')?.length ?? 0

    await wrapper.get('.structured-form input').setValue('README')
    await wrapper.get('.structured-form').trigger('submit')
    expect(wrapper.emitted('run-command')).toHaveLength(emittedBefore + 1)
    expect(wrapper.emitted('run-command')?.at(-1)).toEqual(['cat README'])
    expect(wrapper.emitted('complete-step')).toBeUndefined()
    await wrapper.get('.btn-evidence').trigger('click')
    expect(wrapper.emitted('complete-step')?.[0]).toEqual([1, 3])
  })

  it('挑战模式共享同一步骤目标，但默认隐藏模板，第三层提示后才显示结构', async () => {
    const wrapper = mount(MissionPanel, {
      props: missionProps({
        mode: 'challenge',
        guideStep: 2,
        completedSteps: [1, 2],
      }),
    })

    expect(wrapper.text()).toContain('填写真实文件名')
    expect(wrapper.find('.command-template').exists()).toBe(false)
    expect(wrapper.get('.manual-form').text()).toContain('挑战模式')
    await wrapper.get('.btn-hint').trigger('click')
    expect(wrapper.emitted('use-hint')?.[0]).toEqual([1])

    await wrapper.setProps({ hintsUsed: 3 })
    expect(wrapper.get('.command-template').text()).toContain('cat {{file}}')
    expect(wrapper.text()).toContain('最高级提示仍保留')
  })

  it('分层提示按方向、工具、结构顺序展开，获取提示不会跳过步骤', async () => {
    const wrapper = mount(MissionPanel, {
      props: missionProps({ hintsUsed: 1 }),
    })
    expect(wrapper.get('.hints').text()).toContain('第 1 层 · 方向')
    expect(wrapper.get('.hints').text()).not.toContain('第 2 层 · 工具')
    await wrapper.get('.btn-hint').trigger('click')
    expect(wrapper.emitted('use-hint')).toHaveLength(1)
    expect(wrapper.emitted('complete-step')).toBeUndefined()
    expect(wrapper.emitted('advance-guide')).toBeUndefined()

    await wrapper.setProps({ hintsUsed: 2 })
    expect(wrapper.get('.hints').text()).toContain('第 2 层 · 工具')
    await wrapper.setProps({ hintsUsed: 3 })
    expect(wrapper.get('.hints').text()).toContain('第 3 层 · 结构')
  })

  it('验证区在全部步骤完成前锁定，并拒绝原样占位符', async () => {
    const wrapper = mount(MissionPanel, {
      props: missionProps({ guideStep: 3, completedSteps: [1, 2, 3] }),
    })
    expect(wrapper.get('.verification').classes()).toContain('locked')
    expect(wrapper.find('.verification-form').exists()).toBe(false)

    await wrapper.setProps({ completedSteps: [1, 2, 3, 4] })
    expect(wrapper.get('.verification').classes()).not.toContain('locked')
    expect(wrapper.text()).toContain('<结果>')
    await wrapper.get('.verification-form input').setValue('check <结果>')
    await wrapper.get('.verification-form').trigger('submit')
    expect(wrapper.text()).toContain('仍有尖括号占位符')
    expect(wrapper.emitted('run-command')).toBeUndefined()

    await wrapper.get('.verification-form input').setValue('check discovered-value')
    await wrapper.get('.verification-form').trigger('submit')
    expect(wrapper.emitted('run-command')?.[0]).toEqual(['check discovered-value'])
  })

  it('首次概念在相关操作前显示，长故事可展开且不被截断', async () => {
    const wrapper = mount(MissionPanel, { props: missionProps() })
    expect(wrapper.get('.concept-card').text()).toContain('提示符')
    const conceptPosition = wrapper.html().indexOf('concept-card')
    const instructionPosition = wrapper.html().indexOf('step-instruction')
    expect(conceptPosition).toBeLessThan(instructionPosition)

    const details = wrapper.get('.story-details')
    expect(details.attributes('open')).toBeUndefined()
    expect(details.text()).toContain('可以完整展开')
    await details.get('summary').trigger('click')
    expect(details.attributes('open')).toBeDefined()
  })

  it('通关后先展示总结与能力迁移，不弹窗抢焦点或遮挡下一关', () => {
    const wrapper = mount(MissionPanel, {
      props: missionProps({
        completed: true,
        completedSteps: [1, 2, 3, 4],
      }),
    })

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('你完成了真实环境检查')
    expect(wrapper.text()).toContain('你实际掌握了')
    expect(wrapper.text()).toContain('下一关继续复用观察能力')
    expect(wrapper.find('.current-action').exists()).toBe(false)
    expect(wrapper.get('.btn-next').text()).toContain('准备好后进入第 2 关')
  })
})
