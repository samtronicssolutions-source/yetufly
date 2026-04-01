const axios = require('axios');

async function getAccessToken() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  
  console.log('🔐 Getting M-Pesa access token...');
  console.log('Consumer Key (first 10 chars):', consumerKey?.substring(0, 10) + '...');
  console.log('Environment:', process.env.NODE_ENV);
  
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  
  const url = process.env.NODE_ENV === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  
  console.log('Auth URL:', url);
  
  try {
    const response = await axios.get(url, {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 30000
    });
    console.log('✅ Access token obtained successfully');
    return response.data.access_token;
  } catch (error) {
    console.error('❌ Error getting access token:');
    console.error('Status:', error.response?.status);
    console.error('Data:', error.response?.data);
    console.error('Message:', error.message);
    return null;
  }
}

function formatPhoneNumber(phone) {
  let formatted = phone.toString().trim();
  formatted = formatted.replace(/\D/g, '');
  
  if (formatted.startsWith('0')) {
    formatted = '254' + formatted.substring(1);
  } else if (formatted.startsWith('254')) {
    // Already correct format
  } else if (formatted.startsWith('+254')) {
    formatted = formatted.substring(1);
  } else {
    formatted = '254' + formatted;
  }
  
  console.log('Phone formatting:', { original: phone, formatted });
  return formatted;
}

async function initiateMpesaPayment(phone, amount, orderNumber) {
  console.log('\n💰 Initiating M-Pesa payment...');
  console.log('Order Number:', orderNumber);
  console.log('Phone:', phone);
  console.log('Amount:', amount);
  
  const accessToken = await getAccessToken();
  if (!accessToken) {
    console.error('❌ No access token obtained');
    return { error: 'Failed to get access token' };
  }
  
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, -3);
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  
  const url = process.env.NODE_ENV === 'production'
    ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
    : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
  
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
    TransactionDesc: `Yetu Payment ${orderNumber.slice(-6)}`
  };
  
  console.log('\n📤 M-Pesa Payload:');
  console.log('  URL:', url);
  console.log('  Shortcode:', shortcode);
  console.log('  Phone:', formattedPhone);
  console.log('  Amount:', payload.Amount);
  console.log('  Callback URL:', payload.CallBackURL);
  console.log('  Account Reference:', payload.AccountReference);
  
  try {
    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    console.log('\n✅ M-Pesa Response:');
    console.log('  Response Code:', response.data.ResponseCode);
    console.log('  Response Description:', response.data.ResponseDescription);
    console.log('  Checkout Request ID:', response.data.CheckoutRequestID);
    
    return response.data;
  } catch (error) {
    console.error('\n❌ Error initiating M-Pesa payment:');
    console.error('Status:', error.response?.status);
    console.error('Data:', JSON.stringify(error.response?.data, null, 2));
    console.error('Message:', error.message);
    
    if (error.response?.data) {
      return { 
        error: true, 
        message: error.response.data.errorMessage || error.response.data,
        ResponseCode: error.response.data.ResponseCode || '1'
      };
    }
    return { error: true, message: error.message };
  }
}

module.exports = { initiateMpesaPayment, getAccessToken, formatPhoneNumber };
