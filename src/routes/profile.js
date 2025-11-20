const express = require("express");
const authMiddleware = require("../middleware/auth");
const { successResponse, errorResponse } = require("../utils/response");

const router = express.Router();

router.get("/getProfileData", authMiddleware, async (req, res) => {
  try {
    const userData = req.user.toObject();
    delete userData.isDeleted;
    delete userData.deleteAt;
    successResponse(res, "Profile data", userData);
  } catch (error) {
    errorResponse(res, error.message, error);
  }
});


module.exports = router;
