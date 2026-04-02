const axios = require('axios');

async function getAccessToken() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  
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

async function initiateMpesaPayment(phone, amount, orderNumber) {
  const accessToken = await getAccessToken();
  if (!accessToken) return null;
  
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  
  const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
  const formattedPhone = formatPhoneNumber(phone);
  
  // Use BASE_URL from environment (will be https://yetu-fly.fly.dev)
  const callbackUrl = `${process.env.BASE_URL}/api/orders/mpesa-callback`;
  
  console.log('💰 Initiating M-Pesa payment on Fly.io...');
  console.log('  Phone:', formattedPhone);
  console.log('  Amount:', amount);
  console.log('  Callback URL:', callbackUrl);
  
  const payload = {
    BusinessShortCode: shortcode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: formattedPhone,
    PartyB: shortcode,
    PhoneNumber: formattedPhone,
    CallBackURL: callbackUrl,
    AccountReference: orderNumber.slice(0, 12),
    TransactionDesc: `Yetu Payment`
  };
  
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ M-Pesa Response:', response.data.ResponseCode, response.data.ResponseDescription);
    return response.data;
  } catch (error) {
    console.error('❌ Error initiating M-Pesa payment:', error.response?.data || error.message);
    return null;
  }
}

module.exports = { initiateMpesaPayment, getAccessToken, formatPhoneNumber };
