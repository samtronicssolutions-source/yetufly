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
  } else if (!formatted.startsWith('254')) {
    formatted = '254' + formatted;
  }
  return formatted;
}

router.post('/', async (req, res) => {
  try {
    const { customer_name, customer_phone, customer_email, items, payment_method } = req.body;
    
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      if (!product || product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for ${product?.name}` });
      }
    }
    
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
    
    for (const item of items) {
      await Product.findByIdAndUpdate(item.product_id, {
        $inc: { stock: -item.quantity }
      });
    }
    
    if (payment_method === 'mpesa') {
      const formattedPhone = formatPhoneNumber(customer_phone);
      const mpesaResponse = await initiateMpesaPayment(formattedPhone, total, orderNumber);
      
      if (mpesaResponse && mpesaResponse.ResponseCode === '0') {
        order.mpesa_transaction_id = mpesaResponse.CheckoutRequestID;
        await order.save();
        
        return res.json({
          success: true,
          order_number: orderNumber,
          checkout_id: mpesaResponse.CheckoutRequestID,
          message: 'M-Pesa payment initiated. Please check your phone.'
        });
      } else {
        return res.json({
          success: true,
          order_number: orderNumber,
          payment_initiated: false,
          message: 'Order created but payment initiation failed.'
        });
      }
    }
    
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
    const data = req.body;
    console.log('M-Pesa Callback received');
    
    if (data.Body && data.Body.stkCallback) {
      const callback = data.Body.stkCallback;
      const resultCode = callback.ResultCode;
      const checkoutId = callback.CheckoutRequestID;
      const resultDesc = callback.ResultDesc;
      
      const order = await Order.findOne({ mpesa_transaction_id: checkoutId });
      
      if (!order) {
        console.log('Order not found for checkout ID:', checkoutId);
        return res.json({ ResultCode: 1, ResultDesc: 'Order not found' });
      }
      
      if (resultCode === 0) {
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
        console.log(`✅ Payment successful for order ${order.order_number}`);
        
      } else {
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
    console.error('M-Pesa callback error:', error);
    res.json({ ResultCode: 1, ResultDesc: 'Error' });
  }
});

module.exports = router;
