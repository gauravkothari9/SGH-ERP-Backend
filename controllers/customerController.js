const Customer = require('../models/Customer');
const Order = require('../models/Order');
const generateFileNumber = require('../utils/generateFileNumber');
const { AppError } = require('../middleware/errorHandler');
const {
  successResponse,
  createdResponse,
  paginatedResponse,
  buildPagination,
} = require('../utils/apiResponse');

// ─── @GET /api/v1/customers ──────────────────────────────────────────────────
exports.getCustomers = async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    search,
    status,
    country,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = req.query;

  const filter = {};

  if (status) filter.status = status;
  if (country) filter.country = country;

  if (search) {
    filter.$or = [
      { companyName: { $regex: search, $options: 'i' } },
      { fileNumber: { $regex: search, $options: 'i' } },
      { contactPersonName: { $regex: search, $options: 'i' } },
      { 'emails.email': { $regex: search, $options: 'i' } },
      { agent: { $regex: search, $options: 'i' } },
    ];
  }

  const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [customers, total] = await Promise.all([
    Customer.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .select('-__v')
      .lean(),
    Customer.countDocuments(filter),
  ]);

  // Attach order counts
  const customerIds = customers.map((c) => c._id);
  const orderStats = await Order.aggregate([
    { $match: { customer: { $in: customerIds }, orderStatus: { $ne: 'Cancelled' } } },
    {
      $group: {
        _id: '$customer',
        totalOrders: { $sum: 1 },
        totalOrderValue: { $sum: '$finalAmount' },
      },
    },
  ]);

  const statsMap = orderStats.reduce((map, stat) => {
    map[stat._id.toString()] = stat;
    return map;
  }, {});

  const enrichedCustomers = customers.map((c) => ({
    ...c,
    totalOrders: statsMap[c._id.toString()]?.totalOrders || 0,
    totalOrderValue: statsMap[c._id.toString()]?.totalOrderValue || 0,
  }));

  paginatedResponse(
    res,
    enrichedCustomers,
    buildPagination(total, page, limit),
    'Customers fetched successfully'
  );
};

// ─── @GET /api/v1/customers/:id ──────────────────────────────────────────────
exports.getCustomer = async (req, res, next) => {
  const customer = await Customer.findById(req.params.id).select('-__v');
  if (!customer) throw new AppError('Customer not found', 404);

  const orders = await Order.find({ customer: customer._id })
    .sort({ createdAt: -1 })
    .select('orderNumber orderStatus orderDate finalAmount currency orderType items containerSize fileNumber')
    .lean();

  const totalOrderValue = orders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);

  successResponse(res, {
    customer,
    orders,
    stats: {
      totalOrders: orders.length,
      totalOrderValue,
      activeOrders: orders.filter((o) => !['Completed', 'Cancelled'].includes(o.orderStatus)).length,
    },
  });
};

// ─── @GET /api/v1/customers/file/:fileNumber ─────────────────────────────────
exports.getCustomerByFileNumber = async (req, res, next) => {
  const customer = await Customer.findOne({ fileNumber: req.params.fileNumber }).select('-__v');
  if (!customer) throw new AppError('Customer not found', 404);
  successResponse(res, { customer });
};

// ─── @POST /api/v1/customers ────────────────────────────────────────────────
exports.createCustomer = async (req, res, next) => {
  let fileNumber = req.body.fileNumber?.trim();
  if (!fileNumber) {
    fileNumber = await generateFileNumber();
  } else {
    // Check uniqueness
    const existing = await Customer.findOne({ fileNumber });
    if (existing) {
      throw new AppError(`File number "${fileNumber}" already exists. Please use a different one.`, 409);
    }
  }

  const customer = await Customer.create({
    ...req.body,
    fileNumber,
    createdBy: req.user._id,
    lastModifiedBy: req.user._id,
  });

  createdResponse(res, { customer }, 'Customer created successfully');
};

// ─── @PUT /api/v1/customers/:id ──────────────────────────────────────────────
exports.updateCustomer = async (req, res, next) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new AppError('Customer not found', 404);

  // fileNumber is IMMUTABLE
  delete req.body.fileNumber;
  delete req.body.createdBy;

  const before = customer.toObject();

  Object.assign(customer, req.body, { lastModifiedBy: req.user._id });
  await customer.save();

  successResponse(res, { customer }, 'Customer updated successfully');
};

// ─── @PATCH /api/v1/customers/:id/status ────────────────────────────────────
exports.updateCustomerStatus = async (req, res, next) => {
  const { status } = req.body;
  if (!['Active', 'Inactive'].includes(status)) {
    throw new AppError('Invalid status. Must be Active or Inactive.', 400);
  }

  const customer = await Customer.findByIdAndUpdate(
    req.params.id,
    { status, lastModifiedBy: req.user._id },
    { new: true }
  );

  if (!customer) throw new AppError('Customer not found', 404);

  successResponse(res, { customer }, `Customer status updated to ${status}`);
};

// ─── @DELETE /api/v1/customers/:id (Soft delete) ────────────────────────────
exports.deleteCustomer = async (req, res, next) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new AppError('Customer not found', 404);

  const activeOrders = await Order.countDocuments({
    customer: customer._id,
    orderStatus: { $nin: ['Completed', 'Cancelled'] },
  });

  if (activeOrders > 0) {
    throw new AppError(
      `Cannot deactivate: customer has ${activeOrders} active order(s). Close or cancel them first.`,
      400
    );
  }

  await Customer.findByIdAndUpdate(req.params.id, {
    isDeleted: true,
    status: 'Inactive',
    lastModifiedBy: req.user._id,
  });

  successResponse(res, null, 'Customer deactivated successfully');
};


// ─── @GET /api/v1/customers/stats/summary ───────────────────────────────────
exports.getCustomerStats = async (req, res, next) => {
  const [totalActive, totalInactive, byCountry] = await Promise.all([
    Customer.countDocuments({ status: 'Active' }),
    Customer.countDocuments({ status: 'Inactive' }),
    Customer.aggregate([
      { $match: { status: 'Active' } },
      { $group: { _id: '$country', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
  ]);

  successResponse(res, {
    totalActive,
    totalInactive,
    total: totalActive + totalInactive,
    byCountry,
  });
};

// ─── @POST /api/v1/customers/:id/photo ──────────────────────────────────────
exports.uploadPhoto = async (req, res, next) => {
  if (!req.file) {
    throw new AppError('Please upload a file', 400);
  }

  const customer = await Customer.findById(req.params.id);
  if (!customer) throw new AppError('Customer not found', 404);

  // File path mapping (e.g. /uploads/customers/customer-12345.jpg)
  const photoUrl = `/uploads/customers/${req.file.filename}`;
  
  customer.photo = photoUrl;
  customer.lastModifiedBy = req.user._id;
  await customer.save();

  successResponse(res, { photo: photoUrl }, 'Photo uploaded successfully');
};
