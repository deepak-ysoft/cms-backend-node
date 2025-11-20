const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const {
  getProjectData,
  addProject,
  getProjectDataById,
  updateProjectById,
  assignDeveloper,
  removeDeveloperFromProject,
  getProjectsByDeveloper,
  getProjectDetailsForDeveloper,
  deleteProjectById,
} = require("../controllers/projectController");
const roleMiddleware = require("../middleware/role");
const upload = require("../middleware/upload");

router.get("/getProjects", authMiddleware, getProjectData);

router.post(
  "/Project",
  upload.array("attachments", 10), // 👈 Allow up to 10 files
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  addProject
);

router.get("/project/:id", authMiddleware, getProjectDataById);

router.put(
  "/project/:id",
  upload.array("attachments", 10), // 👈 Allow up to 10 files
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  updateProjectById
);

router.delete(
  "/project/:id",
  authMiddleware,
  roleMiddleware("Admin"),
  deleteProjectById
);

router.patch(
  "/assignDeveloper",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  assignDeveloper
);

router.patch(
  "/removeDeveloper",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  removeDeveloperFromProject
);

// Developer-specific route
router.get("/developer-projects", authMiddleware, getProjectsByDeveloper);

// Developer-specific route
router.get(
  "/developer-projects/:id",
  authMiddleware,
  getProjectDetailsForDeveloper
);

module.exports = router;
