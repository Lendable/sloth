export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts']
};