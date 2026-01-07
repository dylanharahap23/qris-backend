// server.js - QRIS Payment Gateway with Switch Callback & Multi-Channel Notification
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 10000;

// ========== CONFIGURATION ==========
const config = {
  switchSecretKey: process.env.SWITCH_SECRET_KEY || 'simulated-switch-secret-key-2024',
  merchantCallbackUrls: new Map([
    ['MER001', 'https://merchant001.com/api/callback'],
    ['MER002', 'https://merchant002.com/api/callback'],
  ]),
  pushNotificationEnabled: true,
  merchantDeviceEnabled: true
};

// ========== SIMULATION STATE ==========
const simulationState = {
  // Transaction storage
  pendingTransactions: new Map(),
  approvedTransactions: new Map(),
  declinedTransactions: new Map(),
  settledTransactions: new Map(),
  
  // Merchant device connections (for EDC/printer simulation)
  merchantDevices: new Map(),
  
  // Mock data
  mockBanks: [
    { code: 'BCA', name: 'Bank Central Asia', processingTime: 3000, successRate: 0.95 },
    { code: 'MANDIRI', name: 'Bank Mandiri', processingTime: 4000, successRate: 0.93 },
    { code: 'BRI', name: 'Bank Rakyat Indonesia', processingTime: 3500, successRate: 0.94 },
    { code: 'BNI', name: 'Bank Negara Indonesia', processingTime: 3200, successRate: 0.92 },
    { code: 'CIMB', name: 'CIMB Niaga', processingTime: 3800, successRate: 0.91 },
    { code: 'DANA', name: 'DANA', processingTime: 2000, successRate: 0.96 },
    { code: 'GOPAY', name: 'GoPay', processingTime: 1500, successRate: 0.97 },
    { code: 'OVO', name: 'OVO', processingTime: 1800, successRate: 0.96 },
    { code: 'SHOPEEPAY', name: 'ShopeePay', processingTime: 1700, successRate: 0.95 },
    { code: 'LINKAJA', name: 'LinkAja', processingTime: 1900, successRate: 0.94 },
    { code: 'QRIS', name: 'QRIS', processingTime: 2500, successRate: 0.98 },
  ],
  
  mockCustomers: [
    { account: '1234567890', bank: 'BCA', balance: 5000000, name: 'John Doe', riskLevel: 'LOW' },
    { account: '0987654321', bank: 'MANDIRI', balance: 3000000, name: 'Jane Smith', riskLevel: 'LOW' },
    { account: '1122334455', bank: 'BRI', balance: 7500000, name: 'Bob Wilson', riskLevel: 'MEDIUM' },
    { account: '5566778899', bank: 'OVO', balance: 2500000, name: 'Alice Brown', riskLevel: 'LOW' },
    { account: '6677889900', bank: 'GOPAY', balance: 1500000, name: 'Charlie Davis', riskLevel: 'LOW' },
    { account: '7788990011', bank: 'SHOPEEPAY', balance: 1800000, name: 'Eve Johnson', riskLevel: 'LOW' },
  ]
};

// ========== MIDDLEWARE ==========
app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(express.json());

// ========== WEB SOCKET SETUP (Merchant Dashboard) ==========
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', function connection(ws, req) {
  console.log('🔌 New WebSocket client connected');
  
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
  
  console.log(`✅ Merchant ${merchantId} connected to dashboard`);
  
  ws.merchantId = merchantId;
  ws.connectionType = 'DASHBOARD';
  ws.isAlive = true;
  
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  ws.send(JSON.stringify({
    type: 'CONNECTED',
    message: `Dashboard connected for merchant ${merchantId}`,
    merchantId: merchantId,
    timestamp: new Date().toISOString(),
    connectionId: `DASH-${Date.now()}`
  }));
  
  ws.on('message', function message(data) {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', timestamp: new Date().toISOString() }));
      }
    } catch (error) {
      // Ignore non-JSON messages
    }
  });
  
  ws.on('close', () => {
    console.log(`🔌 Dashboard disconnected for merchant: ${merchantId}`);
  });
});

// ========== WEB SOCKET FOR MERCHANT DEVICES (EDC/Printer) ==========
const deviceWss = new WebSocket.Server({ server, path: '/ws/device' });

