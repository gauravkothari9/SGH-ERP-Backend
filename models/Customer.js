const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    // ─── Primary Identifier ──────────────────────────────────────────────────
    fileNumber: {
      type: String,
      unique: true,
      index: true,
      required: [true, 'File number is required'],
      trim: true,
    },

    // ─── Core Info ───────────────────────────────────────────────────────────
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
    },
    contactPersonName: {
      type: String,
      required: [true, 'Contact person name is required'],
      trim: true,
    },
    designation: {
      type: String,
      trim: true,
    },

    // ─── Agent ───────────────────────────────────────────────────────────────
    agent: {
      type: String,
      trim: true,
    },

    // ─── Contact — Multiple Emails ───────────────────────────────────────────
    emails: [
      {
        email: { type: String, lowercase: true, trim: true },
        label: { type: String, trim: true, default: 'Primary' },
      },
    ],

    // ─── Contact — Multiple Phones ───────────────────────────────────────────
    phones: [
      {
        number: { type: String, trim: true },
        label: { type: String, trim: true, default: 'Primary' },
        isWhatsapp: { type: Boolean, default: false },
      },
    ],

    // ─── Photo ───────────────────────────────────────────────────────────────
    photo: {
      type: String,
      trim: true,
    },

    // ─── Multiple Addresses ──────────────────────────────────────────────────
    shippingAddresses: [
      {
        label: { type: String, trim: true, default: 'Primary' },
        line1: { type: String, trim: true },
        line2: { type: String, trim: true },
        city: { type: String, trim: true },
        country: { type: String, trim: true },
        state: { type: String, trim: true },
        pincode: { type: String, trim: true },
      },
    ],
    billingAddresses: [
      {
        label: { type: String, trim: true, default: 'Primary' },
        line1: { type: String, trim: true },
        line2: { type: String, trim: true },
        city: { type: String, trim: true },
        country: { type: String, trim: true },
        state: { type: String, trim: true },
        pincode: { type: String, trim: true },
      },
    ],

    // ─── Location ────────────────────────────────────────────────────────────
    country: {
      type: String,
      required: [true, 'Country is required'],
      trim: true,
    },

    // ─── Pricing & Logistics ──────────────────────────────────────────────────
    priceType: {
      type: String,
      enum: ['FOB', 'Ex Factory', ''],
      default: '',
    },
    currency: {
      type: String,
      enum: ['USD', 'EUR', 'GBP', 'AED', 'INR', 'AUD', 'CAD', 'SGD', 'OTHER'],
      default: 'USD',
    },
    portOfLoading: {
      type: String,
      trim: true,
    },
    portOfDischarge: {
      type: String,
      trim: true,
    },
    countryOfDestination: {
      type: String,
      trim: true,
    },
    paymentTerms: {
      type: String,
      trim: true,
    },
    shippingTerms: {
      type: String,
      enum: ['FOB', 'CIF', 'CNF', 'CFR', 'EXW', 'DDP', 'OTHER', ''],
      default: '',
    },

    // ─── Legal / Tax ──────────────────────────────────────────────────────────
    taxId: {
      type: String,
      trim: true,
    },

    // ─── Advance Payments (linked from orders) ──────────────────────────────
    advancePayments: [
      {
        orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
        orderNumber: { type: String },
        amount: { type: Number, default: 0 },
        date: { type: Date, default: Date.now },
        notes: { type: String, trim: true },
      },
    ],

    // ─── Internal ────────────────────────────────────────────────────────────
    notes: {
      type: String,
      trim: true,
    },
    customerSince: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },

    // ─── Metadata ────────────────────────────────────────────────────────────
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    isDeleted: {
      type: Boolean,
      default: false,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Virtual: Orders ─────────────────────────────────────────────────────────
customerSchema.virtual('orders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'customer',
  justOne: false,
});

// ─── Pre-save: Set customerSince on first create ─────────────────────────────
customerSchema.pre('save', function (next) {
  if (this.isNew && !this.customerSince) {
    this.customerSince = this.createdAt || new Date();
  }
  next();
});

// ─── Indexes ─────────────────────────────────────────────────────────────────
customerSchema.index({ companyName: 'text', contactPersonName: 'text', 'emails.email': 'text' });
customerSchema.index({ country: 1, status: 1 });
customerSchema.index({ createdAt: -1 });

// ─── Query middleware: exclude soft-deleted ───────────────────────────────────
customerSchema.pre(/^find/, function (next) {
  if (!this._conditions.isDeleted) {
    this.where({ isDeleted: { $ne: true } });
  }
  next();
});

const Customer = mongoose.model('Customer', customerSchema);
module.exports = Customer;
