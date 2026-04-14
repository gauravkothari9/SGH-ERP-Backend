const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { successResponse, createdResponse } = require('../utils/apiResponse');
const generateUserId = require('../utils/generateUserId');
const {
  MODULES,
  ACTIONS,
  MODULE_KEYS,
  isValidModule,
  isValidAction,
  buildEmptyPermissionsMap,
  getDepartments,
} = require('../config/modules');

// ─── Constants ───────────────────────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000; // 15 min lockout after MAX attempts

// ─── Helpers ─────────────────────────────────────────────────────────────────
// When `rememberMe` is true the token is minted with NO expiry at all, so
// the user stays signed in indefinitely — the only way out is an explicit
// logout (which wipes the token client-side). The inactivity timeout in
// middleware/auth.js is also skipped for rm-tokens.
//
// Otherwise we fall back to the short session window (default 12h) plus the
// inactivity timeout.
const signToken = (user, rememberMe = false) => {
  const payload = {
    id: user._id,
    role: user.role,
    pv: user.permissionsVersion,
    rm: rememberMe ? 1 : 0,
  };
  const options = {};
  if (!rememberMe) {
    options.expiresIn = process.env.JWT_EXPIRES_IN || '12h';
  }
  return jwt.sign(payload, process.env.JWT_SECRET, options);
};

const buildAuthPayload = (user) => ({
  _id: user._id,
  userId: user.userId,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  designation: user.designation,
  department: user.department,
  permissions: user.effectivePermissions(),
  permissionsVersion: user.permissionsVersion,
  avatar: user.avatar,
  phone: user.phone,
  isActive: user.isActive,
});

const sendTokenResponse = (user, statusCode, res, rememberMe = false) => {
  const token = signToken(user, rememberMe);
  res.status(statusCode).json({
    success: true,
    token,
    rememberMe,
    data: { user: buildAuthPayload(user) },
  });
};

// Normalize an incoming permissions object into the canonical shape —
// silently drops unknown modules/actions and coerces values to booleans so
// a malformed client can't introduce garbage fields.
const sanitizePermissions = (input) => {
  const out = buildEmptyPermissionsMap();
  if (!input || typeof input !== 'object') return out;
  for (const moduleKey of MODULE_KEYS) {
    const incoming = input[moduleKey];
    if (!incoming || typeof incoming !== 'object') continue;
    for (const action of ACTIONS) {
      out[moduleKey][action] = !!incoming[action];
    }
  }
  return out;
};

const countActiveAdmins = () =>
  User.countDocuments({ role: 'Admin', isActive: true });

// ─── @GET /api/v1/auth/bootstrap-status ──────────────────────────────────────
// Public. Reports whether the instance has zero users at all — which is the
// only state in which the Login screen is allowed to expose the "create first
// admin" flow. As soon as any Admin or Employee exists, this flips to false
// and the bootstrap endpoint below starts rejecting.
exports.getBootstrapStatus = async (req, res) => {
  const userCount = await User.estimatedDocumentCount();
  let canBootstrap = userCount === 0;
  if (canBootstrap) {
    // estimatedDocumentCount can be slightly stale on some engines; confirm.
    const exact = await User.countDocuments({});
    canBootstrap = exact === 0;
  }
  successResponse(res, { canBootstrap });
};

// ─── @POST /api/v1/auth/bootstrap-admin ──────────────────────────────────────
// Public, but only usable when the database contains zero users. Creates the
// very first Admin account so a fresh install can sign in without a seed
// script. The "zero users" check is re-evaluated inside the handler to close
// the TOCTOU window between the status call and this one.
exports.bootstrapAdmin = async (req, res) => {
  const existingCount = await User.countDocuments({});
  if (existingCount > 0) {
    throw new AppError(
      'Bootstrap is disabled — an account already exists. Ask an administrator to create your user.',
      403
    );
  }

  const { fullName, email, password } = req.body;
  if (!fullName || !email || !password) {
    throw new AppError('Full name, email and password are required', 400);
  }

  const strengthError = User.validatePasswordStrength(password, 'Admin');
  if (strengthError) throw new AppError(strengthError, 400);

  const userId = await generateUserId();
  const newUser = await User.create({
    userId,
    fullName,
    email,
    password,
    role: 'Admin',
    designation: 'Administrator',
    department: 'Admin',
    permissions: buildEmptyPermissionsMap(),
  });

  sendTokenResponse(newUser, 201, res, false);
};

// ─── @POST /api/v1/auth/login ─────────────────────────────────────────────────
exports.login = async (req, res, next) => {
  const { email, password, rememberMe } = req.body;

  if (!email || !password) {
    throw new AppError('Please provide email and password', 400);
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    '+password +failedLoginAttempts +lockUntil'
  );

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.isLocked()) {
    throw new AppError(
      'Account locked due to too many failed login attempts. Try again later.',
      423
    );
  }

  const match = await user.comparePassword(password);
  if (!match) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
      user.lockUntil = new Date(Date.now() + LOCK_WINDOW_MS);
      user.failedLoginAttempts = 0;
    }
    await user.save({ validateBeforeSave: false });
    throw new AppError('Invalid email or password', 401);
  }

  if (!user.isActive) {
    throw new AppError('Your account has been deactivated. Contact an administrator.', 403);
  }

  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  user.lastLogin = new Date();
  user.lastActiveAt = new Date();
  await user.save({ validateBeforeSave: false });

  sendTokenResponse(user, 200, res, !!rememberMe);
};

// ─── @POST /api/v1/auth/logout ───────────────────────────────────────────────
exports.logout = async (req, res) => {
  successResponse(res, {}, 'Logged out');
};

// ─── @GET /api/v1/auth/me ────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  const user = await User.findById(req.user._id);
  successResponse(res, { user: buildAuthPayload(user) });
};

