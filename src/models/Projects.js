const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    projectCode: { type: String, unique: true, trim: true },

    description: { type: String },

    status: {
      type: String,
      default: "Active",
      enum: ["Active", "Pushed", "Completed", "OnHold", "Cancelled"],
    },

    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
    },

    projectType: {
      type: String,
      enum: ["Web", "Mobile", "Backend", "Fullstack", "Maintenance"],
    },

    projectTech: [{ type: String }],

    phase: {
      type: String,
      enum: [
        "Planning",
        "Design",
        "Development",
        "Testing",
        "Deployment",
        "Maintenance",
      ],
      default: "Planning",
    },

    manager: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    managerMail: { type: String, default: null },
    developers: [{ type: mongoose.Schema.Types.ObjectId, ref: "Users" }],

    // Client Details
    clientName: { type: String, trim: true },
    clientEmail: { type: String, trim: true },
    clientPhone: { type: String, trim: true },
    clientCompany: { type: String, trim: true },

    // Timeline
    startDate: Date,
    endDate: Date,
    deadline: Date,
    estimatedHours: { type: Number, default: 0 },
    actualHours: { type: Number, default: 0 },

    // Financials
    budget: { type: Number, default: 0 },
    spentAmount: { type: Number, default: 0 },
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

    // Attachments
    attachments: [
      {
        name: String,
        url: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    visibility: {
      type: String,
      enum: ["Public", "Internal"],
      default: "Public",
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Users" },

    isDeleted: { type: Boolean, default: false },
    deleteAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Project", projectSchema);
