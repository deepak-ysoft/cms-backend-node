// /services/notifyRole.js
const Notification = require("../models/Notification");
const Users = require("../models/Users");
const { emitToUsers } = require("../socket");

/**
 * Notify a specific role (Admin, Manager, Developer, etc.)
 */
async function notifyRole(role, title, message, meta = {}, type = "info") {
  // Fetch users with selected role
  const users = await Users.find({ role, isDeleted: false }).select("_id");
  const userIds = users.map((u) => u._id);

  if (!userIds.length) return;

  // Save notification for all receivers
  const notification = await Notification.create({
    title,
    message,
    receivers: userIds,
    type,
    meta,
  });

  // Emit real-time using Socket.IO helper
  emitToUsers(userIds, "notification", {
    ...notification.toObject(),
    sender: null, // system-generated
  });

  console.log(`📢 Notification sent to all ${role}s`);
}

module.exports = { notifyRole };
