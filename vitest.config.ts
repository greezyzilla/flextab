import { configDefaults, defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    css: true,
    // Vitest 5 clears mock calls before every test by default. Tests read the
    // listeners modules register on chrome.* at import, so keep the calls.
    clearMocks: false,
    // Two projects in one gate: the jsdom unit/component tests, and the few
    // checks that need a real rendering engine (`*.browser.test.tsx`, e.g. the
    // colour-contrast guard: oklch relative colours, color-mix and composited
    // fills only resolve in a browser).
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: ['./src/test/setup.ts'],
          exclude: [...configDefaults.exclude, '**/*.browser.test.*'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['src/**/*.browser.test.{ts,tsx}'],
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            screenshotFailures: false,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html'],
      reportOnFailure: true,
      // Logic-layer denominator. Component/entry tests also run, but their
      // coverage is not measured here. Native extension E2E remains QA-02.
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
      // QA-01: cap uncovered code at the measured baseline (negative values),
      // so adding covered code cannot dilute existing gaps. Critical files have
      // additional per-file floors. See docs/quality-gates.md before changing.
      thresholds: {
        // Vitest 5 measurement (2026-11-26), after behaviour tests brought the
        // critical sync files back to the floors they had under Vitest 3.
        statements: -171,
        lines: -90,
        functions: -33,
        branches: -184,
        'src/services/{importWorkspace,landedSnapshot,syncPolicy,workspaceBackup}.ts': {
          statements: 100, lines: 100, functions: 100, branches: 100,
        },
        ...Object.fromEntries([
          'services/mergeBase', 'services/revision', 'services/saveTabsAsGroup',
          'services/settingsSync', 'services/spacesMerge3', 'services/structuredSync',
          'store/syncStorage', 'store/useAuthStore',
        ].map(file => [`src/${file}.ts`, {
          statements: 100, lines: 100, functions: 100, branches: 90,
        }])),
        'src/lib/yjsDoc.ts': {
          statements: 98, lines: 98, functions: 100, branches: 84,
        },
        'src/services/syncEngine.ts': {
          statements: 85, lines: 85, functions: 95, branches: 83,
        },
        'src/services/oauthLogin.ts': {
          statements: 96, lines: 96, functions: 100, branches: 93,
        },
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
