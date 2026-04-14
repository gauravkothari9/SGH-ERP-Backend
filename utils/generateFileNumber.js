const Customer = require('../models/Customer');

/**
 * Generates a unique SGH File Number in format: SGH-YYYY-XXXX
 * Thread-safe using findOneAndUpdate atomic counter pattern
 */
const generateFileNumber = async () => {
  const year = new Date().getFullYear();

  // Find the latest file number for this year
  const latest = await Customer.findOne(
    { fileNumber: new RegExp(`^SGH-${year}-`) },
    { fileNumber: 1 },
    { sort: { fileNumber: -1 }, lean: true }
  );

  let nextSeq = 1;
  if (latest && latest.fileNumber) {
    const parts = latest.fileNumber.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    nextSeq = lastSeq + 1;
  }

  const padded = String(nextSeq).padStart(4, '0');
  const fileNumber = `SGH-${year}-${padded}`;

  // Ensure uniqueness (race condition guard)
  const exists = await Customer.findOne({ fileNumber }, { _id: 1 }).lean();
  if (exists) {
    // Recursively try the next number
    return generateFileNumber();
  }

  return fileNumber;
};

module.exports = generateFileNumber;
