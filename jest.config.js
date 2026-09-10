/** Pure TS logic only — no React Native runtime needed for these. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'],
};
