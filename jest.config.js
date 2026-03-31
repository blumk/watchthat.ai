/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx" } }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "\\.(css|scss)$": "<rootDir>/__mocks__/fileMock.ts",
  },
  testMatch: ["**/__tests__/**/*.test.(ts|tsx)"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};

module.exports = config;
