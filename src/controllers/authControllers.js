const User = require("../models/Users");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { successResponse, errorResponse } = require("../utils/response");
const { sendResetEmail } = require("../utils/sendEmail");

const generateToken = (user, rememberMe = false) => {
  const expiresIn = rememberMe ? "7d" : "10h";
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

const loginUser = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    // Normalize email spaces
    const cleanEmail = email.trim();

    // FIND USER WITH CASE-INSENSITIVE EMAIL CHECK
    const user = await User.findOne({
      email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
    }).select("+password");

    if (!user) {
      return errorResponse(res, "Invalid credentials !");
    }

    // CHECK PASSWORD
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return errorResponse(res, "Invalid credentials !");
    }

    // GENERATE TOKEN
    const token = generateToken(user, rememberMe);

    successResponse(res, "Login successful", {
      user: { email: user.email, role: user.role, id: user._id },
      token,
    });
  } catch (error) {
    errorResponse(res, error);
  }
};

const registerUser = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role } = req.body;

    // Manual validation
    if (!firstName || firstName.length < 2)
      return errorResponse(res, "First name must be at least 2 characters");

    if (!lastName || lastName.length < 2)
      return errorResponse(res, "Last name must be at least 2 characters");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return errorResponse(res, "Enter a valid email");

    if (!password || password.length < 6)
      return errorResponse(res, "Password must be at least 6 characters");

    // Normalize email spaces
    const cleanEmail = email.trim();

    // Check if email already exists
    const existingUser = await User.findOne({
      email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
    });
    if (existingUser) {
      return errorResponse(res, "This email is already registered.");
    }

    // Hash password
    const hashedPassword = bcrypt.hashSync(password, 10);

    const user = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role,
    });

    await user.save();

    const userData = user.toObject();
    delete userData.password;
    delete userData.isDeleted;
    delete userData.deleteAt;

    successResponse(res, "User created successfully!", userData);
  } catch (error) {
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      return errorResponse(
        res,
        `This ${duplicateField} is already registered.`
      );
    }
    errorResponse(res, error.message || "Something went wrong");
  }
};

const forgotPass = async (req, res) => {
  try {
    const { email } = req.body;
    const cleanEmail = email.trim();

    const user = await User.findOne({
      email: { $regex: new RegExp(`^${cleanEmail}$`, "i") },
    });

    if (!user) return errorResponse(res, "Email not registered.");

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: process.env.RESET_TOKEN_EXPIRE,
    });

    const resetLink = `${process.env.APP_URL}/reset-password/${token}`;

    const htmlMessage = `
      <div style="font-family: Arial; padding: 20px; background: #f4f6f9;">
        <div style="max-width: 600px; margin: auto; background: #fff; padding: 25px; border-radius: 8px;">
          <h2 style="color:#1976d2;">Password Reset Request</h2>
          <p>Hello,</p>
          <p>We received a request to reset your password. Click the button below to reset it:</p>

          <div style="text-align:center; margin: 20px 0;">
            <a href="${resetLink}"
              style="background:#1976d2; color:#fff; padding:12px 20px; text-decoration:none; border-radius:5px;">
              Reset Password
            </a>
          </div>

          <p>If the button does not work, copy and paste the link below:</p>
          <p style="background:#f1f1f1; padding:10px; border-radius:5px;">${resetLink}</p>

          <p>This link will expire in <strong>15 minutes</strong>.</p>

          <p style="margin-top:30px;">Regards,<br/>Support Team</p>
        </div>
      </div>
    `;

    await sendResetEmail(user.email, "Reset Your Password", htmlMessage);

    return successResponse(res, "Password reset link sent to your email.");
  } catch (err) {
    return errorResponse(res, `Server error : ${err}`);
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return errorResponse(res, "Invalid or expired token.");

    user.password = password; // Make sure your model hashes password
    await user.save();

    return successResponse(res, "Password reset successful.");
  } catch (err) {
    return errorResponse(res, `Invalid or expired link : ${err}`);
  }
};

module.exports = { loginUser, registerUser, forgotPass, resetPassword };
