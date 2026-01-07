const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const http = require('http');
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 10000;

// ========== RENDER HEALTH CHECK FIX ==========
// Render akan cek endpoint ini
app.get("/health", (req, res) => {
  console.log('🏥 Health check requested');
  res.status(200).json({
    status: "healthy",
    service: "QRIS Payment Gateway v6.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: 0, // Akan diupdate nanti
    version: "6.0.0"
  });
});

app.get("/ready", (req, res) => {
  res.status(200).json({
    status: "ready",
    timestamp: new Date().toISOString()
  });
});

// ========== ADVANCED CONFIGURATION ==========
const config = {
  switchSecretKey: process.env.SWITCH_SECRET_KEY || 'simulated-switch-secret-key-2024',
  websocketKeepAlive: 25000,
  maxConnectionAge: 300000,
  retryConfig: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 10000
  },
  banks: {
    BCA: { name: 'Bank BCA', callbackUrl: 'https://api.bca.co.id/qris/callback', weight: 90 },
    MANDIRI: { name: 'Bank Mandiri', callbackUrl: 'https://api.bankmandiri.co.id/qris', weight: 85 },
    BRI: { name: 'Bank BRI', callbackUrl: 'https://api.bri.co.id/qris-notif', weight: 88 },
    BNI: { name: 'Bank BNI', callbackUrl: 'https://api.bni.co.id/qris', weight: 82 }
  }
};
// ========== MERCHANT NOTIFICATION TRACKER (SheerID Style) ==========
class MerchantNotificationTracker {
  constructor() {
    this.filePath = './merchant_stats.json';
    this.data = this.loadData();
  }

  loadData() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        return JSON.parse(raw);
      }
    } catch (e) {
      console.log('📊 New stats file created');
    }
    return {
      total: 0,
      delivered: 0,
      failed: 0,
      merchants: {},
      banks: {},
      lastUpdated: new Date().toISOString()
    };
  }

  saveData() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2));
    } catch (e) {
      console.error('❌ Failed to save stats:', e.message);
    }
  }

  record(merchantId, bankCode, success) {
    this.data.total++;
    success ? this.data.delivered++ : this.data.failed++;

    // Merchant stats
    if (!this.data.merchants[merchantId]) {
      this.data.merchants[merchantId] = { delivered: 0, failed: 0 };
    }
    success ? this.data.merchants[merchantId].delivered++ 
            : this.data.merchants[merchantId].failed++;

    // Bank stats
    if (!this.data.banks[bankCode]) {
      this.data.banks[bankCode] = { delivered: 0, failed: 0 };
    }
    success ? this.data.banks[bankCode].delivered++ 
            : this.data.banks[bankCode].failed++;

    this.data.lastUpdated = new Date().toISOString();
    
    // Save every 5 records
    if (this.data.total % 5 === 0) {
      this.saveData();
      console.log(`📊 Notif Stats: ${this.data.delivered}/${this.data.total} (${this.getSuccessRate()}%)`);
    }
  }

  getSuccessRate() {
    return this.data.total ? (this.data.delivered / this.data.total * 100).toFixed(1) : 0;
  }

  getMerchantRate(merchantId) {
    const m = this.data.merchants[merchantId];
    if (!m || (m.delivered + m.failed) === 0) return 0;
    return (m.delivered / (m.delivered + m.failed) * 100).toFixed(1);
  }

  getBankRate(bankCode) {
    const b = this.data.banks[bankCode];
    if (!b || (b.delivered + b.failed) === 0) return 0;
    return (b.delivered / (b.delivered + b.failed) * 100).toFixed(1);
  }

  getSummary() {
    return {
      total: this.data.total,
      delivered: this.data.delivered,
      failed: this.data.failed,
      successRate: this.getSuccessRate(),
      merchants: this.data.merchants,
      banks: this.data.banks,
      lastUpdated: this.data.lastUpdated
    };
  }
}

