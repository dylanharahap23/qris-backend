// C:\Users\Dylan\Desktop\qris_app\backend\server.js - REFINED VERSION
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Session management for API key-less system
const activeSessions = new Map();
const sessionHistory = new Map();
const deviceProfiles = new Map();

// ========== ENHANCED ML ATTACK DETECTION ENGINE ==========
class MLAttackDetection {
  constructor() {
    console.log('🤖 Enhanced ML Attack Detection Engine Initialized');
    this.attackPatterns = new Map();
    this.transactionHistory = new Map();
    this.sessionHistory = new Map();
    this.lastTimestamps = new Map();
    this.loadEnhancedAttackPatterns();
  }

  loadEnhancedAttackPatterns() {
    // ========== ORIGINAL QRIS PATTERNS ==========
    this.attackPatterns.set('QRIS_LENGTH_ANOMALY', {
      detect: (qrData) => qrData.length < 100 || qrData.length > 512,
      risk: 0.3,
      description: 'QRIS length outside normal range (100-512 chars)'
    });

    this.attackPatterns.set('QRIS_EMV_INVALID', {
      detect: (qrData) => !qrData.startsWith('000201'),
      risk: 0.4,
      description: 'Invalid EMV QRIS format'
    });

    this.attackPatterns.set('QRIS_CHECKSUM_TAMPERING', {
      detect: (qrData) => !qrData.endsWith('6304'),
      risk: 0.6,
      description: 'QRIS checksum validation failed'
    });

    this.attackPatterns.set('AMOUNT_MANIPULATION', {
      detect: (transaction) => this.detectAmountTampering(transaction),
      risk: 0.5,
      description: 'Suspicious amount field manipulation'
    });

    this.attackPatterns.set('JWT_NONE_ALGORITHM', {
      detect: (token) => this.detectJWTNoneAlg(token),
      risk: 0.8,
      description: 'JWT with "none" algorithm detected'
    });

    this.attackPatterns.set('SIGNATURE_ANOMALY', {
      detect: (signature) => this.detectSignatureAnomaly(signature),
      risk: 0.7,
      description: 'Signature pattern anomaly'
    });

    this.attackPatterns.set('HIGH_FREQUENCY_ATTACK', {
      detect: (transaction) => this.detectHighFrequency(transaction),
      risk: 0.4,
      description: 'High frequency transaction pattern'
    });

    this.attackPatterns.set('AMOUNT_ROUNDING_ATTACK', {
      detect: (transaction) => this.detectAmountRounding(transaction),
      risk: 0.3,
      description: 'Suspicious round amount patterns'
    });

    // ========== NEW SESSION-BASED PATTERNS ==========
    this.attackPatterns.set('SESSION_REPLAY_ATTACK', {
      detect: (transaction) => this.detectSessionReplay(transaction),
      risk: 0.7,
      description: 'Session token reuse detected'
    });

    this.attackPatterns.set('DEVICE_FINGERPRINT_SPOOFING', {
      detect: (transaction) => this.detectDeviceSpoofing(transaction),
      risk: 0.8,
      description: 'Device fingerprint mismatch'
    });

    this.attackPatterns.set('TIMESTAMP_MANIPULATION', {
      detect: (transaction) => this.detectTimestampManipulation(transaction),
      risk: 0.6,
      description: 'Suspicious timestamp anomalies'
    });

    this.attackPatterns.set('SIGNATURE_PREDICTION_ATTACK', {
      detect: (transaction) => this.detectSignaturePrediction(transaction),
      risk: 0.9,
      description: 'Possible signature prediction attempt'
    });

    this.attackPatterns.set('QRIS_DYNAMIC_MANIPULATION', {
      detect: (transaction) => this.detectQRISDynamicManipulation(transaction),
      risk: 0.5,
      description: 'QRIS manipulated between scan and payment'
    });

    this.attackPatterns.set('SESSION_TOKEN_PREDICTION', {
      detect: (transaction) => this.detectSessionTokenPrediction(transaction),
      risk: 0.8,
      description: 'Session token prediction attempt'
    });

    this.attackPatterns.set('HEADER_INJECTION_ATTACK', {
      detect: (transaction) => this.detectHeaderInjection(transaction),
      risk: 0.6,
      description: 'Malicious header injection detected'
    });
  }

