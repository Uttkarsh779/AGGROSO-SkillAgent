const mongoose = require('mongoose');

let isConnected = false;

async function connectDB() {
  if (isConnected) return;

  const uri = process.env.MONGODB_URI;
  if (!uri && process.env.NODE_ENV === 'production') {
    throw new Error('MONGODB_URI environment variable is required in production');
  }

  const targetUri = uri || 'mongodb://127.0.0.1:27017/skillsagent';

  try {
    await mongoose.connect(targetUri, { serverSelectionTimeoutMS: 5000 });
    isConnected = true;
    console.log('MongoDB connected successfully');
  } catch (err) {
    console.warn(`Primary MongoDB connection failed (${err.message}).`);

    // In production, do not attempt local fallback
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }

    // Disconnect failed connection state before attempting fallback in development
    await mongoose.disconnect().catch(() => {});

    if (!targetUri.includes('127.0.0.1') && !targetUri.includes('localhost')) {
      console.log('Attempting local MongoDB fallback (mongodb://127.0.0.1:27017/skillsagent)...');
      try {
        await mongoose.connect('mongodb://127.0.0.1:27017/skillsagent', { serverSelectionTimeoutMS: 3000 });
        isConnected = true;
        console.log('MongoDB connected successfully to local fallback');
        return;
      } catch (fallbackErr) {
        console.error('Local MongoDB fallback also failed:', fallbackErr.message);
      }
    }
    throw err;
  }
}

mongoose.connection.on('error', (err) => {
  if (isConnected) {
    console.error('MongoDB connection error:', err.message);
    isConnected = false;
  }
});

mongoose.connection.on('disconnected', () => {
  if (isConnected) {
    console.warn('MongoDB disconnected');
    isConnected = false;
  }
});

module.exports = { connectDB };
