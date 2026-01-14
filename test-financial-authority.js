const http = require('http');

const BASE_URL = 'http://localhost:10000';

async function testAPI(endpoint, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 10000,
      path: endpoint,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body)
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function runTests() {
  console.log('🧪 TESTING FINANCIAL AUTHORITY SYSTEM');
  console.log('='.repeat(50));

  try {
    // 1. Test Health
    console.log('1. Testing /health...');
    const health = await testAPI('/health');
    console.log(`   Status: ${health.status === 200 ? '✅' : '❌'} ${health.status}`);
    console.log(`   Response: ${JSON.stringify(health.data)}`);

    // 2. Test Financial Authority Status
    console.log('\n2. Testing /api/financial-authority/status...');
    const status = await testAPI('/api/financial-authority/status');
    console.log(`   Status: ${status.status === 200 ? '✅' : '❌'} ${status.status}`);
    console.log(`   License: ${status.data.authority?.license?.number || 'N/A'}`);

    // 3. Test Transaction Processing
    console.log('\n3. Testing transaction processing...');
    const transactionData = {
      amount: 750000,
      merchantId: 'MER001',
      merchantName: 'Toko Berizin BI',
      customerName: 'Budi Santoso',
      customerAccount: '8888012345678901',
      terminalId: 'TERMINAL-001'
    };

    const transaction = await testAPI('/api/financial-authority/process', 'POST', transactionData);
    
    if (transaction.status === 200 && transaction.data.success) {
      console.log('✅ Transaction processed successfully!');
      console.log(`   Auth Code: ${transaction.data.result?.authorization?.code}`);
      console.log(`   RRN: ${transaction.data.result?.authorization?.rrn}`);
      console.log(`   Risk Score: ${transaction.data.result?.financials?.riskScore}/100`);
      console.log(`   Legally Binding: ${transaction.data.result?.authorization?.legallyBinding}`);
    } else {
      console.log(`❌ Transaction failed: ${transaction.data?.error || 'Unknown error'}`);
    }

    console.log('\n' + '='.repeat(50));
    console.log('🎉 TESTS COMPLETED!');
    console.log('='.repeat(50));

  } catch (error) {
    console.error('❌ Test error:', error.message);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests();
}

module.exports = { testAPI };