import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Logic layers only — UI components, hooks, and entry shells are covered
      // by behavior/integration/E2E tests, not unit line-coverage.
      include: [
        'src/services/**/*.ts',
        'src/store/**/*.ts',
        'src/lib/**/*.ts',
        'src/utils/**/*.ts',
      ],
      exclude: [
        '**/*.d.ts',
        '**/*.test.*',
        'src/types/**',
      ],
    },
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, '.'),
      '~src': path.resolve(__dirname, './src'),
    },
  },
});