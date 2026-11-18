module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/tests/**/*.test.{ts,tsx}'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  clearMocks: true,
  restoreMocks: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/app/_layout.tsx',
    '!src/app/(tabs)/_layout.tsx',
    '!src/lib/theme.ts',
    '!src/**/*.test.{ts,tsx}',
  ],
  coverageDirectory: 'coverage-native',
  coverageReporters: ['text', 'html'],
  coverageThreshold: {
    global: {
      lines: 70,
      functions: 70,
      statements: 70,
      branches: 70,
    },
  },
}
