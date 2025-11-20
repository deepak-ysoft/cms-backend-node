const Projects = require("../models/Projects");
const Users = require("../models/Users");

const { successResponse, errorResponse } = require("../utils/response");
const uploadToImageKit = require("../utils/uploadToImageKit");

const getProjectData = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const status = req.query.status;
    const sortField = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;

    let filter = { isDeleted: false };

    // Developer role restriction
    if (req.user.role === "Developer") {
      filter.developers = req.user.id;
    }

    if (status) {
      filter.status = status;
    }

    if (search) {
      const s = search.trim();

      let dateQuery = null;

      // If search is a valid date (YYYY-MM-DD or similar)
      const parsedDate = new Date(s);

      if (!isNaN(parsedDate)) {
        // Create range: full day
        const start = new Date(parsedDate.setHours(0, 0, 0, 0));
        const end = new Date(parsedDate.setHours(23, 59, 59, 999));

        dateQuery = { createdAt: { $gte: start, $lte: end } };
      }

      // Apply filter
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
        ...(dateQuery ? [dateQuery] : []),
      ];
    }

    const total = await Projects.countDocuments(filter);

    const projects = await Projects.find(filter)
      .populate("manager", "firstName lastName profileImage")
      .populate("developers", "firstName lastName profileImage")
      .skip(skip)
      .limit(limit)
      .sort({ [sortField]: sortOrder });

    const data = projects.map((item) => ({
      id: item._id,
      projectName: item.name,
      status: item.status,
      createdAt: item.createdAt,
      manager: item.manager
        ? {
            fullName: `${item.manager.firstName} ${item.manager.lastName}`,
            profileImage: item.manager.profileImage,
          }
        : null,
    }));

    successResponse(res, "Success", { total, page, limit, data });
  } catch (error) {
    errorResponse(res, error.message);
  }
};
// ✅ Add Project
const addProject = async (req, res) => {
  try {
    const {
      name,
      projectCode,
      description,
      status,
      priority,
      projectType,
      phase,
      managerId,
      developerIds,
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,
      startDate,
      endDate,
      deadline,
      estimatedHours,
      actualHours,
      budget,
      spentAmount,
      currency,
      visibility,
      projectTech, // ✅ new field
    } = req.body;

    // ===== Required Validation =====
    if (!name || !managerId) {
      return errorResponse(res, "Name and manager are required!");
    }

    // ===== Duplicate Project Check =====
    const exists = await Projects.findOne({ name, isDeleted: false });
    if (exists) return errorResponse(res, "Project already exists!");

    // ===== Validate Manager =====
    const manager = await Users.findById(managerId);
    if (!manager || manager.role !== "Project Manager") {
      return errorResponse(res, "Invalid Manager ID");
    }

    // ===== Validate Developers =====
    let validDevelopers = [];
    if (developerIds?.length > 0) {
      validDevelopers = await Users.find({
        _id: { $in: developerIds },
        role: "Developer",
      }).select("_id");

      if (validDevelopers.length !== developerIds.length) {
        return errorResponse(res, "One or more developers are invalid!");
      }
    }

    // ===== Auto Project Code =====
    const autoProjectCode =
      projectCode ||
      `PRJ-${name.substring(0, 3).toUpperCase()}-${Date.now()
        .toString()
        .slice(-4)}`;

    // ===== Convert ProjectTech (comma-separated → array) =====
    const techArray =
      typeof projectTech === "string"
        ? projectTech
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : Array.isArray(projectTech)
        ? projectTech
        : [];

    // ===== Handle Uploaded Attachments =====
    let formattedAttachments = [];
    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        const uploaded = await uploadToImageKit(file);

        formattedAttachments.push({
          name: file.originalname,
          url: uploaded.url, // ⬅ ImageKit file URL
          uploadedAt: new Date(),
        });
      }
    }

    // ===== Final Project Data =====
    const projectData = {
      name,
      projectCode: autoProjectCode,
      description,
      status,
      priority,
      projectType,
      phase,
      manager: managerId,
      managerMail: manager.email,
      developers: validDevelopers.map((d) => d._id),

      // Client
      clientName,
      clientEmail,
      clientPhone,
      clientCompany,

      // Timeline
      startDate,
      endDate,
      deadline,
      estimatedHours,
      actualHours,

      // Financial
      budget,
      spentAmount,
      currency,

      // Custom
      projectTech: techArray,
      attachments: formattedAttachments,
      visibility: visibility || "Public",
      createdBy: req.user?.id || null,
    };

    const created = await Projects.create(projectData);
    successResponse(res, "Project created successfully!", created);
  } catch (error) {
    errorResponse(res, error.message);
  }
};