deviceWss.on('connection', function connection(ws, req) {
  console.log('🖨️  New merchant device connected');
  
  const url = req.url || '';
  const queryString = url.split('?')[1];
  let merchantId = null;
  let deviceId = null;
  
  if (queryString) {
    const params = new URLSearchParams(queryString);
    merchantId = params.get('merchantId');
    deviceId = params.get('deviceId') || 'DEVICE-001';
  }
  
  if (!merchantId) {
    ws.close(1008, 'Missing merchantId');
    return;
  }
  
  console.log(`🖨️  Merchant device connected: ${deviceId} for ${merchantId}`);
  
  ws.merchantId = merchantId;
  ws.deviceId = deviceId;
  ws.connectionType = 'DEVICE';
  
  // Store device connection
  if (!simulationState.merchantDevices.has(merchantId)) {
    simulationState.merchantDevices.set(merchantId, new Map());
  }
  simulationState.merchantDevices.get(merchantId).set(deviceId, ws);
  
  ws.send(JSON.stringify({
    type: 'DEVICE_CONNECTED',
    message: `Device ${deviceId} connected`,
    merchantId,
    deviceId,
    timestamp: new Date().toISOString()
  }));
  
  ws.on('close', () => {
    console.log(`🖨️  Device disconnected: ${deviceId} for ${merchantId}`);
    const merchantDevices = simulationState.merchantDevices.get(merchantId);
    if (merchantDevices) {
      merchantDevices.delete(deviceId);
    }
  });
});

// Heartbeat for both WebSocket servers
const interval = setInterval(() => {
  [wss, deviceWss].forEach(wssInstance => {
    wssInstance.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  });
}, 30000);

// ========== HELPER FUNCTIONS ==========

function mapResponseCodeToStatus(code) {
  const responseCodes = {
    '00': { status: 'APPROVED', message: 'APPROVED' },
    '01': { status: 'REFERRAL', message: 'REFER TO ISSUER' },
    '51': { status: 'DECLINED', message: 'INSUFFICIENT FUNDS' },
    '55': { status: 'DECLINED', message: 'INCORRECT PIN' },
    '57': { status: 'DECLINED', message: 'TRANSACTION NOT PERMITTED' },
    '58': { status: 'DECLINED', message: 'TRANSACTION NOT PERMITTED TO TERMINAL' },
    '61': { status: 'DECLINED', message: 'EXCEEDS WITHDRAWAL LIMIT' },
    '65': { status: 'DECLINED', message: 'EXCEEDS LIMIT' },
    '75': { status: 'DECLINED', message: 'EXCEEDS PIN TRIES' },
    '91': { status: 'DECLINED', message: 'ISSUER/SWITCH INOPERATIVE' },
    '96': { status: 'DECLINED', message: 'SYSTEM MALFUNCTION' }
  };
  
  return responseCodes[code] || { status: 'DECLINED', message: 'DECLINED' };
}

function generateSignature(data, secretKey) {
  const hmac = crypto.createHmac('sha256', secretKey);
  hmac.update(JSON.stringify(data));
  return hmac.digest('hex');
}

function verifySignature(data, signature, secretKey) {
  const calculatedSignature = generateSignature(data, secretKey);
  return calculatedSignature === signature;
}

// ========== MULTI-CHANNEL NOTIFICATION DISTRIBUTION ==========

async function distributeAuthorizationResult(transaction) {
  console.log(`📨 Distributing authorization result for ${transaction.id}`);
  
  const distributionResults = {
    paymentApp: false,
    merchantDashboard: false,
    merchantDevice: false,
    merchantCallback: false
  };
  
  try {
    // 1️⃣ Send to Payment App (Push Notification - SIMULATED)
    distributionResults.paymentApp = await sendToPaymentApp(transaction);
    
    // 2️⃣ Send to Merchant Dashboard (WebSocket)
    distributionResults.merchantDashboard = sendToMerchantDashboard(transaction);
    
    // 3️⃣ Send to Merchant Device (EDC/Printer - WebSocket)
    distributionResults.merchantDevice = sendToMerchantDevice(transaction);
    
    // 4️⃣ Send to Merchant Callback URL (HTTP)
    distributionResults.merchantCallback = await sendToMerchantCallback(transaction);
    
    console.log(`✅ Distribution completed for ${transaction.id}:`, distributionResults);
    
  } catch (error) {
    console.error(`❌ Distribution error for ${transaction.id}:`, error);
  }
  
  return distributionResults;
}

