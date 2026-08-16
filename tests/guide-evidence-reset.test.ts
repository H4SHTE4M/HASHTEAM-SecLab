// @vitest-environment jsdom
// 回归：同关/同实验「重置」后，MissionPanel 的本地证据缓存必须失效，
// 引导不得在没有持久化证据的情况下推进（guide-ahead-of-evidence）。
import { beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { computed, defineComponent } from 'vue'
import MissionPanel from '../src/components/MissionPanel.vue'
import PwnHubMissionPanel from '../src/components/PwnHubMissionPanel.vue'
import { useLabProgress } from '../src/composables/useLabProgress'
import { LEVELS } from '../src/data/levels'
import { COURSE, getCourseLab } from '../src/modules/pwnhub/course'
import {
  detectBlockingAnomalies,
  detectLabBlockingAnomalies,
} from '../src/services/progress-anomaly'

/** 通过真实 UI 控件完成当前步并进入下一步（observe/manual/explain/acknowledge 通用）。 */
async function completeCurrentStepAndAdvance(panel: VueWrapper<any>) {
  const runBtn = panel.find('.command-run')
  if (runBtn.exists()) await runBtn.trigger('click')
  const evidenceBtn = panel.find('.btn-evidence')
  expect(evidenceBtn.exists()).toBe(true)
  await evidenceBtn.trigger('click')
  const advanceBtn = panel.find('.btn-advance')
  expect(advanceBtn.exists()).toBe(true)
  await advanceBtn.trigger('click')
}

describe('重置后引导不得越过证据', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('SecLab：重置本关后需重新留证据，guide 不会超过证据前缀', async () => {
    const level = LEVELS.find((item) => item.id === 7)
    expect(level).toBeDefined()
    const progress = useLabProgress()
    progress.setLevel(7)

    // 与 SecLabWorkspace 相同的绑定：props 直接来自 progress store，重置不重挂载组件
    const Harness = defineComponent({
      components: { MissionPanel },
      setup() {
        const guideStep = computed(() => progress.guideStepFor(7, level!.steps.length))
        const completedSteps = computed(() => progress.completedStepsFor(7))
        return { level, guideStep, completedSteps, progress }
      },
      template: `
        <MissionPanel
          :level="level"
          :completed="false"
          :hints-used="0"
          :is-last="false"
          mode="guided"
          :guide-step="guideStep"
          :completed-steps="completedSteps"
          @advance-guide="progress.advanceGuide"
          @complete-step="progress.completeStep"
        />`,
    })
    const wrapper = mount(Harness)
    const panel = wrapper

    // 第 1-3 步（observe / manual-command / explain）
    for (let step = 0; step < 3; step += 1) {
      await completeCurrentStepAndAdvance(panel)
    }
    expect(progress.completedStepsFor(7)).toEqual([1, 2, 3])
    expect(progress.state.guideSteps[7]).toBe(3)

    // 顶栏「重置本关」：store 清空本关 guide/证据
    progress.resetLevel(7)
    await wrapper.vm.$nextTick()
    expect(progress.completedStepsFor(7)).toEqual([])
    expect(progress.state.guideSteps[7]).toBe(0)

    // 关键回归断言：回到第 1 步后不能直接「进入下一步」；observe 步骤必须
    // 重新运行命令后才允许留证据（本地证据缓存确已随重置失效）
    expect(panel.find('.btn-advance').exists()).toBe(false)
    expect(panel.find('.btn-evidence').exists()).toBe(false)
    await panel.get('.command-run').trigger('click')
    expect(panel.find('.btn-evidence').exists()).toBe(true)

    // 重新走一遍：证据重新持久化，检测器不报警
    for (let step = 0; step < 3; step += 1) {
      await completeCurrentStepAndAdvance(panel)
    }
    expect(progress.completedStepsFor(7)).toEqual([1, 2, 3])
    expect(progress.state.guideSteps[7]).toBe(3)
    expect(
      detectBlockingAnomalies({ progress: progress.state, levels: LEVELS, mode: 'guided' })
        .blocking,
    ).toHaveLength(0)
  })

  it('PwnHub：重置实验后需重新留证据，guide 不会超过证据前缀', async () => {
    const lab = getCourseLab('memory-addresses-01')
    expect(lab).toBeDefined()
    const progress = useLabProgress()
    progress.setLab(lab!.labId)

    // 与 PwnHubWorkspace 相同的绑定
    const Harness = defineComponent({
      components: { PwnHubMissionPanel },
      setup() {
        const guideStep = computed(() =>
          progress.labGuideStepFor(lab!.labId, lab!.steps.length),
        )
        const completedSteps = computed(() => progress.completedLabStepsFor(lab!.labId))
        return { lab, guideStep, completedSteps, progress }
      },
      template: `
        <PwnHubMissionPanel
          :level="lab"
          :completed="false"
          :hints-used="0"
          :is-last="false"
          mode="guided"
          :guide-step="guideStep"
          :completed-steps="completedSteps"
          @advance-guide="progress.advanceLabGuide"
          @complete-step="progress.completeLabStep"
        />`,
    })
    const wrapper = mount(Harness)
    const panel = wrapper

    // 第 1-2 步（visual-trace / terminal，均为 acknowledge 确认）
    for (let step = 0; step < 2; step += 1) {
      await completeCurrentStepAndAdvance(panel)
    }
    expect(progress.completedLabStepsFor(lab!.labId)).toEqual([1, 2])
    expect(progress.state.labGuideSteps[lab!.labId]).toBe(2)

    progress.resetLab(lab!.labId)
    await wrapper.vm.$nextTick()
    expect(progress.completedLabStepsFor(lab!.labId)).toEqual([])
    expect(progress.state.labGuideSteps[lab!.labId]).toBe(0)

    expect(panel.find('.btn-advance').exists()).toBe(false)
    expect(panel.find('.btn-evidence').exists()).toBe(true)

    for (let step = 0; step < 2; step += 1) {
      await completeCurrentStepAndAdvance(panel)
    }
    expect(progress.completedLabStepsFor(lab!.labId)).toEqual([1, 2])
    expect(progress.state.labGuideSteps[lab!.labId]).toBe(2)
    expect(
      detectLabBlockingAnomalies({
        progress: progress.state,
        labs: COURSE.labs,
        mode: 'guided',
      }).blocking,
    ).toHaveLength(0)
  })
})
