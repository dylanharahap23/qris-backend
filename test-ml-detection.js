// test-ml-detection.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const TEST_URL = 'http://localhost:10000';

async function testMLDetection() {
  console.log('🧪 TESTING ML ATTACK DETECTION SYSTEM');
  console.log('='.repeat(70));
  
  const testCases = [
    // Test 1: Clean transaction
    {
      name: 'Clean Transaction',
      payload: {
        qrString: '00020101021226610016ID.CO.SHOPEE.WWW01189360091800215732120208215732120303UBE51440014ID.CO.QRIS.WWW0215ID20254448023210303UBE52045965530336054102450544.005802ID5916Shopee Indonesia6015KOTA JAKARTA SE610512950622205181359741107105676976304F77B',
        amount: 100000,
        merchantId: 'MER001',
        merchantName: 'Shopee Indonesia',
        customerName: 'John Doe',
        customerId: 'CUST001',
        terminalId: 'TERM001',
        location: 'Jakarta',
        deviceId: 'DEVICE-001',
        timestamp: new Date().toISOString(),
      },
      expected: 'CLEAN'
    },
    
    // Test 2: QRIS Manipulation Attack
    {
      name: 'QRIS Manipulation Attack',
      payload: {
        qrString: 'INVALID_QRIS_DATA_WITHOUT_EMV_FORMAT',
        amount: 1000000,
        merchantId: 'TEST_MERCHANT',
        merchantName: 'Test Attacker',
        customerName: 'Attacker Name',
        timestamp: new Date().toISOString(),
      },
      expected: 'DETECTED'
    },
    
    // Test 3: JWT None Algorithm Attack
    {
      name: 'JWT None Algorithm Attack',
      payload: {
        qrString: '000201010212...6304ABCD',
        amount: 500000,
        merchantId: 'MER001',
        merchantName: 'Test Merchant',
        customerName: 'Test Customer',
        token: 'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.',
        timestamp: new Date().toISOString(),
      },
      expected: 'DETECTED'
    },
    
    // Test 4: High Frequency Attack
    {
      name: 'High Frequency Attack',
      payload: {
        qrString: '000201010212...6304ABCD',
        amount: 50000,
        merchantId: 'MER001',
        merchantName: 'Test Merchant',
        customerName: 'Repeat Customer',
        customerId: 'REPEAT_CUSTOMER_001',
        timestamp: new Date().toISOString(),
      },
      expected: 'FLAGGED'
    },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`\n🔍 Testing: ${testCase.name}`);
    console.log(`   Amount: Rp ${testCase.payload.amount.toLocaleString()}`);
    console.log(`   Expected: ${testCase.expected}`);
    
    try {
      const response = await fetch(`${TEST_URL}/api/ml/detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testCase.payload),
      });
      
      const result = await response.json();
      
      if (result.success) {
        const detection = result.detection;
        const detected = detection.attacksDetected;
        const riskLevel = detection.riskLevel;
        
        console.log(`   Result: ${detected ? 'ATTACKS DETECTED' : 'CLEAN'}`);
        console.log(`   Risk Level: ${riskLevel}`);
        console.log(`   Recommendation: ${detection.recommendation}`);
        
        if ((testCase.expected === 'DETECTED' && detected) ||
            (testCase.expected === 'CLEAN' && !detected) ||
            (testCase.expected === 'FLAGGED' && riskLevel === 'MEDIUM')) {
          console.log('   ✅ PASS');
          passed++;
        } else {
          console.log('   ❌ FAIL');
          failed++;
        }
      } else {
        console.log('   ❌ API Error:', result.error);
        failed++;
      }
    } catch (error) {
      console.log('   ❌ Network Error:', error.message);
      failed++;
    }
    
    console.log('   '.padEnd(70, '-'));
  }
  
  console.log('\n📊 TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`   Total Tests: ${testCases.length}`);
  console.log(`   Passed: ${passed} ✅`);
  console.log(`   Failed: ${failed} ❌`);
  console.log(`   Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(70));
  
  return { passed, failed, total: testCases.length };
}

async function testStatsEndpoint() {
  console.log('\n📈 TESTING ML STATISTICS ENDPOINT');
  
  try {
    const response = await fetch(`${TEST_URL}/api/ml/stats`);
    const stats = await response.json();
    
    console.log('✅ Statistics retrieved successfully');
    console.log('   Total Patterns:', stats.stats?.totalPatterns);
    console.log('   Active Merchants:', stats.stats?.activeMerchants);
    console.log('   Total Transactions:', stats.stats?.totalTransactions);
    console.log('   Detection Rate:', stats.stats?.detectionRate);
    
    return true;
  } catch (error) {
    console.log('❌ Stats test failed:', error.message);
    return false;
  }
}

async function testAttackPatterns() {
  console.log('\n🎭 TESTING ATTACK PATTERNS ENDPOINT');
  
  try {
    const response = await fetch(`${TEST_URL}/api/ml/test-attack`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const result = await response.json();
    
    console.log('✅ Attack patterns test completed');
    console.log('   Total Tests:', result.summary?.totalTests);
    console.log('   Attacks Detected:', result.summary?.attacksDetected);
    console.log('   Effectiveness:', result.summary?.effectiveness);
    
    result.testResults?.forEach((test, index) => {
      console.log(`   ${index + 1}. ${test.testCase}: ${test.detected ? '✅ Detected' : '❌ Not Detected'}`);
    });
    
    return true;
  } catch (error) {
    console.log('❌ Attack patterns test failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 ML ATTACK DETECTION TEST SUITE');
  console.log('='.repeat(70));
  console.log('Server URL:', TEST_URL);
  console.log('Timestamp:', new Date().toISOString());
  console.log('='.repeat(70));
  
  try {
    // Test health endpoint first
    const healthResponse = await fetch(`${TEST_URL}/health`);
    if (healthResponse.ok) {
      console.log('✅ Server is healthy');
    } else {
      console.log('❌ Server health check failed');
      process.exit(1);
    }
    
    // Run all tests
    await testMLDetection();
    await testStatsEndpoint();
    await testAttackPatterns();
    
    console.log('\n🎉 ALL TESTS COMPLETED');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  testMLDetection,
  testStatsEndpoint,
  testAttackPatterns,
  main,
};