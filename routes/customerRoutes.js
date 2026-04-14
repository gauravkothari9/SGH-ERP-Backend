const express = require('express');
const router = express.Router();
const {
  getCustomers,
  getCustomer,
  getCustomerByFileNumber,
  createCustomer,
  updateCustomer,
  updateCustomerStatus,
  deleteCustomer,
  getCustomerStats,
  uploadPhoto,
} = require('../controllers/customerController');
const { protect, requirePermission } = require('../middleware/auth');
const { uploadCustomerPhoto } = require('../middleware/upload');

// All customer routes require authentication
router.use(protect);

// Read-level routes — all require `customers:read`
router.get('/stats/summary', requirePermission('customers', 'read'), getCustomerStats);
router.get('/file/:fileNumber', requirePermission('customers', 'read'), getCustomerByFileNumber);

router.route('/')
  .get(requirePermission('customers', 'read'), getCustomers)
  .post(requirePermission('customers', 'create'), createCustomer);

router.route('/:id')
  .get(requirePermission('customers', 'read'), getCustomer)
  .put(requirePermission('customers', 'update'), updateCustomer)
  .delete(requirePermission('customers', 'delete'), deleteCustomer);

// Status change — update permission covers moving forward; the controller
// additionally enforces forward-only semantics for non-Admin users.
router.patch('/:id/status', requirePermission('customers', 'update'), updateCustomerStatus);

router.post(
  '/:id/photo',
  requirePermission('customers', 'update'),
  uploadCustomerPhoto.single('photo'),
  uploadPhoto
);

module.exports = router;
