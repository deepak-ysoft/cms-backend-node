const Users = require("../models/Users");
const bcrypt = require("bcrypt");
const { successResponse, errorResponse } = require("../utils/response");
const uploadToImageKit = require("../utils/uploadToImageKit");

const getUsersData = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search?.trim() || "";
    const userRole = req.query.role;
    const ownUser = req.user;
    const sortField = "createdAt"; // default field
    const sortOrder = req.query.sortOrder === "desc" ? 1 : -1; // default asc
    const sort = { [sortField]: sortOrder };

    const filter = {
      isDeleted: false,
      _id: { $ne: ownUser._id },
    };

    if (userRole) {
      filter.role = userRole;
    }

    if (search) {
      const searchRegex = new RegExp(search.trim(), "i");

      // Split search text by space
      const parts = search.trim().split(" ").filter(Boolean);

      if (parts.length === 1) {
        // Single word: match either first or last
        filter.$or = [
          { firstName: { $regex: searchRegex } },
          { lastName: { $regex: searchRegex } },
          { email: { $regex: searchRegex } },
        ];
      } else {
        // Multiple words: full name search
        const first = parts[0];
        const last = parts.slice(1).join(" ");

        filter.$or = [
          // FirstName + LastName exact order
          {
            $and: [
              { firstName: { $regex: new RegExp(first, "i") } },
              { lastName: { $regex: new RegExp(last, "i") } },
            ],
          },

          // Reverse order (Doe John)
          {
            $and: [
              { firstName: { $regex: new RegExp(last, "i") } },
              { lastName: { $regex: new RegExp(first, "i") } },
            ],
          },

          // Search in email also
          { email: { $regex: searchRegex } },
        ];
      }
    }

    const total = await Users.countDocuments(filter);
    const data = await Users.find(filter)
      .select("-password -isDeleted -deleteAt")
      .skip(skip)
      .limit(limit)
      .sort(sort);

    return successResponse(res, "Users fetched successfully!", {
      total,
      page,
      limit,
      data,
    });
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

// 🔹 Search developers by email (used for contract form dropdown)
const searchDevelopers = async (req, res) => {
  try {
    const { q } = req.query;
    const query = q
      ? {
          email: { $regex: q, $options: "i" },
          role: "Developer",
          isDeleted: false,
        }
      : { role: "Developer", isDeleted: false };

    const developers = await Users.find(query).select(
      "_id firstName lastName email"
    );

    res.status(200).json({
      isSuccess: true,
      message: "Developers fetched successfully",
      developers,
    });
  } catch (error) {
    res.status(500).json({
      isSuccess: false,
      message: "Error fetching developers",
      error: error.message,
    });
  }
};

// ADD USER
const addUser = async (req, res) => {
  try {
    let data = { ...req.body };

    // ----- Check Duplicate Email -----
    const existingUserByMail = await Users.findOne({
      email: data.email,
    });

    if (existingUserByMail) {
      return errorResponse(res, "User already exists with same Email");
    }

    // ----- Check Duplicate Number -----
    const existingUserByMobile = await Users.findOne({
      phone: data.phone,
    });

    if (existingUserByMobile) {
      return errorResponse(res, "User already exists with same Phone number");
    }

    // ----- Validate Age -----
    if (data.dob) {
      const dob = new Date(data.dob);
      const ageDiffMs = Date.now() - dob.getTime();
      const ageDate = new Date(ageDiffMs);

      const age = Math.abs(ageDate.getUTCFullYear() - 1970);

      if (age < 21) {
        return errorResponse(res, "User must be at least 21 years old");
      }
    }

    // ----- Handle Skills -----
    if (data.skills && typeof data.skills === "string") {
      // frontend is sending like: "React,Angular"
      data.skills = data.skills
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s);
    }

    // frontend already sent as array
    if (Array.isArray(data.skills)) {
      data.skills = data.skills
        .flatMap((item) =>
          typeof item === "string" ? item.split(",").map((s) => s.trim()) : []
        )
        .filter((s) => s);
    }

    // ----- Handle Image Upload -----
    if (req.file ) {
      const uploaded = await uploadToImageKit(req.file);
      data.profileImage = uploaded.url;
    }

    data.password = bcrypt.hashSync(data.password, 10);
    // ----- Create User -----
    const newUser = await Users.create(data);

    return successResponse(res, "User added successfully!", newUser);
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

const updateUsersData = async (req, res) => {
  try {
    const { id } = req.params;
    const data = { ...req.body };

    // ----- Check Duplicate Email -----
    const existingUserByMail = await Users.findOne({
      email: data.email,
      _id: { $ne: id }, // exclude current user
    });

    if (existingUserByMail) {
      return errorResponse(res, "Email already exists for another user");
    }

    // ----- Check Duplicate Number -----
    const existingUserByMobile = await Users.findOne({
      phone: data.phone,
      _id: { $ne: id }, // exclude current user
    });

    if (existingUserByMobile) {
      return errorResponse(res, "Phone number already exists for another user");
    }

    // ----- Validate Age -----
    if (data.dob) {
      const dob = new Date(data.dob);
      const ageDiffMs = Date.now() - dob.getTime();
      const ageDate = new Date(ageDiffMs);
      const age = Math.abs(ageDate.getUTCFullYear() - 1970);

      if (age < 21) {
        return errorResponse(res, "User must be at least 21 years old");
      }
    }

    // ----- Skills Cleanup -----
    if (data.skills) {
      if (typeof data.skills === "string") {
        data.skills = data.skills
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s);
      } else if (Array.isArray(data.skills)) {
        data.skills = data.skills
          .flatMap((item) =>
            typeof item === "string" ? item.split(",").map((s) => s.trim()) : []
          )
          .filter((s) => s);
      }
    }

    // ----- Handle Image -----
    const oldUser = await Users.findById(id);
    console.log("req.file ", req.file);
    if (req.file ) {
      const uploaded = await uploadToImageKit(req?.file);
      data.profileImage = uploaded.url;
    } else {
      data.profileImage = oldUser.profileImage;
    }

    // ----- Update User -----
    const updateUser = await Users.findByIdAndUpdate(id, data, {
      new: true,
      runValidators: true,
    }).select("-password");

    return successResponse(res, "User updated successfully!", updateUser);
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

const userDataById = async (req, res) => {
  try {
    const { id } = req.params;
    const data = await Users.findById({ _id: id }).select(
      "-password -isDeleted -deleteAt"
    );
    successResponse(res, "user data!", data);
  } catch (error) {
    errorResponse(res, error.message, error);
  }
};

const deleteUserData = async (req, res) => {
  try {
    const { id } = req.params;
    await Users.findByIdAndUpdate(id, {
      isDeleted: true,
      deleteAt: Date.now(),
    });
    return successResponse(res, "User deleted successfully!");
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

const deleteUserImg = async (req, res) => {
  try {
    const { id } = req.params;
    await Users.findByIdAndUpdate(id, {
      profileImage: "",
    });
    return successResponse(res, "Profile deleted successfully!");
  } catch (error) {
    return errorResponse(res, error.message, error);
  }
};

module.exports = {
  updateUsersData,
  getUsersData,
  deleteUserData,
  userDataById,
  searchDevelopers,
  addUser,
  deleteUserImg,
};
