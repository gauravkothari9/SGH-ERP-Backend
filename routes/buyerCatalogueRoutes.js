const express = require('express');
const router = express.Router();
const {
  getBuyerFolders,
  getCatalogueDetail,
  getSkuLookup,
} = require('../controllers/buyerCatalogueController');
const { protect, requirePermission } = require('../middleware/auth');

// All buyer catalogue routes require authentication + view permission
router.use(protect);
router.use(requirePermission('buyerCatalogue', 'read'));

router.get('/', getBuyerFolders);
router.get('/:fileNumber', getCatalogueDetail);
router.get('/:fileNumber/sku/:sku', getSkuLookup);

module.exports = router;
