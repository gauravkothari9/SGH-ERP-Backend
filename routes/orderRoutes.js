const express = require('express');
const router = express.Router();
const {
  getOrders,
  getOrder,
  createOrder,
  updateOrder,
  updateOrderStatus,
  cancelOrder,
  finalizeOrder,
  startProcessing,
  addComment,
  uploadOrderImages,
  uploadAttachment,
  getDashboardStats,
  exportOrders,
  deleteOrderMedia,
  deleteOrder,
  setPrimaryImage,
  uploadMedia,
} = require('../controllers/orderController');
const { protect, requirePermission } = require('../middleware/auth');
const { uploadDocument, uploadImage } = require('../middleware/upload');

// All order routes require authentication
router.use(protect);

// Dashboard stats
router.get('/stats/dashboard', requirePermission('orders', 'read'), getDashboardStats);

// Export (folded into read access)
router.get('/export', requirePermission('orders', 'read'), exportOrders);

// Standard CRUD
router.route('/')
  .get(requirePermission('orders', 'read'), getOrders)
  .post(requirePermission('orders', 'create'), createOrder);

router.route('/:id')
  .get(requirePermission('orders', 'read'), getOrder)
  .put(requirePermission('orders', 'update'), updateOrder)
  .delete(requirePermission('orders', 'delete'), deleteOrder);

// Finalize order (Draft → Finalized)
router.patch('/:id/finalize', requirePermission('orders', 'update'), finalizeOrder);

// Start processing (Finalized → Pending)
router.patch('/:id/start-processing', requirePermission('orders', 'update'), startProcessing);

// Status management — controller enforces forward-only for non-Admins
router.patch('/:id/status', requirePermission('orders', 'update'), updateOrderStatus);
router.patch('/:id/cancel', requirePermission('orders', 'update'), cancelOrder);

// Comments (with image upload)
router.post(
  '/:id/comments',
  requirePermission('orders', 'update'),
  uploadDocument.array('images', 10),
  addComment
);

// Generic media upload
router.post(
  '/upload-media',
  requirePermission('orders', 'create'),
  uploadImage.array('images', 20),
  uploadMedia
);

// Order images (multiple)
router.post(
  '/:id/images',
  requirePermission('orders', 'update'),
  uploadDocument.array('images', 20),
  uploadOrderImages
);

// Attachments (single file)
router.post(
  '/:id/attachments',
  requirePermission('orders', 'update'),
  uploadDocument.single('file'),
  uploadAttachment
);

// Media Management
router.delete('/:id/media', requirePermission('orders', 'update'), deleteOrderMedia);

// Primary Image selection
router.patch(
  '/:id/items/:itemId/primary-image',
  requirePermission('orders', 'update'),
  setPrimaryImage
);

module.exports = router;
