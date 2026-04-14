/**
 * Standardized API response helpers
 * Ensures consistent JSON structure across all endpoints
 */

const successResponse = (res, data, message = 'Success', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const createdResponse = (res, data, message = 'Created successfully') => {
  return successResponse(res, data, message, 201);
};

const paginatedResponse = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
  });
};

const errorResponse = (res, message = 'An error occurred', statusCode = 500, errors = null) => {
  return res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
  });
};

/**
 * Build pagination object
 */
const buildPagination = (total, page, limit) => ({
  total,
  page: parseInt(page),
  limit: parseInt(limit),
  pages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
  hasPrevPage: page > 1,
});

module.exports = {
  successResponse,
  createdResponse,
  paginatedResponse,
  errorResponse,
  buildPagination,
};
