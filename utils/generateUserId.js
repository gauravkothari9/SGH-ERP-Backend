const User = require('../models/User');

/**
 * Generates a unique User ID in the format: SGH-U-XXXX (zero-padded, sequential).
 * Uses the latest existing userId to derive the next sequence, with a
 * race-condition retry guard if the generated ID already exists.
 */
const generateUserId = async () => {
  const latest = await User.findOne(
    { userId: /^SGH-U-\d{4}$/ },
    { userId: 1 },
    { sort: { userId: -1 }, lean: true }
  );

  let nextSeq = 1;
  if (latest && latest.userId) {
    const parts = latest.userId.split('-');
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!Number.isNaN(lastSeq)) nextSeq = lastSeq + 1;
  }

  const padded = String(nextSeq).padStart(4, '0');
  const userId = `SGH-U-${padded}`;

  // Race-condition guard: if somehow this ID was just taken, recurse.
  const exists = await User.findOne({ userId }, { _id: 1 }).lean();
  if (exists) {
    return generateUserId();
  }

  return userId;
};

module.exports = generateUserId;
