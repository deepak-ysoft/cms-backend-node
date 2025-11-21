const WorkLogs = require("../models/Worklog");
const Projects = require("../models/Projects");
const { successResponse, errorResponse } = require("../utils/response");
const multer = require("multer");
const Users = require("../models/Users");
const uploadToImageKit = require("../utils/uploadToImageKit");
const upload = multer({ dest: "uploads/" });

// ✅ Add Work Log
const addWorkLog = async (req, res) => {
  try {
    const {
      projectId,
      title,
      date,
      startTime,
      endTime,
      description,
      status,
      isBillable = false,
      projectPhase,
    } = req.body;

    if (!projectId || !title || !date)
      return errorResponse(res, "Required fields are missing!");

    const project = await Projects.findById(projectId);
    if (!project) return errorResponse(res, "Project not found");

    if (project.status !== "Active")
      return errorResponse(
        res,
        `You cannot log work on a ${project.status} project!`
      );

    const userId = req.user.id;

    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const endOfDay = new Date().setHours(23, 59, 59, 999);

    const todayCount = await WorkLogs.countDocuments({
      developer: userId,
      date: { $gte: startOfDay, $lte: endOfDay },
      isDeleted: false,
    });

    if (todayCount >= 2)
      return errorResponse(
        res,
        "You cannot create more than two logs in one day!"
      );

    // ⏱ Calculate hours
    let calculatedHours = 0;
    if (startTime && endTime) {
      const start = new Date(startTime);
      const end = new Date(endTime);

      let hours = end.getHours() - start.getHours();
      let minutes = end.getMinutes() - start.getMinutes();

      if (minutes < 0) {
        hours -= 1;
        minutes += 60;
      }

      const minutesDecimal = (minutes / 100).toFixed(2);
      const total = parseFloat((hours + parseFloat(minutesDecimal)).toFixed(2));

      if (total <= 0)
        return errorResponse(res, "End time must be after start time!");
      if (total > 24) return errorResponse(res, "Hours cannot exceed 24");

      calculatedHours = total;
    }

    const uploaded = await uploadToImageKit(req?.file);
    const workLog = new WorkLogs({
      project: projectId,
      developer: req.user.id,
      title,
      date,
      startTime,
      endTime,
      hours: calculatedHours,
      description,
      status,
      isBillable,
      projectPhase,
      attachments: uploaded.url,
    });

    await workLog.save();
    return successResponse(res, "Work log submitted successfully!", workLog);
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

// ✅ Get Work Logs by Project ID
const getWorkLogsByProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const status = req.query.status || "";
    const sortField = req.query.sortField || "createdAt";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
    const sort = { [sortField]: sortOrder };

    const filter = {
      project: projectId,
      isDeleted: false,
    };

    if (status) {
      filter.approvalStatus = status;
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

        dateQuery = { date: { $gte: start, $lte: end } };
      }

      // Apply filter
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        ...(dateQuery ? [dateQuery] : []),
      ];
    }

    const logs = await WorkLogs.find(filter)
      .populate("developer", "firstName lastName email")
      .populate("approvedBy", "firstName lastName")
      .populate("project", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await WorkLogs.countDocuments(filter);

    const data = logs.map((log) => ({
      id: log._id,
      title: log.title,
      projectId: log.project,
      projectName: log.project.name,
      developerName: `${log.developer.firstName} ${log.developer.lastName}`,
      status: log.status,
      approvalStatus: log.approvalStatus,
      hours: log.hours,
      date: log.date,
      startTime: log.startTime,
      endTime: log.endTime,
      description: log.description,
      isBillable: log.isBillable,
      projectPhase: log.projectPhase,
      createdAt: log.createdAt,
    }));

    return successResponse(res, "Work logs fetched successfully!", {
      total,
      data,
    });
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

// ✅ Get Work Logs by Project ID
const getWorkLogsByProjectByDeveloper = async (req, res) => {
  try {
    const { projectId, developerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const status = req.query.status || "";
    const sortField = req.query.sortField || "createdAt";
    const sortOrder = req.query.sortOrder === "desc" ? -1 : 1;
    const sort = { [sortField]: sortOrder };

    const filter = {
      project: projectId,
      developer: developerId,
      isDeleted: false,
    };

    if (status) {
      filter.approvalStatus = status;
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

        dateQuery = { date: { $gte: start, $lte: end } };
      }

      // Apply filter
      filter.$or = [
        { title: { $regex: s, $options: "i" } },
        { status: { $regex: s, $options: "i" } },
        ...(dateQuery ? [dateQuery] : []),
      ];
    }

    const logs = await WorkLogs.find(filter)
      .populate("developer", "firstName lastName email")
      .populate("approvedBy", "firstName lastName")
      .populate("project", "name")
      .sort(sort)
      .skip(skip)
      .limit(limit);

    const total = await WorkLogs.countDocuments(filter);

    const data = logs.map((log) => ({
      id: log._id,
      title: log.title,
      projectId: log.project,
      projectName: log.project.name,
      developerName: `${log.developer.firstName} ${log.developer.lastName}`,
      status: log.status,
      approvalStatus: log.approvalStatus,
      hours: log.hours,
      date: log.date,
      startTime: log.startTime,
      endTime: log.endTime,
      description: log.description,
      isBillable: log.isBillable,
      projectPhase: log.projectPhase,
      createdAt: log.createdAt,
    }));

    return successResponse(res, "Work logs fetched successfully!", {
      total,
      data,
    });
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

// ✅ Get Work Logs by Project ID
const getWorkLogsById = async (req, res) => {
  try {
    const { worklogId } = req.params;
    // ✅ Validate ID before using in query

    const filter = { _id: worklogId, isDeleted: false };

    const log = await WorkLogs.findOne(filter)
      .populate("developer", "firstName lastName email")
      .populate("approvedBy", "firstName lastName")
      .populate("project", "name");

    // 🔹 If no record found
    if (!log) return errorResponse(res, "Work log not found");

    const data = {
      id: log._id,
      title: log.title,
      projectId: log.project?._id || null,
      projectName: log.project?.name || "",
      developerName: `${log.developer?.firstName || ""} ${
        log.developer?.lastName || ""
      }`,
      status: log.status,
      approvalStatus: log.approvalStatus,
      hours: log.hours,
      startTime: log.startTime,
      endTime: log.endTime,
      date: log.date,
      description: log.description,
      isBillable: log.isBillable,
      projectPhase: log.projectPhase,
      attachments: log.attachments,
      createdAt: log.createdAt,
    };

    return successResponse(res, "Work log fetched successfully!", data);
  } catch (error) {
    console.error("Error fetching work log:", error);
    return res.status(500).json({
      isSuccess: false,
      message: error.message || "Something went wrong",
    });
  }
};

// ✅ Update Work Log
const updateWorkLog = async (req, res) => {
  try {
    const { id } = req.params;
    const log = await WorkLogs.findById(id);
    if (!log) return errorResponse(res, "Work log not found!");

    if (
      req.user.role != "Admin" &&
      log.developer.toString() !== req.user.id.toString()
    )
      return errorResponse(res, "Unauthorized: You can edit only your logs!");

    const updates = { ...req.body };

    // ✅ File replacement if new one uploaded
    if (req.file) {
      const uploaded = await uploadToImageKit(req?.file);
      updates.attachments = uploaded.url;
    }

    // ⏱ Calculate hours
    if (updates.startTime && updates.endTime) {
      const start = new Date(updates.startTime);
      const end = new Date(updates.endTime);

      let hours = end.getHours() - start.getHours();
      let minutes = end.getMinutes() - start.getMinutes();

      if (minutes < 0) {
        hours -= 1;
        minutes += 60;
      }

      const minutesDecimal = (minutes / 100).toFixed(2);
      const total = parseFloat((hours + parseFloat(minutesDecimal)).toFixed(2));

      if (total <= 0)
        return errorResponse(res, "End time must be after start time!");
      if (total > 24) return errorResponse(res, "Hours cannot exceed 24");

      updates.hours = total;
    }

    const updatedLog = await WorkLogs.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    }).populate("developer", "email firstName lastName");

    console.log("updates", updatedLog);

    return successResponse(res, "Work log updated successfully!", updatedLog);
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

// ✅ Soft Delete Work Log
const deleteWorkLog = async (req, res) => {
  try {
    const { id } = req.params;

    const log = await WorkLogs.findById(id);
    if (!log) return errorResponse(res, "Work log not found!");

    if (
      req.user.role != "Admin" &&
      log.developer.toString() !== req.user.id.toString()
    ) {
      return errorResponse(res, "Unauthorized: You can delete only your logs!");
    }

    log.isDeleted = true;
    log.deleteAt = new Date();
    await log.save();

    return successResponse(res, "Work log deleted successfully!");
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

module.exports = {
  addWorkLog,
  getWorkLogsByProject,
  getWorkLogsByProjectByDeveloper,
  getWorkLogsById,
  updateWorkLog,
  deleteWorkLog,
};
