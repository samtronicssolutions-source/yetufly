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
        return res.status(400).json({ 
          error: `Insufficient stock for ${product?.name || 'product'}` 
        });
      }
    }
    
    // Calculate total and prepare order items
    let total = 0;
    const orderItems = [];
    
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      const price = product.price;
      const subtotal = price * item.quantity;
      total += subtotal;
      
      orderItems.push({
        product_id: item.product_id,
        quantity: item.quantity,
        price: price
      });
    }
    
    // Generate order number
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
    
    // Create order
    const order = new Order({
      order_number: orderNumber,
      customer_name,
      customer_phone,
      customer_email,
      items: orderItems,
      total_amount: total,
      payment_method,
      payment_status: payment_method === 'mpesa' ? 'pending' : 'pending',
      status: 'pending'
    });
    
    await order.save();
    
    // Update stock
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product_id, {
        $inc: { stock: -item.quantity }
      });
    }
    
    // Process M-Pesa payment if selected
    if (payment_method === 'mpesa') {
      const mpesaResponse = await initiateMpesaPayment(customer_phone, total, orderNumber);
      
      if (mpesaResponse && mpesaResponse.ResponseCode === '0') {
        // Save the checkout ID to mpesa_transaction_id for callback matching
        order.mpesa_transaction_id = mpesaResponse.CheckoutRequestID;
        await order.save();
        
        return res.json({
          success: true,
          order_number: orderNumber,
          checkout_id: mpesaResponse.CheckoutRequestID,
          message: 'M-Pesa payment initiated. Please check your phone to complete payment.'
        });
      } else {
        // M-Pesa initiation failed
        return res.json({
          success: true,
          order_number: orderNumber,
          payment_initiated: false,
          message: 'Order created but payment initiation failed. Please try again or choose Cash on Delivery.'
        });
      }
    }
    
    // Cash on delivery
    res.json({
      success: true,
      order_number: orderNumber,
      message: 'Order created successfully. You will pay upon delivery.'
    });
    
  } catch (error) {
    console.error('Order creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get order by number
router.get('/:orderNumber', async (req, res) => {
  try {
    const order = await Order.findOne({ order_number: req.params.orderNumber })
      .populate('items.product_id');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// M-Pesa Callback URL
router.post('/mpesa-callback', async (req, res) => {
  try {
    const data = req.body;
    console.log('M-Pesa Callback received:', JSON.stringify(data, null, 2));
    
    if (data.Body && data.Body.stkCallback) {
      const callback = data.Body.stkCallback;
      const resultCode = callback.ResultCode;
      const checkoutId = callback.CheckoutRequestID;
      const resultDesc = callback.ResultDesc;
      
      // Find order by mpesa_transaction_id (which stores the checkout ID)
      const order = await Order.findOne({ mpesa_transaction_id: checkoutId });
      
      if (!order) {
        console.log('Order not found for checkout ID:', checkoutId);
        return res.json({ ResultCode: 1, ResultDesc: 'Order not found' });
      }
      
      if (resultCode === 0) {
        // Payment successful
        const items = callback.CallbackMetadata?.Item || [];
        let mpesaReceipt = '';
        let amount = 0;
        
        for (const item of items) {
          if (item.Name === 'MpesaReceiptNumber') {
            mpesaReceipt = item.Value;
          }
          if (item.Name === 'Amount') {
            amount = item.Value;
          }
        }
        
        order.payment_status = 'completed';
        order.status = 'processing';
        order.mpesa_transaction_id = mpesaReceipt;
        
        await order.save();
        
        console.log(`✅ Payment successful for order ${order.order_number}`);
        
      } else {
        // Payment failed - restore stock
        order.payment_status = 'failed';
        order.status = 'cancelled';
        
        // Restore stock for cancelled order
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.product_id, {
            $inc: { stock: item.quantity }
          });
        }
        
        await order.save();
        
        console.log(`❌ Payment failed for order ${order.order_number}: ${resultDesc}`);
      }
    }
    
    // Always respond with success to M-Pesa
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
    
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
});

module.exports = router;