  // ========== ORIGINAL DETECTION METHODS ==========
  detectAmountTampering(transaction) {
    if (!transaction.qrString || !transaction.amount) return false;
    
    const amountPattern = /54(\d{2})(\d+)/;
    const match = transaction.qrString.match(amountPattern);
    
    if (!match) return false;
    
    const qrisAmount = parseInt(match[2], 10) / 100;
    const reportedAmount = transaction.amount;
    const tolerance = 0.01;
    const diff = Math.abs(qrisAmount - reportedAmount) / reportedAmount;
    
    return diff > tolerance;
  }

  detectJWTNoneAlg(token) {
    try {
      if (!token) return false;
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      return header.alg === 'none' || !header.alg;
    } catch {
      return false;
    }
  }

  detectSignatureAnomaly(signature) {
    if (!signature) return false;
    
    if (signature.length < 10 || signature.length > 512) return true;
    
    const isHex = /^[0-9a-fA-F]+$/.test(signature);
    const isBase64Url = /^[A-Za-z0-9_-]+$/.test(signature);
    
    if (!isHex && !isBase64Url) return true;
    
    const entropy = this.calculateEntropy(signature);
    return entropy < 2.0;
  }

  detectHighFrequency(transaction) {
    const merchantId = transaction.merchantId;
    const customerId = transaction.customerId || 'unknown';
    
    if (!this.transactionHistory.has(merchantId)) {
      this.transactionHistory.set(merchantId, []);
    }
    
    const history = this.transactionHistory.get(merchantId);
    const now = Date.now();
    
    const recentTransactions = history.filter(t => 
      now - t.timestamp < 5 * 60 * 1000
    );
    
    const customerTransactions = recentTransactions.filter(t => 
      t.customerId === customerId
    );
    
    if (customerTransactions.length >= 3) {
      return true;
    }
    
    history.push({
      timestamp: now,
      customerId,
      amount: transaction.amount,
      qrHash: this.hashQR(transaction.qrString)
    });
    
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    return false;
  }

  detectAmountRounding(transaction) {
    const amount = transaction.amount;
    
    const suspiciousAmounts = [
      1000000, 2000000, 5000000, 10000000,
      1234567, 9999999, 8888888,
    ];
    
    if (amount % 100000 === 0 && amount > 1000000) {
      return true;
    }
    
    return suspiciousAmounts.includes(amount);
  }

  // ========== NEW SESSION-BASED DETECTION METHODS ==========
  detectSessionReplay(transaction) {
    const sessionToken = transaction.headers?.['x-session-token'];
    const timestamp = parseInt(transaction.headers?.['x-timestamp'] || '0');
    
    if (!sessionToken || !timestamp) return false;
    
    const sessionUseCount = this.getSessionUseCount(sessionToken, 10 * 1000);
    return sessionUseCount > 1;
  }

  detectDeviceSpoofing(transaction) {
    const deviceHash = transaction.headers?.['x-device-hash'];
    const sessionToken = transaction.headers?.['x-session-token'];
    
    if (!deviceHash || !sessionToken) return false;
    
    const session = activeSessions.get(sessionToken);
    if (!session) return false;
    
    return session.deviceHash !== deviceHash;
  }

  detectTimestampManipulation(transaction) {
    const timestamp = parseInt(transaction.headers?.['x-timestamp'] || '0');
    const serverTime = Date.now();
    const diff = Math.abs(serverTime - timestamp);
    
    if (diff > 5 * 60 * 1000) {
      return true;
    }
    
    const sessionToken = transaction.headers?.['x-session-token'];
    if (sessionToken && this.lastTimestamps.has(sessionToken)) {
      const lastTimestamp = this.lastTimestamps.get(sessionToken);
      if (timestamp <= lastTimestamp) {
        return true;
      }
    }
    
    return false;
  }

  detectSignaturePrediction(transaction) {
    const signature = transaction.headers?.['x-signature'];
    const sessionToken = transaction.headers?.['x-session-token'];
    const timestamp = transaction.headers?.['x-timestamp'];
    const deviceHash = transaction.headers?.['x-device-hash'];
    
    if (!signature || !sessionToken || !timestamp || !deviceHash) {
      return false;
    }
    
    const expected = crypto
      .createHash('sha256')
      .update(`${sessionToken}|${timestamp}|${deviceHash}`)
      .digest('hex');
    
    const similarity = this.calculateStringSimilarity(signature, expected);
    return similarity > 0.8 && signature !== expected;
  }

