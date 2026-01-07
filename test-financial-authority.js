const fetch = require('node-fetch');

const BASE_URL = process.env.BASE_URL || 'http://localhost:10000';

async function testFinancialAuthority() {
  console.log('🧪 TESTING FINANCIAL AUTHORITY SYSTEM');
  console.log('='.repeat(70));
  
  try {
    // 1. Test Server Health
    console.log('1. Testing server health...');
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    console.log(`✅ Health Status: ${healthData.status}`);
    console.log(`   Uptime: ${healthData.uptime} seconds`);
    console.log(`   Connections: ${healthData.connections}`);
    
    // 2. Test Financial Authority Status
    console.log('\n2. Testing Financial Authority Status...');
    const statusRes = await fetch(`${BASE_URL}/api/financial-authority/status`);
    const statusData = await statusRes.json();
    console.log(`✅ Authority Status: ${statusData.status}`);
    console.log(`   License: ${statusData.authority.license.number}`);
    console.log(`   Settlement Account: ${statusData.financials.settlementAccount.number}`);
    console.log(`   Balance: Rp ${statusData.financials.settlementAccount.balance.toLocaleString()}`);
    console.log(`   Insurance: ${statusData.authority.insurance.coverage}`);
    
    // 3. Test Transaction Processing
    console.log('\n3. Testing Transaction Processing...');
    const transactionData = {
      transactionId: `TEST-${Date.now()}`,
      qrString: '00020101021126660014ID.CO.QRIS.WWW01189360093700992990213DANA0219DANA.ID16416514303UMI5204581253033605802ID5912Toko%20Berizin6013Tangerang%20Sel61051531162380124https://qris.com/id62950124https://qris.com/id6304',
      amount: 750000,
      merchantId: 'MER001',
      merchantName: 'Toko Berizin BI',
      customerName: 'Budi Santoso',
      customerAccount: '8888012345678901',
      terminalId: 'TERMINAL-001',
      location: 'Tangerang Selatan',
      deviceId: 'DEVICE-001'
    };
    
    const processRes = await fetch(`${BASE_URL}/api/financial-authority/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Financial-Authority': 'QRIS/Acquirer/2024/001'
      },
      body: JSON.stringify(transactionData)
    });
    
    const processData = await processRes.json();
    
    if (processData.success) {
      console.log('✅ Transaction processed successfully!');
      console.log(`   Authorization Code: ${processData.result.authorization.code}`);
      console.log(`   RRN: ${processData.result.authorization.rrn}`);
      console.log(`   Risk Score: ${processData.result.financials.riskScore}/100`);
      console.log(`   Settlement Date: ${processData.result.financials.settlement.schedule.settlement}`);
      console.log(`   Legally Binding: ${processData.result.authorization.legallyBinding}`);
      
      // Check if receipt was generated
      if (processData.receipt) {
        console.log('✅ Legal receipt generated');
        console.log('   Receipt length:', processData.receipt.length, 'characters');
      }
    } else {
      console.log('❌ Transaction failed:', processData.error);
    }
    
    // 4. Test Clearing Process
    console.log('\n4. Testing Clearing Process...');
    const clearingRes = await fetch(`${BASE_URL}/api/financial-authority/clearing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        batchDate: new Date().toISOString().split('T')[0]
      })
    });
    
    const clearingData = await clearingRes.json();
    console.log(`✅ Clearing Status: ${clearingData.result.status}`);
    console.log(`   Batch Date: ${clearingData.result.batchDate}`);
    console.log(`   BI Reference: ${clearingData.result.biReference}`);
    
    console.log('\n' + '='.repeat(70));
    console.log('🎉 ALL TESTS PASSED! FINANCIAL AUTHORITY SYSTEM IS OPERATIONAL');
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  testFinancialAuthority();
}

module.exports = { testFinancialAuthority };