// ========== QRIS PAYMENT PARSER ==========
function parseQRISString(qrisString) {
  console.log(`🔍 Parsing QRIS: ${qrisString.substring(0, 100)}...`);
  
  try {
    const result = {
      isQRIS: qrisString.includes('ID.CO.QRIS.WWW'),
      merchantId: null,
      merchantName: null,
      amount: null,
      bankCode: null,
      city: null
    };

    // Parse merchant name (ID 59)
    const merchantNameMatch = qrisString.match(/59(\d{2})(.+?)(?=\d{2}[A-Z]{2}|$)/);
    if (merchantNameMatch) {
      result.merchantName = merchantNameMatch[2];
    }

    // Parse amount (ID 54)
    const amountMatch = qrisString.match(/54(\d{2})(\d+\.?\d*)/);
    if (amountMatch) {
      result.amount = parseFloat(amountMatch[2]);
    }

    // Parse city (ID 60)
    const cityMatch = qrisString.match(/60(\d{2})(.+?)(?=\d{2}[A-Z]{2}|$)/);
    if (cityMatch) {
      result.city = cityMatch[2];
    }

    // Parse bank code
    if (qrisString.includes('ID.CO.BCA.')) {
      result.bankCode = 'BCA';
      const bcaMatch = qrisString.match(/ID\.CO\.BCA\.(?:WWW)?(\d+)/);
      if (bcaMatch) {
        result.merchantId = `BCA${bcaMatch[1].substring(0, 8)}`;
      }
    } else if (qrisString.includes('ID.CO.BRI.')) {
      result.bankCode = 'BRI';
    } else if (qrisString.includes('ID.CO.BNI.')) {
      result.bankCode = 'BNI';
    } else if (qrisString.includes('ID.CO.MANDIRI.')) {
      result.bankCode = 'MANDIRI';
    } else if (qrisString.includes('ID.CO.SHOPEE.WWW')) {
      result.bankCode = 'SHOPEEPAY';
      const shopeeMatch = qrisString.match(/0118(\d+)/);
      if (shopeeMatch) {
        result.merchantId = `SHOPEE${shopeeMatch[1].substring(0, 8)}`;
      }
    } else {
      result.bankCode = 'QRIS';
    }

    // Default merchant ID jika tidak ditemukan
    if (!result.merchantId) {
      result.merchantId = `QRIS${Date.now().toString().slice(-8)}`;
    }

    console.log(`✅ QRIS Parsed:`, {
      merchant: result.merchantName || 'Unknown',
      amount: result.amount ? `Rp ${result.amount.toLocaleString()}` : 'N/A',
      city: result.city || 'Unknown',
      bank: result.bankCode
    });

    return result;

  } catch (error) {
    console.error('❌ QRIS parse error:', error);
    return {
      isQRIS: true,
      merchantId: 'QRIS00001',
      merchantName: 'QRIS Merchant',
      amount: 0,
      bankCode: 'QRIS',
      city: 'Unknown'
    };
  }
}

// ========== RETRY HANDLER (Exponential Backoff) ==========
class RetryHandler {
  constructor(config) {
    this.maxRetries = config.maxRetries;
    this.initialDelay = config.initialDelay;
    this.maxDelay = config.maxDelay;
  }

  async executeWithRetry(operation, operationName = 'Operation') {
    let lastError;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          const delay = this.calculateBackoff(attempt);
          console.log(`🔄 ${operationName} retry ${attempt}/${this.maxRetries} in ${delay}ms`);
          await this.sleep(delay);
        }
        
        const result = await operation();
        if (result.success !== false) {
          if (attempt > 0) console.log(`✅ ${operationName} succeeded on attempt ${attempt + 1}`);
          return result;
        }
        
        lastError = new Error(result.error || 'Operation failed');
        
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ ${operationName} attempt ${attempt + 1} failed:`, error.message);
      }
    }
    
    throw lastError || new Error(`${operationName} failed after ${this.maxRetries} attempts`);
  }

  calculateBackoff(attempt) {
    const delay = this.initialDelay * Math.pow(2, attempt);
    return Math.min(delay, this.maxDelay);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== GLOBAL INSTANCES ==========
const merchantTracker = new MerchantNotificationTracker();
const retryHandler = new RetryHandler(config.retryConfig);

const simulationState = {
  pendingTransactions: new Map(),
  approvedTransactions: new Map(),
  declinedTransactions: new Map(),
  settledTransactions: new Map(),
  merchantDevices: new Map(),
  activeConnections: new Map()
};

// ========== MIDDLEWARE ==========
app.use(cors({ 
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-switch-signature', 'x-switch-timestamp', 'x-bank-code'],
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.json());

// ========== ENHANCED WEB SOCKET ==========
const wss = new WebSocket.Server({ server, path: '/ws', clientTracking: true });

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.split('?')[1]);
  const merchantId = params.get('merchantId');
  const deviceId = params.get('deviceId');
  const connectionType = deviceId ? 'DEVICE' : 'DASHBOARD';

  if (!merchantId) {
    ws.close(1008, 'Missing merchantId');
    return;
  }

  const connectionId = `${connectionType}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  ws.merchantId = merchantId;
  ws.deviceId = deviceId;
  ws.connectionType = connectionType;
  ws.connectionId = connectionId;
  ws.connectedAt = Date.now();
  ws.lastActivity = Date.now();

