/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/../../$1'
  },
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest'
  },
  testTimeout: 30000
};

