const https = require('https');

const apiKey = "bagel_test_6027BC54AC5A45368B9900662C362FD8";
const data = JSON.stringify({
  request_id: `test_${Date.now()}`,
  amount: {
    value: 100, // 1.00 USD
    currency: "USD"
  },
  product: {
    name: "Test Product",
    description: "Test Description"
  },
  success_url: "https://example.com/success",
  customer: {
    email: "test@example.com"
  }
});

const options = {
  hostname: 'test.bagelpay.io',
  path: '/api/payments/checkouts',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'Content-Length': data.length
  }
};

console.log("Sending request to BagelPay...");
console.log(data);

const req = https.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log('Response Body:');
    console.log(responseData);
  });
});

req.on('error', (error) => {
  console.error(error);
});

req.write(data);
req.end();
