const mongoose = require('mongoose');

// ─── Comment Sub-schema ──────────────────────────────────────────────────────
const commentSchema = new mongoose.Schema(
  {
    text: { type: String, trim: true },
    images: [{ type: String }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
  },
  { timestamps: true }
);

// ─── Order Item Sub-schema ───────────────────────────────────────────────────
const orderItemSchema = new mongoose.Schema(
  {
    // ─── SKU — dual: company + buyer ─────────────────────────────────────────
    companySKU: {
      type: String,
      required: [true, 'Company SKU is required'],
      trim: true,
      uppercase: true,
    },
    buyerSKU: {
      type: String,
      trim: true,
    },
    buyerDescription: {
      type: String,
      trim: true,
    },
    itemDescription: {
      type: String,
      trim: true,
    },
    itemCategory: {
      type: String,
      trim: true,
    },
    collectionName: {
      type: String,
      trim: true,
    },

    // ─── Multi-value fields ──────────────────────────────────────────────────
    materials: [{ type: String, trim: true }],
    finishes: [{ type: String, trim: true }],

    itemCondition: {
      type: String,
      enum: ['One of Kind', 'Production', ''],
      default: '',
    },

    // ─── HSN & Barcode ───────────────────────────────────────────────────────
    hsnCode: {
      type: String,
      trim: true,
    },
    barcode: {
      text: { type: String, trim: true },
      image: { type: String }, // file path
    },

    // ─── Dimensions ──────────────────────────────────────────────────────────
    dimensions: {
      length: { type: Number },
      width: { type: Number },
      height: { type: Number },
      unit: {
        type: String,
        enum: ['cm', 'inch'],
        default: 'cm',
      },
    },

    // ─── Logistics ───────────────────────────────────────────────────────────
    cbm: {
      type: Number,
      default: 0,
    },
    totalCBM: {
      type: Number,
      default: 0,
      // cbm * quantity — calculated on save
    },
    weight: {
      type: Number,
      default: 0,
    },

    // ─── Pricing ─────────────────────────────────────────────────────────────
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative'],
    },
    totalPrice: {
      type: Number,
      default: 0,
    },

    // ─── Media ───────────────────────────────────────────────────────────────
    images: [{ type: String }],
    primaryImage: { type: String }, // Specific path for the primary photo
    comments: [commentSchema],

    // ─── Module-specific notes ────────────────────────────────────────────────
    productionNotes: { type: String, trim: true },
    qcNotes: { type: String, trim: true },
    polishNotes: { type: String, trim: true },
    packagingNotes: { type: String, trim: true },

    // ─── Production link ─────────────────────────────────────────────────────
    linkedJobOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobOrder',
      default: null,
    },
    jobOrderStatus: {
      type: String,
      default: null,
    },

    // ─── Sort order ──────────────────────────────────────────────────────────
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

// Auto-calculate totalPrice and totalCBM on save
orderItemSchema.pre('save', function (next) {
  this.totalPrice = (this.quantity || 0) * (this.unitPrice || 0);
  this.totalCBM = (this.cbm || 0) * (this.quantity || 1);
  next();
});

// ─── Main Order Schema ───────────────────────────────────────────────────────
const orderSchema = new mongoose.Schema(
  {
    // ─── Identifiers ─────────────────────────────────────────────────────────
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer is required'],
      index: true,
    },
    fileNumber: {
      type: String,
      required: true,
      index: true,
    },

    // ─── Classification ──────────────────────────────────────────────────────
    orderType: {
      type: String,
      enum: ['Sample Order', 'Regular Order'],
      required: [true, 'Order type is required'],
    },
    orderStatus: {
      type: String,
      enum: [
        'Draft',
        'Finalized',
        'Pending',
        'In Production',
        'QC',
        'Polish',
        'Packaging',
        'Ready to Ship',
        'Shipped',
        'Completed',
        'Cancelled',
      ],
      default: 'Draft',
      index: true,
    },

    // ─── Dates ───────────────────────────────────────────────────────────────
    orderDate: {
      type: Date,
      required: [true, 'Order date is required'],
    },
    expectedDeliveryDate: {
      type: Date,
    },

    // ─── Reference Numbers ────────────────────────────────────────────────────
    proformaInvoiceNumber: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    buyerPONumber: {
      type: String,
      trim: true,
    },

    // ─── Currency ────────────────────────────────────────────────────────────
    currency: {
      type: String,
      default: 'USD',
    },

    // ─── Container ───────────────────────────────────────────────────────────
    containerSize: {
      type: String,
      enum: ['20ft', '40ft', '40ft HC', 'LCL', 'Air Freight', ''],
      default: '',
    },
    containerNumber: {
      type: String,
      trim: true,
    },

    // ─── Auto-calculated totals ───────────────────────────────────────────────
    totalCBM: {
      type: Number,
      default: 0,
    },
    totalWeight: {
      type: Number,
      default: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      default: 0,
    },

    // ─── Advance Payment ─────────────────────────────────────────────────────
    advanceReceived: {
      type: Boolean,
      default: false,
    },
    advanceAmount: {
      type: Number,
      default: 0,
    },
    advanceReceivedAt: {
      type: Date,
    },

    // ─── Line Items ───────────────────────────────────────────────────────────
    items: [orderItemSchema],

    // ─── Comments ─────────────────────────────────────────────────────────────
    comments: [commentSchema],

    // ─── Order-level Images ───────────────────────────────────────────────────
    orderImages: [{ type: String }],

    // ─── Notes ────────────────────────────────────────────────────────────────
    specialInstructions: {
      type: String,
      trim: true,
    },
    internalNotes: {
      type: String,
      trim: true,
    },
    attachments: [
      {
        fileName: String,
        filePath: String,
        fileType: String,
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    // ─── Cancellation ────────────────────────────────────────────────────────
    cancellationReason: {
      type: String,
      trim: true,
    },
    cancelledAt: {
      type: Date,
    },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ─── Revision tracking ───────────────────────────────────────────────────
    revisionNumber: {
      type: Number,
      default: 0,
    },
    revisionHistory: [
      {
        revisionNumber: Number,
        editedAt: { type: Date, default: Date.now },
        editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        snapshot: mongoose.Schema.Types.Mixed,
        changeNote: String,
      },
    ],

    // ─── Draft progress ───────────────────────────────────────────────────────
    draftProgress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },

    // ─── Audit ────────────────────────────────────────────────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    finalizedAt: {
      type: Date,
    },
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Pre-save: Recalculate totals ────────────────────────────────────────────
orderSchema.pre('save', function (next) {
  let totalAmount = 0;
  let totalCBM = 0;
  let totalWeight = 0;

  this.items.forEach((item) => {
    item.totalPrice = (item.quantity || 0) * (item.unitPrice || 0);
    item.totalCBM = (item.cbm || 0) * (item.quantity || 1);
    totalAmount += item.totalPrice;
    totalCBM += item.totalCBM || 0;
    totalWeight += (item.weight || 0) * (item.quantity || 1);
  });

  this.totalAmount = totalAmount;
  this.totalCBM = Math.round(totalCBM * 1000) / 1000;
  this.totalWeight = Math.round(totalWeight * 100) / 100;
  this.finalAmount = totalAmount; // No discount

  // Calculate draft progress
  if (this.orderStatus === 'Draft') {
    let filled = 0;
    const checks = [
      !!this.customer,
      !!this.orderDate,
      !!this.orderType,
      this.items.length > 0,
      !!this.currency,
    ];
    filled = checks.filter(Boolean).length;
    this.draftProgress = Math.round((filled / checks.length) * 100);
  } else {
    this.draftProgress = 100;
  }

  next();
});

// ─── Indexes ──────────────────────────────────────────────────────────────────
orderSchema.index({ fileNumber: 1, orderStatus: 1 });
orderSchema.index({ orderDate: -1 });
orderSchema.index({ 'items.companySKU': 1 });
orderSchema.index({ buyerPONumber: 1, customer: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({
  orderNumber: 'text',
  fileNumber: 'text',
  buyerPONumber: 'text',
  'items.companySKU': 'text',
  'items.itemDescription': 'text',
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
