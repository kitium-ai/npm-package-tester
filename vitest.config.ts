import { defineConfig } from 'vitest/config';
import path from 'node:path';

type Preset = {
  test?: Record<string, unknown>;
};

export default defineConfig(async () => {
  try {
    const { createKitiumVitestConfig, loadKitiumVitestBaseConfig } = await import(
      '@kitiumai/vitest-helpers'
    );

    const baseConfig = loadKitiumVitestBaseConfig();
    const baseCoverageExclude =
      (baseConfig.test as { coverage?: { exclude?: string[] } })?.coverage?.exclude ?? [];

    return createKitiumVitestConfig({
      environment: 'node',
      overrides: {
        test: {
          ...baseConfig.test,
          coverage: {
            ...(baseConfig.test as { coverage?: Record<string, unknown> })?.coverage,
            exclude: [...baseCoverageExclude, 'src/cli/index.ts'],
          },
        },
      },
    }) as Preset;
  } catch {
    console.warn(
      '[vitest] Failed to load @kitiumai/vitest-helpers presets, falling back to local defaults.',
    );

    const baseTest: Record<string, unknown> = {
      globals: true,
      environment: 'node',
      restoreMocks: true,
      clearMocks: true,
      mockReset: true,
      coverage: {
        enabled: true,
        provider: 'v8',
        reporter: ['text', 'lcov', 'html'],
        reportsDirectory: 'coverage',
        exclude: ['dist/**', 'tests/setup/**', 'tests/**/fixtures/**', 'src/cli/index.ts'],
      },
    };

    return {
      test: {
        ...baseTest,
        include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
      },
      resolve: {
        alias: {
          application: path.resolve(__dirname, 'src/application'),
          formatters: path.resolve(__dirname, 'src/formatters'),
          domain: path.resolve(__dirname, 'src/domain'),
          '@babel/types': path.resolve(__dirname, 'tests/fixtures/babel-types-stub.ts'),
        },
      },
    } satisfies Preset & { resolve: { alias: Record<string, string> } };
  }
});
