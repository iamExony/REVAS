const crypto = require('crypto');

// Use the same secret from your .env/Docker config
const secret = 'o/HJCyCqTWk/BUepAQQJ0ahFxbeVLncyNfKLR+6wvu0='; // Replace with your actual DOCUSEAL_WEBHOOK_SECRET
const payload = JSON.stringify({
  event_type: "submission_completed",
  data: { submission: { id: "123" } }
});

const signature = crypto
  .createHmac('sha256', secret)
  .update(payload)
  .digest('hex');

console.log('Test Signature:', signature);
console.log('Test Command:', `curl -X POST "http://localhost:5000/api/documents/webhook" \\
  -H "Content-Type: application/json" \\
  -H "DocuSeal-Signature: ${signature}" \\
  -d '${payload}'`);