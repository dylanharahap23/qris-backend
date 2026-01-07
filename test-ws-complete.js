// test-ws-complete.js
const WebSocket = require('ws');

console.log('Testing complete WebSocket flow...\n');

const ws = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001');

ws.on('open', () => {
    console.log('✅ WebSocket CONNECTED successfully!');
    console.log('Waiting for welcome message...\n');
});

ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    console.log('📨 Received message:', message.type);
    console.log('Details:', JSON.stringify(message, null, 2));
    
    if (message.type === 'CONNECTED') {
        console.log('\n🎉 SUCCESS! WebSocket is FULLY WORKING on Render!');
        console.log(`Merchant: ${message.merchantId}`);
        console.log(`Message: ${message.message}`);
        console.log(`Timestamp: ${message.timestamp}`);
        
        // Test send ping
        setTimeout(() => {
            console.log('\n🔔 Sending PING to test two-way communication...');
            ws.send(JSON.stringify({ type: 'PING' }));
        }, 2000);
    }
    
    if (message.type === 'PONG') {
        console.log('✅ PING-PONG working! Two-way communication established.');
        ws.close();
        process.exit(0);
    }
});

ws.on('error', (error) => {
    console.log('❌ Error:', error.message);
    process.exit(1);
});

ws.on('close', () => {
    console.log('\n🔌 Connection closed gracefully');
});

setTimeout(() => {
    console.log('⏰ Test completed');
    process.exit(0);
}, 15000);