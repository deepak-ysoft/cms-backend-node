const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },

    contract: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contracts",
      required: true,
    },

    clientName: {
      type: String,
      required: true,
      trim: true,
    },

    clientEmail: { type: String, trim: true },
    billingAddress: { type: String },
    description: { type: String },

    // 💵 Main Amount before discounts or taxes
    amount: {
      type: Number,
      required: true,
    },

    discount: {
      type: Number,
      default: 0, // percentage
    },

    taxRate: {
      type: Number,
      default: 0, // percentage
    },

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

    issueDate: {
      type: Date,
      default: Date.now,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    paymentDate: {
      type: Date,
    },

    status: {
      type: String,
      enum: ["Pending", "Paid", "Overdue"],
      default: "Pending",
    },

    paymentMethod: {
      type: String,
      enum: ["Bank Transfer", "UPI", "Credit Card", "Cash"],
    },

    notes: { type: String },

    fileUrl: { type: String, trim: true },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Users",
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deleteAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// 🧮 Auto-generate sequential invoice numbers like INV-0001
invoiceSchema.pre("validate", async function (next) {
  if (!this.invoiceNumber) {
    try {
      const last = await mongoose
        .model("Invoice")
        .findOne({ isDeleted: false }) // avoid deleted items
        .sort({ invoiceNumber: -1 }) // sort by invoice number, not createdAt
        .select("invoiceNumber");

      let nextNumber = 1;

      if (last?.invoiceNumber) {
        const lastNum = parseInt(last.invoiceNumber.split("-")[1], 10);
        nextNumber = lastNum + 1;
      }

      this.invoiceNumber = `INV-${String(nextNumber).padStart(4, "0")}`;
    } catch (err) {
      console.error("Error generating invoice number:", err);
    }
  }

  next();
});

// 💡 Virtual: grand total = amount - discount + tax
invoiceSchema.virtual("grandTotal").get(function () {
  const discountAmt = (this.amount * this.discount) / 100;
  const taxable = this.amount - discountAmt;
  const taxAmt = (taxable * this.taxRate) / 100;
  return taxable + taxAmt;
});

invoiceSchema.set("toJSON", { virtuals: true });
invoiceSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Invoice", invoiceSchema);
