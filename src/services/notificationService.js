// /services/notifyRole.js
const Notification = require("../models/Notification");
const Projects = require("../models/Projects");
const Contracts = require("../models/Contracts");
const Users = require("../models/Users");
const { emitToUsers } = require("../socket");

/**
 * Send notification to list of userIds
 */
async function notifyUsers(userIds, title, message, meta = {}, type = "info") {
  if (!userIds || !userIds.length) return;

  const notification = await Notification.create({
    title,
    message,
    receivers: userIds,
    type,
    meta,
  });

  emitToUsers(userIds, "notification", {
    ...notification.toObject(),
    sender: null,
  });
}

/**
 * Notify all users with a specific role
 */
async function notifyRole(role, title, message, meta = {}, type = "info") {
  const users = await Users.find({ role, isDeleted: false }).select("_id");

  if (!users.length) return;

  const ids = users.map((u) => u._id);

  await notifyUsers(ids, title, message, meta, type);
}

/**
 * Notify project manager + developers
 */
async function notifyProjectTeam(
  projectId,
  title,
  message,
  meta = {},
  type = "info"
) {
  const project = await Projects.findById(projectId)
    .select("manager developers name")
    .lean();

  if (!project) return;

  const userIds = [];

  if (project.manager) userIds.push(project.manager);
  if (project.developers?.length) userIds.push(...project.developers);

  if (!userIds.length) return;

  await notifyUsers(
    userIds,
    title,
    message,
    { projectId, projectName: project.name, ...meta },
    type
  );
}

/**
 * Handle contract status changes (Called by CRON)
 *
 * H1 behaviour: status change occurs immediately once endDate has passed.
 */
async function notifyContractStatus(contract, project) {
  const now = new Date();

  // Ensure we have up-to-date project doc (project param may be populated or id)
  let proj = project;
  if (!proj || !proj._id) {
    proj = await Projects.findById(contract.project)
      .select("name status")
      .lean();
  }

  // 1) Auto-End: endDate passed and contract is Active
  if (contract.endDate <= now && contract.status === "Active") {
    // update contract
    await Contracts.findByIdAndUpdate(contract._id, { status: "Ended" });

    // update project → Pushed (only if not already)
    if (proj && proj._id && proj.status !== "Pushed") {
      await Projects.findByIdAndUpdate(proj._id, { status: "Pushed" });
    }

    // Prepare formal messages
    const titleTeam =
      "Contract Automatically Ended — Immediate Review Required";
    const messageTeam = `Dear team,

The contract "${contract.contractName}" associated with project "${
      proj?.name || "Unknown"
    }" has reached its scheduled end date and the contract status has been updated to *Ended*. Consequently, the project status has been set to *Pushed*.

Please review the project backlog, close outstanding tasks if appropriate, and coordinate with stakeholders for next steps. If this auto-update is incorrect, please contact the administration immediately.`;

    const titleAdmin = "Contract Ended (Automated) — Project Marked as Pushed";
    const messageAdmin = `Attention Admins,

The contract "${contract.contractName}" (ID: ${
      contract._id
    }) has passed its end date and was automatically marked as *Ended*. The related project "${
      proj?.name || "Unknown"
    }" has been set to *Pushed*.

Action suggested: review the contract and project status, and confirm if any manual adjustments are required.`;

    // Notify project team and admins
    if (proj && proj._id) {
      await notifyProjectTeam(
        proj._id,
        titleTeam,
        messageTeam,
        { contractId: contract._id },
        "system"
      );
    }

    await notifyRole(
      "Admin",
      titleAdmin,
      messageAdmin,
      { contractId: contract._id },
      "system"
    );

    return; // stop further processing for this contract
  }

  // 2) Contract Cancelled → push project and notify
  if (contract.status === "Cancelled") {
    if (proj && proj._id && proj.status !== "Pushed") {
      await Projects.findByIdAndUpdate(proj._id, { status: "Pushed" });
    }

    const titleTeam = "Contract Cancelled — Project Status Updated";
    const messageTeam = `Dear team,

The contract "${contract.contractName}" for project "${
      proj?.name || "Unknown"
    }" has been marked as *Cancelled*. In response, the project status has been updated to *Pushed*.

Please review the implications for current work, reassign resources if needed, and inform stakeholders accordingly.`;

    const titleAdmin = "Contract Cancelled — Action Recommended";
    const messageAdmin = `Attention Admins,

Contract "${contract.contractName}" (ID: ${
      contract._id
    }) has been cancelled. The associated project "${
      proj?.name || "Unknown"
    }" has been set to *Pushed*.

Action suggested: review cancelled contract details and coordinate next steps with the project manager.`;

    if (proj && proj._id) {
      await notifyProjectTeam(
        proj._id,
        titleTeam,
        messageTeam,
        { contractId: contract._id },
        "system"
      );
    }
    await notifyRole(
      "Admin",
      titleAdmin,
      messageAdmin,
      { contractId: contract._id },
      "system"
    );

    return;
  }

  // otherwise, nothing to do
}

module.exports = {
  notifyRole,
  notifyUsers,
  notifyProjectTeam,
  notifyContractStatus,
};
