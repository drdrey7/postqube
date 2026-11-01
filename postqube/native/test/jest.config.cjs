module.exports = {
  rootDir: '../../..',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/postqube/native/test/*.spec.ts'],
  moduleNameMapper: { '^@gitroom/helpers/(.*)$': '<rootDir>/libraries/helpers/src/$1', '^canvas$': '<rootDir>/postqube/native/test/canvas.stub.cjs' },
  setupFilesAfterEnv: ['<rootDir>/postqube/native/test/dom-setup.cjs'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: { isolatedModules: true, jsx: 'react-jsx', target: 'ES2021', module: 'CommonJS', esModuleInterop: true }, diagnostics: false }] },
};
