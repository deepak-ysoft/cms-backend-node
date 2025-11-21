const cron = require("node-cron");
const Invoice = require("../models/Invoice");
const Contracts = require("../models/Contracts");
const Projects = require("../models/Projects");
const Notification = require("../models/Notification");

const {
  notifyUsers,
  notifyRole,
  notifyProjectTeam,
} = require("../services/notificationService");

function startInvoiceOverdueChecker() {
  // Run daily at 10 AM
  cron.schedule("0 10 * * *", checkOverdueInvoices);
}

// -------------------------------------------------------
// MAIN CRON FUNCTION
// -------------------------------------------------------
async function checkOverdueInvoices() {
  try {
    const today = new Date();
    const tenDaysOld = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);

    // Fetch invoices that are pending and past due date by 10+ days
    const invoices = await Invoice.find({
      status: "Pending",
      isDeleted: false,
      dueDate: { $lte: tenDaysOld },
    })
      .populate("project")
      .populate("contract")
      .lean();

    for (const invoice of invoices) {
      const alertType = "invoice-overdue-10days";

      // Avoid sending multiple notifications
      const alreadySent = await Notification.findOne({
        "meta.invoiceId": invoice._id,
        "meta.alertType": alertType,
      });

      if (alreadySent) continue;

      // -------------------------------------------------------
      // 1️⃣ Update Invoice Status → Overdue
      // -------------------------------------------------------
      await Invoice.findByIdAndUpdate(invoice._id, {
        status: "Overdue",
      });

      // -------------------------------------------------------
      // 2️⃣ Cancel Contract
      // -------------------------------------------------------
      if (invoice.contract?._id) {
        await Contracts.findByIdAndUpdate(invoice.contract._id, {
          status: "Cancelled",
        });
      }

      // -------------------------------------------------------
      // 3️⃣ Push Project
      // -------------------------------------------------------
      if (invoice.project?._id) {
        await Projects.findByIdAndUpdate(invoice.project._id, {
          status: "Pushed",
        });
      }

      // -------------------------------------------------------
      // 4️⃣ Prepare Notification Content
      // -------------------------------------------------------
      const formattedDueDate = new Date(invoice.dueDate).toLocaleDateString();
      const projectName = invoice.project?.name || "Unknown Project";

      const message = `
The invoice **${invoice.invoiceNumber}** linked to the project **"${projectName}"**
has remained unpaid for **more than 10 days past its due date**.

📅 **Original Due Date:** ${formattedDueDate}
💰 **Invoice Status:** Updated to *Overdue*
📉 **Contract Status:** Cancelled
📌 **Project Status:** Pushed

This requires immediate attention to prevent further delays.
      `;

      // -------------------------------------------------------
      // 5️⃣ Notify Admins
      // -------------------------------------------------------
      await notifyRole(
        "Admin",
        "🚨 Overdue Invoice – Immediate Attention Required",
        message,
        {
          invoiceId: invoice._id,
          contractId: invoice.contract?._id,
          projectId: invoice.project?._id,
          alertType,
        },
        "system"
      );

      // -------------------------------------------------------
      // 6️⃣ Notify Project Manager + Developers
      // -------------------------------------------------------
      if (invoice.project?._id) {
        await notifyProjectTeam(
          invoice.project._id,
          "Invoice Overdue – Project Impacted",
          message,
          {
            invoiceId: invoice._id,
            contractId: invoice.contract?._id,
            projectId: invoice.project?._id,
            alertType,
          },
          "system"
        );
      }

      // -------------------------------------------------------
      // 7️⃣ Log Clean Summary
      // -------------------------------------------------------
    }
  } catch (err) {
    console.error("❌ Invoice Overdue Cron Error:", err);
  }
}

module.exports = { startInvoiceOverdueChecker };
