const express = require("express");
const authMiddleware = require("../middleware/auth");
const upload = require("../middleware/upload"); // ✅ use the proper config

const {
  addWorkLog,
  getWorkLogsByProject,
  updateWorkLog,
  deleteWorkLog,
  getWorkLogsById,
  getWorkLogsByProjectByDeveloper,
} = require("../controllers/workLogController");
const roleMiddleware = require("../middleware/role");

const router = express.Router();

// ✅ Use upload.single("attachments") with correct config
router.post("/", upload.single("attachments"), authMiddleware, addWorkLog);
router.get("/:projectId", authMiddleware, getWorkLogsByProject);
router.get(
  "/devloperlog/:projectId/:developerId",
  authMiddleware,
  getWorkLogsByProjectByDeveloper
);
router.get("/details/:worklogId", authMiddleware, getWorkLogsById);
router.put("/:id", upload.single("attachments"), authMiddleware, updateWorkLog);
router.delete(
  "/:id",
  authMiddleware,
  roleMiddleware("Admin", "Developer"),
  deleteWorkLog
);

module.exports = router;
