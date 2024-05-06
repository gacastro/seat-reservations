// eslint-disable-next-line @typescript-eslint/no-var-requires
const { execSync } = require("child_process");

module.exports = () => {
  try {
    console.log("Starting Redis container...");
    execSync(
      "docker run --name my-redis-container -p 6379:6379 -d redis:latest",
    );
    console.log("Redis container started successfully.");
  } catch (error) {
    console.error("Error starting Redis container:", error.message);
  }
};
