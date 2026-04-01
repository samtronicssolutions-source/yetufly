const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { initiateMpesaPayment, getAccessToken } = require('../utils/mpesa');

const router = express.Router();

function formatPhoneNumber(phone) {
  let formatted = phone.toString().trim();
  formatted = formatted.replace(/\D/g, '');
  
  if (formatted.startsWith('0')) {
    formatted = '254' + formatted.substring(1);
  } else if (formatted.startsWith('+254')) {
    formatted = formatted.substring(1);
  } else if (!formatted.startsWith('254')) {
    formatted = '254' + formatted;
  }
  return formatted;
}

// ============================================
// DEBUG: Test callback endpoint
// ============================================
router.post('/test-callback', (req, res) => {
  console.log('🧪 TEST CALLBACK RECEIVED!');
  console.log('Body:', JSON.stringify(req.body, null, 2));
  res.json({ received: true });
});

// ============================================
// CREATE ORDER - WAIT FOR PAYMENT CONFIRMATION
// ============================================
router.post('/', async (req, res) => {
  try {
    console.log('\n📦 Processing order request...');
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
    
    // For Cash on Delivery - create order immediately
    if (payment_method === 'cod') {
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
      
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
      
      // Update stock
      for (const item of items) {
        await Product.findByIdAndUpdate(item.product_id, {
          $inc: { stock: -item.quantity }
        });
      }
      
      return res.json({
        success: true,
        order_number: orderNumber,
        message: 'Order created successfully. You will pay upon delivery.'
      });
    }
    
    // For M-Pesa - initiate payment first, then create order after confirmation
    if (payment_method === 'mpesa') {
      const formattedPhone = formatPhoneNumber(customer_phone);
      console.log('Initiating M-Pesa payment for phone:', formattedPhone);
      console.log('Amount:', total);
      console.log('Callback URL:', `${process.env.BASE_URL}/api/orders/mpesa-callback`);
      
      const mpesaResponse = await initiateMpesaPayment(formattedPhone, total, `TEMP-${Date.now()}`);
      
      console.log('M-Pesa Response:', JSON.stringify(mpesaResponse, null, 2));
      
      if (mpesaResponse && !mpesaResponse.error && mpesaResponse.ResponseCode === '0') {
        const checkoutId = mpesaResponse.CheckoutRequestID;
        
        // Store pending order data
        const pendingOrder = {
          tempId: checkoutId,
          customer_name,
          customer_phone,
          customer_email,
          items: orderItems,
          total_amount: total,
          checkout_id: checkoutId,
          created_at: new Date()
        };
        
        // Store in memory (for production, use Redis)
        if (!global.pendingOrders) global.pendingOrders = {};
        global.pendingOrders[checkoutId] = pendingOrder;
        
        console.log(`✅ M-Pesa initiated. Checkout ID: ${checkoutId}`);
        console.log(`⏳ Waiting for callback...`);
        
        // Set timeout to clean up if payment fails (10 minutes)
        setTimeout(() => {
          if (global.pendingOrders[checkoutId]) {
            delete global.pendingOrders[checkoutId];
            console.log(`⏰ Cleaned up pending order: ${checkoutId}`);
          }
        }, 10 * 60 * 1000);
        
        return res.json({
          success: true,
          waiting_for_payment: true,
          checkout_id: checkoutId,
          message: 'M-Pesa payment initiated. Please check your phone and enter PIN to complete payment.'
        });
      } else {
        console.error('❌ M-Pesa initiation failed:', mpesaResponse);
        return res.status(400).json({
          success: false,
          error: 'Payment initiation failed. Please try again or choose Cash on Delivery.'
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Order creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CHECK PAYMENT STATUS
// ============================================
router.get('/payment-status/:checkoutId', async (req, res) => {
  try {
    const { checkoutId } = req.params;
    console.log(`🔍 Checking payment status for: ${checkoutId}`);
    
    // Check if order was already created (successful payment)
    const existingOrder = await Order.findOne({ mpesa_transaction_id: checkoutId });
    if (existingOrder) {
      console.log(`✅ Order found: ${existingOrder.order_number}`);
      return res.json({
        success: true,
        status: 'completed',
        order_number: existingOrder.order_number,
        message: 'Payment successful! Order created.'
      });
    }
    
    // Check pending order
    if (global.pendingOrders && global.pendingOrders[checkoutId]) {
      console.log(`⏳ Payment still pending for: ${checkoutId}`);
      return res.json({
        success: true,
        status: 'pending',
        message: 'Payment pending. Please complete payment on your phone.'
      });
    }
    
    console.log(`❌ No order found for: ${checkoutId}`);
    return res.json({
      success: false,
      status: 'unknown',
      message: 'Payment status unknown. Please contact support.'
    });
    
  } catch (error) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// M-PESA CALLBACK - CRITICAL: This must work
// ============================================
router.post('/mpesa-callback', async (req, res) => {
  try {
    console.log('\n📞 ========== M-PESA CALLBACK RECEIVED ==========');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Full Body:', JSON.stringify(req.body, null, 2));
    
    const data = req.body;
    
    if (!data.Body || !data.Body.stkCallback) {
      console.log('⚠️ Invalid callback structure - missing stkCallback');
      return res.json({ ResultCode: 1, ResultDesc: 'Invalid callback structure' });
    }
    
    const callback = data.Body.stkCallback;
    const resultCode = callback.ResultCode;
    const checkoutId = callback.CheckoutRequestID;
    const resultDesc = callback.ResultDesc;
    
    console.log(`\n📋 Callback Details:`);
    console.log(`  Checkout ID: ${checkoutId}`);
    console.log(`  Result Code: ${resultCode}`);
    console.log(`  Result Description: ${resultDesc}`);
    
    // Check if there's a pending order waiting for this checkout ID
    const pendingOrder = global.pendingOrders ? global.pendingOrders[checkoutId] : null;
    
    if (resultCode === 0) {
      // PAYMENT SUCCESSFUL
      console.log(`\n✅✅✅ PAYMENT SUCCESSFUL! ✅✅✅`);
      
      if (pendingOrder) {
        console.log('📦 Creating order from pending data...');
        
        // Extract payment metadata
        const items = callback.CallbackMetadata?.Item || [];
        let mpesaReceipt = '';
        let amount = 0;
        
        console.log('\n💰 Payment Metadata:');
        for (const item of items) {
          console.log(`  ${item.Name}: ${item.Value}`);
          if (item.Name === 'MpesaReceiptNumber') {
            mpesaReceipt = item.Value;
          }
          if (item.Name === 'Amount') {
            amount = item.Value;
          }
        }
        
        // Generate permanent order number
        const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
        
        // Create the order
        const order = new Order({
          order_number: orderNumber,
          customer_name: pendingOrder.customer_name,
          customer_phone: pendingOrder.customer_phone,
          customer_email: pendingOrder.customer_email,
          items: pendingOrder.items,
          total_amount: pendingOrder.total_amount,
          payment_method: 'mpesa',
          payment_status: 'completed',
          status: 'processing',
          mpesa_transaction_id: mpesaReceipt || checkoutId
        });
        
        await order.save();
        console.log(`✅ Order created: ${orderNumber}`);
        
        // Update stock
        for (const item of pendingOrder.items) {
          await Product.findByIdAndUpdate(item.product_id, {
            $inc: { stock: -item.quantity }
          });
          console.log(`  Stock updated for product: ${item.product_id}`);
        }
        
        // Clean up pending order
        delete global.pendingOrders[checkoutId];
        console.log(`✅ Cleaned up pending order`);
        
      } else {
        console.log(`⚠️ No pending order found for checkout ID: ${checkoutId}`);
        
        // Check if order already exists
        const existingOrder = await Order.findOne({ mpesa_transaction_id: checkoutId });
        if (existingOrder) {
          console.log(`✅ Order already exists: ${existingOrder.order_number}`);
        } else {
          console.log(`❌ ERROR: Payment successful but no order data found!`);
          console.log(`   Checkout ID: ${checkoutId}`);
          console.log(`   Pending orders: ${Object.keys(global.pendingOrders || {})}`);
        }
      }
      
    } else {
      // PAYMENT FAILED
      console.log(`\n❌ PAYMENT FAILED: ${resultDesc}`);
      
      if (pendingOrder) {
        console.log('🧹 Cleaning up failed payment...');
        delete global.pendingOrders[checkoutId];
      }
    }
    
    console.log('\n========== CALLBACK PROCESSED ==========\n');
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
    
  } catch (error) {
    console.error('❌ M-Pesa callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error processing callback' });
  }
});

module.exports = router;