  simulationState.activeConnections.set(connectionId, ws);

  console.log(`✅ ${connectionType} connected: ${deviceId || merchantId} [${connectionId}] (Total: ${simulationState.activeConnections.size})`);

  // Store device connection
  if (connectionType === 'DEVICE') {
    if (!simulationState.merchantDevices.has(merchantId)) {
      simulationState.merchantDevices.set(merchantId, new Map());
    }
    simulationState.merchantDevices.get(merchantId).set(deviceId, ws);
  }

  // Send welcome message
  safeSend(ws, {
    type: 'CONNECTED',
    message: `${connectionType} connected successfully`,
    merchantId,
    deviceId,
    connectionId,
    timestamp: new Date().toISOString(),
    note: 'Send PING every 10s to keep alive'
  });

  ws.on('message', (data) => {
    try {
      ws.lastActivity = Date.now();
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'PING':
          safeSend(ws, { type: 'PONG', timestamp: new Date().toISOString() });
          break;
        case 'REQUEST_STATS':
          safeSend(ws, {
            type: 'STATS_UPDATE',
            stats: merchantTracker.getSummary(),
            connections: simulationState.activeConnections.size,
            timestamp: new Date().toISOString()
          });
          break;
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    simulationState.activeConnections.delete(connectionId);
    
    if (connectionType === 'DEVICE' && merchantId && deviceId) {
      const merchantDevices = simulationState.merchantDevices.get(merchantId);
      if (merchantDevices) merchantDevices.delete(deviceId);
    }
    
    console.log(`🔌 ${connectionId} disconnected (Remaining: ${simulationState.activeConnections.size})`);
  });

  ws.on('error', (error) => {
    console.error(`❌ ${connectionId} error:`, error.message);
    simulationState.activeConnections.delete(connectionId);
  });
});

function safeSend(ws, data) {
  if (ws.readyState === 1) {
    try {
      ws.send(JSON.stringify(data));
    } catch (error) {
      console.error('Send error:', error);
    }
  }
}

// ========== HEARTBEAT SYSTEM ==========
setInterval(() => {
  const now = Date.now();
  let active = 0;
  let expired = 0;

  simulationState.activeConnections.forEach((ws, connectionId) => {
    try {
      if (ws.readyState !== 1) {
        simulationState.activeConnections.delete(connectionId);
        return;
      }

      if (now - ws.connectedAt > config.maxConnectionAge) {
        ws.close(1000, 'Connection expired');
        simulationState.activeConnections.delete(connectionId);
        expired++;
        return;
      }

      safeSend(ws, {
        type: 'HEARTBEAT',
        timestamp: new Date().toISOString(),
        connectionId: ws.connectionId
      });

      active++;
    } catch (error) {
      console.error(`Heartbeat error for ${connectionId}:`, error.message);
      simulationState.activeConnections.delete(connectionId);
    }
  });

  if (active > 0 || expired > 0) {
    console.log(`❤️  Heartbeat: ${active} active, ${expired} expired, total: ${simulationState.activeConnections.size}`);
  }
}, config.websocketKeepAlive);

// ========== HELPER FUNCTIONS ==========
function generateSignature(data, secretKey) {
  return crypto.createHmac('sha256', secretKey)
    .update(JSON.stringify(data))
    .digest('hex');
}

function mapResponseCodeToStatus(code) {
  const codes = {
    '00': { status: 'APPROVED', message: 'APPROVED' },
    '51': { status: 'DECLINED', message: 'INSUFFICIENT FUNDS' },
    '55': { status: 'DECLINED', message: 'INCORRECT PIN' },
    '91': { status: 'DECLINED', message: 'ISSUER/SWITCH INOPERATIVE' },
    '96': { status: 'DECLINED', message: 'SYSTEM MALFUNCTION' }
  };
  return codes[code] || { status: 'DECLINED', message: 'DECLINED' };
}

