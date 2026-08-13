import productionProfile from '../../../vm/profiles/production.json'

const LAB_ID_PATTERN = /^[a-z][a-z0-9-]{0,95}$/
const configuredLabIds: unknown = productionProfile.pwnhubLabs

if (
  !Array.isArray(configuredLabIds) ||
  configuredLabIds.length === 0 ||
  configuredLabIds.some(
    (labId) => typeof labId !== 'string' || !LAB_ID_PATTERN.test(labId),
  ) ||
  new Set(configuredLabIds).size !== configuredLabIds.length
) {
  throw new Error('production profile 包含无效或重复的 PwnHub labId')
}

/** 生产 profile 是前端课程、VM rootfs、下载产物和遥测白名单的唯一发布清单。 */
export const PUBLISHED_PWNHUB_LAB_IDS: readonly string[] = Object.freeze([
  ...configuredLabIds,
])
