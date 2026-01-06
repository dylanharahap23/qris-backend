const WebSocket = require('ws');

console.log('Testing WebSocket on Render...');
console.log('URL: wss://qris-backend.onrender.com/ws?merchantId=MER001');

const ws = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001');

ws.on('open', () => {
    console.log('✅ SUCCESS: WebSocket connected!');
    console.log('Render WebSocket is working! 🎉');
    ws.close();
    process.exit(0);
});

ws.on('error', (error) => {
    console.log('❌ ERROR: WebSocket failed:', error.message);
    console.log('\n💡 Possible solutions:');
    console.log('1. Render baru mungkin auto-enable WebSocket');
    console.log('2. Coba pakai path yang berbeda');
    console.log('3. Check server.js WebSocket configuration');
    process.exit(1);
});

ws.on('close', () => {
    console.log('🔌 WebSocket closed');
});

setTimeout(() => {
    console.log('⏰ Timeout - WebSocket not responding');
    process.exit(1);
}, 10000);
