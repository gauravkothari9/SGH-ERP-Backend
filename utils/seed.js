/**
 * Database Seeder — creates an initial Admin user
 * Run with: node utils/seed.js  (or `node backend/utils/seed.js` from repo root)
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/sgh-erp');
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existing = await User.findOne({ email: 'admin@sghcrafts.com' });
    if (existing) {
      console.log('ℹ️  Admin user already exists. Skipping seed.');
      process.exit(0);
    }

    // Create default admin
    await User.create({
      userId: 'SGH-U-0001',
      fullName: 'SGH Admin',
      designation: 'Administrator',
      department: 'Admin',
      email: 'admin@sghcrafts.com',
      password: 'SGH@admin2025',
      role: 'Admin',
    });

    console.log('✅ Admin user created:');
    console.log(`   User ID:  SGH-U-0001`);
    console.log(`   Email:    admin@sghcrafts.com`);
    console.log(`   Password: SGH@admin2025`);
    console.log(`   Role:     Admin`);
    console.log('\n⚠️  IMPORTANT: Change the password immediately after first login!');

    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
