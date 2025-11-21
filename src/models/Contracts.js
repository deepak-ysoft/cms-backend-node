const mongoose = require("mongoose");

// 🔹 Sub-schema for developers’ hourly work (used only in Hourly contracts)
const developerWorkSchema = new mongoose.Schema(
  {
    developer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    hoursWorked: { type: Number, default: 0 },
    ratePerHour: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
  },
  { _id: false }
);

const contractSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },

    contractName: {
      type: String,
      required: true,
      trim: true,
    },

    fileUrl: {
      type: String,
      required: true,
      trim: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    currency: {
      type: String,
      enum: [
        "INR", // Indian Rupee 🇮🇳
        "USD", // US Dollar 🇺🇸
        "EUR", // Euro 🇪🇺
        "GBP", // British Pound 🇬🇧
        "AUD", // Australian Dollar 🇦🇺
        "CAD", // Canadian Dollar 🇨🇦
        "AED", // UAE Dirham 🇦🇪
        "JPY", // Japanese Yen 🇯🇵
        "CNY", // Chinese Yuan 🇨🇳
        "SGD", // Singapore Dollar 🇸🇬
      ],
      default: "INR",
      required: true,
    },

    // 🔹 Contract Type — Fixed or Hourly
    billingType: {
      type: String,
      enum: ["Fixed", "Hourly"],
      default: "Fixed",
    },

    // 🔹 Fixed Price contract total (optional for hourly)
    fixedAmount: {
      type: Number,
      default: 0,
    },

    // 🔹 Developer work details (optional, only for Hourly contracts)
    developersWork: {
      type: [developerWorkSchema],
      default: [],
    },

    // 🔹 Automatically calculate total contract value
    totalAmount: {
      type: Number,
      default: 0,
    },

    status: {
      type: String,
      enum: ["Active", "Completed", "Cancelled", "Ended"],
      default: "Active",
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },

    isDeleted: { type: Boolean, default: false },
    deleteAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 🧮 Pre-save hook to auto-calculate totalAmount
contractSchema.pre("save", function (next) {
  if (this.billingType === "Fixed") {
    this.totalAmount = this.fixedAmount;
  } else if (this.billingType === "Hourly") {
    this.totalAmount = this.developersWork.reduce(
      (sum, d) => sum + (d.totalAmount || d.hoursWorked * d.ratePerHour),
      0
    );
  }
  next();
});

module.exports = mongoose.model("Contracts", contractSchema);