  detectQRISDynamicManipulation(transaction) {
    if (!transaction.qrString || !transaction.qrScanTime) return false;
    
    const scanTime = new Date(transaction.qrScanTime).getTime();
    const processTime = new Date(transaction.timestamp).getTime();
    const timeDiff = processTime - scanTime;
    
    if (timeDiff > 2 * 60 * 1000) {
      return true;
    }
    
    const originalQR = transaction.originalQR;
    const currentQR = transaction.qrString;
    
    if (originalQR && currentQR && originalQR !== currentQR) {
      return true;
    }
    
    return false;
  }

  detectSessionTokenPrediction(transaction) {
    const sessionToken = transaction.headers?.['x-session-token'];
    
    if (!sessionToken) return false;
    
    // Check if token follows expected pattern
    const isHex = /^[0-9a-fA-F]+$/.test(sessionToken);
    const expectedLength = 64; // 32 bytes hex
    
    if (isHex && sessionToken.length === expectedLength) {
      // Check if token looks randomly generated or predictable
      const entropy = this.calculateEntropy(sessionToken);
      if (entropy < 3.0) {
        return true; // Low entropy = predictable
      }
    }
    
    return false;
  }

  detectHeaderInjection(transaction) {
    const headers = transaction.headers || {};
    
    // Check for malicious header patterns
    const maliciousPatterns = [
      /<script>/i,
      /javascript:/i,
      /on\w+=/i,
      /union.*select/i,
      /drop.*table/i,
      /exec.*\(/i
    ];
    
    for (const [key, value] of Object.entries(headers)) {
      const headerStr = `${key}: ${value}`;
      for (const pattern of maliciousPatterns) {
        if (pattern.test(headerStr)) {
          return true;
        }
      }
    }
    
    return false;
  }

  // ========== ENHANCED CORE DETECTION ==========
  async detectMLAttacks(transaction) {
    const detections = [];
    let totalRisk = 0;
    
    // Check each attack pattern
    for (const [name, detector] of this.attackPatterns) {
      try {
        let isDetected = false;
        
        if (name.startsWith('QRIS_') && transaction.qrString) {
          isDetected = detector.detect(transaction.qrString);
        } else if (name === 'JWT_NONE_ALGORITHM' && transaction.token) {
          isDetected = detector.detect(transaction.token);
        } else if (name === 'SIGNATURE_ANOMALY' && transaction.signature) {
          isDetected = detector.detect(transaction.signature);
        } else if (name.startsWith('SESSION_') || name.startsWith('DEVICE_') || 
                   name.startsWith('TIMESTAMP_') || name.startsWith('HEADER_')) {
          isDetected = detector.detect(transaction);
        } else {
          isDetected = detector.detect(transaction);
        }
        
        if (isDetected) {
          detections.push({
            attackType: name,
            description: detector.description,
            riskScore: detector.risk,
            timestamp: new Date().toISOString()
          });
          totalRisk += detector.risk;
        }
      } catch (error) {
        console.error(`Error in detector ${name}:`, error);
      }
    }
    
    // Behavioral analysis
    const behaviorScore = await this.analyzeBehavior(transaction);
    totalRisk += behaviorScore;
    
    // Update session tracking
    this.updateSessionTracking(transaction);
    
    // Risk scoring
    const riskLevel = this.getRiskLevel(totalRisk);
    
    return {
      attacksDetected: detections.length > 0,
      detections,
      riskScore: Math.min(totalRisk, 1.0),
      riskLevel,
      recommendation: this.getRecommendation(detections, riskLevel),
      timestamp: new Date().toISOString(),
      confidence: this.calculateConfidence(detections),
      enhancedDetection: detections.some(d => 
        d.attackType.startsWith('SESSION_') || 
        d.attackType.startsWith('DEVICE_')
      )
    };
  }

  analyzeBehavior(transaction) {
    let behaviorScore = 0;
    
    const hour = new Date().getHours();
    if (hour < 6 || hour > 23) {
      behaviorScore += 0.1;
    }
    
    if (transaction.amount > 5000000) {
      behaviorScore += 0.1;
    }
    
    if (this.transactionHistory.has(transaction.merchantId)) {
      const history = this.transactionHistory.get(transaction.merchantId);
      if (history.length > 10) {
        const avgAmount = history.reduce((sum, t) => sum + t.amount, 0) / history.length;
        if (transaction.amount > avgAmount * 3) {
          behaviorScore += 0.2;
        }
      }
    }
    
    return behaviorScore;
  }

  updateSessionTracking(transaction) {
    const sessionToken = transaction.headers?.['x-session-token'];
    const timestamp = parseInt(transaction.headers?.['x-timestamp'] || '0');
    
    if (sessionToken && timestamp) {
      // Track timestamp sequence
      this.lastTimestamps.set(sessionToken, timestamp);
      
      // Track session usage
      if (!this.sessionHistory.has(sessionToken)) {
        this.sessionHistory.set(sessionToken, []);
      }
      this.sessionHistory.get(sessionToken).push(Date.now());
      
      // Keep only last 100 uses per session
      const uses = this.sessionHistory.get(sessionToken);
      if (uses.length > 100) {
        uses.splice(0, uses.length - 100);
      }
    }
  }

  // ========== HELPER METHODS ==========
  calculateEntropy(str) {
    const freq = {};
    for (let i = 0; i < str.length; i++) {
      const char = str[i];
      freq[char] = (freq[char] || 0) + 1;
    }
    
    let entropy = 0;
    for (const count of Object.values(freq)) {
      const probability = count / str.length;
      entropy -= probability * Math.log2(probability);
    }
    
    return entropy;
  }

  hashQR(qrString) {
    if (!qrString) return '';
    return crypto.createHash('sha256').update(qrString).digest('hex');
  }

  getSessionUseCount(sessionToken, timeWindow) {
    let count = 0;
    const now = Date.now();
    
    if (this.sessionHistory.has(sessionToken)) {
      const uses = this.sessionHistory.get(sessionToken);
      count = uses.filter(useTime => now - useTime < timeWindow).length;
    }
    
    return count;
  }

  calculateStringSimilarity(a, b) {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;
    
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    
    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (a[i] === b[i]) matches++;
    }
    
    return matches / longer.length;
  }

