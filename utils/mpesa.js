const axios = require('axios');

async function getAccessToken() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  
  console.log('🔐 Getting M-Pesa access token...');
  console.log('Consumer Key present:', !!consumerKey);
  console.log('Consumer Secret present:', !!consumerSecret);
  
  if (!consumerKey || !consumerSecret) {
    console.error('❌ Missing M-Pesa credentials!');
    return null;
  }
  
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  // Force sandbox for testing
  const url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 30000
    });
    console.log('✅ Access token obtained');
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Error getting access token:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    return null;
  }
}

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

async function initiateMpesaPayment(phone, amount, orderNumber) {
  console.log('\n💰 Initiating M-Pesa payment...');
  console.log('Order:', orderNumber);
  console.log('Phone:', phone);
  console.log('Amount:', amount);
  
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { error: true, message: 'Failed to get access token' };
  }
  
  const shortcode = process.env.MPESA_SHORTCODE || '174379';
  const passkey = process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919';
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  
  // Force sandbox URL
  const url = 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
  
  const formattedPhone = formatPhoneNumber(phone);
  const callbackUrl = `${process.env.BASE_URL || 'https://yetu.onrender.com'}/api/orders/mpesa-callback`;
  
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
  
  console.log('Payload:', {
    shortcode,
    amount: payload.Amount,
    phone: formattedPhone,
    callback: callbackUrl
  });
  
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('✅ M-Pesa Response:', response.data.ResponseCode, response.data.ResponseDescription);
    return response.data;
  } catch (error) {
    console.error('❌ M-Pesa error:', error.response?.data || error.message);
    return { error: true, message: error.response?.data?.errorMessage || error.message };
  }
}

module.exports = { initiateMpesaPayment, getAccessToken, formatPhoneNumber };
