/**
 * One-time migration for the Users & Permissions module rebuild.
 *
 * - Renames `name` → `fullName` via $rename
 * - Backfills `userId` (SGH-U-XXXX) for every user
 * - Sets default `designation` and `department` based on role
 * - Rewrites the `permissions` object to the new 4-action CRUD shape:
 *     view → read, edit → update, export→ (merged into read), approve → (merged into update)
 *
 * Safe to re-run — skips users who are already migrated.
 *
 * Run with:  node backend/utils/migrateUsers.js
 */
require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');
const generateUserId = require('./generateUserId');
const { MODULE_KEYS } = require('../config/modules');

const migrate = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sgh-erp');
    console.log('✅ Connected to MongoDB');

    // 1) Rename `name` → `fullName` on all users that still have the old field.
    const renameRes = await User.collection.updateMany(
      { name: { $exists: true } },
      { $rename: { name: 'fullName' } }
    );
    console.log(`🔤 Renamed name → fullName on ${renameRes.modifiedCount} users`);

    // 2) Load all users and backfill missing fields + rewrite permissions.
    const users = await User.find({}).lean();
    console.log(`👥 Found ${users.length} users to inspect`);

    let touched = 0;
    for (const u of users) {
      const update = {};

      if (!u.userId) {
        update.userId = await generateUserId();
      }

      if (!u.designation) {
        update.designation = u.role === 'Admin' ? 'Administrator' : 'Employee';
      }

      if (!u.department) {
        update.department = u.role === 'Admin' ? 'Admin' : 'Office';
      }

      // Rewrite permissions object to the new 4-action CRUD shape.
      const oldPerms = u.permissions || {};
      const newPerms = {};
      let permsChanged = false;
      for (const key of MODULE_KEYS) {
        const row = oldPerms[key] || {};
        const hasOldShape =
          'view' in row ||
          'edit' in row ||
          'export' in row ||
          'approve' in row;
        const read = !!(row.read || row.view || row.export);
        const update_ = !!(row.update || row.edit || row.approve);
        const create = !!row.create;
        const del = !!row.delete;
        newPerms[key] = { create, read, update: update_, delete: del };
        if (hasOldShape) permsChanged = true;
      }
      if (permsChanged || u.role === 'Admin') {
        // For Admins we don't strictly need to store a permissions map, but
        // keeping a clean empty CRUD shape avoids leftover legacy keys.
        update.permissions = u.role === 'Admin'
          ? Object.fromEntries(MODULE_KEYS.map((k) => [k, { create: false, read: false, update: false, delete: false }]))
          : newPerms;
      }

      if (Object.keys(update).length > 0) {
        await User.collection.updateOne({ _id: u._id }, { $set: update });
        touched += 1;
        console.log(`  • ${u.email || u._id} migrated`);
      }
    }

    console.log(`\n✅ Migration complete. ${touched} users updated.`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
};

migrate();
