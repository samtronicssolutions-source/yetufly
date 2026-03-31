const axios = require('axios');

async function getAccessToken() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  const url = process.env.NODE_ENV === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` }
    });
    return response.data.access_token;
  } catch (error) {
    console.error('Error getting access token:', error.response?.data || error.message);
    return null;
  }
}

// Format phone number for M-Pesa (must be 254XXXXXXXXX)
function formatPhoneNumber(phone) {
  let formatted = phone.toString().trim();
  // Remove any non-digit characters
  formatted = formatted.replace(/\D/g, '');
  // If starts with 0, replace with 254
  if (formatted.startsWith('0')) {
    formatted = '254' + formatted.substring(1);
  }
  // If starts with 254, keep as is
  // If starts with anything else, add 254
  else if (!formatted.startsWith('254')) {
    formatted = '254' + formatted;
  }
  return formatted;
}

async function initiateMpesaPayment(phone, amount, orderNumber) {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  
  const url = process.env.NODE_ENV === 'production'
    ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
    : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
  
  // Format phone number correctly
  const formattedPhone = formatPhoneNumber(phone);
  
  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: formattedPhone,
    PartyB: shortcode,
    PhoneNumber: formattedPhone,
    CallBackURL: `${process.env.BASE_URL}/api/orders/mpesa-callback`,
    AccountReference: orderNumber.slice(0, 12),
    TransactionDesc: `Payment for order ${orderNumber}`
  };
  
  console.log('M-Pesa Payload:', { 
    ...payload, 
    Password: '***',
    PartyA: formattedPhone,
    PhoneNumber: formattedPhone
  });
  
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('M-Pesa Response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error initiating M-Pesa payment:', error.response?.data || error.message);
    return null;
  }
}

module.exports = { initiateMpesaPayment, getAccessToken, formatPhoneNumber };
