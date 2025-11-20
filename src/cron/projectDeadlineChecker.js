// /cron/projectDeadlineChecker.js
const cron = require("node-cron");
const Projects = require("../models/Projects");
const Notification = require("../models/Notification");
const { notifyRole } = require("../services/notificationService");

// ================================
// EXPORT FUNCTION PROPERLY
// ================================
async function startProjectDeadlineChecker() {
  console.log("⏱ Project Deadline Cron Jobs Started");

  // Daily Cron — runs every day at 9 AM
  cron.schedule("0 9 * * *", async () => {
    await checkDailyDeadlineAlerts();
  });

  // Hourly Cron — runs every hour
  cron.schedule("0 * * * *", async () => {
    await checkHourlyDeadlineAlerts();
  });
}

// ================================
// DAILY ALERT (5–1 Days Before)
// ================================
async function checkDailyDeadlineAlerts() {
  try {
    console.log("🔍 Running Daily Deadline Check (5–1 days)");

    const now = new Date();

    for (let days = 5; days >= 1; days--) {
      const start = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

      const projects = await Projects.find({
        status: "Active",
        isDeleted: false,
        deadline: { $gte: start, $lt: end },
      }).lean();

      if (!projects.length) continue;

      for (const project of projects) {
        const alertType = `${days}-days-left`;

        // prevent duplicates
        const exists = await Notification.findOne({
          "meta.projectId": project._id,
          "meta.alertType": alertType,
        });

        if (exists) continue;

        const title = `Project Deadline Alert: ${days} Day(s) Left`;
        const message = `The project "${
          project.name
        }" will reach its deadline on ${project.deadline.toLocaleString()}.`;

        await notifyRole(
          "Admin",
          title,
          message,
          {
            projectId: project._id,
            alertType,
          },
          "system"
        );

        console.log(`📢 SENT: ${alertType} for ${project.name}`);
      }
    }
  } catch (err) {
    console.error("❌ Daily Cron Error:", err);
  }
}

// ================================
// HOURLY ALERT (Last 24 Hours)
// ================================
async function checkHourlyDeadlineAlerts() {
  try {
    console.log("⏱ Running Hourly Deadline Check");

    const now = new Date();
    const nextHour = new Date(now.getTime() + 60 * 60 * 1000);

    const projects = await Projects.find({
      status: "Active",
      isDeleted: false,
      deadline: { $gte: now, $lt: nextHour },
    }).lean();

    for (const project of projects) {
      const alertType = "hourly-last-day";

      // prevent multiple notifications in the same hour
      const exists = await Notification.findOne({
        "meta.projectId": project._id,
        "meta.alertType": alertType,
        createdAt: { $gte: new Date(Date.now() - 59 * 60 * 1000) },
      });

      if (exists) continue;

      const title = "Project Deadline Alert: Final Hours";
      const message = `The project "${
        project.name
      }" will reach its deadline at ${project.deadline.toLocaleTimeString()}.`;

      await notifyRole(
        "Admin",
        title,
        message,
        {
          projectId: project._id,
          alertType,
        },
        "system"
      );

      console.log(`⏳ HOURLY ALERT SENT for project: ${project.name}`);
    }
  } catch (err) {
    console.error("❌ Hourly Cron Error:", err);
  }
}

// ==================================
// EXPORT CORRECTLY
// ==================================
module.exports = { startProjectDeadlineChecker };
