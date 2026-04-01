const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const connectDB = require('./config/database');

dotenv.config();

const app = express();

let dbConnected = false;
let connectionRetryInterval = null;

const initializeDatabase = async () => {
  try {
    await connectDB();
    dbConnected = true;
    console.log('✅ Database connected successfully');
    if (connectionRetryInterval) {
      clearInterval(connectionRetryInterval);
      connectionRetryInterval = null;
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    dbConnected = false;
    if (!connectionRetryInterval) {
      connectionRetryInterval = setInterval(async () => {
        if (!dbConnected) {
          try {
            await connectDB();
            dbConnected = true;
            console.log('✅ Database reconnected successfully');
            if (connectionRetryInterval) {
              clearInterval(connectionRetryInterval);
              connectionRetryInterval = null;
            }
          } catch (err) {
            console.error('❌ Database reconnection failed:', err.message);
          }
        }
      }, 10000);
    }
  }
};

initializeDatabase();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const orderRoutes = require('./routes/orders');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/product/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cart.html'));
});

app.get('/checkout', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'checkout.html'));
});

app.get('/order-success', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'order-success.html'));
});

app.get('/category', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'category.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

app.get('/admin/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'login.html'));
});

app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'dashboard.html'));
});

app.get('/admin/orders', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'orders.html'));
});

app.get('/health', (req, res) => {
  let dbStatus = 'unknown';
  try {
    if (mongoose.connection.readyState === 1) dbStatus = 'connected';
    else if (mongoose.connection.readyState === 2) dbStatus = 'connecting';
    else if (mongoose.connection.readyState === 0) dbStatus = 'disconnected';
  } catch (error) {
    dbStatus = 'error';
  }
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    database: dbStatus,
    uptime: process.uptime()
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: http://localhost:${PORT}\n`);
});
