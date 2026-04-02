const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  if (isConnected) {
    console.log('✅ Already connected to MongoDB');
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      maxPoolSize: 10,
    });
    
    isConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    console.log(`📊 Database Name: ${conn.connection.name}`);
    
    await createIndexes();
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected!');
      isConnected = false;
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
      isConnected = false;
    });
    
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    isConnected = false;
    throw error;
  }
};

async function createIndexes() {
  try {
    const db = mongoose.connection;
    
    if (db.collection('products')) {
      await db.collection('products').createIndex({ name: 'text', description: 'text' });
      await db.collection('products').createIndex({ category_id: 1 });
      await db.collection('products').createIndex({ price: 1 });
      await db.collection('products').createIndex({ featured: 1 });
      console.log('✅ Product indexes created');
    }
    
    if (db.collection('orders')) {
      await db.collection('orders').createIndex({ order_number: 1 }, { unique: true });
      await db.collection('orders').createIndex({ customer_phone: 1 });
      await db.collection('orders').createIndex({ created_at: -1 });
      console.log('✅ Order indexes created');
    }
    
    if (db.collection('categories')) {
      await db.collection('categories').createIndex({ name: 1 }, { unique: true });
      console.log('✅ Category indexes created');
    }
    
  } catch (error) {
    console.error('Error creating indexes:', error);
  }
}

module.exports = connectDB;
