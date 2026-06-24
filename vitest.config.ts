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
      // Lock in the coverage built up for the logic layers. `npm run test:coverage`
      // (and CI) fails if it regresses below these. Slightly under current actuals
      // (99.6% lines / 91% branch) so a legit refactor isn't blocked by noise.
      thresholds: {
        statements: 99,
        lines: 99,
        functions: 99,
        branches: 90,
      },
    },
  },
  resolve: {
    alias: {
      '~': path.resolve(__dirname, '.'),
      '~src': path.resolve(__dirname, './src'),
    },
  },
});