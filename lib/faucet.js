'use strict';

const config = require('../config');
const Web3 = require('web3');
const EthereumTx = require('ethereumjs-tx')
const web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));
web3.eth.defaultAccount = process.env.ACCOUNT_ADDRESS;
const amountToSend = config.amountToSend;
const axios = require('axios');

let privateKey = new Buffer(process.env.PRIVATE_KEY, 'hex');

module.exports = () => {

  let queueArray = [];
  let completedTransactions = [];
  let pendingTransactions = [];
  let transactionPending = false;
  // Tick interval 25 seconds, so we have at least two checks within one minute.
  const checkInterval = config.executionInterval;
  const account = process.env.ACCOUNT_ADDRESS;
  web3.eth.defaultAccount = process.env.ACCOUNT_ADDRESS;
  const statusLength = process.env.CLIENT_TRANSACTIONS_LIST_LENGTH;
  const isAddress = (address) => {
    return /^(0x)?[0-9a-f]{40}$/i.test(address);
  };

  const getFaucetBalance = async () => {
    let balance = await web3.eth.getBalance(account);
    let balanceInEther = await web3.utils.fromWei(balance, 'ether');
    return balanceInEther;
  }

  const executeTransaction = async (id) => {
    let nonce = await web3.eth.getTransactionCount(web3.eth.defaultAccount);
    let gas = await axios.get('https://ethgasstation.info/json/ethgasAPI.json')

    let gasPrice = {
      low: gas.data.safeLow / 10,
      medium: gas.data.average / 10,
      high: gas.data.fast / 10
    }
    
    let details = {
      "to": id,
      "from": process.env.ACCOUNT_ADDRESS,
      "value": config.amountToSend * 1e18,
      "gas": 21000,
      "gasPrice": gasPrice.low * 1000000000, // converts the gwei price to wei
      "nonce": nonce,
      "chainId": 88888 // EIP 155 chainId - mainnet: 1, rinkeby: 4
    }

    const transaction = new EthereumTx(details);
    
    transaction.sign(privateKey);

    const serializedTransaction = `0x${transaction.serialize().toString('hex')}`
    /* console.log('Executing transaction');
    // TEST
    pendingTransactions = pendingTransactions.filter(trId => trId !== id);
    
    subscriptions.pendingTransactionsUpdate.map(cb => cb(pendingTransactions.slice(-statusLength)));
    
    completedTransactions.push(id);
    
    subscriptions.completedTransactionsUpdate.map(cb => cb(completedTransactions.slice(-statusLength)));

    return; */

    web3.eth.sendSignedTransaction(serializedTransaction)
      .then(response => {
        // Update pending and completed stats
        console.log(`Transaction from ${response.from} to ${response.to}. Transaction hash: ${response.transactionHash}`);
        // Update pending transaction stats array
        pendingTransactions = pendingTransactions.filter(trId => trId !== id);
        subscriptions.pendingTransactionsUpdate.map(cb => cb(pendingTransactions.slice(-statusLength)));
       
        completedTransactions.push(id);
        subscriptions.completedTransactionsUpdate.map(cb => cb(completedTransactions.slice(-statusLength)));
      })
      .catch(err => {
        console.log('Transaction Error: ' + err.message);
      })

  }


  const drip = () => {
    let id = queueArray.shift();

    executeTransaction(id)

    // Run the transaction
    if (queueArray.length === 0) {
      transactionPending = false;
      return;
    }

    setTimeout(drip, config.executionInterval);

  }

  const addAddressToQueue = (id) => {
    console.log(`Donate Request: Adding ${id} to the queue.`);
    // Update pending stats
    queueArray.push(id);
    pendingTransactions.push(id);
    subscriptions.pendingTransactionsUpdate.map(cb => cb(pendingTransactions.slice(-statusLength)));
  }

  const init = () => {

  }

  const donate = async (id) => {
    // Check if address is correct
    if (!id || !isAddress(id)) {
      return {
        'status': 'error',
        'message': 'Donate request Error: Address is not in the correct format'
      }
    }

    // Check if address is in queue
    if (queueArray.indexOf(id) > -1) {
      return {
        'status': 'error',
        'message': `Donate Request: Address ${id} already in the queue.`
      }
    }

    // Check if the queue limit reached
    if (queueArray.length >= config.queueLimit) {
      return {
        'status': 'error',
        'message': 'Donate Request: Queue full.'
      }
    }
   
    // check if we have enough funds

   
    let balance = await web3.eth.getBalance(account);
    let balanceInEther = await web3.utils.fromWei(balance, 'ether');
    if(balanceInEther < config.amountToSend) {
      //return console.log('Donate Request: Not enough funds.')
      return {
        'status': 'error',
        'message': 'Not enough funds left in faucet'
      }
    }
    
    addAddressToQueue(id);

    if (!transactionPending) {
      transactionPending = true;
      setTimeout(drip, config.executionInterval);
    }
    return {
      'status': 'success',
      'message': `Address  added to the queue.`
    }
  }

  const status = async () => {

    let balance = await getFaucetBalance();

    return {
      account,
      balance,
      payoutFrequencyInSec: config.executionInterval / 1000,
      payoutAmountInEther: config.amountToSend,
      queueSize: config.queueLimit
    }

  }

  // Socket subscriptions
  const subscriptions = {
    pendingTransactionsUpdate: [],
    completedTransactionsUpdate: []
  }


  const subscribeToPendingTransactionsUpdates = (cb) => {
    if(cb && typeof cb === 'function') {
      subscriptions.pendingTransactionsUpdate.push(cb);
    }
  }

  const subscribeToCompletedTransactionsUpdate = (cb) => {
    if (cb && typeof cb === 'function') {
      subscriptions.completedTransactionsUpdate.push(cb);
    }
  }


  return {
    init,
    donate,
    status,
    subscribeToPendingTransactionsUpdates,
    subscribeToCompletedTransactionsUpdate
  }
}; 