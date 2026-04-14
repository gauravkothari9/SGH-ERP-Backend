const express = require('express');
const router = express.Router();
const {
  login,
  logout,
  getMe,
  updatePassword,
  getModules,
  createUser,
  register,
  getUsers,
  getUser,
  updateUser,
  updateUserPermissions,
  resetUserPassword,
  deleteUser,
  getBootstrapStatus,
  bootstrapAdmin,
} = require('../controllers/authController');
const { protect, authorize, requirePermission } = require('../middleware/auth');

// Public
router.post('/login', login);
router.get('/bootstrap-status', getBootstrapStatus);
router.post('/bootstrap-admin', bootstrapAdmin);

// Protected (any authenticated user)
router.use(protect);
router.get('/me', getMe);
router.post('/logout', logout);
router.put('/update-password', updatePassword);
router.get('/modules', getModules);

// User management — gated by the `users` module permission (Admin has it
// implicitly). We require Admin role for mutating routes because user-mgmt
// is an Admin-only capability by spec; `requirePermission('users', 'read')`
// allows a delegated "read-only user directory" role if ever needed.
router.get('/users', requirePermission('users', 'read'), getUsers);
router.get('/users/:id', requirePermission('users', 'read'), getUser);

router.post('/users', authorize('Admin'), createUser);
router.post('/register', authorize('Admin'), register); // backward-compat alias
router.put('/users/:id', authorize('Admin'), updateUser);
router.put('/users/:id/permissions', authorize('Admin'), updateUserPermissions);
router.post('/users/:id/reset-password', authorize('Admin'), resetUserPassword);
router.delete('/users/:id', authorize('Admin'), deleteUser);

module.exports = router;
