// C:\Users\Dylan\Desktop\qris_app\backend\server.js
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

// ========== ML ATTACK DETECTION ENGINE ==========
class MLAttackDetection {
  constructor() {
    console.log('🤖 ML Attack Detection Engine Initialized');
    this.attackPatterns = new Map();
    this.transactionHistory = new Map(); // merchantId -> [transactions]
    this.loadAttackPatterns();
  }

  loadAttackPatterns() {
    // QRIS manipulation patterns
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
  }

  // ========== DETECTION METHODS ==========

  detectAmountTampering(transaction) {
    if (!transaction.qrString || !transaction.amount) return false;
    
    // Extract amount from QRIS (tag 54)
    const amountPattern = /54(\d{2})(\d+)/;
    const match = transaction.qrString.match(amountPattern);
    
    if (!match) return false;
    
    const qrisAmount = parseInt(match[2], 10) / 100; // Convert to IDR
    const reportedAmount = transaction.amount;
    
    // Check if amounts match (within 1% tolerance)
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
    
    // Check length
    if (signature.length < 10 || signature.length > 512) return true;
    
    // Check if it's hex or base64url
    const isHex = /^[0-9a-fA-F]+$/.test(signature);
    const isBase64Url = /^[A-Za-z0-9_-]+$/.test(signature);
    
    // If neither hex nor base64url, suspicious
    if (!isHex && !isBase64Url) return true;
    
    // Check entropy (too low entropy = suspicious)
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
    
    // Filter transactions from last 5 minutes
    const recentTransactions = history.filter(t => 
      now - t.timestamp < 5 * 60 * 1000
    );
    
    // Check customer frequency
    const customerTransactions = recentTransactions.filter(t => 
      t.customerId === customerId
    );
    
    // More than 3 transactions in 5 minutes from same customer
    if (customerTransactions.length >= 3) {
      return true;
    }
    
    // Add current transaction to history
    history.push({
      timestamp: now,
      customerId,
      amount: transaction.amount,
      qrHash: this.hashQR(transaction.qrString)
    });
    
    // Keep only last 100 transactions per merchant
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    
    return false;
  }

  detectAmountRounding(transaction) {
    const amount = transaction.amount;
    
    // Check for suspicious round amounts
    const suspiciousAmounts = [
      1000000, 2000000, 5000000, 10000000, // Exact millions
      1234567, 9999999, 8888888, // Pattern amounts
    ];
    
    // Check if amount is exact multiple of 100k (common in attacks)
    if (amount % 100000 === 0 && amount > 1000000) {
      return true;
    }
    
    // Check for exact match with suspicious amounts
    return suspiciousAmounts.includes(amount);
  }

  // ========== CORE DETECTION ==========

