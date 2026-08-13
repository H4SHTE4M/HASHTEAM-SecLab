export const PUBLISHED_PWNHUB_LAB_IDS = [
  'memory-addresses-01',
  'memory-layout-01',
  'memory-register-stack-01',
  'asm-registers-01',
  'asm-arithmetic-01',
  'asm-stack-ops-01',
  'asm-branches-01',
  'asm-call-stack-01',
  'elf-bytes-01',
  'elf-sections-01',
  'elf-symbols-01',
  'elf-disassembly-01',
] as const

export type PublishedPwnHubLabId = (typeof PUBLISHED_PWNHUB_LAB_IDS)[number]

const publishedLabIds = new Set<string>(PUBLISHED_PWNHUB_LAB_IDS)

export function isPublishedPwnHubLab(labId: string): labId is PublishedPwnHubLabId {
  return publishedLabIds.has(labId)
}
