const BuyerCatalogue = require('../models/BuyerCatalogue');

// Normalize a stored media path so the frontend can render it from origin root.
// Handles: Windows backslashes, missing leading slash, empty/nullish values.
const normalizePath = (p) => {
  if (!p || typeof p !== 'string') return p;
  const forward = p.replace(/\\/g, '/').trim();
  if (!forward) return forward;
  if (/^https?:\/\//i.test(forward)) return forward;
  return forward.startsWith('/') ? forward : `/${forward}`;
};
const normalizePaths = (arr) =>
  Array.isArray(arr) ? arr.map(normalizePath).filter(Boolean) : arr;

/**
 * Synchronize an order's items into the corresponding BuyerCatalogue.
 * Idempotent: Can be run multiple times safely without duplicate side-effects.
 *
 * @param {Object} order - The populated Mongoose document for the Order.
 * @param {Object} user - The admin/user triggering this sync.
 */
const syncBuyerCatalogue = async (order, user) => {
  if (!order.customer || !order.fileNumber) return; // Cannot map without customer and file number
  if (!order.items || order.items.length === 0) return;

  const buyerId = typeof order.customer === 'object' && order.customer._id ? order.customer._id : order.customer;
  const fileNumber = order.fileNumber;

  // Find or create catalogue
  let catalogue = await BuyerCatalogue.findOne({ buyerId, fileNumber });
  if (!catalogue) {
    catalogue = new BuyerCatalogue({
      buyerId,
      fileNumber,
      products: [],
    });
  }

  catalogue.lastUpdated = new Date();

  // Process all items
  for (const item of order.items) {
    if (!item.companySKU) continue;
    
    const sku = item.companySKU.trim().toUpperCase();
    
    // Attempt to find existing product
    const productIdx = catalogue.products.findIndex(p => p.sku === sku);
    
    const qty = parseInt(item.quantity || 1, 10);
    const price = parseFloat(item.unitPrice || 0);

    // Base entry used for the *first* sync of an order (date = order date
    // so the first recorded price reflects when the order was placed).
    const priceEntry = {
      price,
      currency: order.currency || 'USD',
      quantity: qty,
      orderNumber: order.orderNumber,
      orderId: order._id,
      date: order.finalizedAt || order.orderDate || new Date(),
      recordedBy: user ? user._id : null,
    };

    // Entry used for *revisions* (re-syncs of the same order) — stamped with
    // the current edit time so newest revisions sort to the top of the price
    // history list in the UI.
    const revisionEntry = { ...priceEntry, date: new Date() };

    if (productIdx > -1) {
      // PRODUCT EXISTS - Update it
      const existingProduct = catalogue.products[productIdx];

      // Update basic fields (only when the new value is meaningful — never wipe with empty)
      existingProduct.buyerSKU = item.buyerSKU || existingProduct.buyerSKU;
      existingProduct.itemDescription = item.itemDescription || existingProduct.itemDescription;
      existingProduct.buyerDescription = item.buyerDescription || existingProduct.buyerDescription;
      existingProduct.itemCategory = item.itemCategory || existingProduct.itemCategory;
      existingProduct.collectionName = item.collectionName || existingProduct.collectionName;
      if (Array.isArray(item.materials) && item.materials.length > 0) existingProduct.materials = item.materials;
      if (Array.isArray(item.finishes) && item.finishes.length > 0) existingProduct.finishes = item.finishes;
      existingProduct.hsnCode = item.hsnCode || existingProduct.hsnCode;

      // Dimensions — only overwrite when the new dimensions actually contain data,
      // otherwise an order edit with empty dims would wipe valid catalogue info.
      if (item.dimensions && (item.dimensions.length || item.dimensions.width || item.dimensions.height)) {
        existingProduct.dimensions = item.dimensions;
      }
      existingProduct.cbm = item.cbm || existingProduct.cbm;
      existingProduct.weight = item.weight || existingProduct.weight;

      // Images — refresh the array when new ones exist (normalized)
      if (item.images && item.images.length > 0) {
        existingProduct.images = normalizePaths(item.images);
      } else {
        // Even if no new images arrived, make sure legacy entries are normalized
        // so stale paths (backslashes, missing leading slash) render correctly.
        if (Array.isArray(existingProduct.images)) {
          existingProduct.images = normalizePaths(existingProduct.images);
        }
      }
      // Propagate the primary image whenever it's set (even if the
      // images array itself didn't change). This is what fixes "image not
      // showing in catalogue after a price/primary-image update".
      if (item.primaryImage) {
        existingProduct.primaryImage = normalizePath(item.primaryImage);
      } else if (
        (!existingProduct.primaryImage || existingProduct.primaryImage === '') &&
        existingProduct.images?.length > 0
      ) {
        existingProduct.primaryImage = existingProduct.images[0];
      } else if (existingProduct.primaryImage) {
        // Normalize legacy stored primaryImage
        existingProduct.primaryImage = normalizePath(existingProduct.primaryImage);
      }

      // Keep notes/barcode fresh
      existingProduct.productionNotes = item.productionNotes || existingProduct.productionNotes;
      existingProduct.qcNotes = item.qcNotes || existingProduct.qcNotes;
      existingProduct.polishNotes = item.polishNotes || existingProduct.polishNotes;
      existingProduct.packagingNotes = item.packagingNotes || existingProduct.packagingNotes;

      if (item.barcode?.image || item.barcode?.text) {
        existingProduct.barcode = item.barcode;
      }

      // Comments — refresh the catalogue's snapshot whenever the order item
      // actually has comments. Never wipe existing comments with an empty
      // array (missing `comments` in a partial update shouldn't erase them).
      if (Array.isArray(item.comments) && item.comments.length > 0) {
        existingProduct.comments = item.comments.map((c) =>
          c && typeof c === 'object' ? c.toObject?.() || { ...c } : c
        );
      }

      // Locate the most recent history entry for this order, if any.
      // Defensive against legacy rows with a null orderId.
      const historyForThisOrder = existingProduct.priceHistory.filter(
        h => h.orderId && h.orderId.toString() === order._id.toString()
      );
      const latestForThisOrder = historyForThisOrder.length > 0
        ? historyForThisOrder[historyForThisOrder.length - 1]
        : null;

      if (!latestForThisOrder) {
        // First time this order is being recorded — push a fresh history row
        // and count it as a new order occurrence.
        existingProduct.priceHistory.push(priceEntry);
        existingProduct.totalTimesOrdered += 1;
        existingProduct.totalQuantityOrdered += qty;
        existingProduct.lastOrderedAt = priceEntry.date;
      } else {
        // Re-syncing the same order. If price or quantity changed, append a
        // NEW history row so the user can see the full revision timeline for
        // that order (this is what the BuyerCatalogue price-history modal
        // expects). If nothing changed, skip to stay idempotent.
        const prevPrice = Number(latestForThisOrder.price || 0);
        const prevQty = Number(latestForThisOrder.quantity || 0);
        const priceChanged = prevPrice !== price;
        const qtyChanged = prevQty !== qty;

        if (priceChanged || qtyChanged) {
          existingProduct.priceHistory.push(revisionEntry);
          // Don't bump totalTimesOrdered — it's still one order, just revised.
          existingProduct.totalQuantityOrdered =
            (existingProduct.totalQuantityOrdered || 0) - prevQty + qty;
          existingProduct.lastOrderedAt = revisionEntry.date;
        }
      }

      existingProduct.currentPrice = price;

      // Nested-subdoc array mutations (priceHistory inside products) are not
      // always auto-detected by Mongoose — mark them dirty explicitly so the
      // save persists the new history row.
      catalogue.markModified(`products.${productIdx}.priceHistory`);
      catalogue.markModified(`products.${productIdx}.images`);

    } else {
      // BRAND NEW PRODUCT
      const normalizedImages = normalizePaths(item.images) || [];
      const normalizedPrimary =
        normalizePath(item.primaryImage) ||
        (normalizedImages.length > 0 ? normalizedImages[0] : '');
      catalogue.products.push({
        sku,
        buyerSKU: item.buyerSKU,
        itemDescription: item.itemDescription,
        buyerDescription: item.buyerDescription,
        itemCategory: item.itemCategory,
        collectionName: item.collectionName,
        materials: item.materials,
        finishes: item.finishes,
        itemCondition: item.itemCondition,
        hsnCode: item.hsnCode,
        barcode: item.barcode,
        dimensions: item.dimensions,
        cbm: item.cbm,
        weight: item.weight,
        images: normalizedImages,
        primaryImage: normalizedPrimary,
        comments: item.comments,
        productionNotes: item.productionNotes,
        qcNotes: item.qcNotes,
        polishNotes: item.polishNotes,
        packagingNotes: item.packagingNotes,
        firstOrderedAt: priceEntry.date,
        lastOrderedAt: priceEntry.date,
        totalTimesOrdered: 1,
        totalQuantityOrdered: qty,
        currentPrice: price,
        priceHistory: [priceEntry]
      });
    }
  }

  await catalogue.save();
};

module.exports = {
  syncBuyerCatalogue
};
