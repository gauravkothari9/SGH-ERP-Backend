require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');

const connectDB = require('./config/db');
const { errorHandler, notFound } = require('./middleware/errorHandler');

// Route imports
const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const orderRoutes = require('./routes/orderRoutes');
const buyerCatalogueRoutes = require('./routes/buyerCatalogueRoutes');

// Connect to MongoDB (cached across serverless invocations)
connectDB().catch((err) => console.error('Initial DB connect error:', err.message));

const app = express();

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter);

// ─── CORS ───────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Logging ────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Static Files (Uploads) ─────────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    message: 'SGH ERP API is running',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/buyer-catalogue', buyerCatalogueRoutes);

// ─── Future Module Routes (placeholders) ────────────────────────────────────
// app.use('/api/v1/production', productionRoutes);
// app.use('/api/v1/manufacturing', manufacturingRoutes);
// app.use('/api/v1/qc', qcRoutes);
// app.use('/api/v1/polish', polishRoutes);
// app.use('/api/v1/packaging', packagingRoutes);

// ─── Error Handling ─────────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Start Server (skipped on Vercel serverless) ────────────────────────────
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  const server = app.listen(PORT, () => {
    console.log(`🚀 SGH ERP Server running on port ${PORT} [${process.env.NODE_ENV}]`);
  });

  process.on('unhandledRejection', (err) => {
    console.error('⚠️  Unhandled Rejection:', err);
    if (process.env.NODE_ENV === 'production') {
      server.close(() => process.exit(1));
    }
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Closing server...');
    server.close(() => process.exit(0));
  });
}

module.exports = app;
