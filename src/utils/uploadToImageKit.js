const imagekit = require("../config/imagekit");

async function uploadToImageKit(file) {
  return await imagekit.upload({
    file: file.buffer, // <-- Multer buffer
    fileName: Date.now() + "_" + file.originalname,
    folder: "/upload", // optional
  });
}

module.exports = uploadToImageKit;
