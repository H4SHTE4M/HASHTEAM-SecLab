<script setup lang="ts">
defineProps<{
  name:
    | 'book-open'
    | 'activity'
    | 'braces'
    | 'check'
    | 'chevron-right'
    | 'copy'
    | 'crosshair'
    | 'download'
    | 'external-link'
    | 'file-text'
    | 'git-branch'
    | 'hash'
    | 'help-circle'
    | 'home'
    | 'info'
    | 'lightbulb'
    | 'list-checks'
    | 'layers'
    | 'lock'
    | 'moon'
    | 'minus'
    | 'palette'
    | 'plus'
    | 'rotate-ccw'
    | 'save'
    | 'server'
    | 'shield-check'
    | 'sun'
    | 'terminal'
    | 'trophy'
    | 'trash-2'
    | 'x'
  size?: number
}>()
</script>

<template>
  <svg
    :width="size ?? 18"
    :height="size ?? 18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <template v-if="name === 'hash'">
      <line x1="4" x2="20" y1="9" y2="9" />
      <line x1="4" x2="20" y1="15" y2="15" />
      <line x1="10" x2="8" y1="3" y2="21" />
      <line x1="16" x2="14" y1="3" y2="21" />
    </template>
    <template v-else-if="name === 'activity'">
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </template>
    <template v-else-if="name === 'braces'">
      <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" />
      <path d="M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1" />
    </template>
    <template v-else-if="name === 'help-circle'">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.1 9a3 3 0 1 1 5.8 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </template>
    <template v-else-if="name === 'home'">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </template>
    <template v-else-if="name === 'rotate-ccw'">
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </template>
    <template v-else-if="name === 'book-open'">
      <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
    </template>
    <template v-else-if="name === 'crosshair'">
      <circle cx="12" cy="12" r="10" />
      <line x1="22" x2="18" y1="12" y2="12" />
      <line x1="6" x2="2" y1="12" y2="12" />
      <line x1="12" x2="12" y1="6" y2="2" />
      <line x1="12" x2="12" y1="22" y2="18" />
    </template>
    <template v-else-if="name === 'terminal'">
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" x2="20" y1="19" y2="19" />
    </template>
    <template v-else-if="name === 'lock'">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m20 6-11 11-5-5" />
    </template>
    <template v-else-if="name === 'lightbulb'">
      <path d="M9 18h6" />
      <path d="M10 22h4" />
      <path d="M15.1 14c.2-1 .7-1.7 1.5-2.5A6 6 0 1 0 6 7c0 1.7.7 3.2 1.8 4.3.8.8 1.3 1.7 1.5 2.7" />
    </template>
    <template v-else-if="name === 'file-text'">
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" x2="16" y1="13" y2="13" />
      <line x1="8" x2="16" y1="17" y2="17" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </template>
    <template v-else-if="name === 'external-link'">
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </template>
    <template v-else-if="name === 'git-branch'">
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </template>
    <template v-else-if="name === 'list-checks'">
      <path d="m3 7 2 2 4-4" />
      <path d="m3 17 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="M13 12h8" />
      <path d="M13 18h8" />
    </template>
    <template v-else-if="name === 'layers'">
      <path d="m12.8 2.6 8.2 4.6a1 1 0 0 1 0 1.7l-8.2 4.6a1.6 1.6 0 0 1-1.6 0L3 8.9a1 1 0 0 1 0-1.7l8.2-4.6a1.6 1.6 0 0 1 1.6 0Z" />
      <path d="m22 13-9.2 5.1a1.6 1.6 0 0 1-1.6 0L2 13" />
      <path d="m22 17-9.2 5.1a1.6 1.6 0 0 1-1.6 0L2 17" />
    </template>
    <template v-else-if="name === 'chevron-right'">
      <path d="m9 18 6-6-6-6" />
    </template>
    <template v-else-if="name === 'server'">
      <rect width="20" height="8" x="2" y="2" rx="2" ry="2" />
      <rect width="20" height="8" x="2" y="14" rx="2" ry="2" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </template>
    <template v-else-if="name === 'save'">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </template>
    <template v-else-if="name === 'shield-check'">
      <path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z" />
      <path d="m9 12 2 2 4-4" />
    </template>
    <template v-else-if="name === 'moon'">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </template>
    <template v-else-if="name === 'sun'">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.42 1.42" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </template>
    <template v-else-if="name === 'palette'">
      <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" stroke="none" />
      <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" stroke="none" />
      <path d="M12 22a10 10 0 1 1 10-10c0 2.2-1.8 4-4 4h-1.8c-.9 0-1.5 1-.9 1.8l.3.5c1 1.6-.2 3.7-2.1 3.7z" />
    </template>
    <template v-else-if="name === 'minus'">
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'trophy'">
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4V2h10v2" />
      <path d="M17 4v4a5 5 0 0 1-10 0V4" />
      <path d="M5 4H3v2a4 4 0 0 0 4 4" />
      <path d="M19 4h2v2a4 4 0 0 1-4 4" />
    </template>
    <template v-else-if="name === 'trash-2'">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 15H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </template>
    <template v-else-if="name === 'x'">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </template>
  </svg>
</template>
