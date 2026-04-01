const express = require('express');
const Product = require('../models/Product');
const upload = require('../middleware/upload');
const auth = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Get all products
router.get('/', async (req, res) => {
  try {
    const { category, featured, limit, search } = req.query;
    let query = {};
    
    if (category) query.category_id = category;
    if (featured === 'true') query.featured = true;
    if (search) {
      query.$text = { $search: search };
    }
    
    let productsQuery = Product.find(query).populate('category_id');
    if (limit) productsQuery = productsQuery.limit(parseInt(limit));
    const products = await productsQuery.sort({ created_at: -1 });
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('category_id');
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product (admin only)
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const productData = {
      name: req.body.name,
      description: req.body.description,
      price: parseFloat(req.body.price),
      category_id: req.body.category_id,
      stock: parseInt(req.body.stock) || 0,
      featured: req.body.featured === 'true'
    };
    
    if (req.file) {
      productData.image = `/images/products/${req.file.filename}`;
    }
    
    const product = new Product(productData);
    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error('Create product error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Update product (admin only)
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    product.name = req.body.name;
    product.description = req.body.description;
    product.price = parseFloat(req.body.price);
    product.category_id = req.body.category_id;
    product.stock = parseInt(req.body.stock) || 0;
    product.featured = req.body.featured === 'true';
    
    if (req.file) {
      if (product.image) {
        const oldImagePath = path.join(__dirname, '../public', product.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      product.image = `/images/products/${req.file.filename}`;
    }
    
    await product.save();
    res.json(product);
  } catch (error) {
    console.error('Update product error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Delete product (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    if (product.image) {
      const imagePath = path.join(__dirname, '../public', product.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
