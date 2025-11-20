const Contracts = require("../models/Contracts");
const Projects = require("../models/Projects");
const { successResponse, errorResponse } = require("../utils/response");

/**
 * Add new contract
 * Supports both Fixed & Hourly contracts.
 */
const addContracts = async (req, res) => {
  try {
    const {
      projectId,
      contractName,
      startDate,
      endDate,
      currency,
      billingType,
      fixedAmount,
      developersWork, // optional array if hourly-based
    } = req.body;

    // ✅ Basic validation
    if (!req.file) return errorResponse(res, "Contract file is required!");
    if (!projectId || !contractName || !startDate || !endDate)
      return errorResponse(res, "All required fields must be provided!");

    // ✅ Check project existence
    const project = await Projects.findById(projectId);
    if (!project) return errorResponse(res, "Project not found!");

    // ✅ Prevent duplicate active contracts
    const existingContract = await Contracts.findOne({
      project: projectId,
      contractName: contractName.trim(),
      isDeleted: false,
    });

    if (existingContract)
      return errorResponse(
        res,
        "A contract with this name already exists for this project."
      );

    // ✅ Create contract base object
    const newContract = new Contracts({
      project: projectId,
      contractName: contractName.trim(),
      currency: currency || "INR",
      billingType: billingType || "Fixed",
      startDate,
      endDate,
      fileUrl: req.file.path.replace(/\\/g, "/"),
      uploadedBy: req.user.id,
    });

    // ✅ Billing type handling
    if (newContract.billingType === "Fixed") {
      newContract.fixedAmount = fixedAmount || 0;
    } else if (newContract.billingType === "Hourly" && developersWork) {
      let parsedDevelopers = JSON.parse(developersWork);

      // 🔹 Calculate each developer’s totalAmount (hoursWorked * ratePerHour)
      parsedDevelopers = parsedDevelopers.map((dev) => ({
        ...dev,
        totalAmount: (dev.hoursWorked || 0) * (dev.ratePerHour || 0),
      }));

      newContract.developersWork = parsedDevelopers;
    }

    // ✅ Save contract (pre-save hook will auto-update totalAmount)
    await newContract.save();

    // ✅ Populate response
    const populatedContract = await Contracts.findById(newContract._id)
      .populate("project", "name")
      .populate("uploadedBy", "firstName lastName")
      .populate("developersWork.developer", "firstName lastName email");

    const baseUrl = process.env.BASE_URL || "http://localhost:5000";
    const data = populatedContract.toObject();
    data.fileUrl = `${baseUrl}/${data.fileUrl}`;

    successResponse(res, "Contract added successfully!", data);
  } catch (error) {
    console.error("Error adding contract:", error);
    errorResponse(res, error.message, error);
  }
};

/**
 * Update contract by ID
 */
const updateContract = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      contractName,
      startDate,
      endDate,
      currency,
      billingType,
      fixedAmount,
      developersWork,
      status,
    } = req.body;

    // ✅ Check if contract exists
    const contract = await Contracts.findById(id);
    if (!contract || contract.isDeleted)
      return errorResponse(res, "Contract not found or deleted!");

    // ✅ Prevent duplicate contract name within same project
    if (contractName) {
      const existing = await Contracts.findOne({
        project: contract.project,
        contractName: contractName.trim(),
        _id: { $ne: id },
        isDeleted: false,
      });

      if (existing)
        return errorResponse(
          res,
          "A contract with this name already exists for this project."
        );

      contract.contractName = contractName.trim();
    }

    // ✅ Update basic fields
    if (startDate) contract.startDate = startDate;
    if (endDate) contract.endDate = endDate;
    if (currency) contract.currency = currency;
    if (billingType) contract.billingType = billingType;
    if (status) contract.status = status;

    // ✅ Billing type handling
    if (billingType === "Fixed") {
      contract.fixedAmount = fixedAmount || contract.fixedAmount;
      contract.developersWork = [];
      contract.totalAmount = contract.fixedAmount;
    } else if (billingType === "Hourly" && developersWork) {
      let parsedDevelopers = JSON.parse(developersWork);

      // 🔹 Calculate each developer’s totalAmount (hoursWorked * ratePerHour)
      parsedDevelopers = parsedDevelopers.map((dev) => ({
        ...dev,
        totalAmount: (dev.hoursWorked || 0) * (dev.ratePerHour || 0),
      }));

      // 🔹 Assign updated work list
      contract.developersWork = parsedDevelopers;
      contract.fixedAmount = 0;

      // 🔹 Update overall total amount for contract
      contract.totalAmount = parsedDevelopers.reduce(
        (sum, d) => sum + d.totalAmount,
        0
      );
    }

    // ✅ File replacement if new one uploaded
    if (req.file) {
      contract.fileUrl = req.file.path.replace(/\\/g, "/");
    }

    // ✅ Save updated contract
    await contract.save();

    // ✅ Return populated data
    const updatedContract = await Contracts.findById(id)
      .populate("project", "name")
      .populate("uploadedBy", "firstName lastName")
      .populate("developersWork.developer", "firstName lastName email");

    successResponse(res, "Contract updated successfully!", updatedContract);
  } catch (error) {
    console.error("Error updating contract:", error);
    errorResponse(res, error.message, error);
  }
};

