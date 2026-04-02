const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const compression = require('compression');
const connectDB = require('./config/database');

dotenv.config();

const app = express();

// Database connection with retry logic
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

// Security Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});

// Compression for better performance
app.use(compression());

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Session configuration
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

// Import routes
const productRoutes = require('./routes/products');
const categoryRoutes = require('./routes/categories');
const orderRoutes = require('./routes/orders');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

// API routes
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// ============================================
// SITEMAP GENERATOR (Dynamic for Fly.io)
// ============================================
app.get('/sitemap.xml', async (req, res) => {
  try {
    const Category = require('./models/Category');
    const Product = require('./models/Product');
    
    const baseUrl = process.env.BASE_URL || 'https://yetu-fly.fly.dev';
    const categories = await Category.find({ parent_id: null });
    const products = await Product.find();
    
    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    
    const staticPages = [
      { url: '', priority: 1.0, changefreq: 'daily' },
      { url: '/category', priority: 0.9, changefreq: 'daily' },
      { url: '/cart', priority: 0.5, changefreq: 'monthly' },
      { url: '/checkout', priority: 0.5, changefreq: 'monthly' }
    ];
    
    staticPages.forEach(page => {
      sitemap += `  <url>\n`;
      sitemap += `    <loc>${baseUrl}${page.url}</loc>\n`;
      sitemap += `    <changefreq>${page.changefreq}</changefreq>\n`;
      sitemap += `    <priority>${page.priority}</priority>\n`;
      sitemap += `  </url>\n`;
    });
    
    categories.forEach(cat => {
      sitemap += `  <url>\n`;
      sitemap += `    <loc>${baseUrl}/category?id=${cat._id}</loc>\n`;
      sitemap += `    <changefreq>weekly</changefreq>\n`;
      sitemap += `    <priority>0.7</priority>\n`;
      sitemap += `  </url>\n`;
    });
    
    products.forEach(product => {
      sitemap += `  <url>\n`;
      sitemap += `    <loc>${baseUrl}/product/${product._id}</loc>\n`;
      if (product.created_at) {
        sitemap += `    <lastmod>${new Date(product.created_at).toISOString()}</lastmod>\n`;
      }
      sitemap += `    <changefreq>weekly</changefreq>\n`;
      sitemap += `    <priority>0.6</priority>\n`;
      sitemap += `  </url>\n`;
    });
    
    sitemap += '</urlset>';
    
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Sitemap error:', error);
    res.status(500).send('Error generating sitemap');
  }
});

// ============================================
// SERVE HTML FILES
// ============================================
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

app.get('/robots.txt', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'robots.txt'));
});

// Health check endpoint for Fly.io
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
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    fly_region: process.env.FLY_REGION || 'unknown'
  });
});

// ============================================
// 404 HANDLER
// ============================================
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 URL: http://localhost:${PORT}\n`);
});

module.exports = app;
