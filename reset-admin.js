const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/Owner/OneDrive/Desktop/Sgh Software/sgh-erp/backend/.env' });
const User = require('./models/User');

async function resetPassword() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sgh-erp');

    let admin = await User.findOne({ email: 'admin@sghcrafts.com' });
    if (!admin) {
      console.log('Admin not found, creating...');
      admin = new User({
        userId: 'SGH-U-0001',
        fullName: 'SGH Admin',
        designation: 'Administrator',
        department: 'Admin',
        email: 'admin@sghcrafts.com',
        role: 'Admin',
        isActive: true,
      });
    } else {
      // Make sure the account is still fully privileged. Admin permissions
      // are synthesized at request time, so we only need to reassert role
      // and active flag.
      admin.role = 'Admin';
      admin.isActive = true;
    }

    admin.password = 'SGH@admin2025';
    await admin.save();

    console.log('Admin email:    admin@sghcrafts.com');
    console.log('Admin password: SGH@admin2025');
    console.log('Role:           Admin (full permissions)');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

resetPassword();
