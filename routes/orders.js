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
