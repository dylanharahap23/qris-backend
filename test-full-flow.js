const WebSocket = require('ws');
const https = require('https');

console.log('🚀 Testing complete payment flow with WebSocket...\n');

// 1. Connect WebSocket first
const ws = new WebSocket('wss://qris-backend.onrender.com/ws?merchantId=MER001');

let paymentProcessed = false;

ws.on('open', () => {
    console.log('✅ WebSocket connected, waiting for notifications...\n');
    
    // 2. Make payment request after WebSocket is connected
    setTimeout(() => {
        console.log('💳 Sending payment request...');
        
        const paymentData = JSON.stringify({
            merchantId: 'MER001',
            amount: 75000,
            paymentMethod: 'gopay',
            customerName: 'Test Customer'
        });
        
        const options = {
            hostname: 'qris-backend.onrender.com',
            path: '/api/payment',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': paymentData.length
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const response = JSON.parse(data);
                console.log('💰 Payment API Response:');
                console.log('  Transaction ID:', response.transaction?.id);
                console.log('  Amount: Rp', response.transaction?.amount);
                console.log('  Notification Sent:', response.notificationSent);
                console.log('  Message:', response.message);
                
                if (response.notificationSent) {
                    console.log('\n📡 Waiting for WebSocket notification...');
                    paymentProcessed = true;
                } else {
                    console.log('\n⚠️  Merchant was offline, no notification sent');
                    ws.close();
                    process.exit(0);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error('Payment API error:', error.message);
            ws.close();
            process.exit(1);
        });
        
        req.write(paymentData);
        req.end();
        
    }, 2000);
});

ws.on('message', (data) => {
    const message = JSON.parse(data.toString());
    
    if (message.type === 'CONNECTED') {
        console.log('🔌 WebSocket:', message.message);
    }
    
    if (message.type === 'NEW_PAYMENT' && paymentProcessed) {
        console.log('\n🎉🎉🎉 SUCCESS! REAL-TIME NOTIFICATION RECEIVED!');
        console.log('='.repeat(50));
        console.log('💳 Notification Type:', message.type);
        console.log('📱 Title:', message.title);
        console.log('💬 Message:', message.message);
        console.log('💰 Amount: Rp', message.transaction?.amount);
        console.log('🆔 Transaction ID:', message.transaction?.id);
        console.log('⏰ Time:', message.timestamp);
        console.log('='.repeat(50));
        console.log('\n✅ QRIS PAYMENT GATEWAY IS FULLY WORKING!');
        console.log('   Backend: Render.com ✅');
        console.log('   WebSocket: Connected ✅');
        console.log('   Real-time: Working ✅');
        console.log('   API: Responding ✅');
        
        ws.close();
        process.exit(0);
    }
});

ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('⏰ Test timeout');
    process.exit(1);
}, 30000);
