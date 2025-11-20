// /cron/contractDeadlineChecker.js
const cron = require("node-cron");
const Contracts = require("../models/Contracts");
const Notification = require("../models/Notification");
const { notifyRole } = require("../services/notificationService");

// ================================
// EXPORT FUNCTION
// ================================
async function startContractDeadlineChecker() {
  console.log("⏱ Contract Deadline Cron Job Started");

  // Daily at 9:00 AM
  cron.schedule("0 9 * * *", async () => {
    await checkContractDailyAlerts();
  });

  // Hourly for last day
  cron.schedule("0 * * * *", async () => {
    await checkContractHourlyAlerts();
  });
}

// ================================
// DAILY ALERT (5–1 Days Before)
// ================================
async function checkContractDailyAlerts() {
  try {
    console.log("🔍 Running Daily Contract Deadline Check");

    const now = new Date();

    for (let days = 5; days >= 1; days--) {
      const start = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

      const contracts = await Contracts.find({
        status: "Active",
        isDeleted: false,
        endDate: { $gte: start, $lt: end },
      })
        .populate("project", "name")
        .lean();

      if (!contracts.length) continue;

      for (const contract of contracts) {
        const alertType = `contract-${days}-days-left`;

        const exists = await Notification.findOne({
          "meta.contractId": contract._id,
          "meta.alertType": alertType,
        });

        if (exists) continue;

        const title = `Contract Ending Soon – ${days} Day(s) Left`;
        const message = `The contract "${contract.contractName}" for project "${
          contract.project?.name
        }" will end on ${contract.endDate.toLocaleString()}.`;

        await notifyRole(
          "Admin",
          title,
          message,
          {
            contractId: contract._id,
            projectId: contract.project?._id,
            alertType,
          },
          "system"
        );

        console.log(
          `📢 SENT contract alert (${alertType}) for ${contract.contractName}`
        );
      }
    }
  } catch (err) {
    console.error("❌ Contract Daily Cron Error:", err);
  }
}

// ================================
// HOURLY ALERT (Last 24 Hours)
// ================================
async function checkContractHourlyAlerts() {
  try {
    console.log("⏱ Running Hourly Contract Deadline Check");

    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000);

    const contracts = await Contracts.find({
      status: "Active",
      isDeleted: false,
      endDate: { $gte: now, $lt: nextHour },
    })
      .populate("project", "name")
      .lean();

    for (const contract of contracts) {
      const alertType = "contract-hourly-final-day";

      // prevent multiple per hour
      const exists = await Notification.findOne({
        "meta.contractId": contract._id,
        "meta.alertType": alertType,
        createdAt: { $gte: new Date(Date.now() - 59 * 60 * 1000) },
      });

      if (exists) continue;

      const title = "Contract Ending Today – Final Hours";
      const message = `The contract "${contract.contractName}" for project "${
        contract.project?.name
      }" will end at ${contract.endDate.toLocaleTimeString()}.`;

      await notifyRole(
        "Admin",
        title,
        message,
        {
          contractId: contract._id,
          projectId: contract.project?._id,
          alertType,
        },
        "system"
      );

      console.log(`⏳ HOURLY contract alert sent for ${contract.contractName}`);
    }
  } catch (err) {
    console.error("❌ Contract Hourly Cron Error:", err);
  }
}

// EXPORT
module.exports = { startContractDeadlineChecker };
