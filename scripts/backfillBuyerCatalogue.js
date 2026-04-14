require('dotenv').config();
const mongoose = require('mongoose');
const Customer = require('../models/Customer');
const Order = require('../models/Order');
const { syncBuyerCatalogue } = require('../utils/syncBuyerCatalogue');
const connectDB = require('../config/db');

const runBackfill = async () => {
  try {
    await connectDB();
    console.log('Connected to DB. Starting Buyer Catalogue backfill...');

    // Find all orders that should be synced. We'll include Finalized and any post-finalized status.
    const statuses = [
      'Finalized', 'Pending', 'In Production', 'QC', 'Polish', 
      'Packaging', 'Ready to Ship', 'Shipped', 'Completed'
    ];

    // Get orders sorted from oldest to newest so the chronology of priceHistory works correctly
    const orders = await Order.find({ orderStatus: { $in: statuses } })
      .sort({ finalizedAt: 1, orderDate: 1, createdAt: 1 })
      .populate('customer')
      .exec();

    console.log(`Found ${orders.length} orders to process.`);

    let successCount = 0;
    for (const order of orders) {
      if (!order.customer || !order.fileNumber) {
        console.warn(`Skipping Order ${order.orderNumber} - Missing customer or file number.`);
        continue;
      }
      try {
        await syncBuyerCatalogue(order, null);
        successCount++;
        // console.log(`[${successCount}/${orders.length}] Synced Order ${order.orderNumber}`);
      } catch (err) {
        console.error(`Error syncing Order ${order.orderNumber}:`, err);
      }
    }

    console.log(`Backfill complete. Successfully synced ${successCount} orders.`);
    process.exit(0);
  } catch (error) {
    console.error('Fatal error during backfill:', error);
    process.exit(1);
  }
};

runBackfill();
