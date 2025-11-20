const successResponse = (res, message, data = {}, statusCode = 200) => {
  return res.status(statusCode).json({ isSuccess: true, message, data });
};

const errorResponse = (res, message, error = {}, statusCode = 200) => {
  return res.status(statusCode).json({ isSuccess: false, message, error });
};

module.exports = { successResponse, errorResponse };
