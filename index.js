import { ApiPromise, WsProvider } from '@polkadot/api';
import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { BN } from '@polkadot/util';

async function connectToNode(nodeUrl = 'wss://rpc.polkadot.io') {
  console.log(`Connecting to ${nodeUrl}...`);
  const provider = new WsProvider(nodeUrl);
  const api = await ApiPromise.create({ provider });
  
  const [chain, nodeName, nodeVersion] = await Promise.all([
    api.rpc.system.chain(),
    api.rpc.system.name(),
    api.rpc.system.version()
  ]);
  
  console.log(`Connected to chain ${chain} using ${nodeName} v${nodeVersion}`);
  return api;
}

function readTransactionsFromCsv(filePath) {
  const transactions = [];
  
  return new Promise((resolve, reject) => {
    createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        transactions.push({
          address: row.address.trim(),
          amount: parseFloat(row.amount)
        });
      })
      .on('end', () => {
        console.log(`Parsed ${transactions.length} transactions from CSV`);
        resolve(transactions);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

async function createBatchCalls(api, transactions) {
  const DECIMALS = new BN(10).pow(new BN(10));
  
  // create an array of transfer calls
  const calls = transactions.map(({ address, amount }) => {
    const amountPlanck = new BN(amount * 10000).mul(DECIMALS).div(new BN(10000));
    return api.tx.balances.transferKeepAlive(address, amountPlanck);
  });
  
  // create a batch call
  const batchCall = api.tx.utility.batchAll(calls);
  
  // het the call data (hex string)
  const callData = batchCall.toHex();
  
  return {
    batchCall,
    callData,
    totalTransactions: calls.length
  };
}

async function main() {
  try {
    const api = await connectToNode();
    const transactions = await readTransactionsFromCsv('./transactions.csv');
    const { callData, totalTransactions } = await createBatchCalls(api, transactions);
    
    console.log('\n========== CALL DATA ==========');
    console.log(callData);
    console.log('==============================\n');
    console.log(`Generated batch call for ${totalTransactions} transactions`);
    console.log('You can now paste this call data into polkadot.js apps');
    
    process.exit(0);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();