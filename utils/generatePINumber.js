const Order = require('../models/Order');

/**
 * Generates a unique Proforma Invoice Number in format: PI-YYYY-XXXX
 */
const generatePINumber = async () => {
  const year = new Date().getFullYear();

  const latest = await Order.findOne(
    { proformaInvoiceNumber: new RegExp(`^PI-${year}-`) },
    { proformaInvoiceNumber: 1 },
    { sort: { proformaInvoiceNumber: -1 }, lean: true }
  );

  let nextSeq = 1;
  if (latest && latest.proformaInvoiceNumber) {
    const parts = latest.proformaInvoiceNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  const padded = String(nextSeq).padStart(4, '0');
  const piNumber = `PI-${year}-${padded}`;

  // Check uniqueness
  const exists = await Order.findOne({ proformaInvoiceNumber: piNumber }, { _id: 1 }).lean();
  if (exists) {
    return generatePINumber();
  }

  return piNumber;
};

module.exports = generatePINumber;