// ========== MERCHANT NOTIFICATION SYSTEM ==========
async function notifyMerchant(transaction) {
  console.log(`📨 Notifying merchant: ${transaction.merchantId} for ${transaction.id}`);
  
  const results = {
    dashboard: false,
    device: false
  };

  try {
    // 1. Dashboard notification
    results.dashboard = sendToMerchantDashboard(transaction);
    
    // 2. Device notification (printer/EDC)
    results.device = sendToMerchantDevice(transaction);
    
    // 3. Track success rate
    merchantTracker.record(
      transaction.merchantId,
      transaction.bankCode,
      results.dashboard || results.device
    );
    
    console.log(`✅ Merchant notification:`, {
      dashboard: results.dashboard ? '✅' : '❌',
      device: results.device ? '✅' : '❌',
      successRate: `${merchantTracker.getMerchantRate(transaction.merchantId)}%`
    });
    
    return results;
    
  } catch (error) {
    console.error(`❌ Merchant notification failed for ${transaction.id}:`, error);
    merchantTracker.record(transaction.merchantId, transaction.bankCode, false);
    return results;
  }
}

function sendToMerchantDashboard(transaction) {
  const notification = {
    type: 'PAYMENT_APPROVED',
    title: '✅ Payment Successful',
    message: `Rp ${transaction.amount.toLocaleString()} received via ${transaction.bankName}`,
    transaction: {
      id: transaction.id,
      amount: transaction.amount,
      status: transaction.status,
      authCode: transaction.authorizationCode,
      time: transaction.transactionTime,
      merchantName: transaction.merchantName,
      bankName: transaction.bankName,
      customerName: transaction.customerName
    },
    timestamp: new Date().toISOString(),
    urgent: true
  };

  let sentCount = 0;
  simulationState.activeConnections.forEach(client => {
    if (client.connectionType === 'DASHBOARD' && 
        client.merchantId === transaction.merchantId && 
        client.readyState === 1) {
      safeSend(client, notification);
      sentCount++;
    }
  });

  console.log(`📊 Dashboard notification: ${sentCount} clients`);
  return sentCount > 0;
}

function sendToMerchantDevice(transaction) {
  const merchantDevices = simulationState.merchantDevices.get(transaction.merchantId);
  if (!merchantDevices || merchantDevices.size === 0) {
    console.log(`📱 No devices for ${transaction.merchantId}`);
    return false;
  }

  // Format receipt untuk printer
  const receipt = `
================================
        PAYMENT SUCCESS
================================
Merchant: ${transaction.merchantName}
Transaction ID: ${transaction.id}
Time: ${new Date(transaction.transactionTime).toLocaleTimeString()}
--------------------------------
Amount: Rp ${transaction.amount.toLocaleString()}
Bank: ${transaction.bankName}
Payment: QRIS
--------------------------------
Auth Code: ${transaction.authorizationCode}
RRN: ${transaction.rrn}
STAN: ${transaction.stan}
Customer: ${transaction.customerName}
Location: ${transaction.city}
================================
        THANK YOU
================================
`;

  const deviceMessage = {
    type: 'PAYMENT_SUCCESS',
    command: 'PRINT_RECEIPT',
    receipt: receipt,
    transaction: {
      id: transaction.id,
      amount: transaction.amount,
      status: transaction.status,
      authCode: transaction.authorizationCode,
      rrn: transaction.rrn,
      stan: transaction.stan,
      time: transaction.transactionTime,
      merchantName: transaction.merchantName,
      bankName: transaction.bankName,
      customerName: transaction.customerName
    },
    timestamp: new Date().toISOString(),
    printImmediately: true
  };

  let sentCount = 0;
  merchantDevices.forEach((deviceSocket, deviceId) => {
    if (deviceSocket.readyState === 1) {
      safeSend(deviceSocket, deviceMessage);
      sentCount++;
      console.log(`🖨️  Receipt sent to ${deviceId}`);
    }
  });

  return sentCount > 0;
}

