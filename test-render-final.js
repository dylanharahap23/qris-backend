// test-render-final.js
const WebSocket = require('ws');

console.log('Testing Render WebSocket connection...\n');

const ws = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001');

ws.on('open', () => {
  console.log('✅ SUCCESS: Connected to Render WebSocket!');
  console.log('Connection established 🎉\n');
  
  // Send a ping
  ws.send(JSON.stringify({ type: 'PING' }));
  
  // Listen for messages
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📨 Received:', message.type);
    
    if (message.type === 'CONNECTED') {
      console.log('✅ WebSocket working perfectly!');
      console.log('Merchant ID:', message.merchantId);
      console.log('Message:', message.message);
    }
    
    // Close after success
    setTimeout(() => {
      ws.close();
      process.exit(0);
    }, 3000);
  });
});

ws.on('error', (error) => {
  console.log('❌ ERROR:', error.message);
  console.log('\n💡 Solutions:');
  console.log('1. Wait 2 minutes after deploy');
  console.log('2. Check Render logs');
  console.log('3. Make sure WebSocket path is /ws');
  process.exit(1);
});

ws.on('close', () => {
  console.log('\n🔌 Connection closed');
});

setTimeout(() => {
  console.log('⏰ Timeout - No response');
  process.exit(1);
}, 10000);