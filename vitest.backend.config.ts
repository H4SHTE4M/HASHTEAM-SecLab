import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/backend.test.ts'],
    environment: 'node',
  },
})