// ========== BANK CALLBACK ENDPOINT ==========
app.post("/api/bank/callback", (req, res) => {
  console.log("🏦 BANK CALLBACK from:", req.headers['x-bank-code'] || 'Unknown');
  
  const bankCode = req.headers['x-bank-code'] || 'BCA';
  const bankData = req.body;
  
  // Parse QRIS dari payload jika ada
  let qrisData = { merchantId: bankData.merchantId };
  if (bankData.qrisString) {
    qrisData = parseQRISString(bankData.qrisString);
  }
  
  const statusInfo = mapResponseCodeToStatus(bankData.responseCode || '00');
  
  const transaction = {
    id: bankData.transactionId || `BANK-${Date.now()}`,
    merchantId: qrisData.merchantId || bankData.merchantId || 'MER001',
    merchantName: qrisData.merchantName || bankData.merchantName || 'QRIS Merchant',
    amount: parseFloat(bankData.amount || bankData.transactionAmount || 0),
    status: statusInfo.status,
    responseCode: bankData.responseCode || '00',
    responseMessage: statusInfo.message,
    authorizationCode: bankData.authorizationCode || `AUTH${Date.now().toString().slice(-8)}`,
    rrn: bankData.rrn || `RRN${Date.now().toString().slice(-12)}`,
    stan: bankData.stan || Math.floor(100000 + Math.random() * 900000).toString(),
    bankCode: bankCode,
    bankName: config.banks[bankCode]?.name || bankCode,
    customerName: bankData.customerName || 'QRIS Customer',
    customerAccount: bankData.customerAccount || 'QRIS-ACCOUNT',
    transactionTime: bankData.transactionTime || new Date().toISOString(),
    source: 'BANK_CALLBACK',
    receivedAt: new Date().toISOString(),
    city: qrisData.city || bankData.city || 'Unknown',
    qrisParsed: qrisData
  };
  
  console.log(`✅ Bank callback processed: ${transaction.id}`);
  console.log(`   Merchant: ${transaction.merchantName}`);
  console.log(`   Amount: Rp ${transaction.amount.toLocaleString()}`);
  console.log(`   Status: ${transaction.status}`);
  
  // Simpan transaksi
  if (transaction.status === 'APPROVED') {
    simulationState.approvedTransactions.set(transaction.id, transaction);
    
    // Kirim notifikasi ke merchant
    notifyMerchant(transaction);
    
    // Auto settlement setelah 2 detik
    setTimeout(() => completeSettlement(transaction.id), 2000);
    
  } else {
    simulationState.declinedTransactions.set(transaction.id, transaction);
    console.log(`❌ Payment declined: ${transaction.responseMessage}`);
  }
  
  res.json({
    success: true,
    message: "Bank callback processed",
    transactionId: transaction.id,
    status: transaction.status,
    merchantNotified: transaction.status === 'APPROVED',
    processedAt: new Date().toISOString()
  });
});

// ========== BCA CALLBACK SIMULATION ==========
app.post("/api/test/bca-callback", (req, res) => {
  const { qrisString, amount, merchantName } = req.body;
  
  // Contoh QRIS dari Shopee
  const sampleQRIS = '00020101021226610016ID.CO.SHOPEE.WWW01189360091800215732120208215732120303UBE51440014ID.CO.QRIS.WWW0215ID20254448023210303UBE52045965530336054102450544.005802ID5916Shopee Indonesia6015KOTA JAKARTA SE610512950622205181170027479979648756304111C';
  
  // Parse QRIS string
  const qrisData = parseQRISString(qrisString || sampleQRIS);
  
  // Simulasi callback dari BCA
  const bcaCallback = {
    transactionId: `BCA-${Date.now()}`,
    merchantId: qrisData.merchantId,
    merchantName: merchantName || qrisData.merchantName || 'Toko QRIS',
    amount: amount || qrisData.amount || 2450544,
    responseCode: '00',
    authorizationCode: `BCA${Date.now().toString().slice(-10)}`,
    rrn: `RRN${Date.now().toString().slice(-12)}`,
    stan: Math.floor(100000 + Math.random() * 900000).toString(),
    bankName: 'Bank Central Asia (BCA)',
    customerName: 'Budi Santoso',
    customerAccount: '888801234567890',
    transactionTime: new Date().toISOString(),
    city: qrisData.city || 'JAKARTA',
    qrisString: qrisString || sampleQRIS
  };
  
  console.log('🏦 Simulating BCA callback...');
  console.log('   Amount:', `Rp ${bcaCallback.amount.toLocaleString()}`);
  console.log('   Merchant:', bcaCallback.merchantName);
  
  // Kirim callback ke endpoint bank (simulasi internal)
  setTimeout(() => {
    const transaction = {
      id: bcaCallback.transactionId,
      merchantId: bcaCallback.merchantId,
      merchantName: bcaCallback.merchantName,
      amount: bcaCallback.amount,
      status: 'APPROVED',
      responseCode: '00',
      responseMessage: 'APPROVED',
      authorizationCode: bcaCallback.authorizationCode,
      rrn: bcaCallback.rrn,
      stan: bcaCallback.stan,
      bankCode: 'BCA',
      bankName: bcaCallback.bankName,
      customerName: bcaCallback.customerName,
      customerAccount: bcaCallback.customerAccount,
      transactionTime: bcaCallback.transactionTime,
      source: 'BCA_SIMULATION',
      receivedAt: new Date().toISOString(),
      city: bcaCallback.city
    };
    
    simulationState.approvedTransactions.set(transaction.id, transaction);
    notifyMerchant(transaction);
    setTimeout(() => completeSettlement(transaction.id), 2000);
    
    console.log('✅ BCA simulation completed');
  }, 500);
  
  res.json({
    success: true,
    message: "BCA callback simulation started",
    transactionId: bcaCallback.transactionId,
    merchant: bcaCallback.merchantName,
    amount: `Rp ${bcaCallback.amount.toLocaleString()}`,
    note: "Merchant will receive notification in 0.5 seconds"
  });
});

