/**
 * One-shot migration: legacy `Office Staff` / `Factory Staff` roles and the
 * old flat permission map → new `Employee` role + granular permission matrix.
 *
 * Idempotent: re-running it on an already-migrated DB is a no-op. Run with:
 *
 *   node scripts/migrateUserPermissions.js
 */

const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config({
  path: path.join(__dirname, '..', '.env'),
});

// We need to bypass the new schema enum to read legacy values, so use the
// raw collection rather than the Mongoose model.
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/sgh-erp';

const { MODULE_KEYS, ACTIONS, buildEmptyPermissionsMap } = require('../config/modules');

// Old → new role mapping
const ROLE_MAP = {
  'Office Staff': 'Employee',
  'Factory Staff': 'Employee',
};

// For any old module name that was `true`, grant these actions in the new
// model. Delete/export/approve must be granted explicitly by an Admin
// after migration — they were Admin-only in the legacy system.
const DEFAULT_GRANT = ['read', 'create', 'update'];

// Some legacy keys map onto new module keys (renames)
const MODULE_RENAMES = {
  // old → new
  // (none yet, but place to add aliases as the schema evolves)
};

const translatePermissions = (legacyPerms) => {
  const next = buildEmptyPermissionsMap();
  if (!legacyPerms || typeof legacyPerms !== 'object') return next;

  for (const [rawKey, value] of Object.entries(legacyPerms)) {
    const key = MODULE_RENAMES[rawKey] || rawKey;
    if (!MODULE_KEYS.includes(key)) continue;

    // Already in the new shape? Just merge straight in.
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const action of ACTIONS) {
        if (value[action] === true) next[key][action] = true;
      }
      continue;
    }

    // Old flat boolean
    if (value === true) {
      for (const a of DEFAULT_GRANT) next[key][a] = true;
    }
  }

  // Dashboard view is implicit for every employee — they need it to load
  // the home screen. Customers/orders likewise need view if they had any
  // create/edit on them (defensive: legacy office staff always saw both).
  next.dashboard.read = true;
  return next;
};

const migrate = async () => {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  const users = db.collection('users');

  const cursor = users.find({});
  let scanned = 0;
  let migrated = 0;
  let skipped = 0;

  while (await cursor.hasNext()) {
    const u = await cursor.next();
    scanned += 1;

    let nextRole = u.role;
    let needsRoleUpdate = false;

    if (ROLE_MAP[u.role]) {
      nextRole = ROLE_MAP[u.role];
      needsRoleUpdate = true;
    } else if (u.role !== 'Admin' && u.role !== 'Employee') {
      // Anything weird → Employee with zero perms (safest default)
      nextRole = 'Employee';
      needsRoleUpdate = true;
    }

    // Detect old flat-boolean permissions shape: any value that is a plain
    // boolean rather than an object means we need to translate.
    const isLegacyShape =
      u.permissions &&
      Object.values(u.permissions).some((v) => typeof v === 'boolean');

    const isMissingShape =
      !u.permissions ||
      Object.keys(u.permissions).length === 0;

    if (!needsRoleUpdate && !isLegacyShape && !isMissingShape) {
      skipped += 1;
      continue;
    }

    const update = {
      $set: {
        permissionsVersion: (u.permissionsVersion || 0) + 1,
      },
    };

    if (needsRoleUpdate) update.$set.role = nextRole;

    // Admins don't store permissions — they're synthesized at request time.
    if (nextRole === 'Admin') {
      update.$set.permissions = buildEmptyPermissionsMap();
    } else {
      update.$set.permissions = translatePermissions(u.permissions);
    }

    await users.updateOne({ _id: u._id }, update);
    migrated += 1;
    console.log(
      `  migrated ${u.email || u._id}: role=${u.role || '(none)'} → ${nextRole}`
    );
  }

  console.log('');
  console.log(`Scanned:  ${scanned}`);
  console.log(`Migrated: ${migrated}`);
  console.log(`Skipped:  ${skipped} (already on new schema)`);

  await mongoose.disconnect();
};

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
