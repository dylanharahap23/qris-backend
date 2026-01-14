// test-attack-patterns.js
const MLDetectionEngine = require('./ml_detection');

async function testAttackPatterns() {
  console.log('🎭 TESTING ATTACK PATTERNS DETECTION');
  console.log('='.repeat(70));
  
  const mlEngine = new MLDetectionEngine();
  
  const attacks = [
    {
      name: 'QRIS Length Anomaly',
      transaction: {
        qrString: 'SHORT',
        amount: 100000,
        merchantId: 'TEST',
        customerName: 'Test',
      },
      shouldDetect: true,
    },
    {
      name: 'QRIS EMV Format Violation',
      transaction: {
        qrString: 'INVALID_QR_FORMAT_123',
        amount: 50000,
        merchantId: 'TEST',
        customerName: 'Test',
      },
      shouldDetect: true,
    },
    {
      name: 'JWT None Algorithm',
      transaction: {
        qrString: '000201...6304ABCD',
        amount: 200000,
        merchantId: 'TEST',
        customerName: 'Test',
        token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.',
      },
      shouldDetect: true,
    },
    {
      name: 'Clean Transaction',
      transaction: {
        qrString: '00020101021226610016ID.CO.SHOPEE.WWW01189360091800215732120208215732120303UBE51440014ID.CO.QRIS.WWW0215ID20254448023210303UBE52045965530336054102450544.005802ID5916Shopee Indonesia6015KOTA JAKARTA SE610512950622205181359741107105676976304F77B',
        amount: 100000,
        merchantId: 'MER001',
        merchantName: 'Shopee',
        customerName: 'John Doe',
        timestamp: new Date().toISOString(),
      },
      shouldDetect: false,
    },
  ];
  
  let detected = 0;
  let total = attacks.length;
  
  for (const attack of attacks) {
    console.log(`\n🔍 ${attack.name}`);
    console.log(`   Amount: Rp ${attack.transaction.amount.toLocaleString()}`);
    
    const detection = await mlEngine.detectAttacks(attack.transaction);
    
    console.log(`   Detected: ${detection.detected ? '✅ YES' : '❌ NO'}`);
    console.log(`   Risk Level: ${detection.riskLevel}`);
    
    if (detection.detected) {
      console.log(`   Detected Attacks:`);
      detection.detections.forEach(d => {
        console.log(`     - ${d.name}: ${d.description}`);
      });
    }
    
    if ((attack.shouldDetect && detection.detected) || 
        (!attack.shouldDetect && !detection.detected)) {
      console.log('   ✅ PASS');
      detected++;
    } else {
      console.log('   ❌ FAIL');
    }
    
    console.log('   '.padEnd(50, '-'));
  }
  
  console.log('\n📊 SUMMARY');
  console.log('='.repeat(70));
  console.log(`   Total Patterns Tested: ${total}`);
  console.log(`   Correctly Detected: ${detected}`);
  console.log(`   Accuracy: ${((detected / total) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));
  
  // Show engine stats
  const stats = mlEngine.getDetectionStats();
  console.log('\n🤖 ML ENGINE STATS');
  console.log('='.repeat(70));
  console.log(`   Total Patterns: ${stats.totalPatterns}`);
  console.log(`   Active Merchants: ${stats.activeMerchants}`);
  console.log(`   Total Transactions: ${stats.totalTransactions}`);
  console.log('='.repeat(70));
}

if (require.main === module) {
  testAttackPatterns().catch(console.error);
}

module.exports = testAttackPatterns;