/**
 * Get all active contracts (sorted by newest first)
 */
const getContracts = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const status = req.query.status || "";
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    // 🔹 Build filter (search by contractName or project name)
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

      // --- DATE SEARCH ----
      const parsedDate = new Date(s);
      if (!isNaN(parsedDate)) {
        const start = new Date(parsedDate.setHours(0, 0, 0, 0));
        const end = new Date(parsedDate.setHours(23, 59, 59, 999));
        dateQuery = { createdAt: { $gte: start, $lte: end } };
      }

      // --- AMOUNT SEARCH ----
      const parsedAmount = Number(s);
      if (!isNaN(parsedAmount)) {
        amountQuery = {
          $or: [{ fixedAmount: parsedAmount }, { totalAmount: parsedAmount }],
        };
      }

      filter.$or = [
        // text fields
        { contractName: { $regex: s, $options: "i" } },
        { billingType: { $regex: s, $options: "i" } },

        // numeric fields
        ...(amountQuery ? [amountQuery] : []),

        // date
        ...(dateQuery ? [dateQuery] : []),
      ];
    }

    // 🔹 Count total matching documents
    const total = await Contracts.countDocuments(filter);

    // 🔹 Fetch contracts with pagination + sorting
    const contracts = await Contracts.find(filter)
      .populate("project", "name")
      .populate("uploadedBy", "firstName lastName")
      .populate("developersWork.developer", "firstName lastName email")
      .sort({ [sortBy]: sortOrder === "asc" ? 1 : -1 })
      .skip(skip)
      .limit(Number(limit));

    // 🔹 Prepare response data
    const baseUrl = process.env.BASE_URL || "http://localhost:5000";

    const formatDateDisplay = (date) =>
      new Date(date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

    const data = contracts.map((contract) => ({
      id: contract._id,
      projectId: contract.project._id,
      projectName: contract.project.name,
      adminName: `${contract.uploadedBy.firstName} ${contract.uploadedBy.lastName}`,
      fileUrl: `${baseUrl}/${contract.fileUrl}`,
      contractName: contract.contractName,
      currency: contract.currency,
      billingType: contract.billingType,
      fixedAmount: contract.fixedAmount,
      totalAmount: contract.totalAmount,
      developersWork: contract.developersWork,
      status: contract.status,
      startDate: contract.startDate,
      endDate: contract.endDate,
      createdAt: contract.createdAt,
      startDateFormatted: formatDateDisplay(contract.startDate),
      endDateFormatted: formatDateDisplay(contract.endDate),
      createdAtFormatted: formatDateDisplay(contract.createdAt),
    }));
    // ✅ Send paginated response
    successResponse(res, "Contracts fetched successfully!", {
      data,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    errorResponse(res, error.message, error);
  }
};

/**
 * Get contract details by Project ID (sorted by newest first)
 */
const getContractsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!projectId) return errorResponse(res, "Project ID is required!");

    const contracts = await Contracts.find({
      project: projectId,
      isDeleted: false,
    })
      .populate("project", "name")
      .populate("uploadedBy", "firstName lastName")
      .populate("developersWork.developer", "firstName lastName email")
      .sort({ createdAt: -1 }); // 🟢 Sort DESC

    if (!contracts || contracts.length === 0) {
      return successResponse(res, "No contract found for this project!", []);
    }

    const formatDateDisplay = (date) =>
      new Date(date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

    const baseUrl = process.env.BASE_URL || "http://localhost:5000";

    const data = contracts.map((contract) => ({
      id: contract._id,
      projectId: contract.project._id,
      projectName: contract.project.name,
      adminName: `${contract.uploadedBy.firstName} ${contract.uploadedBy.lastName}`,
      fileUrl: `${baseUrl}/${contract.fileUrl}`,
      contractName: contract.contractName,
      currency: contract.currency,
      billingType: contract.billingType,
      fixedAmount: contract.fixedAmount,
      totalAmount: contract.totalAmount,
      developersWork: contract.developersWork,
      status: contract.status,
      startDate: contract.startDate,
      endDate: contract.endDate,
      createdAt: contract.createdAt,
      startDateFormatted: formatDateDisplay(contract.startDate),
      endDateFormatted: formatDateDisplay(contract.endDate),
      createdAtFormatted: formatDateDisplay(contract.createdAt),
    }));
    successResponse(res, "Contract fetched successfully!", data);
  } catch (error) {
    errorResponse(res, error.message, error);
  }
};
/**
 * Get contract details by ID
 */
