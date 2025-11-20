// server.js
const app = require("./app");
const http = require("http");
const server = http.createServer(app);

const { initSocket } = require("./socket");
initSocket(server);

// Import Cron Job
const {
  startProjectDeadlineChecker,
} = require("./cron/projectDeadlineChecker");
const {
  startContractDeadlineChecker,
} = require("./cron/contractDeadlineChecker");

const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running at port ${PORT}`);

  // Start cron job
  startProjectDeadlineChecker();
  startContractDeadlineChecker();
});
