// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execSync } = require("child_process");

module.exports = () => {
  try {
    console.log("Stopping Redis container...");
    execSync("docker stop my-redis-container");
    console.log("Removing Redis container...");
    execSync("docker rm -v my-redis-container");
    console.log("Redis container stopped and removed successfully.");
  } catch (error) {
    console.error("Error stopping or removing Redis container:", error.message);
  }
};
