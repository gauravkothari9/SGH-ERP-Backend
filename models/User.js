const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const {
  MODULE_KEYS,
  ACTIONS,
  buildEmptyPermissionsMap,
} = require('../config/modules');

// Build a Mongoose sub-schema that mirrors the modules/actions config.
// Each module becomes a field of booleans — one per action — so storage
// stays compact and queryable without a separate collection.
const buildPermissionsSchema = () => {
  const shape = {};
  for (const key of MODULE_KEYS) {
    const actionShape = {};
    for (const action of ACTIONS) {
      actionShape[action] = { type: Boolean, default: false };
    }
    shape[key] = {
      type: new mongoose.Schema(actionShape, { _id: false }),
      default: () => ({}),
    };
  }
  return new mongoose.Schema(shape, { _id: false });
};

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      trim: true,
      index: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['Admin', 'Employee'],
      default: 'Employee',
      index: true,
    },
    designation: {
      type: String,
      trim: true,
      required: [
        function () {
          return this.role === 'Employee';
        },
        'Designation is required',
      ],
    },
    department: {
      type: String,
      trim: true,
      required: [
        function () {
          return this.role === 'Employee';
        },
        'Department is required',
      ],
    },
    permissions: {
      type: buildPermissionsSchema(),
      default: () => buildEmptyPermissionsMap(),
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
    lastActiveAt: {
      type: Date,
    },
    // Bumped whenever permissions or role change — the frontend uses this
    // to decide if its cached permissions are stale and needs to refetch.
    permissionsVersion: {
      type: Number,
      default: 1,
    },
    avatar: {
      type: String,
    },
    phone: {
      type: String,
    },

    // ─── Security ──────────────────────────────────────────────────────────
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Password strength: stricter rules for Admin accounts ────────────────────
userSchema.statics.validatePasswordStrength = function (password, role) {
  if (typeof password !== 'string') return 'Password is required';
  if (role === 'Admin') {
    if (password.length < 12) return 'Admin password must be at least 12 characters';
    if (!/[A-Z]/.test(password)) return 'Admin password must contain an uppercase letter';
    if (!/[a-z]/.test(password)) return 'Admin password must contain a lowercase letter';
    if (!/[0-9]/.test(password)) return 'Admin password must contain a digit';
    if (!/[^A-Za-z0-9]/.test(password)) return 'Admin password must contain a symbol';
  } else {
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      return 'Password must include letters and digits';
    }
  }
  return null;
};

// ─── Pre-save: Hash password ─────────────────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Bump permissionsVersion whenever role or permissions change so logged-in
// clients detect and refetch. Works for save(); findOneAndUpdate handled in
// the controller.
userSchema.pre('save', function (next) {
  if (this.isModified('role') || this.isModified('permissions')) {
    this.permissionsVersion = (this.permissionsVersion || 0) + 1;
  }
  next();
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Return a plain object giving the effective permissions for this user.
// Admins are granted the full set regardless of the stored document — there
// is no way for an Employee with edited permissions.json to escalate.
userSchema.methods.effectivePermissions = function () {
  if (this.role === 'Admin') {
    const map = buildEmptyPermissionsMap();
    for (const key of MODULE_KEYS) {
      for (const action of ACTIONS) map[key][action] = true;
    }
    return map;
  }
  const stored = this.permissions ? this.permissions.toObject?.() || this.permissions : {};
  const map = buildEmptyPermissionsMap();
  for (const key of MODULE_KEYS) {
    if (stored[key]) {
      for (const action of ACTIONS) {
        map[key][action] = !!stored[key][action];
      }
    }
  }
  return map;
};

userSchema.methods.hasPermission = function (moduleKey, action) {
  if (this.role === 'Admin') return true;
  const perms = this.permissions?.[moduleKey];
  if (!perms) return false;
  return !!perms[action];
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.failedLoginAttempts;
  delete obj.lockUntil;
  obj.userId = this.userId;
  obj.fullName = this.fullName;
  obj.designation = this.designation;
  obj.department = this.department;
  obj.permissions = this.effectivePermissions();
  return obj;
};

const User = mongoose.model('User', userSchema);
module.exports = User;