// ✅ Update Project
const updateProjectById = async (req, res) => {
  try {
    const projectId = req.params.id;
    let data = { ...req.body };
    const project = await Projects.findById(projectId);
    if (!project) return errorResponse(res, "Project not found!");

    // ===== Manager Validation =====
    if (data.managerId) {
      const manager = await Users.findById(data.managerId);
      if (!manager || manager.role !== "Project Manager") {
        return errorResponse(res, "Invalid Manager ID!");
      }
      data.manager = data.managerId;
      delete data.managerId;
    }

    // ===== Developer Validation =====
    if (data.developerIds) {
      const validDevelopers = await Users.find({
        _id: { $in: data.developerIds },
        role: "Developer",
      }).select("_id");

      if (validDevelopers.length !== data.developerIds.length) {
        return errorResponse(res, "One or more developers are invalid!");
      }
      data.developers = validDevelopers.map((d) => d._id);
      delete data.developerIds;
    }

    // ===== Auto Project Code =====
    if (data.name && !data.projectCode) {
      data.projectCode = `PRJ-${data.name
        .substring(0, 3)
        .toUpperCase()}-${Date.now().toString().slice(-4)}`;
    }

    // ===== Convert ProjectTech (comma-separated → array) =====
    if (data.projectTech) {
      data.projectTech = Array.isArray(data.projectTech)
        ? data.projectTech
        : data.projectTech
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
    }

    // ===== Handle Uploaded Attachments =====

    if (req.files && req.files.length > 0) {
      for (let file of req.files) {
        const uploaded = await uploadToImageKit(file);

        data.attachments.push({
          name: file.originalname,
          url: uploaded.url, // ⬅ ImageKit file URL
          uploadedAt: new Date(),
        });
      }
    }

    // ===== Metadata =====
    data.updatedBy = req.user?.id || null;

    const updated = await Projects.findByIdAndUpdate(projectId, data, {
      new: true,
      runValidators: true,
    })
      .populate("manager", "firstName lastName profileImage")
      .populate("developers", "firstName lastName profileImage");

    successResponse(res, "Project updated successfully!", updated);
  } catch (error) {
    errorResponse(res, error.message);
  }
};

const getProjectDataById = async (req, res) => {
  try {
    const project = await Projects.findById(req.params.id)
      .populate("manager", "firstName lastName profileImage email")
      .populate("developers", "firstName lastName profileImage email");

    if (!project) return errorResponse(res, "Project not found");

    const data = {
      projectId: project._id,
      name: project.name,
      projectCode: project.projectCode,
      description: project.description,
      status: project.status,
      priority: project.priority,
      projectType: project.projectType,
      projectTech: project.projectTech,
      phase: project.phase,

      // Manager
      manager: project.manager
        ? {
            id: project.manager._id,
            fullName: `${project.manager.firstName} ${project.manager.lastName}`,
            email: project.manager.email,
            profileImage: project.manager.profileImage,
          }
        : null,

      // Developers
      developers: project.developers.map((dev) => ({
        id: dev._id,
        fullName: `${dev.firstName} ${dev.lastName}`,
        email: dev.email,
        profileImage: dev.profileImage,
      })),

      // Client Info
      client: {
        name: project.clientName,
        email: project.clientEmail,
        phone: project.clientPhone,
        company: project.clientCompany,
      },

      // Timeline
      timeline: {
        startDate: project.startDate,
        endDate: project.endDate,
        deadline: project.deadline,
        estimatedHours: project.estimatedHours,
        actualHours: project.actualHours,
      },

      // Financial
      financials: {
        budget: project.budget,
        spentAmount: project.spentAmount,
        currency: project.currency,
      },

      // Attachments
      attachments: project.attachments.map((att) => ({
        name: att.name,
        url: att.url,
        uploadedAt: att.uploadedAt,
      })),

      visibility: project.visibility,

      createdBy: project.createdBy,
      updatedBy: project.updatedBy,

      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };

    successResponse(res, "Project details", data);
  } catch (error) {
    errorResponse(res, error.message);
  }
};

const deleteProjectById = async (req, res) => {
  try {
    const project = await Projects.findById(req.params.id);
    if (!project) return errorResponse(res, "Project not found");

    project.isDeleted = true;
    project.deletedAt = new Date();
    await project.save();

    successResponse(res, "Project deleted successfully!");
  } catch (error) {
    errorResponse(res, error.message);
  }
};

