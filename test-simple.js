const WebSocket = require('ws');
const ws = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001');

ws.on('open', () => {
    console.log('✅ Connected!');
    process.exit(0);
});

ws.on('error', (error) => {
    console.log('❌ Error:', error.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('⏰ Timeout');
    process.exit(1);
}, 10000);
