require('dotenv').config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require('http');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);

// **RAILWAY CONFIG - PASTIKAN PATH '/ws'**
const wss = new WebSocket.Server({ 
  server,
  path: '/ws' // Railway butuh path yang spesifik
});

// Middleware dengan CORS untuk production
app.use(cors({
  origin: ['http://localhost:3000', 'http://10.0.2.2:3000', 'https://your-flutter-app.web.app'],
  credentials: true
}));
app.use(bodyParser.json());

// **WebSocket Connection Handler**
const merchantConnections = new Map();

wss.on('connection', (ws, req) => {
    console.log('🔌 New WebSocket client connected');
    
    // Extract merchantId from query parameters
    const url = new URL(req.url, `http://${req.headers.host}`);
    const merchantId = url.searchParams.get('merchantId');
    
    if (merchantId) {
        console.log(`✅ Merchant ${merchantId} connected to WebSocket`);
        merchantConnections.set(merchantId, ws);
        
        // Send welcome message
        ws.send(JSON.stringify({
            type: 'CONNECTED',
            message: `WebSocket connected for merchant ${merchantId}`,
            timestamp: new Date().toISOString()
        }));
    } else {
        console.log('⚠️  WebSocket connection without merchantId');
        ws.close(1008, 'Missing merchantId');
    }
    
    ws.on('close', () => {
        console.log(`🔌 WebSocket closed for merchant: ${merchantId}`);
        if (merchantId) merchantConnections.delete(merchantId);
    });
    
    ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
    });
});

// Helper function to send notifications
function sendNotificationToMerchant(merchantId, notification) {
    const ws = merchantConnections.get(merchantId);
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(notification));
        console.log(`📤 Notification sent to ${merchantId}:`, notification.type);
        return true;
    } else {
        console.log(`⚠️  Merchant ${merchantId} not connected. Notification not sent.`);
        return false;
    }
}

// In-memory storage (for demo - in production use database)
let transactions = [];

// ========== API ENDPOINTS ==========

// Health check
app.get("/", (req, res) => {
    res.json({ 
        service: "QRIS Payment Gateway",
        version: "2.0.0",
        status: "running",
        timestamp: new Date().toISOString(),
        wsConnections: merchantConnections.size,
        environment: process.env.NODE_ENV || 'development'
    });
});

// Health endpoint for Railway
app.get("/health", (req, res) => {
    res.json({ 
        status: "healthy",
        timestamp: new Date().toISOString()
    });
});

// Payment processing
app.post("/api/payment", (req, res) => {
    console.log("💳 Payment request received:", req.body);
    
    const { merchantId, amount, paymentMethod, qrData } = req.body;
    
    // Validation
    if (!merchantId || !amount) {
        return res.status(400).json({ 
            error: "Missing required fields",
            required: ["merchantId", "amount"]
        });
    }
    
    if (amount <= 0 || amount > 100000000) {
        return res.status(400).json({ 
            error: "Invalid amount",
            min: 1,
            max: 100000000
        });
    }
    
    // Create transaction
    const transaction = {
        id: "TRX-" + Date.now(),
        merchantId,
        amount: parseFloat(amount),
        paymentMethod: paymentMethod || "QRIS",
        qrData: qrData ? qrData.substring(0, 100) + '...' : null,
        status: "SUCCESS",
        timestamp: new Date().toISOString(),
        rrn: "RRN" + Date.now().toString().slice(-10),
        authCode: "AUTH" + Math.random().toString(36).substr(2, 8).toUpperCase(),
        customerPan: "****" + Math.floor(1000 + Math.random() * 9000)
    };
    
    transactions.push(transaction);
    
    // Keep only last 100 transactions
    if (transactions.length > 100) {
        transactions = transactions.slice(-100);
    }
    
    // API response
    const apiResponse = {
        success: true,
        ...transaction,
        message: "Payment successful! 💰"
    };
    
    console.log("✅ Payment processed:", transaction.id);
    
    // Send WebSocket notification
    const wsNotification = {
        type: 'NEW_PAYMENT',
        title: '💳 New Payment!',
        message: `Payment Rp ${amount.toLocaleString('id-ID')} received.`,
        transaction: transaction,
        timestamp: new Date().toISOString()
    };
    
    sendNotificationToMerchant(merchantId, wsNotification);
    
    res.json(apiResponse);
});

// Get merchant transactions
app.get("/api/merchant/:id/transactions", (req, res) => {
    const merchantId = req.params.id;
    let filtered = transactions.filter(t => t.merchantId === merchantId);
    
    res.json({
        merchantId: merchantId,
        count: filtered.length,
        transactions: filtered.slice(-50).reverse()
    });
});

// Get transaction by ID
app.get("/api/transaction/:id", (req, res) => {
    const transaction = transactions.find(t => t.id === req.params.id);
    if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
    }
    res.json(transaction);
});

// Test WebSocket endpoint
app.post("/api/test-notification", (req, res) => {
    const { merchantId } = req.body;
    
    if (!merchantId) {
        return res.status(400).json({ error: "merchantId is required" });
    }
    
    const testNotification = {
        type: 'TEST',
        title: '🔔 Test Notification',
        message: 'This is a test message from server!',
        timestamp: new Date().toISOString()
    };
    
    const sent = sendNotificationToMerchant(merchantId, testNotification);
    
    res.json({
        success: sent,
        message: sent ? 'Test notification sent' : 'Merchant is not connected to WebSocket',
        merchantId: merchantId
    });
});

// Refund endpoint
app.post("/api/refund", (req, res) => {
    const { transactionId, merchantId, amount, reason } = req.body;
    
    const transaction = transactions.find(t => t.id === transactionId);
    if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
    }
    
    const refund = {
        id: "REF-" + Date.now(),
        originalTransactionId: transactionId,
        merchantId,
        amount,
        reason: reason || "Customer request",
        status: "REFUNDED",
        timestamp: new Date().toISOString()
    };
    
    transactions.push(refund);
    
    // Send notification
    sendNotificationToMerchant(merchantId, {
        type: 'REFUND_PROCESSED',
        title: '🔄 Refund Processed',
        message: `Refund Rp ${amount} processed for transaction ${transactionId}`,
        refund: refund,
        timestamp: new Date().toISOString()
    });
    
    res.json({
        success: true,
        ...refund,
        message: "Refund processed successfully"
    });
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log("=".repeat(60));
    console.log("🚀 QRIS PAYMENT GATEWAY STARTED");
    console.log("=".repeat(60));
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔌 REST API: http://localhost:${PORT}`);
    console.log(`📡 WebSocket: ws://localhost:${PORT}/ws`);
    console.log("");
    console.log("📋 Available Endpoints:");
    console.log("   GET  /                         - Health check");
    console.log("   GET  /health                   - Health (for Railway)");
    console.log("   POST /api/payment              - Process payment");
    console.log("   GET  /api/merchant/:id/transactions");
    console.log("   POST /api/refund               - Process refund");
    console.log("   POST /api/test-notification    - Test WebSocket");
    console.log("");
    console.log("🔗 WebSocket Connection Examples:");
    console.log("   Merchant: ws://localhost:${PORT}/ws?merchantId=MER001");
    console.log("   Test: node websocket-test.js");
    console.log("=".repeat(60));
});