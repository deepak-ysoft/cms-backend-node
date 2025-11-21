// /cron/contractDeadlineChecker.js
const cron = require("node-cron");
const Contracts = require("../models/Contracts");
const Projects = require("../models/Projects");
const Notification = require("../models/Notification");

const {
  notifyRole,
  notifyProjectTeam,
  notifyContractStatus,
} = require("../services/notificationService");

function startContractDeadlineChecker() {

  cron.schedule("0 9 * * *", checkContractDailyAlerts); // daily 09:00
  cron.schedule("0 * * * *", checkContractHourlyAlerts); // hourly :00
}

function getDayRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);

  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  return { start, end };
}

// -----------------------------------------------------
// DAILY ALERTS (5–1 days before end date) — formal
// -----------------------------------------------------
async function checkContractDailyAlerts() {
  try {

    const today = new Date();

    for (let days = 5; days >= 1; days--) {
      const targetDate = new Date(today.getTime() + days * 86400000);
      const { start, end } = getDayRange(targetDate);

      const contracts = await Contracts.find({
        status: { $in: ["Active"] },
        isDeleted: false,
        endDate: { $gte: start, $lte: end },
      })
        .populate("project")
        .lean();

      for (const contract of contracts) {
        const alertType = `contract-${days}-days-left`;

        const exists = await Notification.findOne({
          "meta.contractId": contract._id,
          "meta.alertType": alertType,
        });

        if (exists) continue;

        const projectName = contract.project?.name || "Unknown Project";

        const title = `Contract Ending — ${days} Day(s) Remaining`;
        const message = `Dear team,

This is an automated reminder that the contract "${
          contract.contractName
        }" for project "${projectName}" is scheduled to end in ${days} day(s), on ${new Date(
          contract.endDate
        ).toLocaleString()}.

Please confirm deliverables, finalize invoices, and communicate any risks to the project manager or administration.`;

        await notifyRole(
          "Admin",
          title,
          message,
          {
            contractId: contract._id,
            projectId: contract.project?._id,
            alertType,
          },
          "info"
        );
        if (contract.project?._id) {
          await notifyProjectTeam(
            contract.project._id,
            title,
            message,
            { contractId: contract._id, alertType },
            "info"
          );
        }
      }
    }
  } catch (err) {
    console.error("❌ Daily Contract Cron Error:", err);
  }
}

// -----------------------------------------------------
// HOURLY ALERTS (last day) + IMMEDIATE STATUS CHANGES (H1)
// - Send hourly reminders for contracts ending today
// - If a contract's endDate has passed, update contract -> Ended and project -> Pushed immediately
// -----------------------------------------------------
async function checkContractHourlyAlerts() {
  try {
    const now = new Date();
    const { start, end } = getDayRange(now);

    // 1) Contracts ending today → hourly reminders
    const todaysContracts = await Contracts.find({
      status: { $in: ["Active"] },
      isDeleted: false,
      endDate: { $gte: start, $lte: end },
    })
      .populate("project")
      .lean();

    for (const contract of todaysContracts) {
      const alertType = "contract-hourly-last-day";

      const exists = await Notification.findOne({
        "meta.contractId": contract._id,
        "meta.alertType": alertType,
        createdAt: { $gte: new Date(Date.now() - 59 * 60 * 1000) },
      });

      if (exists) continue;

      const projectName = contract.project?.name || "Unknown Project";

      const title = "Contract Ending — Today (Hourly Reminder)";
      const message = `Dear team,

This is an automated hourly reminder that the contract "${
        contract.contractName
      }" for project "${projectName}" will end today (${new Date(
        contract.endDate
      ).toLocaleString()}).

Please ensure all final deliverables and billing are in order and escalate any unresolved items to the project manager.`;

      await notifyRole(
        "Admin",
        title,
        message,
        {
          contractId: contract._id,
          projectId: contract.project?._id,
          alertType,
        },
        "warning"
      );
      if (contract.project?._id) {
        await notifyProjectTeam(
          contract.project._id,
          title,
          message,
          { contractId: contract._id, alertType },
          "warning"
        );
      }
    }

    // 2) Contracts past endDate → immediately mark Ended and push project
    const expiredContracts = await Contracts.find({
      status: { $in: ["Active"] },
      isDeleted: false,
      endDate: { $lt: now },
    })
      .populate("project")
      .lean();

    for (const contract of expiredContracts) {
      const project = contract.project;
     
      // Update contract status to Ended
      await Contracts.findByIdAndUpdate(contract._id, { status: "Ended" });

      // Update project status to Pushed if not already
      if (project && project._id && project.status !== "Pushed") {
        await Projects.findByIdAndUpdate(project._id, { status: "Pushed" });
      }

      // Prepare formal messages
      const titleTeam =
        "Contract Automatically Ended — Project Marked as Pushed";
      const messageTeam = `Dear team,

The contract "${contract.contractName}" for project "${
        project?.name || "Unknown"
      }" has reached its end date and was automatically marked as *Ended*. Consequently, the related project has been set to *Pushed*.

Please review any outstanding items, complete administrative closure, and coordinate next steps with stakeholders.`;

      const titleAdmin = "Contract Auto-Ended — Action Recommended";
      const messageAdmin = `Attention Admins,

Contract "${contract.contractName}" (ID: ${
        contract._id
      }) has passed its scheduled end date and was automatically marked as *Ended*. The associated project "${
        project?.name || "Unknown"
      }" has been updated to *Pushed*.

Action recommended: review contract closure and advise project manager on next steps.`;

      if (project && project._id) {
        await notifyProjectTeam(
          project._id,
          titleTeam,
          messageTeam,
          { contractId: contract._id },
          "warning"
        );
      }
      await notifyRole(
        "Admin",
        titleAdmin,
        messageAdmin,
        { contractId: contract._id },
        "warning"
      );

    }
  } catch (err) {
    console.error("❌ Hourly Contract Cron Error:", err);
  }
}

module.exports = { startContractDeadlineChecker };