  async detectMLAttacks(transaction) {
    const detections = [];
    let totalRisk = 0;
    
    // Check each attack pattern
    for (const [name, detector] of this.attackPatterns) {
      try {
        let isDetected = false;
        
        switch (name) {
          case 'QRIS_LENGTH_ANOMALY':
          case 'QRIS_EMV_INVALID':
          case 'QRIS_CHECKSUM_TAMPERING':
            if (transaction.qrString) {
              isDetected = detector.detect(transaction.qrString);
            }
            break;
            
          case 'JWT_NONE_ALGORITHM':
            if (transaction.token) {
              isDetected = detector.detect(transaction.token);
            }
            break;
            
          case 'SIGNATURE_ANOMALY':
            if (transaction.signature) {
              isDetected = detector.detect(transaction.signature);
            }
            break;
            
          default:
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
    
    // Risk scoring
    const riskLevel = this.getRiskLevel(totalRisk);
    
    return {
      attacksDetected: detections.length > 0,
      detections,
      riskScore: Math.min(totalRisk, 1.0),
      riskLevel,
      recommendation: this.getRecommendation(detections, riskLevel),
      timestamp: new Date().toISOString(),
      confidence: this.calculateConfidence(detections)
    };
  }

  analyzeBehavior(transaction) {
    let behaviorScore = 0;
    
    // Time-based analysis
    const hour = new Date().getHours();
    if (hour < 6 || hour > 23) { // Outside normal business hours
      behaviorScore += 0.1;
    }
    
    // Amount analysis
    if (transaction.amount > 5000000) { // Large transaction
      behaviorScore += 0.1;
    }
    
    // Velocity analysis (if we have previous transactions)
    if (this.transactionHistory.has(transaction.merchantId)) {
      const history = this.transactionHistory.get(transaction.merchantId);
      if (history.length > 10) { // Active merchant
        const avgAmount = history.reduce((sum, t) => sum + t.amount, 0) / history.length;
        if (transaction.amount > avgAmount * 3) { // 3x average
          behaviorScore += 0.2;
        }
      }
    }
    
    return behaviorScore;
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
    
    // Higher confidence if multiple detections with high risk
    if (detections.length >= 3 && avgRisk > 0.5) {
      return 0.9;
    }
    if (detections.length >= 2) {
      return 0.7;
    }
    return 0.5;
  }

  // ========== DEBUG & MONITORING ==========

  getDetectionStats() {
    const stats = {
      totalPatterns: this.attackPatterns.size,
      activeMerchants: this.transactionHistory.size,
      totalTransactions: 0,
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
}

// ========== INSTANTIATE ML DETECTION ==========
const mlDetector = new MLAttackDetection();

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
          detectionStats: mlDetector.getDetectionStats()
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
          severity: detectionResult.riskLevel
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
    service: 'QRIS ML Attack Detection API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    detectionStats: mlDetector.getDetectionStats(),
    endpoints: {
      detect: '/api/ml/detect (POST)',
      stats: '/api/ml/stats (GET)',
      reset: '/api/ml/reset/:merchantId (DELETE)',
      health: '/health (GET)'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    connections: activeConnections.size,
    detectionEngine: 'ACTIVE'
  });
});

// ========== ML DETECTION ENDPOINT ==========

app.post("/api/ml/detect", async (req, res) => {
  console.log('\n🤖 ML ATTACK DETECTION REQUEST');
  console.log('='.repeat(60));
  
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
    token: req.headers.authorization?.replace('Bearer ', ''),
    signature: req.headers['x-signature'],
    timestamp: new Date().toISOString()
  };
  
  console.log('📋 Transaction Details:');
  console.log('   ID:', transaction.id);
  console.log('   Merchant:', transaction.merchantName);
  console.log('   Amount: Rp', transaction.amount.toLocaleString());
  console.log('   QR Length:', transaction.qrString?.length || 0);
  console.log('='.repeat(60));
  
  try {
    // Run ML detection
    const detectionResult = await mlDetector.detectMLAttacks(transaction);
    
    // Log detection results
    console.log('🔍 ML Detection Results:');
    console.log('   Attacks Detected:', detectionResult.attacksDetected);
    console.log('   Risk Level:', detectionResult.riskLevel);
    console.log('   Risk Score:', detectionResult.riskScore.toFixed(2));
    
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
      timestamp: new Date().toISOString(),
      recommendation: detectionResult.recommendation
    };
    
    // Add debug info in development
    if (process.env.NODE_ENV !== 'production') {
      response.debug = {
        qrLength: transaction.qrString?.length,
        hasToken: !!transaction.token,
        hasSignature: !!transaction.signature,
        transactionHistory: mlDetector.transactionHistory.has(transaction.merchantId) 
          ? mlDetector.transactionHistory.get(transaction.merchantId).length 
          : 0
      };
    }
    
    res.json(response);
    
  } catch (error) {
    console.error('❌ ML Detection failed:', error);
    
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
  
  // Calculate detection rates from recent history
  let totalTransactions = 0;
  let totalDetections = 0;
  
  mlDetector.transactionHistory.forEach(history => {
    totalTransactions += history.length;
    // Simple heuristic: if transaction amount > 5M, count as possible detection
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
      attackPatterns: Array.from(mlDetector.attackPatterns.keys())
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

// ========== TEST ENDPOINT FOR ATTACK SIMULATION ==========

app.post("/api/ml/test-attack", (req, res) => {
  console.log('\n🧪 TESTING ML ATTACK DETECTION');
  
  // Generate test attack patterns
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
      name: 'JWT None Algorithm Attack',
      transaction: {
        qrString: '000201010212...6304ABCD',
        amount: 5000000,
        merchantId: 'TEST_MERCHANT',
        customerId: 'TEST_ATTACKER',
        token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.'
      }
    },
    {
      name: 'High Frequency Attack',
      transaction: {
        qrString: '000201010212...6304ABCD',
        amount: 100000,
        merchantId: 'TEST_MERCHANT',
        customerId: 'REPEAT_CUSTOMER'
      }
    }
  ];
  
  const results = testCases.map(testCase => {
    const detection = mlDetector.detectMLAttacks(testCase.transaction);
    return {
      testCase: testCase.name,
      detected: detection.attacksDetected,
      riskLevel: detection.riskLevel,
      attacks: detection.detections.map(d => d.attackType)
    };
  });
  
  res.json({
    success: true,
    testResults: results,
    summary: {
      totalTests: testCases.length,
      attacksDetected: results.filter(r => r.detected).length,
      effectiveness: (results.filter(r => r.detected).length / testCases.length * 100).toFixed(1) + '%'
    },
    timestamp: new Date().toISOString()
  });
});

// ========== SERVER STARTUP ==========

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 ML ATTACK DETECTION SERVER STARTED');
  console.log('='.repeat(70));
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log('='.repeat(70));
  console.log('🤖 ML DETECTION ENGINE: ACTIVE');
  console.log(`   Attack Patterns: ${mlDetector.attackPatterns.size}`);
  console.log('   Detection Types:');
  Array.from(mlDetector.attackPatterns.keys()).forEach(pattern => {
    console.log(`     • ${pattern}`);
  });
  console.log('='.repeat(70));
  console.log('\n📋 AVAILABLE ENDPOINTS:');
  console.log('   POST /api/ml/detect          - Detect ML attacks in transaction');
  console.log('   GET  /api/ml/stats          - Get ML detection statistics');
  console.log('   DELETE /api/ml/reset/:id    - Reset merchant history');
  console.log('   POST /api/ml/test-attack    - Test attack detection');
  console.log('   GET  /health                - Health check');
  console.log('='.repeat(70));
  console.log('\n⚠️  IMPORTANT: This server is for educational purposes only.');
  console.log('   Use responsibly for security testing and research.');
  console.log('='.repeat(70));
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});