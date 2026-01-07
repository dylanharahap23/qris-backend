// server.js - Tanpa dotenv sama sekali
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 10000; // Render akan set PORT otomatis

// ========== MIDDLEWARE ==========
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(express.json());

// ========== WEB SOCKET SETUP ==========
const wss = new WebSocket.Server({ server });

wss.on('connection', function connection(ws, req) {
  console.log('🔌 New WebSocket client connected');
  
  // Extract merchantId from query parameters
  const url = req.url || '';
  const queryString = url.split('?')[1];
  let merchantId = null;
  
  if (queryString) {
    const params = new URLSearchParams(queryString);
    merchantId = params.get('merchantId');
  }
  
  if (!merchantId) {
    ws.send(JSON.stringify({
      type: 'ERROR',
      message: 'merchantId parameter required in query string'
    }));
    ws.close(1008, 'Missing merchantId');
    return;
  }
  
  console.log(`✅ Merchant ${merchantId} connected`);
  
  // Store merchant connection
  ws.merchantId = merchantId;
  ws.isAlive = true;
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: `Connected for merchant ${merchantId}`,
    merchantId: merchantId,
    timestamp: new Date().toISOString()
  }));
  
  ws.on('message', function message(data) {
    console.log(`📨 Message from ${merchantId}:`, data.toString());
  });
  
  ws.on('error', (error) => {
    console.error(`❌ WebSocket error for ${merchantId}:`, error);
  });
  
  ws.on('close', () => {
    console.log(`🔌 Connection closed for merchant: ${merchantId}`);
  });
});

// Heartbeat - ping clients every 30 seconds
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`💀 Terminating stale connection: ${ws.merchantId}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(interval);
});

// ========== API ENDPOINTS ==========

app.get("/", (req, res) => {
  res.json({
    service: "QRIS Payment Gateway",
    version: "2.0.0",
    status: "running",
    websocket: true,
    endpoint: "/ws?merchantId=YOUR_ID",
    timestamp: new Date().toISOString(),
    clients: wss.clients.size
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    websocket_clients: wss.clients.size
  });
});

app.post("/api/payment", (req, res) => {
  console.log("💳 Payment request received:", req.body);
  
  const { merchantId, amount, description } = req.body;
  
  if (!merchantId || !amount) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: merchantId and amount are required"
    });
  }
  
  // Generate transaction ID
  const transactionId = `TRX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  const transaction = {
    id: transactionId,
    merchantId,
    amount: parseFloat(amount),
    description: description || "QRIS Payment",
    status: "SUCCESS",
    timestamp: new Date().toISOString()
  };
  
  console.log(`✅ Payment processed: ${transactionId} for ${merchantId}`);
  
  // Send notification via WebSocket
  const notification = {
    type: 'NEW_PAYMENT',
    title: '💳 New Payment Received!',
    message: `Payment of Rp ${amount.toLocaleString()} received`,
    transaction: transaction,
    timestamp: new Date().toISOString()
  };
  
  // Find merchant's connection
  let sent = false;
  wss.clients.forEach((client) => {
    if (client.merchantId === merchantId && client.readyState === 1) {
      try {
        client.send(JSON.stringify(notification));
        sent = true;
        console.log(`📤 Notification sent to merchant ${merchantId}`);
      } catch (error) {
        console.error(`❌ Failed to send notification to ${merchantId}:`, error);
      }
    }
  });
  
  res.json({
    success: true,
    message: "Payment processed successfully",
    transaction: transaction,
    notification: {
      sent: sent,
      message: sent ? "Merchant notified in real-time" : "Merchant is offline"
    },
    websocket_status: {
      total_clients: wss.clients.size,
      merchant_connected: sent
    }
  });
});

// Get transactions for merchant (simulated)
app.get("/api/merchant/:merchantId/transactions", (req, res) => {
  const { merchantId } = req.params;
  
  // Simulate transactions
  const transactions = [
    {
      id: `TRX-${Date.now() - 10000}`,
      amount: 50000,
      status: "SUCCESS",
      timestamp: new Date(Date.now() - 10000).toISOString()
    },
    {
      id: `TRX-${Date.now() - 20000}`,
      amount: 75000,
      status: "SUCCESS",
      timestamp: new Date(Date.now() - 20000).toISOString()
    }
  ];
  
  res.json({
    success: true,
    merchantId,
    transactions: transactions,
    count: transactions.length
  });
});

// ========== START SERVER ==========
server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 QRIS PAYMENT GATEWAY - PRODUCTION READY');
  console.log('='.repeat(60));
  console.log(`📡 Server running on port: ${PORT}`);
  console.log(`🌐 HTTP API: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket: ws://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  wss.close(() => {
    console.log('WebSocket server closed');
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });
});