async function sendToPaymentApp(transaction) {
  // Simulate push notification to payment app
  // In reality: FCM/APNS with device token
  console.log(`📱 [SIM] Push notification to payment app for transaction ${transaction.id}`);
  
  // Simulate async operation
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const notificationPayload = {
    to: transaction.deviceToken || 'simulated-device-token',
    notification: {
      title: transaction.status === 'APPROVED' ? '✅ Payment Successful' : '❌ Payment Failed',
      body: transaction.status === 'APPROVED' 
        ? `Rp ${transaction.amount.toLocaleString()} paid successfully`
        : `Payment failed: ${transaction.responseMessage}`,
      sound: 'default'
    },
    data: {
      type: 'PAYMENT_RESULT',
      transactionId: transaction.id,
      status: transaction.status,
      amount: transaction.amount.toString(),
      merchantId: transaction.merchantId,
      timestamp: new Date().toISOString()
    }
  };
  
  console.log(`📱 Push notification payload:`, JSON.stringify(notificationPayload, null, 2));
  return true;
}

function sendToMerchantDashboard(transaction) {
  const notification = {
    type: transaction.status === 'APPROVED' ? 'PAYMENT_APPROVED' : 'PAYMENT_DECLINED',
    title: transaction.status === 'APPROVED' ? '✅ Payment Approved' : '❌ Payment Declined',
    message: transaction.status === 'APPROVED'
      ? `Rp ${transaction.amount.toLocaleString()} from ${transaction.bankCode}`
      : `Declined: ${transaction.responseMessage}`,
    transaction: transaction,
    timestamp: new Date().toISOString(),
    color: transaction.status === 'APPROVED' ? 'green' : 'red'
  };
  
  let sentCount = 0;
  wss.clients.forEach((client) => {
    if (client.merchantId === transaction.merchantId && client.readyState === 1) {
      client.send(JSON.stringify(notification));
      sentCount++;
    }
  });
  
  console.log(`📊 Dashboard notification sent to ${transaction.merchantId}: ${sentCount} clients`);
  return sentCount > 0;
}

function sendToMerchantDevice(transaction) {
  const merchantDevices = simulationState.merchantDevices.get(transaction.merchantId);
  if (!merchantDevices || merchantDevices.size === 0) {
    console.log(`🖨️  No devices connected for merchant ${transaction.merchantId}`);
    return false;
  }
  
  const deviceMessage = {
    type: 'PAYMENT_RESULT',
    command: transaction.status === 'APPROVED' ? 'PRINT_RECEIPT' : 'SHOW_DECLINED',
    transaction: {
      id: transaction.id,
      amount: transaction.amount,
      status: transaction.status,
      authCode: transaction.authorizationCode,
      rrn: transaction.rrn,
      stan: transaction.stan,
      time: transaction.transactionTime,
      customerAccount: transaction.customerAccount,
      merchantId: transaction.merchantId,
      bankName: transaction.bankName
    },
    timestamp: new Date().toISOString()
  };
  
  let sentCount = 0;
  merchantDevices.forEach((deviceSocket, deviceId) => {
    if (deviceSocket.readyState === 1) {
      deviceSocket.send(JSON.stringify(deviceMessage));
      sentCount++;
      console.log(`🖨️  Sent to device ${deviceId} for merchant ${transaction.merchantId}`);
    }
  });
  
  return sentCount > 0;
}

async function sendToMerchantCallback(transaction) {
  const callbackUrl = config.merchantCallbackUrls.get(transaction.merchantId);
  if (!callbackUrl) {
    console.log(`🌐 No callback URL configured for merchant ${transaction.merchantId}`);
    return false;
  }
  
  try {
    const callbackPayload = {
      event: 'payment.authorization',
      transaction: transaction,
      signature: generateSignature(transaction, config.switchSecretKey),
      timestamp: new Date().toISOString()
    };
    
    console.log(`🌐 Sending callback to ${callbackUrl} for ${transaction.id}`);
    
    // Simulate HTTP callback (in reality: axios.post)
    await new Promise(resolve => setTimeout(resolve, 200));
    console.log(`🌐 Callback sent successfully to ${callbackUrl}`);
    
    return true;
  } catch (error) {
    console.error(`❌ Callback error for ${transaction.merchantId}:`, error);
    return false;
  }
}

// ========== SWITCH CALLBACK ENDPOINT ==========

