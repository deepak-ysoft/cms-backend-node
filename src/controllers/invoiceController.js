const Invoice = require("../models/Invoice");
const Projects = require("../models/Projects");
const Contracts = require("../models/Contracts");
const { successResponse, errorResponse } = require("../utils/response");
const PDFDocument = require("pdfkit");
const { Document, Packer, Paragraph, TextRun, AlignmentType } = require("docx");

// 🔧 Helper function for date formatting
const formatDateTime = (date) => {
  if (!date) return null;
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

// ✅ Create new invoice
exports.addInvoiceData = async (req, res) => {
  try {
    const {
      projectId,
      contractId,
      clientName,
      clientEmail,
      billingAddress,
      description,
      amount,
      discount,
      taxRate,
      currency,
      issueDate,
      dueDate,
      paymentMethod,
      notes,
      fileUrl,
      status,
    } = req.body;
    const { id: uploadedBy } = req.user;

    // 🔸 Required field validation
    if (!projectId || !contractId || !clientName || !amount || !dueDate) {
      return errorResponse(res, "Required fields missing!");
    }

    // 🔸 Verify related models
    const project = await Projects.findById(projectId);
    if (!project) return errorResponse(res, "Project not found");

    const contract = await Contracts.findById(contractId);
    if (!contract) return errorResponse(res, "Contract not found");

    // 🔸 Create invoice
    const invoice = new Invoice({
      project: projectId,
      contract: contractId,
      clientName,
      clientEmail,
      billingAddress,
      description,
      amount,
      discount,
      taxRate,
      currency,
      issueDate,
      dueDate,
      paymentMethod,
      notes,
      fileUrl,
      status,
      uploadedBy,
    });

    await invoice.save();
    return successResponse(res, "Invoice created successfully", invoice);
  } catch (error) {
    console.error("Error creating invoice:", error);
    return errorResponse(res, error.message, error);
  }
};

// ✅ Get all invoices
// GET /invoice/getInvoices?page=1&limit=10&search=abc&sortField=createdAt&sortOrder=desc
exports.getAllInvoices = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const status = req.query.status || "";
    const sortField = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    const filter = {
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    if (search) {
      const s = search.trim();

      let dateQuery = null;
      let amountQuery = null;

      // ---------------------------
      // 📌 DATE SEARCH
      // ---------------------------
      const parsedDate = new Date(s);

      if (!isNaN(parsedDate)) {
        const start = new Date(parsedDate.setHours(0, 0, 0, 0));
        const end = new Date(parsedDate.setHours(23, 59, 59, 999));

        dateQuery = { dueDate: { $gte: start, $lte: end } };
      }

      // ---------------------------
      // 📌 AMOUNT SEARCH (number)
      // ---------------------------
      const parsedAmount = Number(s);

      if (!isNaN(parsedAmount)) {
        amountQuery = { amount: parsedAmount };
      }

      // ---------------------------
      // 📌 APPLY FILTER
      // ---------------------------
      filter.$or = [
        { clientName: { $regex: s, $options: "i" } },
        { invoiceNumber: { $regex: s, $options: "i" } },
        ...(amountQuery ? [amountQuery] : []),
        ...(dateQuery ? [dateQuery] : []),
      ];
    }

    const sort = {};
    sort[sortField] = sortOrder === "asc" ? 1 : -1;

    const invoices = await Invoice.find(filter)
      .populate("project", "_id name")
      .populate("contract", "contractName")
      .populate("uploadedBy", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Invoice.countDocuments(filter);

    const formattedInvoices = invoices.map((inv) => ({
      _id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      clientName: inv.clientName,
      amount: inv.amount,
      currency: inv.currency,
      status: inv.status,
      dueDate: formatDateTime(inv.dueDate),
      createdAt: formatDateTime(inv.createdAt),
      projectId: inv.project?._id || null,
      projectName: inv.project?.name || null,
      contractName: inv.contract?.contractName || null,
      uploadedBy: inv.uploadedBy
        ? `${inv.uploadedBy.firstName} ${inv.uploadedBy.lastName}`
        : null,
    }));

    return successResponse(res, "Invoices fetched", {
      rows: formattedInvoices,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

exports.getInvoicesByProject = async (req, res) => {
  try {
    const projectId = req.query.projectId || "";
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const status = req.query.status || "";
    const sortField = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    const sort = {};
    sort[sortField] = sortOrder === "asc" ? 1 : -1;

    // 🔍 Search + Project filter
    const filter = {
      project: projectId,
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    if (search) {
      const s = search.trim();

      let dateQuery = null;
      let amountQuery = null;

      // ---------------------------
      // 📌 DATE SEARCH
      // ---------------------------
      const parsedDate = new Date(s);

      if (!isNaN(parsedDate)) {
        const start = new Date(parsedDate.setHours(0, 0, 0, 0));
        const end = new Date(parsedDate.setHours(23, 59, 59, 999));

        dateQuery = { dueDate: { $gte: start, $lte: end } };
      }

      // ---------------------------
      // 📌 AMOUNT SEARCH (number)
      // ---------------------------
      const parsedAmount = Number(s);

      if (!isNaN(parsedAmount)) {
        amountQuery = { amount: parsedAmount };
      }

      // ---------------------------
      // 📌 APPLY FILTER
      // ---------------------------
      filter.$or = [
        { clientName: { $regex: s, $options: "i" } },
        { invoiceNumber: { $regex: s, $options: "i" } },
        ...(amountQuery ? [amountQuery] : []),
        ...(dateQuery ? [dateQuery] : []),
      ];
    }

    // 📌 Fetch paginated/sorted/searched invoices
    const invoices = await Invoice.find(filter)
      .populate("project", "name")
      .populate("contract", "contractName")
      .populate("uploadedBy", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // 📌 Total count for pagination
    const total = await Invoice.countDocuments(filter);

    // 📌 Format response
    const formattedInvoices = invoices.map((invoice) => ({
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      amount: invoice.amount,
      discount: invoice.discount,
      taxRate: invoice.taxRate,
      currency: invoice.currency,
      status: invoice.status,
      createdAt: formatDateTime(invoice.createdAt),
      dueDate: formatDateTime(invoice.dueDate),
      projectName: invoice.project?.name || null,
      contractName: invoice.contract?.contractName || null,
      uploadedBy: invoice.uploadedBy
        ? `${invoice.uploadedBy.firstName} ${invoice.uploadedBy.lastName}`
        : null,
    }));

    return successResponse(res, "Invoices fetched for project", {
      rows: formattedInvoices,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

// ✅ Get single invoice by ID
exports.getInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById(id)
      .populate("project", "name")
      .populate("contract", "contractName")
      .populate("uploadedBy", "firstName lastName");

    if (!invoice) return errorResponse(res, "Invoice not found");

    const formattedInvoice = {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.clientName,
      clientEmail: invoice.clientEmail,
      billingAddress: invoice.billingAddress,
      description: invoice.description,
      amount: invoice.amount,
      discount: invoice.discount,
      taxRate: invoice.taxRate,
      currency: invoice.currency,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      paymentDate: invoice.paymentDate,
      issueDateFormatted: formatDateTime(invoice.issueDate),
      dueDateFormatted: formatDateTime(invoice.dueDate),
      paymentDateFormatted: formatDateTime(invoice.paymentDate),
      status: invoice.status,
      paymentMethod: invoice.paymentMethod,
      notes: invoice.notes,
      fileUrl: invoice.fileUrl,
      createdAt: formatDateTime(invoice.createdAt),
      updatedAt: formatDateTime(invoice.updatedAt),

      projectId: invoice.project?._id || null,
      projectName: invoice.project?.name || null,
      contractId: invoice.contract?._id || null,
      contractName: invoice.contract?.contractName || null,

      uploadedBy: invoice.uploadedBy
        ? `${invoice.uploadedBy.firstName} ${invoice.uploadedBy.lastName}`
        : null,

      grandTotal: invoice.grandTotal, // ✅ include virtual total
    };

    return successResponse(res, "Invoice fetched", formattedInvoice);
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

// ✅ Update invoice
exports.updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    // Map contractId → contract (if exists)
    if (updateData.contractId) {
      updateData.contract = updateData.contractId;
      delete updateData.contractId;
    }

    const updated = await Invoice.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate("project", "name")
      .populate("contract", "contractName")
      .populate("uploadedBy", "firstName lastName");

    if (!updated) return errorResponse(res, "Invoice not found");

    return successResponse(res, "Invoice updated successfully", updated);
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

// ✅ Delete invoice
exports.deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Invoice.findById({ _id: id });
    if (!invoice) return errorResponse(res, "Invoice not found");

    invoice.isDeleted = true;
    invoice.deleteAt = new Date();
    await invoice.save();

    return successResponse(res, "Invoice deleted successfully!");
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

exports.generateInvoicePDF = async (req, res) => {
  try {
    const invoiceId = req.params.id;

    const invoice = await Invoice.findById(invoiceId)
      .populate("project")
      .populate("contract");

    if (!invoice) return res.status(404).send("Invoice not found");

    const doc = new PDFDocument({ margin: 40 });
    const fileName = `invoice-${invoice.invoiceNumber}.pdf`;

    res.setHeader("Content-Disposition", `attachment; filename=${fileName}`);
    res.setHeader("Content-Type", "application/pdf");
    doc.pipe(res);

    // COLORS
    const primary = "#3949ab";
    const secondary = "#6876c7ff";
    const bgLight = "#e8eaf6";
    const green = "#43a047";
    const grey = "#424242";

    // ---------------- HEADER BAR ----------------
    doc.rect(0, 0, doc.page.width, 80).fill(primary);
    doc.fillColor("#fff").fontSize(32).text("INVOICE", 40, 25);

    // ---------------- COMPANY INFO ----------------
    doc
      .fillColor("#000")
      .fontSize(16)
      .text("Ysoft Solution", 40, 120)
      .fontSize(12)
      .text("213, 2nd Floor, Vraj Valencia, Off, Sarkhej - Gandhinagar Hwy,")
      .text(" Sola, Ahmedabad, Gujarat 380060")
      .text("Email: YsoftSolution@email.com")
      .moveDown(1);

    // ---------------- SECTION BAR ----------------
    doc.moveDown(0.5);
    doc.rect(40, doc.y, doc.page.width - 80, 25).fill(bgLight);
    doc
      .fillColor(primary)
      .fontSize(14)
      .text("Billing Details", 50, doc.y + 5);

    doc.moveDown(2);

    // ---------------- CLIENT DETAILS ----------------
    doc
      .fillColor(grey)
      .fontSize(14)
      .text(`Client: ${invoice.clientName}`)
      .text(`Email: ${invoice.clientEmail}`)
      .text(`Address: ${invoice.billingAddress || "—"}`)
      .moveDown(2);

    // ---------------- INVOICE DETAILS ----------------
    doc.rect(40, doc.y, doc.page.width - 80, 25).fill(bgLight);
    doc
      .fillColor(primary)
      .fontSize(14)
      .text("Invoice Details", 50, doc.y + 5);

    doc.moveDown(2);

    doc
      .fillColor(grey)
      .fontSize(14)
      .text(`Invoice No: ${invoice.invoiceNumber}`)
      .text(`Project: ${invoice.project?.name || "—"}`)
      .text(`Contract: ${invoice.contract?.contractName || "—"}`)
      .text(`Issue Date: ${invoice.issueDate}`)
      .text(`Due Date: ${invoice.dueDate}`)
      .moveDown(2);

    // ---------------- PAYMENT SUMMARY BOX ----------------
    doc.rect(40, doc.y, doc.page.width - 80, 150).fill(secondary);
    doc
      .fillColor(primary)
      .fontSize(16)
      .text("Payment Summary", 50, doc.y + 10);

    doc
      .fillColor(grey)
      .fontSize(14)
      .text(`Amount: ₹${invoice.amount}`, 50, doc.y + 20)
      .text(`Discount: ${invoice.discount}%`)
      .text(`Tax: ${invoice.taxRate}%`)
      .moveDown(1);

    // GRAND TOTAL HIGHLIGHT
    doc
      .fillColor(green)
      .fontSize(18)
      .text(`Grand Total: ₹${invoice.grandTotal.toFixed(2)}`, {
        bold: true,
        underline: true,
      });

    doc.moveDown(5);

    // ---------------- NOTES ----------------
    if (invoice.notes) {
      doc
        .fillColor(primary)
        .fontSize(14)
        .text("Notes", 50, doc.y + 5);

      doc.moveDown(2);
      doc.fillColor(grey).fontSize(12).text(invoice.notes);
    }

    // ---------------- FOOTER ----------------
    doc
      .moveDown(4)
      .fontSize(12)
      .fillColor("#888")
      .text("Thank you for your business!", { align: "center" });

    doc.end();
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.generateInvoiceDOCX = async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const invoice = await Invoice.findById(invoiceId).populate(
      "project contract"
    );

    if (!invoice) return res.status(404).send("Invoice not found");

    // 🌈 COLORS
    const primary = "1a237e"; // Indigo
    const headingBg = "e8eaf6"; // Light Indigo
    const labelGrey = "555555";

    const makeHeading = (text) =>
      new Paragraph({
        text,
        spacing: { before: 300, after: 200 },
        shading: { fill: headingBg },
        bold: true,
        alignment: AlignmentType.LEFT,
        style: "headingStyle",
      });

    const makeLabelValue = (label, value) =>
      new Paragraph({
        children: [
          new TextRun({ text: `${label}: `, bold: true, color: labelGrey }),
          new TextRun({ text: value || "—", color: "000000" }),
        ],
        spacing: { after: 100 },
      });

    // DOC
    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: "headingStyle",
            name: "Section Heading",
            basedOn: "Normal",
            run: { color: primary, bold: true, size: 26 },
          },
        ],
      },

      sections: [
        {
          properties: {},
          children: [
            // ---------------------- TITLE ----------------------
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "INVOICE",
                  size: 52,
                  bold: true,
                  color: primary,
                }),
              ],
              spacing: { after: 400 },
            }),

            // ---------------------- COMPANY INFO ----------------------
            makeHeading("Company Information"),

            new Paragraph({
              children: [
                new TextRun({ text: "Your Company Pvt Ltd", bold: true }),
              ],
            }),
            new Paragraph("Address Line 1"),
            new Paragraph("Address Line 2"),
            new Paragraph("Email: company@email.com"),

            // ---------------------- CLIENT INFO ----------------------
            makeHeading("Bill To"),
            makeLabelValue("Client Name", invoice.clientName),
            makeLabelValue("Email", invoice.clientEmail),
            makeLabelValue("Billing Address", invoice.billingAddress),

            // ---------------------- INVOICE DETAILS ----------------------
            makeHeading("Invoice Details"),
            makeLabelValue("Invoice No", invoice.invoiceNumber),
            makeLabelValue("Project", invoice.project?.name),
            makeLabelValue("Contract", invoice.contract?.contractName),
            makeLabelValue(
              "Issue Date",
              invoice.issueDate?.toISOString()?.slice(0, 10)
            ),
            makeLabelValue(
              "Due Date",
              invoice.dueDate?.toISOString()?.slice(0, 10)
            ),

            // ---------------------- PAYMENT SUMMARY ----------------------
            makeHeading("Payment Summary"),
            makeLabelValue("Amount", `₹${invoice.amount}`),
            makeLabelValue("Discount", `${invoice.discount}%`),
            makeLabelValue("Tax Rate", `${invoice.taxRate}%`),
            makeLabelValue(
              "Grand Total",
              `₹${invoice.grandTotal?.toFixed(2) || "—"}`
            ),

            // ---------------------- NOTES ----------------------
            makeHeading("Notes"),
            new Paragraph(invoice.notes || "—"),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=invoice-${invoice.invoiceNumber}.docx`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );

    res.send(buffer);
  } catch (err) {
    res.status(500).send("Error generating DOCX");
  }
};
