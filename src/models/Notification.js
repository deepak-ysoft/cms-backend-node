const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
    },
    receivers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Users" }], // recipients
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: ["info", "warning", "success", "chat", "system"],
      default: "info",
    },
    isReadBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "Users" }], // who read it
    meta: { type: Object, default: {} }, // { projectId, chatId, url, etc. }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Notification", notificationSchema);
