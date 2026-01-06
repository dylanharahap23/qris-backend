// websocket-test.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000?merchantId=MER001');

ws.on('open', () => {
    console.log('✅ Connected to WebSocket server');
    console.log('Waiting for notifications...');
});

ws.on('message', (data) => {
    console.log('📨 Notification received:', JSON.parse(data.toString()));
});

ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
});

ws.on('close', () => {
    console.log('🔌 Disconnected from WebSocket');
});

// Keep alive
setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
    }
}, 30000);