app.post("/api/switch/callback", (req, res) => {
  console.log("🔄 SWITCH CALLBACK received:", JSON.stringify(req.body, null, 2));
  
  const switchSignature = req.headers['x-switch-signature'];
  const switchTimestamp = req.headers['x-switch-timestamp'];
  
  // Verify switch signature
  if (!verifySignature(req.body, switchSignature, config.switchSecretKey)) {
    console.error('❌ Invalid switch signature');
    return res.status(401).json({ 
      success: false, 
      error: "Invalid signature",
      code: "SECURITY_ERROR"
    });
  }
  
  const switchData = req.body;
  
  // Map switch response codes
  const statusInfo = mapResponseCodeToStatus(switchData.responseCode);
  
  const transaction = {
    id: switchData.transactionId,
    merchantId: switchData.merchantId,
    amount: parseFloat(switchData.amount),
    status: statusInfo.status,
    responseCode: switchData.responseCode,
    responseMessage: statusInfo.message,
    authorizationCode: switchData.authorizationCode,
    rrn: switchData.rrn,
    stan: switchData.stan,
    terminalId: switchData.terminalId,
    bankCode: switchData.bankCode,
    bankName: switchData.bankName || 'Bank',
    customerName: switchData.customerName,
    customerAccount: switchData.customerAccount,
    transactionTime: switchData.transactionTime || new Date().toISOString(),
    settlementDate: switchData.settlementDate,
    additionalData: switchData.additionalData,
    source: 'SWITCH_CALLBACK',
    receivedAt: new Date().toISOString(),
    switchId: switchData.switchId,
    switchTimestamp: switchTimestamp
  };
  
  console.log(`✅ Switch callback processed: ${transaction.id} - ${transaction.status}`);
  
  // Store transaction based on status
  if (transaction.status === 'APPROVED') {
    simulationState.approvedTransactions.set(transaction.id, transaction);
    
    // Schedule settlement
    setTimeout(() => {
      completeSettlement(transaction.id);
    }, 2000);
    
  } else {
    simulationState.declinedTransactions.set(transaction.id, transaction);
  }
  
  // Distribute to all channels (async)
  distributeAuthorizationResult(transaction).then(distributionResults => {
    console.log(`📨 Distribution results for ${transaction.id}:`, distributionResults);
  });
  
  // Immediate response to switch
  res.json({
    success: true,
    message: "Callback processed successfully",
    transactionId: transaction.id,
    processedAt: new Date().toISOString(),
    deliveryInitiated: true
  });
});

function completeSettlement(transactionId) {
  const transaction = simulationState.approvedTransactions.get(transactionId);
  if (!transaction) return;
  
  transaction.settlementStatus = 'COMPLETED';
  transaction.settledAt = new Date().toISOString();
  transaction.settlementReference = `SETTLE-${Date.now()}`;
  
  simulationState.approvedTransactions.delete(transactionId);
  simulationState.settledTransactions.set(transactionId, transaction);
  
  console.log(`💰 Settlement completed: ${transactionId}`);
  
  // Notify merchant about settlement
  const settlementNotification = {
    type: 'SETTLEMENT_COMPLETED',
    title: '💰 Funds Settled',
    message: `Rp ${transaction.amount.toLocaleString()} has been settled to your account`,
    transaction: transaction,
    timestamp: new Date().toISOString(),
    color: 'blue'
  };
  
  sendToMerchantDashboard(transaction);
}

// ========== SIMULATION ENDPOINTS ==========

