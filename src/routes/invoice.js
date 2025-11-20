const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const {
  addInvoiceData,
  getAllInvoices,
  getInvoiceById,
  updateInvoice,
  deleteInvoice,
  getInvoicesByProject,
  generateInvoiceDOCX,
  generateInvoicePDF,
} = require("../controllers/invoiceController");
const roleMiddleware = require("../middleware/role");

// ✅ Create new invoice
router.post(
  "/addInvoice",
  authMiddleware,
  roleMiddleware("Admin"),
  addInvoiceData
);

// ✅ Get all invoices
router.get(
  "/getAllInvoices",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  getAllInvoices
);

// ✅ Get invoices by project ID
router.get(
  "/getInvoiceByProjectId",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  getInvoicesByProject
);

// ✅ Get single invoice by invoice ID
router.get(
  "/getInvoiceById/:id",
  authMiddleware,
  roleMiddleware("Admin", "Project Manager"),
  getInvoiceById
);

// ✅ Update invoice
router.put(
  "/updateInvoice/:id",
  authMiddleware,
  roleMiddleware("Admin"),
  updateInvoice
);

// ✅ Delete invoice
router.delete(
  "/deleteInvoice/:id",
  authMiddleware,
  roleMiddleware("Admin"),
  deleteInvoice
);

router.get("/pdf/:id", generateInvoicePDF);
router.get("/docx/:id", generateInvoiceDOCX);

module.exports = router;