// ========== SETTLEMENT FUNCTION ==========
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
  const notification = {
    type: 'SETTLEMENT_COMPLETED',
    title: '💰 Funds Settled',
    message: `Rp ${transaction.amount.toLocaleString()} telah ditransfer ke rekening Anda`,
    transaction: transaction,
    timestamp: new Date().toISOString()
  };
  
  simulationState.activeConnections.forEach(client => {
    if (client.connectionType === 'DASHBOARD' && 
        client.merchantId === transaction.merchantId && 
        client.readyState === 1) {
      safeSend(client, notification);
    }
  });
}

// ========== ANALYTICS ENDPOINTS ==========
app.get("/api/analytics/stats", (req, res) => {
  res.json({
    success: true,
    timestamp: new Date().toISOString(),
    ...merchantTracker.getSummary(),
    connections: simulationState.activeConnections.size,
    transactions: {
      pending: simulationState.pendingTransactions.size,
      approved: simulationState.approvedTransactions.size,
      declined: simulationState.declinedTransactions.size,
      settled: simulationState.settledTransactions.size
    }
  });
});

app.get("/api/analytics/merchant/:merchantId", (req, res) => {
  const { merchantId } = req.params;
  
  const merchantStats = merchantTracker.data.merchants[merchantId] || { delivered: 0, failed: 0 };
  const total = merchantStats.delivered + merchantStats.failed;
  
  res.json({
    merchantId,
    successRate: total > 0 ? (merchantStats.delivered / total * 100).toFixed(1) : 0,
    totalNotifications: total,
    delivered: merchantStats.delivered,
    failed: merchantStats.failed,
    connections: Array.from(simulationState.activeConnections.values())
      .filter(c => c.merchantId === merchantId).length,
    devices: simulationState.merchantDevices.get(merchantId)?.size || 0,
    timestamp: new Date().toISOString()
  });
});

// ========== TRANSACTIONS ENDPOINT ==========
app.get("/api/transactions/:merchantId", (req, res) => {
  const { merchantId } = req.params;
  
  const allTransactions = [
    ...Array.from(simulationState.approvedTransactions.values()),
    ...Array.from(simulationState.declinedTransactions.values()),
    ...Array.from(simulationState.settledTransactions.values())
  ];
  
  const merchantTransactions = allTransactions
    .filter(tx => tx.merchantId === merchantId)
    .sort((a, b) => new Date(b.transactionTime) - new Date(a.transactionTime));
  
  res.json({
    merchantId,
    count: merchantTransactions.length,
    transactions: merchantTransactions,
    summary: {
      approved: merchantTransactions.filter(tx => tx.status === 'APPROVED').length,
      declined: merchantTransactions.filter(tx => tx.status === 'DECLINED').length,
      settled: merchantTransactions.filter(tx => tx.settlementStatus === 'COMPLETED').length,
      totalAmount: merchantTransactions
        .filter(tx => tx.status === 'APPROVED')
        .reduce((sum, tx) => sum + tx.amount, 0)
    },
    timestamp: new Date().toISOString()
  });
});

