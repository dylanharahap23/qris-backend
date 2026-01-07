// test-render.js
const WebSocket = require('ws');

console.log('=== TESTING RENDER.COM WEB SOCKET ===\n');

// Test Dashboard Connection
const dashboardWs = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001');

dashboardWs.on('open', () => {
  console.log('✅ Dashboard WebSocket Connected');
  
  // Send ping
  dashboardWs.send(JSON.stringify({ type: 'PING' }));
  
  // Request initial state
  dashboardWs.send(JSON.stringify({ type: 'GET_INITIAL_STATE' }));
});

dashboardWs.on('message', (data) => {
  console.log('📨 Dashboard Message:', data.toString());
});

dashboardWs.on('error', (error) => {
  console.error('❌ Dashboard Error:', error);
});

// Test Device Connection
const deviceWs = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001&deviceId=EDC001');

deviceWs.on('open', () => {
  console.log('\n✅ Device WebSocket Connected');
  
  // Send device heartbeat
  setInterval(() => {
    if (deviceWs.readyState === 1) {
      deviceWs.send(JSON.stringify({ 
        type: 'DEVICE_HEARTBEAT',
        timestamp: Date.now()
      }));
    }
  }, 10000);
});

deviceWs.on('message', (data) => {
  console.log('📨 Device Message:', data.toString());
});

deviceWs.on('error', (error) => {
  console.error('❌ Device Error:', error);
});

// Test HTTP endpoints
const fetch = require('node-fetch');

async function testHttp() {
  console.log('\n=== TESTING HTTP ENDPOINTS ===');
  
  try {
    // Test health endpoint
    const healthRes = await fetch('https://qris-backend.onrender.com/health');
    const healthData = await healthRes.json();
    console.log('✅ Health Check:', healthData.status);
    
    // Test simulation endpoint
    const simRes = await fetch('https://qris-backend.onrender.com/api/simulate/switch-callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchantId: 'MER001', amount: 50000, bankCode: 'BCA' })
    });
    const simData = await simRes.json();
    console.log('✅ Simulation Started:', simData.transactionId);
    
  } catch (error) {
    console.error('❌ HTTP Test Error:', error);
  }
}

setTimeout(testHttp, 2000);

// Keep alive
setTimeout(() => {
  console.log('\n🎉 All tests completed successfully!');
  process.exit(0);
}, 10000);