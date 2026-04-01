const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

const router = express.Router();

// Get dashboard stats
router.get('/stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: 'pending' });
    const totalRevenue = await Order.aggregate([
      { $match: { payment_status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$total_amount' } } }
    ]);
    
    const recentOrders = await Order.find()
      .sort({ created_at: -1 })
      .limit(10)
      .populate('items.product_id');
    
    res.json({
      totalProducts,
      totalOrders,
      pendingOrders,
      totalRevenue: totalRevenue[0]?.total || 0,
      recentOrders
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders
router.get('/orders', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const orders = await Order.find()
      .sort({ created_at: -1 })
      .populate('items.product_id');
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update order status
router.put('/orders/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Clear processed orders (completed, delivered, or paid orders)
router.delete('/clear-processed-orders', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    // Delete orders that are completed, delivered, or have completed payment
    const result = await Order.deleteMany({
      $or: [
        { status: 'completed' },
        { status: 'delivered' },
        { status: 'processing' },
        { payment_status: 'completed' }
      ]
    });
    
    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Successfully cleared ${result.deletedCount} processed orders`
    });
  } catch (error) {
    console.error('Error clearing orders:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
