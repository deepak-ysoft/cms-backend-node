// /cron/projectDeadlineChecker.js
const cron = require("node-cron");
const Notification = require("../models/Notification");
const { notifyRole, notifyProjectTeam } = require("../services/notificationService");
const Projects = require("../models/Projects");

function startProjectDeadlineChecker() {
  cron.schedule("0 9 * * *", checkDailyDeadlineAlerts); // daily at 09:00
  cron.schedule("0 * * * *", checkHourlyDeadlineAlerts); // hourly at :00
}

function getDayRange(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// -----------------------------------------------------
// DAILY (5–1 days) — formal corporate messages
// -----------------------------------------------------
async function checkDailyDeadlineAlerts() {
  try {
    const today = new Date();

    for (let days = 5; days >= 1; days--) {
      const targetDate = new Date(today.getTime() + days * 86400000);
      const { start, end } = getDayRange(targetDate);

      const projects = await Projects.find({
        status: "Active",
        isDeleted: false,
        deadline: { $gte: start, $lte: end },
      }).lean();

      for (const project of projects) {
        const alertType = `project-${days}-days-left`;

        const exists = await Notification.findOne({
          "meta.projectId": project._id,
          "meta.alertType": alertType,
        });

        if (exists) continue;

        const title = `Project Deadline — ${days} Day(s) Remaining`;
        const message = `Dear team,

This is an automated reminder that the project "${
          project.name
        }" is scheduled to reach its deadline in ${days} day(s), on ${new Date(
          project.deadline
        ).toLocaleString()}.

Please ensure all outstanding deliverables are reviewed and that any risks are escalated to the project manager immediately.`;

        await notifyRole(
          "Admin",
          title,
          message,
          { projectId: project._id, alertType },
          "info"
        );
        await notifyProjectTeam(
          project._id,
          title,
          message,
          { alertType },
          "info"
        );
      }
    }
  } catch (err) {
    console.error("❌ Daily Project Deadline Error:", err);
  }
}

// -----------------------------------------------------
// HOURLY LAST-DAY + IMMEDIATE STATUS CHANGES (H1)
// - Send hourly notifications for projects with deadline today.
// - If a project's deadline already passed, mark project as Pushed and notify.
// -----------------------------------------------------
async function checkHourlyDeadlineAlerts() {
  try {
    const now = new Date();
    const { start, end } = getDayRange(now);

    // 1) Projects with deadline today -> send hourly reminders (once per hour)
    const todaysProjects = await Projects.find({
      status: "Active",
      isDeleted: false,
      deadline: { $gte: start, $lte: end },
    }).lean();

    for (const project of todaysProjects) {
      const alertType = "project-hourly-last-day";

      const exists = await Notification.findOne({
        "meta.projectId": project._id,
        "meta.alertType": alertType,
        createdAt: { $gte: new Date(Date.now() - 59 * 60 * 1000) },
      });

      if (exists) continue;

      const title = "Project Deadline — Today (Hourly Reminder)";
      const message = `Dear team,

This is an automated hourly reminder that the project "${
        project.name
      }" will reach its deadline today (${new Date(
        project.deadline
      ).toLocaleString()}).

Please verify task completion status and escalate any unresolved issues to the project manager immediately.`;

      await notifyRole(
        "Admin",
        title,
        message,
        { projectId: project._id, alertType },
        "warning"
      );
      await notifyProjectTeam(
        project._id,
        title,
        message,
        { alertType },
        "warning"
      );
    }

    // 2) Projects whose deadline has already passed -> immediately set to Pushed and notify
    const overdueProjects = await Projects.find({
      status: "Active",
      isDeleted: false,
      deadline: { $lt: now },
    }).lean();

    for (const project of overdueProjects) {
      // Prevent repeated pushes if some other process already updated
      // (we check status still Active above)
     
      await Projects.findByIdAndUpdate(project._id, { status: "Pushed" });

      const titleTeam = "Project Status Updated — Pushed (Deadline Passed)";
      const messageTeam = `Dear team,

The scheduled deadline for project "${project.name}" (${new Date(
        project.deadline
      ).toLocaleString()}) has passed. As an automated measure, the project status has been updated to *Pushed*.

Please pause new development work, review remaining deliverables, and coordinate with stakeholders to determine next steps. If this change was made in error, please contact administration to reverse it.`;

      const titleAdmin =
        "Project Automatically Marked as Pushed — Deadline Missed";
      const messageAdmin = `Attention Admins,

Project "${project.name}" (ID: ${project._id}) has surpassed its deadline and was automatically updated to status *Pushed*.

Action recommended: review the project, reassign resources if required, and liaise with the project manager.`;

      await notifyProjectTeam(
        project._id,
        titleTeam,
        messageTeam,
        { projectId: project._id },
        "warning"
      );
      await notifyRole(
        "Admin",
        titleAdmin,
        messageAdmin,
        { projectId: project._id },
        "warning"
      );
    }
  } catch (err) {
    console.error("❌ Hourly Project Deadline Error:", err);
  }
}

module.exports = { startProjectDeadlineChecker };
