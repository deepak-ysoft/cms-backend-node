const express = require("express");
const authMiddleware = require("../middleware/auth");
const upload = require("../middleware/upload");
const {
  addContracts,
  getContracts,
  updateContract,
  deleteContract,
  getContractsByProject,
  getContractById,
} = require("../controllers/contractController");
const roleMiddleware = require("../middleware/role");

const router = express.Router();

// ➕ Add new contract
router.post(
  "/",
  authMiddleware,
  roleMiddleware("Admin"),
  upload.single("file"),
  addContracts
);

router.put(
  "/:id",
  authMiddleware,
  roleMiddleware("Admin"),
  upload.single("file"),
  updateContract
);

// 📃 Get all contracts
router.get(
  "/",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  getContracts
);

// 📄 Get contract by project ID
router.get(
  "/project/:projectId",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  getContractsByProject
);

// 📄 Get contract details by ID
router.get(
  "/details/:id",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  getContractById
);

/// 🗑️ Delete contract (soft delete)
router.delete("/:id", authMiddleware, roleMiddleware("Admin"), deleteContract);

module.exports = router;
