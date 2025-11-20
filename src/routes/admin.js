const express = require("express");
const authMiddleware = require("../middleware/auth");

const roleMiddleware = require("../middleware/role");

const router = express.Router();

const {
  getUsersData,
  updateUsersData,
  deleteUserData,
  userDataById,
  searchDevelopers,
  addUser,
  deleteUserImg,
} = require("../controllers/adminController");
const upload = require("../middleware/upload");
const {
  getAdminDashboard,
  getDeveloperDashboard,
} = require("../controllers/dashboardController");

router.get(
  "/",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  getAdminDashboard
);

router.get("/developerDashboard/", authMiddleware, getDeveloperDashboard);

router.get(
  "/getUsers",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  getUsersData
);

router.get(
  "/searchDevelopers",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  searchDevelopers
);

router.get(
  "/getuserById/:id",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  userDataById
);

router.post(
  "/createUser",
  authMiddleware,
  upload.single("profileImage"),
  addUser
);

router.put(
  "/update/:id",
  authMiddleware,
  upload.single("profileImage"),
  updateUsersData
);

router.delete(
  "/delete/:id",
  authMiddleware,
  roleMiddleware("Admin"),
  deleteUserData
);

router.delete("/deleteImg/:id", authMiddleware, deleteUserImg);

module.exports = router;
