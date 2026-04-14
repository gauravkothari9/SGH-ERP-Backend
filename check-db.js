const mongoose = require('mongoose');
require('dotenv').config({ path: 'c:/Users/Owner/OneDrive/Desktop/Sgh Software/sgh-erp/backend/.env' });
const User = require('./models/User');

async function checkUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sgh-erp');
    const admin = await User.findOne({ email: 'admin@sghcrafts.com' });
    if (admin) {
      console.log('Admin found:', admin.email);
    } else {
      console.log('Admin not found');
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkUser();