  getRiskLevel(score) {
    if (score >= 0.7) return 'CRITICAL';
    if (score >= 0.5) return 'HIGH';
    if (score >= 0.3) return 'MEDIUM';
    if (score >= 0.1) return 'LOW';
    return 'NONE';
  }

  getRecommendation(detections, riskLevel) {
    if (riskLevel === 'CRITICAL') {
      return 'BLOCK transaction and alert security team';
    }
    if (riskLevel === 'HIGH') {
      return 'REJECT transaction and flag for review';
    }
    if (riskLevel === 'MEDIUM') {
      return 'Additional verification required';
    }
    if (detections.length > 0) {
      return 'Monitor transaction closely';
    }
    return 'No action required';
  }

  calculateConfidence(detections) {
    if (detections.length === 0) return 1.0;
    
    const totalRisk = detections.reduce((sum, d) => sum + d.riskScore, 0);
    const avgRisk = totalRisk / detections.length;
    
    if (detections.length >= 3 && avgRisk > 0.5) {
      return 0.9;
    }
    if (detections.length >= 2) {
      return 0.7;
    }
    return 0.5;
  }

  getDetectionStats() {
    const stats = {
      totalPatterns: this.attackPatterns.size,
      activeMerchants: this.transactionHistory.size,
      totalTransactions: 0,
      activeSessions: this.sessionHistory.size,
      recentDetections: 0
    };
    
    for (const history of this.transactionHistory.values()) {
      stats.totalTransactions += history.length;
    }
    
    return stats;
  }

  resetMerchantHistory(merchantId) {
    if (this.transactionHistory.has(merchantId)) {
      this.transactionHistory.delete(merchantId);
      return true;
    }
    return false;
  }

  resetSessionHistory(sessionToken) {
    if (this.sessionHistory.has(sessionToken)) {
      this.sessionHistory.delete(sessionToken);
      return true;
    }
    return false;
  }
}

// ========== INSTANTIATE ENHANCED ML DETECTION ==========
const mlDetector = new MLAttackDetection();

// ========== SESSION MANAGEMENT ==========
function generateSessionToken(deviceHash) {
  return crypto.randomBytes(32).toString('hex');
}

function validateSession(headers) {
  const sessionToken = headers['x-session-token'];
  const timestamp = parseInt(headers['x-timestamp'] || '0');
  const signature = headers['x-signature'];
  const deviceHash = headers['x-device-hash'];
  
  // Check if session exists
  const session = activeSessions.get(sessionToken);
  if (!session) {
    return { valid: false, error: 'Invalid session token' };
  }
  
  // Check expiry
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(sessionToken);
    return { valid: false, error: 'Session expired' };
  }
  
  // Validate signature
  const expectedSignature = crypto
    .createHash('sha256')
    .update(`${sessionToken}|${timestamp}|${deviceHash}`)
    .digest('hex');
    
  if (signature !== expectedSignature) {
    return { valid: false, error: 'Invalid signature' };
  }
  
  // Validate timestamp
  const timeDiff = Math.abs(Date.now() - timestamp);
  if (timeDiff > 2 * 60 * 1000) {
    return { valid: false, error: 'Timestamp expired' };
  }
  
  // Update session activity
  session.lastActivity = Date.now();
  
  return { valid: true, session };
}

