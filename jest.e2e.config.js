// eslint-disable-next-line @typescript-eslint/no-var-requires
const baseConfig = require("./jest.config");

module.exports = {
  ...baseConfig,
  testRegex: ".*\\.e2e-tests\\.ts$",
  globalSetup: "./setupRedis.js",
  globalTeardown: "./teardownRedis.js",
};
