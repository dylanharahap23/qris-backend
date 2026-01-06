require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 10000; // Render default port 10000

// ========== WEB SOCKET SETUP (RENDER STYLE) ==========
const wss = new WebSocket.Server({ server, path: '/ws' });

// Heartbeat function untuk deteksi connection mati
function heartbeat() {
  this.isAlive = true;
}

// Store merchant connections
const merchantConnections = new Map();

wss.on('connection', function connection(ws, req) {
  console.log('🔌 New WebSocket client connected');
  
  // Extract merchantId from URL
  const url = req.url;
  const merchantId = getMerchantIdFromUrl(url);
  
  if (merchantId) {
    console.log(`✅ Merchant ${merchantId} connected`);
    merchantConnections.set(merchantId, ws);
    
    // Setup heartbeat
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: `WebSocket connected for merchant ${merchantId}`,
      merchantId: merchantId,
      timestamp: new Date().toISOString(),
      note: 'Send ping every 30 seconds to keep connection alive'
    }));
  } else {
    console.log('⚠️ Connection without merchantId');
    ws.send(JSON.stringify({
      type: 'ERROR',
      message: 'merchantId parameter required',
      example: 'wss://your-app.onrender.com/ws?merchantId=MER001'
    }));
    ws.close(1008, 'Missing merchantId');
  }
  
  ws.on('message', function message(data) {
    console.log('📨 Received:', data.toString());
    
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ 
          type: 'PONG', 
          timestamp: new Date().toISOString() 
        }));
      }
    } catch (error) {
      // Not JSON, echo back
      ws.send(`Echo: ${data}`);
    }
  });
  
  ws.on('error', function error(err) {
    console.error('❌ WebSocket error:', err.message);
  });
  
  ws.on('close', function close() {
    console.log(`🔌 Connection closed for merchant: ${merchantId}`);
    if (merchantId) merchantConnections.delete(merchantId);
  });
});

// Ping semua connected clients setiap 30 detik (seperti contoh Render)
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) {
      console.log('Terminating stale connection');
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', function close() {
  clearInterval(interval);
});

// Helper function
function getMerchantIdFromUrl(url) {
  try {
    const queryString = url.split('?')[1];
    if (!queryString) return null;
    const params = new URLSearchParams(queryString);
    return params.get('merchantId');
  } catch (error) {
    return null;
  }
}

// Helper untuk send notification
function sendNotificationToMerchant(merchantId, notification) {
  const ws = merchantConnections.get(merchantId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(notification));
    console.log(`📤 Notification sent to ${merchantId}:`, notification.type);
    return true;
  }
  console.log(`⚠️ Merchant ${merchantId} not connected`);
  return false;
}

// ========== EXPRESS MIDDLEWARE ==========
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// ========== API ENDPOINTS ==========

// Health check (WAJIB untuk Render)
app.get('/', (req, res) => {
  res.json({
    service: 'QRIS Payment Gateway',
    version: '3.0.0',
    status: 'running',
    websocket: true,
    endpoint: '/ws?merchantId=YOUR_ID',
    timestamp: new Date().toISOString(),
    connections: merchantConnections.size
  });
});

// Health endpoint untuk Render health checks
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: merchantConnections.size
  });
});

// Payment processing
app.post('/api/payment', (req, res) => {
  console.log('💳 Payment request:', req.body);
  
  const { merchantId, amount, paymentMethod } = req.body;
  
  if (!merchantId || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const transaction = {
    id: `TRX-${Date.now()}`,
    merchantId,
    amount: parseFloat(amount),
    paymentMethod: paymentMethod || 'QRIS',
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
    rrn: `RRN${Date.now().toString().slice(-10)}`,
    authCode: `AUTH${Math.random().toString(36).substr(2, 8).toUpperCase()}`
  };
  
  console.log(`✅ Payment processed: ${transaction.id}`);
  
  // Send WebSocket notification
  const notification = {
    type: 'NEW_PAYMENT',
    title: '💳 New Payment!',
    message: `Payment Rp ${amount.toLocaleString('id-ID')} received`,
    transaction: transaction,
    timestamp: new Date().toISOString()
  };
  
  const sent = sendNotificationToMerchant(merchantId, notification);
  
  res.json({
    success: true,
    transaction: transaction,
    notificationSent: sent,
    message: sent ? 'Merchant notified in real-time' : 'Merchant offline, payment recorded'
  });
});

// Get server status
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    websocket: 'active',
    connectedMerchants: Array.from(merchantConnections.keys()),
    timestamp: new Date().toISOString()
  });
});

// ========== START SERVER ==========
server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('🚀 QRIS PAYMENT GATEWAY (RENDER COMPATIBLE)');
  console.log('='.repeat(60));
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 HTTP: https://qris-backend.onrender.com`);
  console.log(`🔌 WebSocket: wss://qris-backend.onrender.com/ws`);
  console.log('');
  console.log('💡 IMPORTANT FOR RENDER:');
  console.log('1. WebSocket path: /ws');
  console.log('2. Heartbeat ping every 30 seconds');
  console.log('3. Health endpoint at /health');
  console.log('4. All origins allowed (*)');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing WebSocket connections...');
  
  wss.clients.forEach((client) => {
    client.close(1001, 'Server shutting down');
  });
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});