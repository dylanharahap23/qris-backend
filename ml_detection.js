// backend/ml_detection.js
const crypto = require('crypto');

class MLDetectionEngine {
  constructor() {
    console.log('🤖 ML Detection Engine Initialized');
    this.patternDatabase = new Map();
    this.loadKnownAttackPatterns();
  }
  
  loadKnownAttackPatterns() {
    // Load known attack patterns
    this.patternDatabase.set('qris_length_anomaly', {
      pattern: (data) => data.length < 100 || data.length > 512,
      weight: 0.3,
      description: 'QRIS length outside normal range'
    });
    
    this.patternDatabase.set('emv_format_violation', {
      pattern: (data) => !data.startsWith('000201'),
      weight: 0.4,
      description: 'Invalid EMV QRIS format'
    });
    
    this.patternDatabase.set('amount_manipulation', {
      pattern: (data) => this.detectAmountManipulation(data),
      weight: 0.5,
      description: 'Suspicious amount field manipulation'
    });
    
    this.patternDatabase.set('checksum_tampering', {
      pattern: (data) => !this.validateChecksum(data),
      weight: 0.6,
      description: 'Checksum validation failed'
    });
    
    this.patternDatabase.set('jwt_algorithm_none', {
      pattern: (token) => this.detectJWTNoneAlg(token),
      weight: 0.8,
      description: 'JWT with none algorithm detected'
    });
    
    this.patternDatabase.set('signature_anomaly', {
      pattern: (signature) => this.detectSignatureAnomaly(signature),
      weight: 0.7,
      description: 'Signature pattern anomaly'
    });
  }
  
  async detectAttacks(transaction) {
    const detections = [];
    let totalRisk = 0;
    
    // Check each pattern
    for (const [name, detector] of this.patternDatabase) {
      try {
        let isDetected = false;
        
        switch (name) {
          case 'qris_length_anomaly':
          case 'emv_format_violation':
          case 'amount_manipulation':
          case 'checksum_tampering':
            if (transaction.qrString) {
              isDetected = detector.pattern(transaction.qrString);
            }
            break;
            
          case 'jwt_algorithm_none':
            if (transaction.token) {
              isDetected = detector.pattern(transaction.token);
            }
            break;
            
          case 'signature_anomaly':
            if (transaction.signature) {
              isDetected = detector.pattern(transaction.signature);
            }
            break;
        }
        
        if (isDetected) {
          detections.push({
            name,
            description: detector.description,
            weight: detector.weight,
            timestamp: new Date().toISOString()
          });
          totalRisk += detector.weight;
        }
      } catch (error) {
        console.error(`Error in detector ${name}:`, error);
      }
    }
    
    // Behavioral analysis
    const behavioralScore = await this.analyzeBehavior(transaction);
    totalRisk += behavioralScore * 0.5;
    
    return {
      detected: detections.length > 0,
      detections,
      riskScore: Math.min(totalRisk, 1.0),
      riskLevel: this.getRiskLevel(totalRisk),
      recommendation: this.getRecommendation(detections),
      timestamp: new Date().toISOString()
    };
  }
  
  detectAmountManipulation(qrData) {
    // Extract amount field (tag 54)
    const amountPattern = /54(\d{2})(\d+)/;
    const match = qrData.match(amountPattern);
    
    if (!match) return false;
    
    const length = parseInt(match[1], 10);
    const amountStr = match[2];
    
    // Check if length matches actual amount length
    if (amountStr.length !== length) {
      return true;
    }
    
    // Check for round numbers (common in attacks)
    const amount = parseInt(amountStr, 10) / 100; // Convert to IDR
    return amount % 100000 === 0; // Suspicious if exactly 100k multiples
  }
  
  validateChecksum(qrData) {
    // Simplified checksum validation
    // In reality, use proper CRC16 validation
    return qrData.endsWith('6304') || qrData.includes('6304');
  }
  
  detectJWTNoneAlg(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      return header.alg === 'none' || !header.alg;
    } catch {
      return false;
    }
  }
  
  detectSignatureAnomaly(signature) {
    // Check signature length
    if (signature.length < 10 || signature.length > 512) {
      return true;
    }
    
    // Check if it's hex (should be for HS256)
    const isHex = /^[0-9a-fA-F]+$/.test(signature);
    const isBase64Url = /^[A-Za-z0-9_-]+$/.test(signature);
    
    // If neither hex nor base64url, suspicious
    if (!isHex && !isBase64Url) {
      return true;
    }
    
    // Check entropy (too low entropy = suspicious)
    const entropy = this.calculateEntropy(signature);
    return entropy < 2.0;
  }
  
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
  
  async analyzeBehavior(transaction) {
    // Analyze transaction behavior patterns
    const behaviors = [];
    
    // Check transaction frequency
    const frequencyScore = await this.checkTransactionFrequency(
      transaction.merchantId,
      transaction.customerId
    );
    if (frequencyScore > 0.7) {
      behaviors.push('High transaction frequency');
    }
    
    // Check time patterns
    const hour = new Date().getHours();
    if (hour < 6 || hour > 23) { // Outside normal business hours
      behaviors.push('Unusual transaction time');
    }
    
    // Check amount patterns
    if (transaction.amount > 5000000) { // Large transaction
      behaviors.push('Large transaction amount');
    }
    
    return behaviors.length > 0 ? 0.3 : 0;
  }
  
  async checkTransactionFrequency(merchantId, customerId) {
    // Simulate frequency check
    // In reality, query database
    return 0.2;
  }
  
  getRiskLevel(score) {
    if (score >= 0.7) return 'HIGH';
    if (score >= 0.4) return 'MEDIUM';
    return 'LOW';
  }
  
  getRecommendation(detections) {
    if (detections.some(d => d.weight >= 0.6)) {
      return 'REJECT transaction and flag for review';
    }
    if (detections.some(d => d.weight >= 0.4)) {
      return 'Additional verification required';
    }
    if (detections.length > 0) {
      return 'Monitor for further anomalies';
    }
    return 'No action required';
  }
}

module.exports = MLDetectionEngine;