// ─── @PUT /api/v1/auth/update-password ──────────────────────────────────────
exports.updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  const user = await User.findById(req.user._id).select('+password');
  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError('Current password is incorrect', 401);
  }

  const strengthError = User.validatePasswordStrength(newPassword, user.role);
  if (strengthError) throw new AppError(strengthError, 400);

  user.password = newPassword;
  await user.save();

  sendTokenResponse(user, 200, res);
};

// ─── @GET /api/v1/auth/modules ───────────────────────────────────────────────
// Returns the canonical module/action list for the permission matrix UI.
exports.getModules = async (req, res) => {
  successResponse(res, {
    modules: MODULES,
    actions: ACTIONS,
    departments: getDepartments(),
  });
};

// ─── Admin: User CRUD ────────────────────────────────────────────────────────

// @POST /api/v1/auth/users
exports.createUser = async (req, res) => {
  const {
    fullName,
    email,
    password,
    role,
    permissions,
    phone,
    designation,
    department,
  } = req.body;

  if (!fullName || !email || !password) {
    throw new AppError('Full name, email and password are required', 400);
  }

  const effectiveRole = role === 'Admin' ? 'Admin' : 'Employee';
  const strengthError = User.validatePasswordStrength(password, effectiveRole);
  if (strengthError) throw new AppError(strengthError, 400);

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('A user with this email already exists', 409);
  }

  const finalDesignation =
    effectiveRole === 'Admin'
      ? designation || 'Administrator'
      : designation;
  const finalDepartment =
    effectiveRole === 'Admin' ? department || 'Admin' : department;

  if (effectiveRole === 'Employee' && (!finalDesignation || !finalDepartment)) {
    throw new AppError('Designation and department are required for Employees', 400);
  }

  const userId = await generateUserId();

  const newUser = await User.create({
    userId,
    fullName,
    email,
    password,
    role: effectiveRole,
    designation: finalDesignation,
    department: finalDepartment,
    permissions:
      effectiveRole === 'Employee'
        ? sanitizePermissions(permissions)
        : buildEmptyPermissionsMap(), // Admin permissions computed on-the-fly
    phone,
  });

  createdResponse(res, { user: buildAuthPayload(newUser) }, 'User created successfully');
};

// Kept as an alias so /auth/register still resolves — maps to createUser.
exports.register = exports.createUser;

// @GET /api/v1/auth/users
exports.getUsers = async (req, res) => {
  const users = await User.find().sort({ createdAt: -1 });
  successResponse(res, {
    users: users.map(buildAuthPayload),
    count: users.length,
  });
};

// @GET /api/v1/auth/users/:id
exports.getUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);
  successResponse(res, { user: buildAuthPayload(user) });
};

// @PUT /api/v1/auth/users/:id — update profile fields, role, active flag
exports.updateUser = async (req, res) => {
  const { fullName, role, isActive, phone, designation, department } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);

  // Last-admin protection: prevent demotion or deactivation of the final Admin.
  if (user.role === 'Admin') {
    const adminCount = await countActiveAdmins();
    const beingDemoted = role && role !== 'Admin';
    const beingDeactivated = isActive === false;
    if (adminCount <= 1 && (beingDemoted || beingDeactivated)) {
      throw new AppError(
        'Cannot demote or deactivate the last active Admin account.',
        400
      );
    }
  }

  if (typeof fullName === 'string') user.fullName = fullName;
  if (typeof phone === 'string') user.phone = phone;
  if (typeof designation === 'string') user.designation = designation;
  if (typeof department === 'string') user.department = department;
  if (typeof isActive === 'boolean') user.isActive = isActive;

  if (role === 'Admin' || role === 'Employee') {
    const roleChanging = user.role !== role;
    user.role = role;
    if (roleChanging && role === 'Admin') {
      // Clear stored permissions — Admin has synthetic full access.
      user.permissions = buildEmptyPermissionsMap();
      if (!user.designation) user.designation = 'Administrator';
      if (!user.department) user.department = 'Admin';
    }
  }

  await user.save();

  successResponse(res, { user: buildAuthPayload(user) }, 'User updated successfully');
};

// @PUT /api/v1/auth/users/:id/permissions — replace permissions map wholesale
exports.updateUserPermissions = async (req, res) => {
  const { permissions } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);

  if (user.role === 'Admin') {
    throw new AppError('Admin permissions cannot be edited — Admins always have full access.', 400);
  }

  const before = user.effectivePermissions();
  user.permissions = sanitizePermissions(permissions);
  await user.save();

  successResponse(
    res,
    { user: buildAuthPayload(user) },
    'Permissions updated successfully'
  );
};

// @POST /api/v1/auth/users/:id/reset-password — admin-initiated reset
exports.resetUserPassword = async (req, res) => {
  const { newPassword } = req.body;
  const user = await User.findById(req.params.id).select('+password');
  if (!user) throw new AppError('User not found', 404);

  const strengthError = User.validatePasswordStrength(newPassword, user.role);
  if (strengthError) throw new AppError(strengthError, 400);

  user.password = newPassword;
  user.failedLoginAttempts = 0;
  user.lockUntil = undefined;
  await user.save();

  successResponse(res, {}, 'Password reset successfully');
};

// @DELETE /api/v1/auth/users/:id
exports.deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('User not found', 404);

  if (String(user._id) === String(req.user._id)) {
    throw new AppError('You cannot delete your own account.', 400);
  }

  if (user.role === 'Admin') {
    const adminCount = await countActiveAdmins();
    if (adminCount <= 1) {
      throw new AppError('Cannot delete the last active Admin account.', 400);
    }
  }

  await user.deleteOne();

  successResponse(res, {}, 'User deleted successfully');
};

