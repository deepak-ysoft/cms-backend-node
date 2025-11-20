const sgMail = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

module.exports.sendResetEmail = async (to, subject, html) => {
  const msg = {
    to,
    from: process.env.SENDGRID_FROM, // verified send email
    subject,
    html,
  };

  try {
    await sgMail.send(msg);
  } catch (error) {
    console.error("SendGrid Error:", error);
    if (error.response) console.error(error.response.body);
    throw new Error("Failed to send reset email");
  }
};
