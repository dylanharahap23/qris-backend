// test-client-fixed.js
const WebSocket = require('ws');

console.log('=== FIXED WEBSOCKET CLIENT TEST ===\n');

const ws = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001');

ws.on('open', () => {
  console.log('✅ CONNECTED');
  
  // Kirim PING setiap 8 detik
  const pingInterval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'PING',
        timestamp: Date.now()
      }));
      console.log('📤 Sent PING');
    } else {
      clearInterval(pingInterval);
    }
  }, 8000);
  
  // Hapus interval saat connection close
  ws.on('close', () => {
    clearInterval(pingInterval);
  });
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log(`📨 ${msg.type}: ${msg.message || ''}`);
  
  // Tanggapi SERVER_PING dengan PONG
  if (msg.type === 'SERVER_PING') {
    ws.send(JSON.stringify({
      type: 'PONG',
      timestamp: Date.now()
    }));
    console.log('📤 Sent PONG response');
  }
});

ws.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 CLOSED: ${code} - ${reason}`);
});

// Test selama 30 detik
setTimeout(() => {
  console.log('\n🎉 Test completed - connection stable for 30 seconds!');
  ws.close(1000, 'Test completed');
  process.exit(0);
}, 30000);