// ========== ROOT ENDPOINT ==========
app.get("/", (req, res) => {
  res.json({
    service: "QRIS Payment Gateway v6.0",
    version: "6.0.0",
    status: "running",
    focus: "Merchant Notification System",
    features: [
      "QRIS String Parser",
      "Bank Callback Handler (BCA, BRI, Mandiri, BNI)",
      "Real-time Merchant Dashboard Notifications",
      "Printer/EDC Receipt Printing",
      "Success Rate Tracking (SheerID Style)",
      "Exponential Backoff Retry",
      "WebSocket Heartbeat System"
    ],
    connections: simulationState.activeConnections.size,
    stats: merchantTracker.getSummary(),
    endpoints: {
      bank_callback: "POST /api/bank/callback (Header: x-bank-code)",
      bca_simulation: "POST /api/test/bca-callback",
      analytics_stats: "GET /api/analytics/stats",
      merchant_stats: "GET /api/analytics/merchant/:merchantId",
      transactions: "GET /api/transactions/:merchantId",
      websocket: "GET /ws?merchantId=YOUR_ID&deviceId=DEVICE_ID (optional)"
    },
    documentation: {
      dashboard_ws: `wss://${req.headers.host}/ws?merchantId=YOUR_ID`,
      device_ws: `wss://${req.headers.host}/ws?merchantId=YOUR_ID&deviceId=PRINTER01`,
      bank_callback_format: {
        headers: { "x-bank-code": "BCA" },
        body: { 
          "transactionId": "TXN123456789", 
          "amount": 100000, 
          "responseCode": "00",
          "merchantId": "MER001",
          "merchantName": "Merchant Name",
          "authorizationCode": "AUTH123456",
          "rrn": "RRN987654321",
          "stan": "123456",
          "customerName": "John Doe",
          "customerAccount": "1234567890",
          "transactionTime": "2024-01-07T10:30:00Z",
          "city": "JAKARTA",
          "qrisString": "00020101021226610016ID.CO.SHOPEE.WWW01189360091800215732120208215732120303UBE51440014ID.CO.QRIS.WWW0215ID20254448023210303UBE52045965530336054102450544.005802ID5916Shopee Indonesia6015KOTA JAKARTA SE610512950622205181170027479979648756304111C"
        }
      }
    },
    timestamp: new Date().toISOString()
  });
});

// ========== START SERVER ==========
server.listen(PORT, '0.0.0.0', () => {
  console.log('='.repeat(70));
  console.log('🚀 QRIS PAYMENT GATEWAY v6.0 - MERCHANT NOTIFICATION FOCUS');
  console.log('='.repeat(70));
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌐 HTTP Server: http://0.0.0.0:${PORT}`);
  console.log(`📊 Dashboard WS: ws://0.0.0.0:${PORT}/ws?merchantId=YOUR_ID`);
  console.log(`🖨️  Device WS: ws://0.0.0.0:${PORT}/ws?merchantId=YOUR_ID&deviceId=PRINTER01`);
  console.log(`📈 Notification Tracking: Enabled (SheerID Style)`);
  console.log('='.repeat(70));
  console.log('🎯 CORE FEATURES:');
  console.log('  • QRIS String Parser');
  console.log('  • Bank Callback Handler (BCA, BRI, Mandiri, BNI)');
  console.log('  • Real-time Dashboard Notifications');
  console.log('  • Automatic Receipt Printing');
  console.log('  • Success Rate Analytics');
  console.log('  • Exponential Backoff Retry');
  console.log('='.repeat(70));
  console.log('📡 Test Commands:');
  console.log(`  curl -X POST http://localhost:${PORT}/api/test/bca-callback`);
  console.log(`  curl -X GET http://localhost:${PORT}/api/analytics/stats`);
  console.log(`  wscat -c "ws://localhost:${PORT}/ws?merchantId=MER001"`);
  console.log('='.repeat(70));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Graceful shutdown initiated...');
  
  simulationState.activeConnections.forEach(ws => {
    safeSend(ws, {
      type: 'SERVER_SHUTDOWN',
      message: 'Server maintenance',
      timestamp: new Date().toISOString()
    });
    ws.close();
  });
  
  merchantTracker.saveData();
  
  wss.close(() => {
    console.log('✅ WebSocket server closed');
  });
  
  server.close(() => {
    console.log('✅ HTTP server stopped');
    process.exit(0);
  });
});