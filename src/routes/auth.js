const express = require("express");

const {
  loginUser,
  registerUser,
  resetPassword,
  forgotPass,
} = require("../controllers/authControllers.js");

const router = express.Router();

router.post("/login", loginUser);

router.post("/register", registerUser);

router.post("/forgot-password", forgotPass);

router.post("/reset-password/:token", resetPassword);

module.exports = router;
