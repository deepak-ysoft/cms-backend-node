const express = require("express");
const router = express.Router();

const {
  sendNotification,
  getNotificationsForUser,
  markAsRead,
  markAllAsRead,
} = require("../controllers/notificationController");

// =============================
// Notification Routes
// =============================

// Send notification to role / user
router.post("/send", sendNotification);

// Get all notifications for a user
router.get("/user/:userId", getNotificationsForUser);

// Mark a single notification as read
router.patch("/read/:notificationId", markAsRead);

// Mark all notifications as read
router.patch("/read-all", markAllAsRead);

module.exports = router;
