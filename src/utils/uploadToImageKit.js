const imagekit = require("../config/imagekit");

async function uploadToImageKit(file) {
  try {
    const response = await imagekit.upload({
      file: file.buffer, // <-- Multer buffer
      fileName: Date.now() + "_" + file.originalname,
      folder: "/uploads", // ensure folder exists
    });

    return {
      url: response.url,
      fileId: response.fileId,
      name: response.name,
    };
  } catch (error) {
    console.error("ImageKit Upload Error:", error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

module.exports = uploadToImageKit;
