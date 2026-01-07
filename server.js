// server.js - QRIS Payment Gateway v4.0 with FIXED WebSocket for Render.com
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
  merchantDeviceEnabled: true,
  websocketKeepAlive: 25000, // 25 seconds for Render.com
  maxConnectionAge: 300000   // 5 minutes
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
  
  // Connection tracking - HANYA SATU INI YANG DIGUNAKAN
  activeConnections: new Map(),
  
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
app.use(cors({ 
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-switch-signature', 'x-switch-timestamp'],
  credentials: true
}));
app.use(bodyParser.json());
app.use(express.json());

// Handle preflight requests
app.options('*', cors());

// ========== FIXED WEB SOCKET ENDPOINT ==========
const wss = new WebSocket.Server({ 
  server, 
  path: '/ws',
  clientTracking: true,
  perMessageDeflate: false
});

wss.on('connection', function connection(ws, req) {
  console.log('🔌 New WebSocket client connecting...');
  
  const url = req.url || '';
  const queryString = url.split('?')[1];
  let merchantId = null;
  let deviceId = null;
  let connectionType = 'DASHBOARD';
  
  if (queryString) {
    const params = new URLSearchParams(queryString);
    merchantId = params.get('merchantId');
    deviceId = params.get('deviceId');
    
    if (deviceId) {
      connectionType = 'DEVICE';
    }
  }
  
  if (!merchantId) {
    try {
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: 'merchantId required',
        timestamp: new Date().toISOString()
      }));
    } catch (e) {}
    ws.close(1008, 'Missing merchantId');
    return;
  }
  
  // Buat connection ID UNIK
  const connectionId = `${connectionType}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  
  // Set properties pada WebSocket object
  ws.merchantId = merchantId;
  ws.deviceId = deviceId;
  ws.connectionType = connectionType;
  ws.connectionId = connectionId;
  ws.connectedAt = Date.now();
  ws.lastActivity = Date.now();
  
  // SIMPAN KE SATU TEMPAT SAJA: simulationState.activeConnections
  simulationState.activeConnections.set(connectionId, ws);
  
  console.log(`✅ ${connectionType} connected: ${deviceId || merchantId} [${connectionId}]`);
  console.log(`📊 Total connections: ${simulationState.activeConnections.size}`);
  
  // Send welcome message
  const welcomeMessage = connectionType === 'DEVICE' ? {
    type: 'DEVICE_CONNECTED',
    message: `Device ${deviceId} connected`,
    merchantId,
    deviceId,
    timestamp: new Date().toISOString(),
    connectionId,
    note: 'Send PING messages to keep connection alive'
  } : {
    type: 'CONNECTED',
    message: `Dashboard connected for merchant ${merchantId}`,
    merchantId,
    timestamp: new Date().toISOString(),
    connectionId,
    note: 'Send PING messages to keep connection alive'
  };
  
  try {
    ws.send(JSON.stringify(welcomeMessage));
    console.log(`📤 Sent welcome to ${connectionId}`);
  } catch (error) {
    console.error(`❌ Error sending welcome:`, error);
    return;
  }
  
  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      ws.lastActivity = Date.now();
      const msg = JSON.parse(data.toString());
      
      console.log(`📨 Received from ${connectionId}: ${msg.type}`);
      
      if (msg.type === 'PING') {
        // Balas dengan PONG
        ws.send(JSON.stringify({
          type: 'PONG',
          timestamp: new Date().toISOString(),
          serverTime: Date.now()
        }));
      }
      
      // Handle transaction approval from device
      if (connectionType === 'DEVICE' && msg.type === 'APPROVE_TRANSACTION') {
        handleDeviceTransactionApproval(ws, msg);
      }
      
    } catch (error) {
      console.error('Message parsing error:', error);
    }
  });
  
  // Handle close
  ws.on('close', (code, reason) => {
    console.log(`🔌 ${connectionId} disconnected: ${code} - ${reason || 'No reason'}`);
    
    // HAPUS DARI SATU TEMPAT SAJA
    simulationState.activeConnections.delete(connectionId);
    
    // Hapus dari device connections jika ini device
    if (connectionType === 'DEVICE' && deviceId) {
      const merchantDevices = simulationState.merchantDevices.get(merchantId);
      if (merchantDevices) {
        merchantDevices.delete(deviceId);
      }
    }
    
    console.log(`📊 Remaining connections: ${simulationState.activeConnections.size}`);
  });
  
  ws.on('error', (error) => {
    console.error(`❌ ${connectionId} error:`, error.message);
    simulationState.activeConnections.delete(connectionId);
  });
  
  // Store device connection jika ini device
  if (connectionType === 'DEVICE') {
    if (!simulationState.merchantDevices.has(merchantId)) {
      simulationState.merchantDevices.set(merchantId, new Map());
    }
    simulationState.merchantDevices.get(merchantId).set(deviceId, ws);
  }
});

// ========== FIXED HEARTBEAT (APP-LEVEL PING) ==========
const heartbeatInterval = setInterval(() => {
  const now = Date.now();
  let activeCount = 0;
  let expiredCount = 0;
  
  simulationState.activeConnections.forEach((ws, connectionId) => {
    try {
      // Cek jika connection masih open
      if (ws.readyState !== WebSocket.OPEN) {
        simulationState.activeConnections.delete(connectionId);
        return;
      }
      
      // Cek connection age (max 5 menit)
      if (now - ws.connectedAt > config.maxConnectionAge) {
        console.log(`⏳ Connection expired: ${connectionId}`);
        ws.close(1000, 'Connection expired');
        simulationState.activeConnections.delete(connectionId);
        expiredCount++;
        return;
      }
      
      // Kirim APP-LEVEL PING (bukan WebSocket protocol ping)
      ws.send(JSON.stringify({
        type: 'SERVER_PING',
        timestamp: new Date().toISOString(),
        connectionId: ws.connectionId
      }));
      
      activeCount++;
      
    } catch (error) {
      console.error(`Heartbeat error for ${connectionId}:`, error.message);
      simulationState.activeConnections.delete(connectionId);
    }
  });
  
  console.log(`❤️  Heartbeat: ${activeCount} active, ${expiredCount} expired, total: ${simulationState.activeConnections.size}`);
}, config.websocketKeepAlive);

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

function handleDeviceTransactionApproval(deviceWs, messageData) {
  const { transactionId, status, authorizationCode } = messageData;
  
  console.log(`🖨️  Device ${deviceWs.deviceId} approving transaction ${transactionId}`);
  
  // Find transaction
  let transaction = simulationState.pendingTransactions.get(transactionId) ||
                   simulationState.approvedTransactions.get(transactionId) ||
                   simulationState.declinedTransactions.get(transactionId);
  
  if (!transaction) {
    try {
      deviceWs.send(JSON.stringify({
        type: 'ERROR',
        message: `Transaction ${transactionId} not found`,
        timestamp: new Date().toISOString()
      }));
    } catch (e) {
      console.error('Error sending transaction not found error:', e);
    }
    return;
  }
  
  // Update transaction status
  if (status === 'APPROVED') {
    transaction.status = 'APPROVED';
    transaction.authorizationCode = authorizationCode || `AUTH${Date.now().toString().slice(-8)}`;
    transaction.deviceApprovedAt = new Date().toISOString();
    transaction.deviceId = deviceWs.deviceId;
    
    simulationState.pendingTransactions.delete(transactionId);
    simulationState.approvedTransactions.set(transactionId, transaction);
    
    // Schedule settlement
    setTimeout(() => {
      completeSettlement(transactionId);
    }, 2000);
    
  } else if (status === 'DECLINED') {
    transaction.status = 'DECLINED';
    transaction.responseMessage = 'DECLINED_BY_MERCHANT';
    transaction.deviceDeclinedAt = new Date().toISOString();
    transaction.deviceId = deviceWs.deviceId;
    
    simulationState.pendingTransactions.delete(transactionId);
    simulationState.declinedTransactions.set(transactionId, transaction);
  }
  
  // Update transaction timestamp
  transaction.updatedAt = new Date().toISOString();
  
  // Notify dashboard
  sendToMerchantDashboard(transaction);
  
  // Send confirmation to device
  try {
    deviceWs.send(JSON.stringify({
      type: 'TRANSACTION_PROCESSED',
      transactionId: transactionId,
      status: status,
      timestamp: new Date().toISOString(),
      message: `Transaction ${status.toLowerCase()} successfully`
    }));
  } catch (e) {
    console.error('Error sending transaction processed confirmation:', e);
  }
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
    // **URGENT: Hanya distribusi ke merchant, TIDAK ke payment app**
    // Karena Shopee sudah kasih notifikasi ke user
    
    // 1️⃣ Send to Merchant Dashboard (WebSocket) - PRIORITAS
    distributionResults.merchantDashboard = sendToMerchantDashboard(transaction);
    
    // 2️⃣ Send to Merchant Device (EDC/Printer) - PRIORITAS
    distributionResults.merchantDevice = sendToMerchantDevice(transaction);
    
    // 3️⃣ Send to Merchant Callback URL (HTTP) - opsional
    if (config.pushNotificationEnabled) {
      distributionResults.merchantCallback = await sendToMerchantCallback(transaction);
    }
    
    // 4️⃣ Skip payment app notification (sudah dari Shopee)
    
    console.log(`✅ Distribution completed for ${transaction.id}:`, distributionResults);
    
  } catch (error) {
    console.error(`❌ Distribution error for ${transaction.id}:`, error);
  }
  
  return distributionResults;
}

async function sendToPaymentApp(transaction) {
  // Simulate push notification to payment app
  console.log(`📱 [SIM] Push notification to payment app for transaction ${transaction.id}`);
  
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
  let notificationType;
  let title;
  let message;
  let color;
  
  if (transaction.status === 'APPROVED') {
    notificationType = 'PAYMENT_APPROVED';
    title = '✅ Payment Approved';
    message = `Rp ${transaction.amount.toLocaleString()} from ${transaction.bankCode}`;
    color = 'green';
  } else if (transaction.status === 'DECLINED') {
    notificationType = 'PAYMENT_DECLINED';
    title = '❌ Payment Declined';
    message = `Declined: ${transaction.responseMessage}`;
    color = 'red';
  } else if (transaction.status === 'PENDING') {
    notificationType = 'PAYMENT_INITIATED';
    title = '🔄 Payment Initiated';
    message = `Rp ${transaction.amount.toLocaleString()} pending approval`;
    color = 'yellow';
  } else {
    return false;
  }
  
  const notification = {
    type: notificationType,
    title: title,
    message: message,
    transaction: transaction,
    timestamp: new Date().toISOString(),
    color: color
  };
  
  let sentCount = 0;
  
  // Gunakan simulationState.activeConnections untuk mencari client
  simulationState.activeConnections.forEach((client) => {
    if (client.connectionType === 'DASHBOARD' && 
        client.merchantId === transaction.merchantId && 
        client.readyState === 1) {
      try {
        client.send(JSON.stringify(notification));
        sentCount++;
      } catch (error) {
        console.error(`Error sending to dashboard ${client.connectionId}:`, error);
      }
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
  
  // **LANGSUNG KIRIM PERINTAH PRINT**
  const deviceMessage = {
    type: 'PAYMENT_SUCCESS',
    command: 'PRINT_RECEIPT',
    transaction: {
      id: transaction.id,
      amount: transaction.amount,
      status: 'APPROVED',
      authCode: transaction.authorizationCode,
      rrn: transaction.rrn,
      stan: transaction.stan,
      time: transaction.transactionTime,
      merchantId: transaction.merchantId,
      bankName: transaction.bankName || 'QRIS',
      paymentMethod: 'ShopeePay',
      note: 'Payment successful via QRIS'
    },
    timestamp: new Date().toISOString(),
    urgent: true // Flag untuk prioritas tinggi
  };
  
  let sentCount = 0;
  merchantDevices.forEach((deviceSocket, deviceId) => {
    if (deviceSocket.readyState === 1) {
      try {
        deviceSocket.send(JSON.stringify(deviceMessage));
        sentCount++;
        console.log(`🖨️  PRINT command sent to device ${deviceId}`);
      } catch (error) {
        console.error(`Error sending to device ${deviceId}:`, error);
      }
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
    
    // In production, use axios/fetch
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
  
  // Send to dashboard connections
  simulationState.activeConnections.forEach((client) => {
    if (client.connectionType === 'DASHBOARD' && 
        client.merchantId === transaction.merchantId && 
        client.readyState === 1) {
      try {
        client.send(JSON.stringify(settlementNotification));
      } catch (error) {
        console.error(`Error sending settlement to ${client.connectionId}:`, error);
      }
    }
  });
}

// ========== SHOPEE QRIS CALLBACK ENDPOINT ==========
app.post("/api/shopee/callback", (req, res) => {
  console.log("🛍️  SHOPEE CALLBACK received:", JSON.stringify(req.body, null, 2));
  
  // Shopee QRIS biasanya mengirim data dalam format khusus
  const shopeeData = req.body;
  
  // Create transaction
  const transaction = {
    id: shopeeData.transactionId || `SHOPEE-${Date.now()}`,
    merchantId: shopeeData.merchantId || 'SHOPEE001',
    amount: parseFloat(shopeeData.amount || 0),
    status: 'APPROVED', // Shopee hanya callback kalau sukses
    responseCode: '00',
    responseMessage: 'APPROVED',
    authorizationCode: shopeeData.authorizationCode || `AUTH${Date.now().toString().slice(-8)}`,
    rrn: shopeeData.rrn || `RRN${Date.now().toString().slice(-12)}`,
    stan: shopeeData.stan || Math.floor(100000 + Math.random() * 900000).toString(),
    bankCode: shopeeData.bankCode || 'QRIS',
    bankName: 'QRIS via Shopee',
    customerName: shopeeData.customerName || 'Shopee Customer',
    customerAccount: shopeeData.customerAccount || 'SHOPEE-ACCOUNT',
    transactionTime: shopeeData.transactionTime || new Date().toISOString(),
    source: 'SHOPEE_QRIS',
    receivedAt: new Date().toISOString(),
    rawData: shopeeData
  };
  
  console.log(`✅ Shopee callback processed: ${transaction.id}`);
  
  // Simpan transaksi
  simulationState.approvedTransactions.set(transaction.id, transaction);
  
  // **LANGSUNG distribusi ke merchant (TANPA settlement delay)**
  distributeAuthorizationResult(transaction).then(distributionResults => {
    console.log(`📨 Shopee distribution results:`, distributionResults);
  });
  
  // Response ke Shopee HARUS format JSON ini
  res.json({
    "errCode": "0",
    "errMessage": "success",
    "timestamp": new Date().toISOString(),
    "transactionId": transaction.id,
    "received": true
  });
});

// ========== SIMULASI PEMBAYARAN SHOPEE ==========


// Helper untuk parsing QRIS string
function extractFromQRIS(qrisString, tag) {
  // Implementasi sederhana parsing QRIS
  // Format QRIS: tag(2) + length(2) + value
  const regex = new RegExp(tag + '(\\d{2})(.{1,})', 'g');
  const match = regex.exec(qrisString);
  return match ? match[2] : null;
}

// ========== SIMULASI PEMBAYARAN SHOPEE ==========
app.post("/api/shopee/simulate-payment", async (req, res) => {
  console.log("🎮 Simulating Shopee QRIS payment...");
  
  const { merchantId = 'MER001', amount = 2450544, qrisString } = req.body;
  
  const transactionId = `SHOPEE-${Date.now()}`;
  
  // Mock data Shopee
  const shopeeCallbackData = {
    transactionId: transactionId,
    merchantId: merchantId,
    amount: amount,
    status: "SUCCESS",
    authorizationCode: `AUTH${Date.now().toString().slice(-8)}`,
    rrn: `RRN${Date.now().toString().slice(-12)}`,
    stan: Math.floor(100000 + Math.random() * 900000).toString(),
    bankCode: "QRIS",
    customerName: "Shopee User",
    customerAccount: "SHOPEEPAY-12345",
    transactionTime: new Date().toISOString(),
    qrisString: qrisString || "00020101021226610016ID.CO.SHOPEE.WWW01189360091800215732120208215732120303UBE51440014ID.CO.QRIS.WWW0215ID20254448023210303UBE52045965530336054102450544.005802ID5916Shopee Indonesia6015KOTA JAKARTA SE610512950622205181170027479979648756304111C"
  };
  
  console.log(`🛍️  Simulating Shopee payment: Rp ${amount.toLocaleString()}`);
  
  // Kirim ke callback endpoint kita sendiri
  setTimeout(async () => {
    try {
      // Dynamic import untuk fetch
      let fetch;
      try {
        fetch = (await import('node-fetch')).default;
      } catch {
        fetch = global.fetch;
      }
      
      const response = await fetch(`https://qris-backend.onrender.com/api/shopee/callback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(shopeeCallbackData)
      });
      
      const result = await response.json();
      console.log(`✅ Shopee simulation sent:`, result);
      
    } catch (error) {
      console.error(`❌ Failed to send Shopee simulation:`, error);
    }
  }, 1000);
  
  res.json({
    success: true,
    message: "Shopee payment simulation initiated",
    transactionId,
    amount: `Rp ${amount.toLocaleString()}`,
    merchantId,
    simulation: {
      note: "Callback will be sent in 1 second",
      shopeeData: shopeeCallbackData
    }
  });
});

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
  
  // Store as pending transaction
  const pendingTransaction = {
    id: transactionId,
    merchantId: merchantId,
    amount: parseFloat(amount),
    bankCode: bankCode,
    status: 'PENDING',
    source: 'SIMULATION',
    createdAt: new Date().toISOString()
  };
  
  simulationState.pendingTransactions.set(transactionId, pendingTransaction);
  
  // Notify dashboard about pending transaction
  sendToMerchantDashboard(pendingTransaction);
  
  // Send to our own callback endpoint after delay
  setTimeout(async () => {
    console.log(`🔄 Sending simulated callback for ${transactionId}`);
    
    try {
      // Dynamic import for node-fetch
      let fetch;
      try {
        fetch = (await import('node-fetch')).default;
      } catch {
        // Fallback if node-fetch not available
        fetch = global.fetch || (() => {
          throw new Error('Fetch not available');
        });
      }
      
      await fetch(`https://qris-backend.onrender.com/api/switch/callback`, {
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

// ========== DEVICE MANAGEMENT ENDPOINTS ==========

app.get("/api/device/status/:merchantId/:deviceId", (req, res) => {
  const { merchantId, deviceId } = req.params;
  
  const merchantDevices = simulationState.merchantDevices.get(merchantId);
  const isConnected = merchantDevices && merchantDevices.has(deviceId);
  
  // Check in active connections
  let connectionData = null;
  simulationState.activeConnections.forEach((ws) => {
    if (ws.merchantId === merchantId && ws.deviceId === deviceId) {
      connectionData = {
        connectionId: ws.connectionId,
        connectedAt: ws.connectedAt,
        lastActivity: ws.lastActivity,
        readyState: ws.readyState
      };
    }
  });
  
  res.json({
    merchantId,
    deviceId,
    connected: isConnected,
    lastSeen: connectionData ? new Date(connectionData.lastActivity).toISOString() : null,
    connectionId: connectionData ? connectionData.connectionId : null,
    connectionAge: connectionData ? Date.now() - connectionData.connectedAt : null,
    timestamp: new Date().toISOString()
  });
});

app.post("/api/device/register", (req, res) => {
  const { merchantId, deviceId, deviceName, deviceType = 'EDC' } = req.body;
  
  if (!merchantId || !deviceId) {
    return res.status(400).json({ error: "Missing merchantId or deviceId" });
  }
  
  console.log(`📝 Registering device: ${deviceId} for merchant ${merchantId}`);
  
  res.json({
    success: true,
    message: "Device registered successfully",
    device: {
      deviceId,
      merchantId,
      deviceName: deviceName || `Device ${deviceId}`,
      deviceType,
      registeredAt: new Date().toISOString(),
      status: 'REGISTERED'
    }
  });
});

// ========== TRANSACTION ENDPOINTS ==========

app.get("/api/transactions/:merchantId", (req, res) => {
  const { merchantId } = req.params;
  
  const allTransactions = [
    ...Array.from(simulationState.pendingTransactions.values()),
    ...Array.from(simulationState.approvedTransactions.values()),
    ...Array.from(simulationState.declinedTransactions.values()),
    ...Array.from(simulationState.settledTransactions.values())
  ];
  
  const merchantTransactions = allTransactions.filter(tx => tx.merchantId === merchantId);
  
  res.json({
    merchantId,
    count: merchantTransactions.length,
    transactions: merchantTransactions.sort((a, b) => 
      new Date(b.timestamp || b.createdAt || b.receivedAt) - new Date(a.timestamp || a.createdAt || a.receivedAt)
    ),
    summary: {
      pending: merchantTransactions.filter(tx => tx.status === 'PENDING').length,
      approved: merchantTransactions.filter(tx => tx.status === 'APPROVED').length,
      declined: merchantTransactions.filter(tx => tx.status === 'DECLINED').length,
      settled: merchantTransactions.filter(tx => tx.settlementStatus === 'COMPLETED').length
    },
    timestamp: new Date().toISOString()
  });
});

// ========== WEB SOCKET STATUS ENDPOINTS ==========

app.get("/api/websocket/connections", (req, res) => {
  const connections = [];
  
  simulationState.activeConnections.forEach((ws) => {
    connections.push({
      connectionId: ws.connectionId,
      merchantId: ws.merchantId,
      deviceId: ws.deviceId,
      connectionType: ws.connectionType,
      connectedAt: new Date(ws.connectedAt).toISOString(),
      lastActivity: new Date(ws.lastActivity).toISOString(),
      connectionAge: Date.now() - ws.connectedAt,
      readyState: ws.readyState
    });
  });
  
  res.json({
    totalConnections: simulationState.activeConnections.size,
    connections: connections,
    byType: {
      dashboard: connections.filter(c => c.connectionType === 'DASHBOARD').length,
      device: connections.filter(c => c.connectionType === 'DEVICE').length
    },
    timestamp: new Date().toISOString()
  });
});

app.get("/api/websocket/test/:merchantId", (req, res) => {
  const { merchantId } = req.params;
  
  let sentCount = 0;
  
  simulationState.activeConnections.forEach((ws) => {
    if (ws.connectionType === 'DASHBOARD' && 
        ws.merchantId === merchantId && 
        ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({
          type: 'TEST_MESSAGE',
          message: 'This is a test message from the server',
          timestamp: new Date().toISOString()
        }));
        sentCount++;
      } catch (error) {
        console.error('Error sending test message:', error);
      }
    }
  });
  
  res.json({
    success: true,
    message: `Test message sent to ${sentCount} dashboard connections`,
    connections: sentCount,
    timestamp: new Date().toISOString()
  });
});

// ========== EXISTING ENDPOINTS (Maintained) ==========

app.get("/", (req, res) => {
  const dashboardCount = Array.from(simulationState.activeConnections.values())
    .filter(ws => ws.connectionType === 'DASHBOARD').length;
  
  const deviceCount = Array.from(simulationState.activeConnections.values())
    .filter(ws => ws.connectionType === 'DEVICE').length;
  
  res.json({
    service: "QRIS Payment Gateway",
    version: "4.0.0",
    status: "running",
    features: [
      "Fixed WebSocket Connection Tracking",
      "Device Integration",
      "Switch Callback",
      "Multi-channel Notification",
      "Render.com Compatible"
    ],
    connections: {
      total: simulationState.activeConnections.size,
      dashboard: dashboardCount,
      devices: deviceCount
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
      shopee_callback: "POST /api/shopee/callback",
      shopee_simulate: "POST /api/shopee/simulate-payment",
      websocket: "/ws?merchantId=YOUR_ID (add &deviceId=DEVICE_ID for devices)",
      device_status: "GET /api/device/status/:merchantId/:deviceId",
      transactions: "GET /api/transactions/:merchantId",
      websocket_status: "GET /api/websocket/connections",
      websocket_test: "GET /api/websocket/test/:merchantId"
    },
    documentation: {
      dashboard: "wss://qris-backend.onrender.com/ws?merchantId=YOUR_ID",
      device: "wss://qris-backend.onrender.com/ws?merchantId=YOUR_ID&deviceId=DEVICE_ID",
      note: "Send PING messages every 10 seconds to keep connection alive"
    },
    serverInfo: {
      keepAliveInterval: config.websocketKeepAlive,
      maxConnectionAge: config.maxConnectionAge,
      uptime: process.uptime()
    },
    timestamp: new Date().toISOString()
  });
});

app.get("/health", (req, res) => {
  // Hitung connections dari simulationState.activeConnections
  const dashboardCount = Array.from(simulationState.activeConnections.values())
    .filter(ws => ws.connectionType === 'DASHBOARD').length;
  
  const deviceCount = Array.from(simulationState.activeConnections.values())
    .filter(ws => ws.connectionType === 'DEVICE').length;
  
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: {
      total: simulationState.activeConnections.size, // <-- INI YANG BENAR
      dashboard: dashboardCount,
      devices: deviceCount
    },
    simulation: {
      pendingTransactions: simulationState.pendingTransactions.size,
      approvedTransactions: simulationState.approvedTransactions.size,
      declinedTransactions: simulationState.declinedTransactions.size,
      settledTransactions: simulationState.settledTransactions.size
    },
    websocket: {
      keepAliveInterval: config.websocketKeepAlive,
      maxConnectionAge: config.maxConnectionAge,
      heartbeatRunning: true
    }
  });
});

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
server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(70));
  console.log('🚀 QRIS PAYMENT GATEWAY v4.0 - FIXED WEBSOCKET');
  console.log('='.repeat(70));
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 HTTP: https://qris-backend.onrender.com`);
  console.log(`📊 Dashboard WS: wss://qris-backend.onrender.com/ws?merchantId=YOUR_ID`);
  console.log(`🖨️  Device WS: wss://qris-backend.onrender.com/ws?merchantId=YOUR_ID&deviceId=DEVICE_ID`);
  console.log(`🔐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`⚡ Keep Alive: ${config.websocketKeepAlive}ms`);
  console.log(`⏳ Max Connection Age: ${config.maxConnectionAge}ms`);
  console.log('='.repeat(70));
  console.log('🛡️  CRITICAL FIXES APPLIED:');
  console.log('  • Single connection tracking (simulationState.activeConnections)');
  console.log('  • App-level ping (not WebSocket protocol ping)');
  console.log('  • No ws.terminate() for dashboard clients');
  console.log('  • Proper connection cleanup');
  console.log('='.repeat(70));
  console.log('📡 Test Commands:');
  console.log(`  curl -X POST https://qris-backend.onrender.com/api/simulate/switch-callback`);
  console.log(`  wscat -c "wss://qris-backend.onrender.com/ws?merchantId=MER001"`);
  console.log('='.repeat(70));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  
  clearInterval(heartbeatInterval);
  
  simulationState.activeConnections.forEach((ws) => {
    if (ws.readyState === 1) {
      try {
        ws.send(JSON.stringify({
          type: 'SERVER_SHUTDOWN',
          message: 'Server maintenance',
          timestamp: new Date().toISOString()
        }));
        ws.close();
      } catch (error) {
        console.error('Error closing client:', error);
      }
    }
  });
  
  wss.close(() => {
    console.log('✅ WebSocket server closed');
  });
  
  server.close(() => {
    console.log('✅ HTTP server stopped');
    process.exit(0);
  });
});

// Clean up intervals on exit
process.on('exit', () => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }
  console.log('🧹 Cleaned up intervals');
});