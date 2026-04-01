const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { initiateMpesaPayment } = require('../utils/mpesa');

const router = express.Router();

function formatPhoneNumber(phone) {
  let formatted = phone.toString().trim();
  formatted = formatted.replace(/\D/g, '');
  
  if (formatted.startsWith('0')) {
    formatted = '254' + formatted.substring(1);
  } else if (formatted.startsWith('254')) {
    // Already correct
  } else if (formatted.startsWith('+254')) {
    formatted = formatted.substring(1);
  } else {
    formatted = '254' + formatted;
  }
  return formatted;
}

router.post('/', async (req, res) => {
  try {
    console.log('\n📦 Creating new order...');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { customer_name, customer_phone, customer_email, items, payment_method } = req.body;
    
    // Validate inputs
    if (!customer_name || !customer_phone || !items || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Validate stock
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      if (!product) {
        return res.status(400).json({ error: `Product not found` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
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
    
    // Create order
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
    console.log('✅ Order created:', orderNumber);
    
    // Update stock
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product_id, {
        $inc: { stock: -item.quantity }
      });
    }
    
    // Process M-Pesa payment if selected
    if (payment_method === 'mpesa') {
      const formattedPhone = formatPhoneNumber(customer_phone);
      console.log('Processing M-Pesa for phone:', formattedPhone);
      
      const mpesaResponse = await initiateMpesaPayment(formattedPhone, total, orderNumber);
      
      if (mpesaResponse && !mpesaResponse.error && mpesaResponse.ResponseCode === '0') {
        // Save checkout ID
        order.mpesa_transaction_id = mpesaResponse.CheckoutRequestID;
        await order.save();
        
        console.log('✅ M-Pesa initiated successfully');
        
        return res.json({
          success: true,
          order_number: orderNumber,
          checkout_id: mpesaResponse.CheckoutRequestID,
          message: 'M-Pesa payment initiated. Please check your phone.'
        });
      } else {
        // M-Pesa initiation failed
        const errorMsg = mpesaResponse?.message || mpesaResponse?.ResponseDescription || 'Payment initiation failed';
        console.error('❌ M-Pesa initiation failed:', errorMsg);
        
        return res.json({
          success: true,
          order_number: orderNumber,
          payment_initiated: false,
          message: `Order created but payment failed: ${errorMsg}. Please try Cash on Delivery.`
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
    console.error('❌ Order creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

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

router.post('/mpesa-callback', async (req, res) => {
  try {
    console.log('\n📞 M-Pesa Callback received');
    const data = req.body;
    console.log('Callback data:', JSON.stringify(data, null, 2));
    
    if (data.Body && data.Body.stkCallback) {
      const callback = data.Body.stkCallback;
      const resultCode = callback.ResultCode;
      const checkoutId = callback.CheckoutRequestID;
      const resultDesc = callback.ResultDesc;
      
      console.log(`Callback: Checkout ID: ${checkoutId}, Result: ${resultCode}, Description: ${resultDesc}`);
      
      const order = await Order.findOne({ mpesa_transaction_id: checkoutId });
      
      if (!order) {
        console.log('❌ Order not found for checkout ID:', checkoutId);
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
        
        console.log(`✅ Payment successful for order ${order.order_number}, Receipt: ${mpesaReceipt}`);
        
      } else {
        // Payment failed - restore stock
        order.payment_status = 'failed';
        order.status = 'cancelled';
        
        for (const item of order.items) {
          await Product.findByIdAndUpdate(item.product_id, {
            $inc: { stock: item.quantity }
          });
        }
        
        await order.save();
        
        console.log(`❌ Payment failed for order ${order.order_number}: ${resultDesc}`);
      }
    }
    
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
    
  } catch (error) {
    console.error('❌ M-Pesa callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
});

module.exports = router;
// TEMPORARY: Test M-Pesa credentials (remove after testing)
router.get('/test-mpesa', async (req, res) => {
  try {
    const { initiateMpesaPayment, getAccessToken } = require('../utils/mpesa');
    
    // Test access token
    const token = await getAccessToken();
    if (!token) {
      return res.json({ success: false, message: 'Failed to get access token' });
    }
    
    // Test STK push with test phone
    const testPhone = '254708374149';
    const testAmount = 10;
    const testOrder = `TEST-${Date.now()}`;
    
    const result = await initiateMpesaPayment(testPhone, testAmount, testOrder);
    
    res.json({
      success: !!result,
      token_received: !!token,
      stk_result: result,
      message: result?.ResponseDescription || result?.message || 'Test completed'
    });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});
