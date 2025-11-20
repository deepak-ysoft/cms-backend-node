const mongoose = require("mongoose");

const workLogSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["ToDo", "InProgress", "Blocked", "Completed", "Reviewed"],
      default: "ToDo",
    },
    date: {
      type: Date,
      required: true,
    },
    startTime: Date,
    endTime: Date,
    hours: {
      type: Number,
      min: 0,
      max: 24,
      default: 0,
      get: (v) => Number(v.toFixed(2)), // ensure rounding
    },

    description: String,
    isBillable: { type: Boolean, default: false },
    approvalStatus: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
    },
    remarks: String,
    attachments: {
      type: String,
      default: null,
    },
    projectPhase: String,
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deleteAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkLogs", workLogSchema);