const assignDeveloper = async (req, res) => {
  try {
    const { projectId, developerIds } = req.body;

    const project = await Projects.findById(projectId);
    if (!project) return errorResponse(res, "Project not found");

    const assigned = project.developers.map(String);
    const duplicates = developerIds.filter((id) => assigned.includes(id));

    if (duplicates.length) {
      return errorResponse(res, "Developer already exists in project", {}, 200);
    }

    const updated = await Projects.findByIdAndUpdate(
      projectId,
      { $addToSet: { developers: { $each: developerIds } } },
      { new: true }
    )
      .populate("manager", "firstName lastName profileImage")
      .populate("developers", "firstName lastName profileImage");

    successResponse(res, "Developers added!", updated);
  } catch (error) {
    errorResponse(res, error.message);
  }
};

const removeDeveloperFromProject = async (req, res) => {
  try {
    const { projectId, developerId } = req.body;

    if (!projectId || !developerId) {
      return errorResponse(res, "Project ID & Developer ID are required");
    }

    const updated = await Projects.findByIdAndUpdate(
      projectId,
      { $pull: { developers: developerId } },
      { new: true }
    )
      .populate("manager", "firstName lastName profileImage")
      .populate("developers", "firstName lastName profileImage");

    successResponse(res, "Developer removed", updated);
  } catch (error) {
    errorResponse(res, error.message);
  }
};

// Get projects assigned to a specific developer
const getProjectsByDeveloper = async (req, res) => {
  try {
    const developerId = req.user._id; // assuming auth middleware sets req.user
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search?.trim() || "";
    const status = req.query.status;
    const sortField = req.query.sortField || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const filter = {
      developers: developerId,
      name: { $regex: search, $options: "i" },
      isDeleted: false,
    };

    if (status) {
      filter.status = status;
    }

    if (search) {
      const s = search.trim();

      let dateQuery = null;

      // If search is a valid date (YYYY-MM-DD or similar)
      const parsedDate = new Date(s);

      if (!isNaN(parsedDate)) {
        // Create range: full day
        const start = new Date(parsedDate.setHours(0, 0, 0, 0));
        const end = new Date(parsedDate.setHours(23, 59, 59, 999));

        dateQuery = { createdAt: { $gte: start, $lte: end } };
      }

      // Apply filter
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        ...(dateQuery ? [dateQuery] : []),
      ];
    }

    const total = await Projects.countDocuments(filter);
    const projects = await Projects.find(filter)
      .populate("manager", "firstName lastName profileImage")
      .sort({ [sortField]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    res.status(200).json({
      success: true,
      total,
      data: projects.map((p) => ({
        id: p._id,
        projectName: p.name,
        status: p.status,
        managerName: p.manager
          ? `${p.manager.firstName} ${p.manager.lastName}`
          : "N/A",
        managerProfileImage: p.manager?.profileImage || null,
        createdAt: p.createdAt,
      })),
    });
  } catch (error) {
    console.error("Error fetching developer projects:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

// Get single project details for developer
const getProjectDetailsForDeveloper = async (req, res) => {
  try {
    const { id } = req.params;
    const developerId = req.user._id;

    // Ensure the developer is assigned to the project
    const project = await Projects.findOne({
      _id: id,
      developers: developerId,
    })
      .populate("manager", "firstName lastName email profileImage")
      .populate("developers", "firstName lastName email profileImage");

    if (!project)
      return res.status(404).json({
        success: false,
        message: "Project not found or access denied",
      });

    res.status(200).json({
      success: true,
      data: {
        id: project._id,
        name: project.name,
        description: project.description,
        status: project.status,
        createdAt: project.createdAt,
        manager: project.manager
          ? {
              name: `${project.manager.firstName} ${project.manager.lastName}`,
              email: project.manager.email,
              image: project.manager.profileImage || null,
            }
          : null,
        developers: project.developers.map((dev) => ({
          id: dev._id,
          name: `${dev.firstName} ${dev.lastName}`,
          email: dev.email,
          image: dev.profileImage || null,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching project details:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  getProjectData,
  addProject,
  getProjectDataById,
  updateProjectById,
  deleteProjectById,
  assignDeveloper,
  removeDeveloperFromProject,
  getProjectsByDeveloper,
  getProjectDetailsForDeveloper,
};
