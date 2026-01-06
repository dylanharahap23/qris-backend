// server.js - tanpa dotenv
// HAPUS LINE INI: require('dotenv').config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 10000; // Render otomatis set PORT

// ========== WEB SOCKET SETUP ==========
const wss = new WebSocket.Server({ server, path: '/ws' });

// Heartbeat function
function heartbeat() {
  this.isAlive = true;
}

const merchantConnections = new Map();

wss.on('connection', function connection(ws, req) {
  console.log('🔌 New WebSocket client connected');
  
  // Extract merchantId
  const url = req.url || '';
  const merchantId = getMerchantIdFromUrl(url);
  
  if (merchantId) {
    console.log(`✅ Merchant ${merchantId} connected`);
    merchantConnections.set(merchantId, ws);
    
    // Setup heartbeat
    ws.isAlive = true;
    ws.on('pong', heartbeat);
    
    // Send welcome
    ws.send(JSON.stringify({
      type: 'CONNECTED',
      message: `Connected for merchant ${merchantId}`,
      merchantId: merchantId,
      timestamp: new Date().toISOString()
    }));
  } else {
    ws.send(JSON.stringify({
      type: 'ERROR',
      message: 'merchantId parameter required'
    }));
    ws.close(1008, 'Missing merchantId');
  }
  
  ws.on('message', function message(data) {
    console.log('📨 Received:', data.toString());
  });
  
  ws.on('error', console.error);
  
  ws.on('close', function close() {
    console.log(`🔌 Connection closed for: ${merchantId}`);
    if (merchantId) merchantConnections.delete(merchantId);
  });
});

// Ping clients every 30 seconds
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

// Helper functions
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

function sendNotificationToMerchant(merchantId, notification) {
  const ws = merchantConnections.get(merchantId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(notification));
    console.log(`📤 Notification sent to ${merchantId}`);
    return true;
  }
  console.log(`⚠️ Merchant ${merchantId} not connected`);
  return false;
}

// ========== EXPRESS MIDDLEWARE ==========
app.use(cors({ origin: '*' }));
app.use(express.json());

// ========== API ENDPOINTS ==========

app.get("/", (req, res) => {
  res.json({
    service: "QRIS Payment Gateway",
    version: "3.0.0",
    status: "running",
    websocket: true,
    endpoint: "/ws?merchantId=YOUR_ID",
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.post("/api/payment", (req, res) => {
  console.log("💳 Payment request:", req.body);
  
  const { merchantId, amount } = req.body;
  
  if (!merchantId || !amount) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  
  const transaction = {
    id: `TRX-${Date.now()}`,
    merchantId,
    amount: parseFloat(amount),
    status: "SUCCESS",
    timestamp: new Date().toISOString()
  };
  
  console.log(`✅ Payment processed: ${transaction.id}`);
  
  // Send notification
  const notification = {
    type: 'NEW_PAYMENT',
    title: '💳 New Payment!',
    message: `Payment Rp ${amount} received`,
    transaction: transaction,
    timestamp: new Date().toISOString()
  };
  
  const sent = sendNotificationToMerchant(merchantId, notification);
  
  res.json({
    success: true,
    transaction: transaction,
    notificationSent: sent,
    message: sent ? 'Merchant notified' : 'Merchant offline'
  });
});

// ========== START SERVER ==========
server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(60));
  console.log('🚀 QRIS PAYMENT GATEWAY - RENDER FIXED');
  console.log('='.repeat(60));
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 HTTP API ready`);
  console.log(`🔌 WebSocket: /ws path`);
  console.log('='.repeat(60));
});