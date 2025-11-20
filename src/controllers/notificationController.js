const Notification = require("../models/Notification");
const Users = require("../models/Users");
const { emitToUsers } = require("../socket");
const { errorResponse, successResponse } = require("../utils/response");

// ----------------------------
// SEND NOTIFICATION
// ----------------------------
exports.sendNotification = async (req, res) => {
  try {
    const { title, message, role, email, userId, senderId, meta, type } =
      req.body;
    let receivers = [];

    if (role) {
      receivers = await Users.find({ role, isDeleted: false }).select("_id");
    } else if (userId) {
      receivers = await Users.find({ _id: userId, isDeleted: false }).select(
        "_id"
      );
    } else if (email) {
      const cleanEmail = email.trim();
      receivers = await Users.find({
        email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
        isDeleted: false,
      }).select("_id");
    } else {
      return errorResponse(res, "Provide role or user");
    }

    const receiverIds = receivers.map((r) => r._id);

    const notification = await Notification.create({
      sender: senderId,
      receivers: receiverIds,
      title,
      message,
      meta,
      type,
    });

    // Fetch sender details
    const sender = await Users.findById(senderId).select(
      "_id firstName lastName profileImage role"
    );

    // Attach sender object to notification for real-time
    const notificationWithSender = {
      ...notification.toObject(),
      sender,
    };

    // Emit real-time notification
    emitToUsers(receiverIds, "notification", notificationWithSender);

    return successResponse(
      res,
      "Notification sent successfully",
      notification,
      201
    );
  } catch (err) {
    console.error(err);
    return errorResponse(res, "Failed to send notification", err, 500);
  }
};
// ----------------------------
// GET NOTIFICATIONS FOR A USER
// ----------------------------
exports.getNotificationsForUser = async (req, res) => {
  try {
    const userId = req.params.userId;

    const notifications = await Notification.find({ receivers: userId })
      .populate("sender", "firstName lastName role profileImage")
      .sort({ createdAt: -1 })
      .lean();

    const annotated = notifications.map((n) => ({
      ...n,
      isRead:
        n.isReadBy?.some((id) => id?.toString() === userId?.toString()) ||
        false,
    }));

    return successResponse(
      res,
      "Notifications fetched successfully",
      annotated
    );
  } catch (err) {
    console.error(err);
    return errorResponse(res, "Failed to fetch notifications", err, 500);
  }
};

// ----------------------------
// MARK SINGLE NOTIFICATION AS READ
// ----------------------------
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const { userId } = req.body;

    await Notification.findByIdAndUpdate(notificationId, {
      $addToSet: { isReadBy: userId },
    });

    return successResponse(res, "Notification marked as read");
  } catch (err) {
    console.error(err);
    return errorResponse(res, "Failed to mark notification as read", err, 500);
  }
};

// ----------------------------
// MARK ALL NOTIFICATIONS AS READ
// ----------------------------
exports.markAllAsRead = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return errorResponse(res, "userId is required");
    }

    await Notification.updateMany(
      { receivers: userId },
      { $addToSet: { isReadBy: userId } }
    );

    return successResponse(res, "All notifications marked as read");
  } catch (err) {
    console.error(err);
    return errorResponse(
      res,
      "Failed to mark all notifications as read",
      err,
      500
    );
  }
};
