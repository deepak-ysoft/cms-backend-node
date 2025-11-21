const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_SERVER,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

module.exports.sendResetEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM, // MUST be inquiry@ysoftsolution.com
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("SMTP Error:", error);
    throw new Error("Failed to send reset email");
  }
};
