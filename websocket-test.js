// test-websocket.js
const WebSocket = require('ws');

console.log('=== WEB SOCKET DIAGNOSTIC TEST ===\n');

// Test 1: Dashboard connection
console.log('1. Testing Dashboard WebSocket...');
const dashboardWs = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001', {
  perMessageDeflate: false,
  handshakeTimeout: 10000,
  maxPayload: 1048576,
  headers: {
    'User-Agent': 'Node-WebSocket-Test',
    'Origin': 'https://qris-backend.onrender.com'
  }
});

dashboardWs.on('open', () => {
  console.log('   ✅ Dashboard CONNECTED');
  
  // Send ping after 1 second
  setTimeout(() => {
    if (dashboardWs.readyState === 1) {
      dashboardWs.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
      console.log('   📤 Sent PING to dashboard');
    }
  }, 1000);
});

dashboardWs.on('message', (data) => {
  console.log('   📨 Dashboard received:', data.toString().substring(0, 200) + '...');
});

dashboardWs.on('error', (error) => {
  console.log('   ❌ Dashboard error:', error.message);
});

dashboardWs.on('close', (code, reason) => {
  console.log(`   🔌 Dashboard closed: ${code} - ${reason}`);
});

// Test 2: Device connection
setTimeout(() => {
  console.log('\n2. Testing Device WebSocket...');
  const deviceWs = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001&deviceId=EDC001', {
    perMessageDeflate: false,
    handshakeTimeout: 10000,
    maxPayload: 1048576,
    headers: {
      'User-Agent': 'Node-WebSocket-Test',
      'Origin': 'https://qris-backend.onrender.com'
    }
  });

  deviceWs.on('open', () => {
    console.log('   ✅ Device CONNECTED');
    
    setTimeout(() => {
      if (deviceWs.readyState === 1) {
        deviceWs.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
        console.log('   📤 Sent PING to device');
      }
    }, 1000);
  });

  deviceWs.on('message', (data) => {
    console.log('   📨 Device received:', data.toString().substring(0, 200) + '...');
  });

  deviceWs.on('error', (error) => {
    console.log('   ❌ Device error:', error.message);
  });

  deviceWs.on('close', (code, reason) => {
    console.log(`   🔌 Device closed: ${code} - ${reason}`);
  });
}, 2000);

// Test 3: Test HTTP endpoints
setTimeout(() => {
  console.log('\n3. Testing HTTP endpoints...');
  
  const https = require('https');
  
  const options = {
    hostname: 'qris-backend.onrender.com',
    port: 443,
    path: '/health',
    method: 'GET',
    headers: {
      'User-Agent': 'Node-Test'
    }
  };
  
  const req = https.request(options, (res) => {
    console.log(`   Health check status: ${res.statusCode}`);
    
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const health = JSON.parse(data);
        console.log(`   Status: ${health.status}`);
        console.log(`   Connections: ${health.connections?.total || 0}`);
        console.log(`   Uptime: ${health.uptime}`);
      } catch (e) {
        console.log('   Response:', data.substring(0, 200));
      }
    });
  });
  
  req.on('error', (error) => {
    console.log('   ❌ HTTP request error:', error.message);
  });
  
  req.end();
}, 4000);

// Run for 10 seconds
setTimeout(() => {
  console.log('\n=== TEST COMPLETED ===');
  process.exit(0);
}, 10000);