app.post("/api/simulate/switch-callback", async (req, res) => {
  console.log("🎮 Simulating switch callback...");
  
  const { merchantId, amount, bankCode = 'BCA' } = req.body;
  
  if (!merchantId || !amount) {
    return res.status(400).json({ error: "Missing merchantId or amount" });
  }
  
  const transactionId = `SWITCH-${Date.now()}`;
  const isApproved = Math.random() > 0.1; // 90% success rate
  
  const switchResponse = {
    transactionId,
    merchantId,
    amount: parseFloat(amount),
    responseCode: isApproved ? '00' : '51',
    authorizationCode: isApproved ? `AUTH${Date.now().toString().slice(-8)}` : null,
    rrn: `RRN${Date.now().toString().slice(-12)}`,
    stan: Math.floor(100000 + Math.random() * 900000).toString(),
    terminalId: 'TERM001',
    bankCode,
    bankName: bankCode === 'BCA' ? 'Bank Central Asia' : 'Bank',
    customerName: 'Simulated Customer',
    customerAccount: '1234XXXX5678',
    transactionTime: new Date().toISOString(),
    settlementDate: new Date().toISOString().split('T')[0],
    switchId: 'SWITCH-SIM-001',
    additionalData: {
      simulation: true,
      note: 'This is a simulated switch callback'
    }
  };
  
  // Generate signature
  const signature = generateSignature(switchResponse, config.switchSecretKey);
  const timestamp = new Date().toISOString();
  
  // Send to our own callback endpoint
  setTimeout(async () => {
    console.log(`🔄 Sending simulated callback for ${transactionId}`);
    
    try {
      await fetch(`http://localhost:${PORT}/api/switch/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-switch-signature': signature,
          'x-switch-timestamp': timestamp
        },
        body: JSON.stringify(switchResponse)
      });
      
      console.log(`✅ Simulated callback sent for ${transactionId}`);
    } catch (error) {
      console.error(`❌ Failed to send simulated callback:`, error);
    }
  }, 1000);
  
  res.json({
    success: true,
    message: "Switch callback simulation initiated",
    transactionId,
    simulation: {
      switchResponse,
      signature: signature.substring(0, 16) + '...',
      timestamp,
      estimatedDelivery: "1 second"
    }
  });
});

// ========== EXISTING ENDPOINTS (Maintained) ==========

app.get("/", (req, res) => {
  const dashboardConnections = Array.from(wss.clients).filter(c => c.connectionType === 'DASHBOARD').length;
  const deviceConnections = Array.from(deviceWss.clients).filter(c => c.connectionType === 'DEVICE').length;
  
  res.json({
    service: "QRIS Payment Gateway",
    version: "4.0.0",
    status: "running",
    features: ["WebSocket Dashboard", "Device Integration", "Switch Callback", "Multi-channel Notification"],
    connections: {
      dashboard: dashboardConnections,
      devices: deviceConnections,
      total: dashboardConnections + deviceConnections
    },
    simulation: {
      banks: simulationState.mockBanks.length,
      customers: simulationState.mockCustomers.length,
      transactions: {
        pending: simulationState.pendingTransactions.size,
        approved: simulationState.approvedTransactions.size,
        declined: simulationState.declinedTransactions.size,
        settled: simulationState.settledTransactions.size
      }
    },
    endpoints: {
      switch_callback: "POST /api/switch/callback",
      simulate_callback: "POST /api/simulate/switch-callback",
      dashboard_ws: "/ws?merchantId=YOUR_ID",
      device_ws: "/ws/device?merchantId=YOUR_ID&deviceId=DEVICE_ID"
    },
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: {
      dashboard: wss.clients.size,
      devices: deviceWss.clients.size,
      merchantDevices: Array.from(simulationState.merchantDevices.keys()).length
    }
  });
});

// Existing endpoints (keep for backward compatibility)
app.post("/api/payment", (req, res) => {
  const { merchantId, amount, description } = req.body;
  
  if (!merchantId || !amount) {
    return res.status(400).json({ error: "Missing merchantId or amount" });
  }
  
  const transactionId = `DIRECT-${Date.now()}`;
  
  const transaction = {
    id: transactionId,
    merchantId,
    amount: parseFloat(amount),
    description: description || "Direct Payment",
    status: "SUCCESS",
    timestamp: new Date().toISOString(),
    type: "DIRECT"
  };
  
  console.log(`💳 Direct payment: ${transactionId}`);
  
  sendToMerchantDashboard(transaction);
  
  res.json({
    success: true,
    transaction,
    message: "Direct payment processed"
  });
});

// ========== START SERVER ==========
server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('🚀 QRIS PAYMENT GATEWAY v4.0 - SWITCH INTEGRATION');
  console.log('='.repeat(60));
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 HTTP: http://localhost:${PORT}`);
  console.log(`📊 Dashboard WS: ws://localhost:${PORT}/ws?merchantId=YOUR_ID`);
  console.log(`🖨️  Device WS: ws://localhost:${PORT}/ws/device?merchantId=YOUR_ID`);
  console.log(`🏦 Switch Secret: ${config.switchSecretKey.substring(0, 10)}...`);
  console.log('='.repeat(60));
  console.log('🎯 NEW FEATURES:');
  console.log('  • Switch Callback Endpoint');
  console.log('  • Multi-channel Notification');
  console.log('  • Merchant Device Integration');
  console.log('  • Signature Verification');
  console.log('='.repeat(60));
  console.log('📡 Test with:');
  console.log(`  curl -X POST http://localhost:${PORT}/api/simulate/switch-callback`);
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  
  [wss, deviceWss].forEach(wssInstance => {
    wssInstance.clients.forEach(client => {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'SERVER_SHUTDOWN',
          message: 'Server maintenance',
          timestamp: new Date().toISOString()
        }));
        client.close();
      }
    });
    
    wssInstance.close();
  });
  
  server.close(() => {
    console.log('✅ Server stopped');
    process.exit(0);
  });
});