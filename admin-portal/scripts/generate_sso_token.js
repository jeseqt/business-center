// Test script to generate an SSO parameters for testing
const crypto = require('crypto');

function base64url(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

const payload = {
  app_id: 'test-app-id',
  email: 'testuser@example.com',
  account: 'testuser'
};

const sso_token = base64url(JSON.stringify(payload));
const timestamp = Date.now().toString();

const secret = 'your-app-secret'; // Replace with actual app_secret from platform_apps

// Signature payload: sso_token + timestamp
const payloadToSign = sso_token + timestamp;

const hmac = crypto.createHmac('sha256', secret);
hmac.update(payloadToSign);
const sso_sign = hmac.digest('hex'); // using hex as verifySignature in shared/crypto.ts expects hex bytes

console.log('SSO Token:', sso_token);
console.log('SSO Sign:', sso_sign);
console.log('Timestamp:', timestamp);
console.log(`Test URL: http://localhost:5173/?sso_token=${sso_token}&sso_sign=${sso_sign}&timestamp=${timestamp}`);
