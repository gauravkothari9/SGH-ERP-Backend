const BuyerCatalogue = require('../models/BuyerCatalogue');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, paginatedResponse, buildPagination } = require('../utils/apiResponse');

// ─── @GET /api/v1/buyer-catalogue ───────────────────────────────────────────
// List catalogue folders, supporting ?search= and pagination
exports.getBuyerFolders = async (req, res, next) => {
  const { page = 1, limit = 20, search } = req.query;

  const filter = {};
  
  if (search) {
    // To search by buyer name, we need to populate customer or do an aggregate.
    // For simplicity with Mongoose, if search is used, we can query catalogues 
    // by fileNumber or do a lookup on customer.
    // Let's do a simple fileNumber regex first:
    filter.fileNumber = { $regex: search, $options: 'i' };
  }

  // To support searching by customer name smoothly, let's just fetch everything,
  // populate customer, and filter in memory if "search" is provided (assuming modest folder counts).
  // Alternatively, use an aggregate. Let's use aggregate for robust search.
  
  const pg = parseInt(page, 10);
  const lim = parseInt(limit, 10);
  const skip = (pg - 1) * lim;

  let pipeline = [
    {
      $lookup: {
        from: 'customers',
        localField: 'buyerId',
        foreignField: '_id',
        as: 'buyer'
      }
    },
    { $unwind: { path: '$buyer', preserveNullAndEmptyArrays: true } }
  ];

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { fileNumber: { $regex: search, $options: 'i' } },
          { 'buyer.companyName': { $regex: search, $options: 'i' } },
        ]
      }
    });
  }

  // Count total for pagination
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countRes = await BuyerCatalogue.aggregate(countPipeline);
  const total = countRes.length > 0 ? countRes[0].total : 0;

  // Fetch data
  pipeline.push({ $sort: { lastUpdated: -1 } });
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: lim });
  
  // Project necessary fields
  pipeline.push({
    $project: {
      _id: 1,
      fileNumber: 1,
      lastUpdated: 1,
      buyerName: '$buyer.companyName',
      productCount: { $size: { $ifNull: ['$products', []] } }
    }
  });

  const folders = await BuyerCatalogue.aggregate(pipeline);
  
  paginatedResponse(res, folders, buildPagination(total, pg, lim), 'Buyer folders retrieved');
};

// ─── @GET /api/v1/buyer-catalogue/:fileNumber ─────────────────────────────────
// Get full catalogue for a specific buyer/folder
exports.getCatalogueDetail = async (req, res, next) => {
  const { fileNumber } = req.params;

  const catalogue = await BuyerCatalogue.findOne({ fileNumber })
    .populate('buyerId', 'companyName')
    .lean();

  if (!catalogue) {
    throw new AppError('Catalogue not found for this file number', 404);
  }

  // Optional: support search inside the catalogue products
  let products = catalogue.products || [];
  if (req.query.search) {
    const s = req.query.search.toLowerCase();
    products = products.filter(p => 
      p.sku.toLowerCase().includes(s) || 
      (p.itemDescription && p.itemDescription.toLowerCase().includes(s))
    );
  }

  successResponse(res, { 
    buyer: catalogue.buyerId, 
    fileNumber: catalogue.fileNumber, 
    lastUpdated: catalogue.lastUpdated,
    products 
  }, 'Catalogue detail retrieved');
};

// ─── @GET /api/v1/buyer-catalogue/:fileNumber/sku/:sku ──────────────────────
// Single product lookup for Autofill
exports.getSkuLookup = async (req, res, next) => {
  const { fileNumber, sku } = req.params;

  const catalogue = await BuyerCatalogue.findOne(
    { fileNumber, 'products.sku': sku.toUpperCase() },
    { 'products.$': 1 }
  ).lean();

  if (!catalogue || !catalogue.products || catalogue.products.length === 0) {
    return res.status(200).json({
      success: true,
      data: null,
      message: 'SKU not found in catalogue' // Don't throw 404, we just return empty so UI handles it gracefully
    });
  }

  successResponse(res, catalogue.products[0], 'SKU logic retrieved');
};
