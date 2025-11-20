const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true, select: false },
    role: { type: String, default: "Developer" },
    profileImage: { type: String, default: "" },
    dob: { type: Date, default: null },
    phone: { type: String },
    designation: { type: String }, // Senior Dev, Team Lead, PM etc.
    skills: [{ type: String }], // ["React", "Node", "MongoDB"]
    experience: { type: Number, default: 0 }, // in years
    department: {
      type: String,
      enum: [ 
        "Frontend",
        "Backend",
        "Fullstack",
        "Mobile",
        "UI/UX",
        "DevOps",
        "QA",
      ],
      default: "Frontend",
    }, // "Frontend", "Backend", "Mobile", etc.

    // Working preferences
    workType: {
      type: String,
      enum: ["Full-Time", "Part-Time", "Contract", "Intern"],
      default: "Full-Time",
    },

    isDeleted: { type: Boolean, default: false },
    deleteAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Users", userSchema);
