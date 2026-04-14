const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema(
  {
    price: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    quantity: { type: Number, required: true },
    orderNumber: { type: String, required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    date: { type: Date, default: Date.now },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const catalogueProductSchema = new mongoose.Schema(
  {
    // Primary Key within the catalogue
    sku: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    
    // Extracted from Order Item Schema
    buyerSKU: { type: String, trim: true },
    buyerDescription: { type: String, trim: true },
    itemDescription: { type: String, trim: true },
    itemCategory: { type: String, trim: true },
    collectionName: { type: String, trim: true },
    materials: [{ type: String, trim: true }],
    finishes: [{ type: String, trim: true }],
    itemCondition: { type: String, default: '' },
    hsnCode: { type: String, trim: true },
    barcode: {
      text: { type: String, trim: true },
      image: { type: String },
    },
    dimensions: {
      length: { type: Number },
      width: { type: Number },
      height: { type: Number },
      unit: { type: String, default: 'cm' },
    },
    cbm: { type: Number, default: 0 },
    weight: { type: Number, default: 0 },
    
    // Sync logic updates these on subsequent orders
    images: [{ type: String }],
    primaryImage: { type: String }, // Important for displaying default
    comments: [], // Using mixed array since comments structure can change, or define fully. We will just use mixed.
    productionNotes: { type: String, trim: true },
    qcNotes: { type: String, trim: true },
    polishNotes: { type: String, trim: true },
    packagingNotes: { type: String, trim: true },

    // Tracking stats
    firstOrderedAt: { type: Date },
    lastOrderedAt: { type: Date },
    totalTimesOrdered: { type: Number, default: 0 },
    totalQuantityOrdered: { type: Number, default: 0 },
    
    // Convenience property for current active price
    currentPrice: { type: Number, default: 0 },
    
    // History
    priceHistory: [priceHistorySchema],
  },
  { _id: true, timestamps: true }
);

const buyerCatalogueSchema = new mongoose.Schema(
  {
    buyerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    fileNumber: {
      type: String,
      required: true,
      index: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
    products: [catalogueProductSchema],
  },
  { timestamps: true }
);

// Indexes
buyerCatalogueSchema.index({ buyerId: 1, fileNumber: 1 }, { unique: true });
buyerCatalogueSchema.index({ 'products.sku': 1 });

const BuyerCatalogue = mongoose.model('BuyerCatalogue', buyerCatalogueSchema);
module.exports = BuyerCatalogue;