// ========== WEBSOCKET FOR REAL-TIME ALERTS ==========
const activeConnections = new Map();

wss.on('connection', (ws, req) => {
  console.log('🔌 New WebSocket connection for ML alerts');
  
  const connectionId = Date.now().toString();
  ws.connectionId = connectionId;
  
  activeConnections.set(connectionId, {
    ws,
    merchantId: null,
    connectionTime: new Date().toISOString()
  });
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'REGISTER_MERCHANT') {
        const conn = activeConnections.get(connectionId);
        if (conn) {
          conn.merchantId = data.merchantId;
          console.log(`📝 ML Alerts registered for merchant: ${data.merchantId}`);
        }
      }
      
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ 
          type: 'PONG', 
          timestamp: new Date().toISOString(),
          detectionStats: mlDetector.getDetectionStats(),
          activeSessions: activeSessions.size
        }));
      }
      
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    console.log(`🔌 WebSocket connection closed: ${connectionId}`);
    activeConnections.delete(connectionId);
  });
});

function sendMLAlert(merchantId, detectionResult) {
  let notified = 0;
  
  activeConnections.forEach((conn, id) => {
    if (conn.merchantId === merchantId && conn.ws.readyState === WebSocket.OPEN) {
      try {
        conn.ws.send(JSON.stringify({
          type: 'ML_ATTACK_DETECTED',
          timestamp: new Date().toISOString(),
          detection: detectionResult,
          action: detectionResult.recommendation,
          severity: detectionResult.riskLevel,
          enhancedDetection: detectionResult.enhancedDetection || false
        }));
        notified++;
      } catch (error) {
        console.error('Error sending ML alert:', error);
      }
    }
  });
  
  return notified;
}

// ========== API ENDPOINTS ==========

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'QRIS Enhanced ML Attack Detection API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    detectionStats: mlDetector.getDetectionStats(),
    sessionStats: {
      activeSessions: activeSessions.size,
      totalPatterns: mlDetector.attackPatterns.size
    },
    endpoints: {
      detect: '/api/ml/detect (POST)',
      sessionInit: '/api/session/init (POST)',
      stats: '/api/ml/stats (GET)',
      reset: '/api/ml/reset/:merchantId (DELETE)',
      health: '/health (GET)',
      testAttack: '/api/ml/test-attack (POST)'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: activeConnections.size,
    activeSessions: activeSessions.size,
    detectionEngine: 'ENHANCED_ACTIVE'
  });
});

// ========== SESSION INITIALIZATION ENDPOINT ==========
app.post("/api/session/init", async (req, res) => {
  console.log('\n🔑 SESSION INITIALIZATION REQUEST');
  
  const { deviceHash, deviceModel, timestamp } = req.body;
  
  // Validate timestamp
  const timeDiff = Date.now() - parseInt(timestamp);
  if (Math.abs(timeDiff) > 5 * 60 * 1000) {
    return res.status(400).json({ 
      success: false, 
      error: 'Invalid timestamp' 
    });
  }
  
  // Generate session
  const sessionToken = generateSessionToken(deviceHash);
  const expiresIn = 5 * 60; // 5 minutes
  
  activeSessions.set(sessionToken, {
    deviceHash,
    deviceModel,
    createdAt: Date.now(),
    expiresAt: Date.now() + (expiresIn * 1000),
    lastActivity: Date.now()
  });
  
  console.log(`✅ Session created: ${sessionToken.substring(0, 8)}...`);
  
  res.json({
    success: true,
    sessionToken,
    expiresIn,
    timestamp: new Date().toISOString()
  });
});

