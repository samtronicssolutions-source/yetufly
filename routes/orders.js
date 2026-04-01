const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { initiateMpesaPayment } = require('../utils/mpesa');

const router = express.Router();

// Create order
router.post('/', async (req, res) => {
  try {
    const { customer_name, customer_phone, customer_email, items, payment_method } = req.body;
    
    // Validate stock
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product?.name}` });
      }
    }
    
    // Calculate total
    let total = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      const price = product.price;
      total += price * item.quantity;
      orderItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        price: price
      });
    }
    
    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    // Create order with PENDING status
    const order = new Order({
      order_number: orderNumber,
      customer_name,
      customer_phone,
      customer_email,
      items: orderItems,
      total_amount: total,
      payment_method,
      payment_status: 'pending',
      status: 'pending'
    });
    
    await order.save();
    
    // If M-Pesa, initiate payment
    if (payment_method === 'mpesa') {
      const mpesaResponse = await initiateMpesaPayment(customer_phone, total, orderNumber);
      
      if (mpesaResponse && mpesaResponse.ResponseCode === '0') {
        // Save the checkout ID so callback can find this order
        order.mpesa_transaction_id = mpesaResponse.CheckoutRequestID;
        await order.save();
        
        return res.json({
          success: true,
          order_number: orderNumber,
          checkout_id: mpesaResponse.CheckoutRequestID,
          message: 'M-Pesa payment initiated. Please check your phone.'
        });
      } else {
        // Payment initiation failed - delete order
        await Order.findByIdAndDelete(order._id);
        return res.status(400).json({
          error: 'Payment initiation failed. Please try again.'
        });
      }
    }
    
    // Cash on delivery
    res.json({
      success: true,
      order_number: orderNumber,
      message: 'Order created successfully.'
    });
    
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// M-Pesa Callback - Update order status
router.post('/mpesa-callback', async (req, res) => {
  try {
    console.log('M-Pesa Callback received:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    
    if (!data.Body || !data.Body.stkCallback) {
      return res.json({ ResultCode: 1, ResultDesc: 'Invalid callback' });
    }
    
    const callback = data.Body.stkCallback;
    const resultCode = callback.ResultCode;
    const checkoutId = callback.CheckoutRequestID;
    
    // Find order by checkout ID
    const order = await Order.findOne({ mpesa_transaction_id: checkoutId });
    
    if (!order) {
      console.log('Order not found for checkout ID:', checkoutId);
      return res.json({ ResultCode: 1, ResultDesc: 'Order not found' });
    }
    
    if (resultCode === 0) {
      // Payment successful
      const items = callback.CallbackMetadata?.Item || [];
      let mpesaReceipt = '';
      for (const item of items) {
        if (item.Name === 'MpesaReceiptNumber') {
          mpesaReceipt = item.Value;
        }
      }
      
      order.payment_status = 'completed';
      order.status = 'processing';
      order.mpesa_transaction_id = mpesaReceipt;
      await order.save();
      
      // Update stock
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product_id, {
          $inc: { stock: -item.quantity }
        });
      }
      
      console.log(`✅ Payment successful for order ${order.order_number}`);
      
    } else {
      // Payment failed - cancel order
      order.payment_status = 'failed';
      order.status = 'cancelled';
      await order.save();
      console.log(`❌ Payment failed for order ${order.order_number}`);
    }
    
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
    
  } catch (error) {
    console.error('Callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error' });
  }
});

// Check payment status
router.get('/payment-status/:orderNumber', async (req, res) => {
  try {
    const order = await Order.findOne({ order_number: req.params.orderNumber });
    if (!order) {
      return res.json({ status: 'not_found' });
    }
    res.json({
      status: order.payment_status,
      order_status: order.status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
