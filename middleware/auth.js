const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { AppError } = require('./errorHandler');
const { isValidModule, isValidAction } = require('../config/modules');

// Idle timeout for an active session. If a token is presented but the user
// hasn't hit any protected route within this window, treat it as expired.
// Configurable via SESSION_INACTIVITY_MINUTES, default 60 min.
const INACTIVITY_MS =
  (parseInt(process.env.SESSION_INACTIVITY_MINUTES, 10) || 60) * 60 * 1000;

/**
 * protect — Verifies JWT, enforces inactivity timeout, attaches user to req.user.
 */
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Not authorized. No token provided.', 401));
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return next(new AppError('Session expired. Please sign in again.', 401));
  }

  const user = await User.findById(decoded.id).select('+isActive');
  if (!user) {
    return next(new AppError('The user belonging to this token no longer exists.', 401));
  }

  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated. Contact an administrator.', 403));
  }

  if (user.isLocked && user.isLocked()) {
    return next(new AppError('Your account is temporarily locked. Try again later.', 403));
  }

  // Enforce idle timeout — compares lastActiveAt on the user document.
  // Skipped entirely when the token was minted with `rememberMe`: those
  // tokens are meant to persist until the user explicitly signs out.
  const isRememberMe = decoded && decoded.rm === 1;
  if (
    !isRememberMe &&
    user.lastActiveAt &&
    Date.now() - user.lastActiveAt.getTime() > INACTIVITY_MS
  ) {
    return next(new AppError('Session timed out due to inactivity. Please sign in again.', 401));
  }

  // If the token was minted before the user's permissions changed, force a
  // token refresh by returning 401. The frontend will react to this by
  // calling /auth/me which re-mints. In practice, the frontend polls /me so
  // the cache stays fresh — this is the hard fallback.
  if (
    typeof decoded.pv === 'number' &&
    typeof user.permissionsVersion === 'number' &&
    decoded.pv !== user.permissionsVersion
  ) {
    // We don't reject — we simply let the request through and signal via a
    // response header that the client should refresh. Hard-rejecting would
    // surprise users mid-request when an admin tweaks their permissions.
    res.set('X-Permissions-Stale', '1');
  }

  user.lastActiveAt = new Date();
  // Save without triggering validators / pre-save hooks (we only touch one
  // non-sensitive field here).
  User.updateOne({ _id: user._id }, { lastActiveAt: user.lastActiveAt }).catch(() => {});

  req.user = user;
  next();
};

/**
 * authorize — Legacy role-based gate. Still useful for "admin-only" routes
 * where we don't want to express the access in terms of a module.
 * Usage: authorize('Admin')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          `Role '${req.user.role}' is not authorized to perform this action.`,
          403
        )
      );
    }
    next();
  };
};

/**
 * requirePermission — Granular, module/action-based gate.
 * Usage:
 *   router.post('/', requirePermission('orders', 'create'), createOrder)
 *
 * Admins short-circuit to allow. Employees must have the exact action flag
 * set on the module in their stored permissions map.
 */
const requirePermission = (moduleKey, action) => {
  if (!isValidModule(moduleKey)) {
    throw new Error(`requirePermission: unknown module "${moduleKey}"`);
  }
  if (!isValidAction(action)) {
    throw new Error(`requirePermission: unknown action "${action}"`);
  }
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Not authenticated.', 401));
    }
    if (req.user.hasPermission(moduleKey, action)) return next();
    return next(
      new AppError(
        `Access denied. Missing '${action}' permission on '${moduleKey}'.`,
        403
      )
    );
  };
};

/**
 * optionalAuth — Attaches user if token present, proceeds either way.
 */
const optionalAuth = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    } catch {
      // Token invalid — continue without user
    }
  }

  next();
};

module.exports = { protect, authorize, requirePermission, optionalAuth };