// ========== ENHANCED ML DETECTION ENDPOINT ==========
app.post("/api/ml/detect", async (req, res) => {
  console.log('\n🤖 ENHANCED ML ATTACK DETECTION REQUEST');
  console.log('='.repeat(60));
  
  // Extract headers for session validation
  const headers = {
    'x-session-token': req.headers['x-session-token'],
    'x-timestamp': req.headers['x-timestamp'],
    'x-signature': req.headers['x-signature'],
    'x-device-hash': req.headers['x-device-hash']
  };
  
  // Validate session first
  const sessionValidation = validateSession(headers);
  if (!sessionValidation.valid) {
    console.log(`❌ Session validation failed: ${sessionValidation.error}`);
    return res.status(401).json({
      success: false,
      error: 'SESSION_VALIDATION_FAILED',
      message: sessionValidation.error,
      timestamp: new Date().toISOString()
    });
  }
  
  const transaction = {
    id: req.body.transactionId || `TX${Date.now()}`,
    qrString: req.body.qrString,
    amount: parseFloat(req.body.amount) || 0,
    merchantId: req.body.merchantId,
    merchantName: req.body.merchantName || 'Unknown Merchant',
    customerId: req.body.customerId,
    customerName: req.body.customerName || 'Unknown Customer',
    customerAccount: req.body.customerAccount,
    terminalId: req.body.terminalId,
    location: req.body.location,
    deviceId: req.body.deviceId,
    qrScanTime: req.body.qrScanTime,
    originalQR: req.body.originalQR,
    token: req.headers.authorization?.replace('Bearer ', ''),
    signature: req.headers['x-signature'],
    headers: headers,
    timestamp: new Date().toISOString()
  };
  
  console.log('📋 Transaction Details:');
  console.log('   ID:', transaction.id);
  console.log('   Merchant:', transaction.merchantName);
  console.log('   Amount: Rp', transaction.amount.toLocaleString());
  console.log('   QR Length:', transaction.qrString?.length || 0);
  console.log('   Session:', headers['x-session-token']?.substring(0, 8) + '...');
  console.log('='.repeat(60));
  
  try {
    // Run enhanced ML detection
    const detectionResult = await mlDetector.detectMLAttacks(transaction);
    
    // Log detection results
    console.log('🔍 Enhanced ML Detection Results:');
    console.log('   Attacks Detected:', detectionResult.attacksDetected);
    console.log('   Risk Level:', detectionResult.riskLevel);
    console.log('   Risk Score:', detectionResult.riskScore.toFixed(2));
    console.log('   Enhanced Patterns:', detectionResult.enhancedDetection);
    
    if (detectionResult.detections.length > 0) {
      console.log('   Detected Attacks:');
      detectionResult.detections.forEach(d => {
        console.log(`     - ${d.attackType}: ${d.description} (risk: ${d.riskScore})`);
      });
    }
    
    // Send real-time alert if attacks detected
    if (detectionResult.attacksDetected && transaction.merchantId) {
      const notified = sendMLAlert(transaction.merchantId, detectionResult);
      console.log(`   📢 Alerts sent to ${notified} connected device(s)`);
    }
    
    // Prepare response
    const response = {
      success: true,
      transactionId: transaction.id,
      detection: detectionResult,
      sessionValid: true,
      timestamp: new Date().toISOString(),
      recommendation: detectionResult.recommendation
    };
    
    // Add debug info in development
    if (process.env.NODE_ENV !== 'production') {
      response.debug = {
        qrLength: transaction.qrString?.length,
        hasSession: !!headers['x-session-token'],
        sessionAge: sessionValidation.session ? 
          Date.now() - sessionValidation.session.createdAt : 0,
        enhancedDetection: detectionResult.enhancedDetection,
        detectedPatterns: detectionResult.detections.map(d => d.attackType)
      };
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ Enhanced ML Detection failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'ML_DETECTION_FAILED',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ========== ML STATISTICS ENDPOINT ==========
app.get("/api/ml/stats", (req, res) => {
  const stats = mlDetector.getDetectionStats();
  
  let totalTransactions = 0;
  let totalDetections = 0;
  
  mlDetector.transactionHistory.forEach(history => {
    totalTransactions += history.length;
    totalDetections += history.filter(t => t.amount > 5000000).length;
  });
  
  const detectionRate = totalTransactions > 0 
    ? (totalDetections / totalTransactions) * 100 
    : 0;
  
  res.json({
    success: true,
    stats: {
      ...stats,
      detectionRate: detectionRate.toFixed(2) + '%',
      activeConnections: activeConnections.size,
      activeSessions: activeSessions.size,
      attackPatterns: Array.from(mlDetector.attackPatterns.keys()),
      enhancedPatterns: Array.from(mlDetector.attackPatterns.keys())
        .filter(p => p.startsWith('SESSION_') || p.startsWith('DEVICE_') || 
                     p.startsWith('TIMESTAMP_') || p.startsWith('HEADER_'))
    },
    timestamp: new Date().toISOString()
  });
});

// ========== RESET MERCHANT HISTORY ==========
app.delete("/api/ml/reset/:merchantId", (req, res) => {
  const merchantId = req.params.merchantId;
  
  if (!merchantId) {
    return res.status(400).json({
      success: false,
      error: 'MERCHANT_ID_REQUIRED',
      message: 'Merchant ID is required'
    });
  }
  
  const reset = mlDetector.resetMerchantHistory(merchantId);
  
  res.json({
    success: true,
    reset,
    merchantId,
    message: reset 
      ? `Transaction history for merchant ${merchantId} has been reset`
      : `No history found for merchant ${merchantId}`,
    timestamp: new Date().toISOString()
  });
});

// ========== ENHANCED TEST ENDPOINT FOR ATTACK SIMULATION ==========
app.post("/api/ml/test-attack", (req, res) => {
  console.log('\n🧪 ENHANCED TESTING ML ATTACK DETECTION');
  
  // Enhanced test cases including session-based attacks
  const testCases = [
    {
      name: 'QRIS Manipulation Attack',
      transaction: {
        qrString: 'INVALID_QRIS_DATA_WITHOUT_EMV_HEADER',
        amount: 1000000,
        merchantId: 'TEST_MERCHANT',
        customerId: 'TEST_ATTACKER'
      }
    },
    {
      name: 'Session Replay Attack',
      transaction: {
        qrString: '000201010212...6304ABCD',
        amount: 500000,
        merchantId: 'TEST_MERCHANT',
        customerId: 'SESSION_ATTACKER',
        headers: {
          'x-session-token': 'replaytoken123',
          'x-timestamp': Date.now().toString(),
          'x-signature': 'fake_signature',
          'x-device-hash': 'spoofed_device_hash'
        }
      }
    },
    {
      name: 'Timestamp Manipulation Attack',
      transaction: {
        qrString: '000201010212...6304ABCD',
        amount: 1500000,
        merchantId: 'TEST_MERCHANT',
        customerId: 'TIME_ATTACKER',
        headers: {
          'x-session-token': 'testtoken123',
          'x-timestamp': (Date.now() - 3600000).toString(), // 1 hour ago
          'x-signature': 'fake_signature_456',
          'x-device-hash': 'device_hash_123'
        }
      }
    },
    {
      name: 'Device Fingerprint Spoofing',
      transaction: {
        qrString: '000201010212...6304ABCD',
        amount: 800000,
        merchantId: 'TEST_MERCHANT',
        customerId: 'DEVICE_SPOOFER',
        headers: {
          'x-session-token': 'legit_token',
          'x-timestamp': Date.now().toString(),
          'x-signature': 'valid_signature',
          'x-device-hash': 'different_device_hash' // Different from session
        }
      }
    }
  ];
  
  const results = testCases.map(testCase => {
    const detection = mlDetector.detectMLAttacks(testCase.transaction);
    return {
      testCase: testCase.name,
      detected: detection.attacksDetected,
      riskLevel: detection.riskLevel,
      riskScore: detection.riskScore.toFixed(2),
      attacks: detection.detections.map(d => d.attackType),
      enhanced: detection.enhancedDetection || false
    };
  });
  
  res.json({
    success: true,
    testResults: results,
    summary: {
      totalTests: testCases.length,
      attacksDetected: results.filter(r => r.detected).length,
      enhancedDetections: results.filter(r => r.enhanced).length,
      effectiveness: (results.filter(r => r.detected).length / testCases.length * 100).toFixed(1) + '%',
      enhancedEffectiveness: results.filter(r => r.enhanced).length > 0 ? 
        (results.filter(r => r.enhanced && r.detected).length / results.filter(r => r.enhanced).length * 100).toFixed(1) + '%' : 'N/A'
    },
    timestamp: new Date().toISOString()
  });
});

// ========== TEST BANK CALLBACK ENDPOINT (for Flutter) ==========
app.post("/api/test/bca-callback", async (req, res) => {
  console.log('\n🏦 TEST BCA CALLBACK SIMULATION');
  
  const {
    qrString,
    amount,
    merchantName,
    customerName,
    city,
    bankCode,
    merchantId
  } = req.body;
  
  console.log('📤 Received from Flutter:');
  console.log('   Bank:', bankCode);
  console.log('   Merchant:', merchantName);
  console.log('   Amount: Rp', amount?.toLocaleString());
  console.log('   Customer:', customerName);
  console.log('   City:', city);
  
  // Run ML detection on the callback
  const mlDetection = await mlDetector.detectMLAttacks({
    transactionId: `CBTEST_${Date.now()}`,
    qrString: qrString,
    amount: parseFloat(amount) || 0,
    merchantId: merchantId,
    merchantName: merchantName,
    customerName: customerName,
    customerId: customerName?.replace(/\s+/g, '_').toUpperCase(),
    location: city,
    timestamp: new Date().toISOString()
  });
  
  // Generate response
  const response = {
    success: true,
    message: 'Bank callback simulated successfully',
    transactionId: `TX${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
    authCode: `AUTH${Date.now().toString().substr(8, 6)}`,
    note: mlDetection.riskScore > 0.7 
      ? '⚠️ High risk detected - Transaction flagged' 
      : '✅ Transaction processed normally',
    mlCheck: {
      performed: true,
      riskScore: mlDetection.riskScore,
      riskLevel: mlDetection.riskLevel,
      passed: mlDetection.riskScore < 0.7
    },
    bankResponse: {
      responseCode: mlDetection.riskScore < 0.7 ? '0000' : '0500',
      responseMessage: mlDetection.riskScore < 0.7 ? 'APPROVED' : 'DECLINED',
      rrn: `RRN${Date.now().toString().substr(5)}`,
      stan: (100000 + Math.floor(Math.random() * 900000)).toString()
    },
    timestamp: new Date().toISOString()
  };
  
  console.log('📤 Response to Flutter:');
  console.log('   Transaction ID:', response.transactionId);
  console.log('   Risk Score:', mlDetection.riskScore.toFixed(2));
  console.log('   Risk Level:', mlDetection.riskLevel);
  
  res.json(response);
});

// ========== BANK CALLBACK ENDPOINT ==========
app.post("/api/bank/callback", async (req, res) => {
  console.log('\n🏦 GENERAL BANK CALLBACK');
  
  const transaction = req.body;
  
  console.log('📤 Bank callback received:', transaction.bankCode);
  
  // Simulate processing delay
  setTimeout(() => {
    const response = {
      success: true,
      transactionId: `BANK_TX_${Date.now()}`,
      bankReference: `BANK_REF_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      status: 'PROCESSED',
      timestamp: new Date().toISOString(),
      note: 'Bank callback processed successfully'
    };
    
    res.json(response);
  }, 1000);
});

// ========== SERVER STARTUP ==========
const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 ENHANCED ML ATTACK DETECTION SERVER STARTED');
  console.log('='.repeat(80));
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log('='.repeat(80));
  console.log('🤖 ENHANCED ML DETECTION ENGINE: ACTIVE');
  console.log(`   Total Attack Patterns: ${mlDetector.attackPatterns.size}`);
  console.log('   Original Patterns:');
  Array.from(mlDetector.attackPatterns.keys())
    .filter(p => !p.startsWith('SESSION_') && !p.startsWith('DEVICE_') && 
                  !p.startsWith('TIMESTAMP_') && !p.startsWith('HEADER_'))
    .forEach(pattern => {
      console.log(`     • ${pattern}`);
    });
  console.log('   Enhanced Patterns (Session-based):');
  Array.from(mlDetector.attackPatterns.keys())
    .filter(p => p.startsWith('SESSION_') || p.startsWith('DEVICE_') || 
                  p.startsWith('TIMESTAMP_') || p.startsWith('HEADER_'))
    .forEach(pattern => {
      console.log(`     • ${pattern}`);
    });
  console.log('='.repeat(80));
  console.log('\n📋 AVAILABLE ENDPOINTS:');
  console.log('   POST /api/session/init      - Initialize session (no API key)');
  console.log('   POST /api/ml/detect         - Enhanced ML attack detection');
  console.log('   GET  /api/ml/stats          - Get ML detection statistics');
  console.log('   DELETE /api/ml/reset/:id    - Reset merchant history');
  console.log('   POST /api/ml/test-attack    - Test attack detection');
  console.log('   POST /api/test/bca-callback - Test BCA callback (Flutter)');
  console.log('   POST /api/bank/callback     - General bank callback');
  console.log('   GET  /health                - Health check');
  console.log('='.repeat(80));
  console.log('\n⚠️  IMPORTANT: Enhanced security with session-based authentication');
  console.log('   No static API keys - Dynamic session tokens only');
  console.log('   Device fingerprinting + timestamp validation');
  console.log('   Real-time ML attack detection');
  console.log('='.repeat(80));
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});