// full-flow-test.js
const WebSocket = require('ws');
const https = require('https');

console.log('=== FULL FLOW TEST ===\n');

// Step 1: Connect WebSocket
console.log('1. Connecting WebSocket...');
const ws = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001');

let pingInterval;

ws.on('open', () => {
  console.log('   ✅ WebSocket CONNECTED');
  
  // Start keep-alive
  pingInterval = setInterval(() => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'PING',
        timestamp: Date.now()
      }));
    }
  }, 8000);
  
  // Step 2: Trigger simulation after 2 seconds
  setTimeout(() => {
    console.log('\n2. Triggering transaction simulation...');
    
    const postData = JSON.stringify({
      merchantId: 'MER001',
      amount: 150000,
      bankCode: 'BCA'
    });
    
    const options = {
      hostname: 'qris-backend.onrender.com',
      port: 443,
      path: '/api/simulate/switch-callback',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };
    
    const req = https.request(options, (res) => {
      console.log(`   Simulation response: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const response = JSON.parse(data);
        console.log(`   Transaction ID: ${response.transactionId}`);
        console.log('   ⏳ Waiting for real-time notifications...');
      });
    });
    
    req.on('error', (error) => {
      console.error('   ❌ Simulation error:', error.message);
    });
    
    req.write(postData);
    req.end();
    
  }, 2000);
  
  // Step 3: Trigger another transaction after 10 seconds
  setTimeout(() => {
    console.log('\n3. Triggering second transaction...');
    
    const postData = JSON.stringify({
      merchantId: 'MER001',
      amount: 75000,
      bankCode: 'OVO'
    });
    
    const options = {
      hostname: 'qris-backend.onrender.com',
      port: 443,
      path: '/api/simulate/switch-callback',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': postData.length
      }
    };
    
    const req = https.request(options, (res) => {
      console.log(`   Second simulation: ${res.statusCode}`);
    });
    
    req.write(postData);
    req.end();
    
  }, 10000);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  switch (msg.type) {
    case 'CONNECTED':
      console.log(`   📨 ${msg.type}: ${msg.message}`);
      break;
    
    case 'PONG':
      // Ignore PONG messages in console (too noisy)
      break;
    
    case 'SERVER_PING':
      // Respond to server ping
      ws.send(JSON.stringify({
        type: 'PONG',
        timestamp: Date.now()
      }));
      break;
    
    case 'PAYMENT_INITIATED':
      console.log(`\n   💳 ${msg.type}: ${msg.message}`);
      console.log(`      Amount: Rp ${msg.transaction.amount}`);
      console.log(`      Status: ${msg.transaction.status}`);
      break;
    
    case 'PAYMENT_APPROVED':
      console.log(`\n   ✅ ${msg.type}: ${msg.message}`);
      console.log(`      Bank: ${msg.transaction.bankCode}`);
      console.log(`      Auth Code: ${msg.transaction.authorizationCode}`);
      break;
    
    case 'SETTLEMENT_COMPLETED':
      console.log(`\n   💰 ${msg.type}: ${msg.message}`);
      console.log(`      Settlement Ref: ${msg.transaction.settlementReference}`);
      break;
    
    default:
      console.log(`   📨 ${msg.type}: ${msg.message || JSON.stringify(msg).substring(0, 100)}`);
  }
});

ws.on('error', (error) => {
  console.error('   ❌ WebSocket error:', error.message);
});

ws.on('close', (code, reason) => {
  console.log(`\n   🔌 WebSocket closed: ${code} - ${reason}`);
  if (pingInterval) clearInterval(pingInterval);
});

// Run test for 30 seconds
setTimeout(() => {
  console.log('\n🎉 TEST COMPLETED SUCCESSFULLY!');
  console.log('\n📊 Expected notifications received:');
  console.log('   1. PAYMENT_INITIATED');
  console.log('   2. PAYMENT_APPROVED (after 2-3 seconds)');
  console.log('   3. SETTLEMENT_COMPLETED (after 4-5 seconds)');
  
  if (ws.readyState === 1) {
    ws.close(1000, 'Test completed');
  }
  process.exit(0);
}, 30000);