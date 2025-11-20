process.env.TZ = "Asia/Kolkata";
const express = require("express");
const cors = require("cors");
const path = require("path");
const connectDB = require("./config/db");
require("dotenv").config();

// import route groups
const authRoutes = require("./routes/auth");
const adminRoutes = require("./routes/admin");
const projectRoutes = require("./routes/project");
const ProfileRoutes = require("./routes/profile");
const workLogRoutes = require("./routes/workLog");
const contractsRoutes = require("./routes/contract");
const invoiceRoutes = require("./routes/invoice");
const notificationRoutes = require("./routes/notification");

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    // credentials: true // if you want to allow cookies/auth headers
  })
);

// Middleware
app.use(express.json());

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Routes
app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api", projectRoutes);
app.use("/api", ProfileRoutes);
app.use("/api/worklog", workLogRoutes);
app.use("/api/contracts", contractsRoutes);
app.use("/api/invoice", invoiceRoutes);
app.use("/api/notifications", notificationRoutes);

//  Database
connectDB();

module.exports = app;
