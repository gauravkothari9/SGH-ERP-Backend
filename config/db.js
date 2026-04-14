const mongoose = require('mongoose');

let cached = global.__mongooseConn;
if (!cached) {
  cached = global.__mongooseConn = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 15000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
      })
      .then((conn) => {
        console.log(`✅ MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);

        mongoose.connection.on('error', (err) => {
          console.error(`MongoDB connection error: ${err}`);
        });
        mongoose.connection.on('disconnected', () => {
          console.warn('MongoDB disconnected. Attempting to reconnect...');
        });

        return conn;
      });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    console.error(`❌ MongoDB Connection Failed: ${error.message}`);
    if (!process.env.VERCEL) process.exit(1);
    throw error;
  }

  return cached.conn;
};

module.exports = connectDB;