const getContractById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return errorResponse(res, "Contract ID is required!");
    const contract = await Contracts.findById(id)
      .populate("project", "name description status")
      .populate("uploadedBy", "firstName lastName email")
      .populate(
        "developersWork.developer",
        "firstName lastName email profileImage"
      );

    if (!contract) return errorResponse(res, "Contract not found!");

    const formatDateDisplay = (date) =>
      new Date(date).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      });

    const baseUrl = process.env.BASE_URL || "http://localhost:5000";

    const data = {
      id: contract._id,
      project: {
        id: contract.project?._id,
        name: contract.project?.name,
        description: contract.project?.description,
        status: contract.project?.status,
      },
      uploadedBy: {
        id: contract.uploadedBy?._id,
        name: `${contract.uploadedBy?.firstName || ""} ${
          contract.uploadedBy?.lastName || ""
        }`,
        email: contract.uploadedBy?.email,
      },
      contractName: contract.contractName,
      billingType: contract.billingType,
      fileUrl: `${baseUrl}/${contract.fileUrl}`,
      currency: contract.currency,
      fixedAmount: contract.fixedAmount,
      totalAmount: contract.totalAmount,
      developersWork: contract.developersWork.map((dev) => ({
        id: dev.developer?._id,
        name: `${dev.developer?.firstName || ""} ${
          dev.developer?.lastName || ""
        }`,
        email: dev.developer?.email,
        hoursWorked: dev.hoursWorked,
        ratePerHour: dev.ratePerHour,
        totalAmount: dev.totalAmount,
      })),
      status: contract.status,
      startDate: formatDateDisplay(contract.startDate),
      endDate: formatDateDisplay(contract.endDate),
      createdAt: formatDateDisplay(contract.createdAt),
      updatedAt: formatDateDisplay(contract.updatedAt),
    };

    successResponse(res, "Contract fetched successfully!", data);
  } catch (error) {
    console.error("Error fetching contract:", error);
    errorResponse(res, error.message, error);
  }
};

/**
 * Soft delete a contract
 */
const deleteContract = async (req, res) => {
  try {
    const { id } = req.params;
    const contract = await Contracts.findById(id);

    if (!contract) return errorResponse(res, "Contract not found!");

    contract.isDeleted = true;
    contract.deleteAt = new Date();
    await contract.save();

    successResponse(res, "Contract deleted successfully (soft delete)", null);
  } catch (error) {
    errorResponse(res, error.message, error);
  }
};

module.exports = {
  addContracts,
  updateContract,
  getContracts,
  getContractsByProject,
  getContractById,
  deleteContract,
};
