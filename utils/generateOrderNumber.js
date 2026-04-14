const Order = require('../models/Order');

/**
 * Generates a unique Order Number in format: SGH-ORD-YYYY-XXXX
 */
const generateOrderNumber = async () => {
  const year = new Date().getFullYear();

  const latest = await Order.findOne(
    { orderNumber: new RegExp(`^SGH-ORD-${year}-`) },
    { orderNumber: 1 },
    { sort: { orderNumber: -1 }, lean: true }
  );

  let nextSeq = 1;
  if (latest && latest.orderNumber) {
    const parts = latest.orderNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    nextSeq = lastSeq + 1;
  }

  const padded = String(nextSeq).padStart(4, '0');
  const orderNumber = `SGH-ORD-${year}-${padded}`;

  const exists = await Order.findOne({ orderNumber }, { _id: 1 }).lean();
  if (exists) {
    return generateOrderNumber();
  }

  return orderNumber;
};

module.exports = generateOrderNumber;
