/*
MIT License
VitalMatch Blockchain Service
*/

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

class Block {
  constructor(index, timestamp, data, previousHash) {
    this.index = index;
    this.timestamp = timestamp;
    this.data = data;
    this.previousHash = previousHash;
    this.nonce = 0;
    this.hash = this.calculateHash();
  }

  calculateHash() {
    return crypto
      .createHash('sha256')
      .update(this.index + this.previousHash + this.timestamp + JSON.stringify(this.data) + this.nonce)
      .digest('hex');
  }

  mineBlock(difficulty) {
    const target = Array(difficulty + 1).join('0');
    
    while (this.hash.substring(0, difficulty) !== target) {
      this.nonce++;
      this.hash = this.calculateHash();
    }

    console.log(`⛏️  Block mined: ${this.hash}`);
  }
}

class VitalMatchBlockchain {
  constructor() {
    this.chain = [this.createGenesisBlock()];
    this.difficulty = 2;
    this.pendingTransactions = [];
    this.miningReward = 100;
    this.blockchainFile = 'blockchain.json';
    this.loadBlockchain();
  }

  createGenesisBlock() {
    return new Block(0, Date.now(), {
      type: 'genesis',
      message: 'VitalMatch Blockchain Genesis Block',
      version: '1.0.0'
    }, '0');
  }

  getLatestBlock() {
    return this.chain[this.chain.length - 1];
  }

  // Add blood donation record to blockchain
  addDonationRecord(donorId, donationData) {
    const transaction = {
      type: 'donation',
      donorId: donorId,
      timestamp: Date.now(),
      data: {
        bloodType: donationData.bloodType,
        units: donationData.units,
        location: donationData.location,
        medicalChecks: donationData.medicalChecks,
        hash: this.hashDonationData(donationData)
      }
    };

    this.pendingTransactions.push(transaction);
    console.log('📝 Donation record added to pending transactions');
  }

  // Add blood request record to blockchain
  addRequestRecord(requestId, requestData) {
    const transaction = {
      type: 'request',
      requestId: requestId,
      timestamp: Date.now(),
      data: {
        patientId: requestData.patientId,
        bloodType: requestData.bloodType,
        units: requestData.unitsRequired,
        urgency: requestData.urgency,
        hospital: requestData.hospitalName,
        status: requestData.status
      }
    };

    this.pendingTransactions.push(transaction);
    console.log('📝 Blood request added to pending transactions');
  }

  // Add fulfillment record to blockchain
  addFulfillmentRecord(requestId, donorId, fulfillmentData) {
    const transaction = {
      type: 'fulfillment',
      requestId: requestId,
      donorId: donorId,
      timestamp: Date.now(),
      data: {
        unitsProvided: fulfillmentData.units,
        matchingScore: fulfillmentData.matchingScore,
        verificationHash: this.hashFulfillmentData(fulfillmentData)
      }
    };

    this.pendingTransactions.push(transaction);
    console.log('📝 Fulfillment record added to pending transactions');
  }

  // Mine pending transactions into a new block
  minePendingTransactions() {
    if (this.pendingTransactions.length === 0) {
      console.log('⚠️  No pending transactions to mine');
      return false;
    }

    const block = new Block(
      this.getLatestBlock().index + 1,
      Date.now(),
      this.pendingTransactions,
      this.getLatestBlock().hash
    );

    block.mineBlock(this.difficulty);
    
    console.log('✅ Block successfully mined!');
    this.chain.push(block);
    this.pendingTransactions = [];
    
    this.saveBlockchain();
    return true;
  }

  // Verify blockchain integrity
  isChainValid() {
    for (let i = 1; i < this.chain.length; i++) {
      const currentBlock = this.chain[i];
      const previousBlock = this.chain[i - 1];

      if (currentBlock.hash !== currentBlock.calculateHash()) {
        console.log('❌ Invalid hash at block', i);
        return false;
      }

      if (currentBlock.previousHash !== previousBlock.hash) {
        console.log('❌ Invalid previous hash at block', i);
        return false;
      }
    }

    console.log('✅ Blockchain is valid');
    return true;
  }

  // Get donation history for a donor
  getDonorHistory(donorId) {
    const history = [];
    
    for (const block of this.chain) {
      if (block.data && Array.isArray(block.data)) {
        for (const transaction of block.data) {
          if (transaction.type === 'donation' && transaction.donorId === donorId) {
            history.push({
              blockIndex: block.index,
              timestamp: transaction.timestamp,
              data: transaction.data,
              blockHash: block.hash
            });
          }
        }
      }
    }
    
    return history;
  }

  // Get request fulfillment chain
  getRequestChain(requestId) {
    const chain = [];
    
    for (const block of this.chain) {
      if (block.data && Array.isArray(block.data)) {
        for (const transaction of block.data) {
          if (transaction.requestId === requestId) {
            chain.push({
              type: transaction.type,
              blockIndex: block.index,
              timestamp: transaction.timestamp,
              data: transaction.data,
              blockHash: block.hash
            });
          }
        }
      }
    }
    
    return chain.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Utility functions
  hashDonationData(data) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  hashFulfillmentData(data) {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(data))
      .digest('hex');
  }

  // Persistence
  saveBlockchain() {
    try {
      fs.writeFileSync(this.blockchainFile, JSON.stringify(this.chain, null, 2));
      console.log('💾 Blockchain saved to file');
    } catch (error) {
      console.error('❌ Error saving blockchain:', error);
    }
  }

  loadBlockchain() {
    try {
      if (fs.existsSync(this.blockchainFile)) {
        const data = fs.readFileSync(this.blockchainFile, 'utf8');
        const loadedChain = JSON.parse(data);
        
        // Reconstruct Block objects
        this.chain = loadedChain.map(blockData => {
          const block = new Block(
            blockData.index,
            blockData.timestamp,
            blockData.data,
            blockData.previousHash
          );
          block.hash = blockData.hash;
          block.nonce = blockData.nonce;
          return block;
        });
        
        console.log('📂 Blockchain loaded from file');
      }
    } catch (error) {
      console.error('❌ Error loading blockchain:', error);
      console.log('🔄 Starting with genesis block');
    }
  }

  // Get blockchain statistics
  getStats() {
    let donations = 0;
    let requests = 0;
    let fulfillments = 0;

    for (const block of this.chain) {
      if (block.data && Array.isArray(block.data)) {
        for (const transaction of block.data) {
          switch (transaction.type) {
            case 'donation': donations++; break;
            case 'request': requests++; break;
            case 'fulfillment': fulfillments++; break;
          }
        }
      }
    }

    return {
      totalBlocks: this.chain.length,
      pendingTransactions: this.pendingTransactions.length,
      donations,
      requests,
      fulfillments,
      isValid: this.isChainValid()
    };
  }
}

// Export singleton instance
export const vitalMatchBlockchain = new VitalMatchBlockchain();
export { VitalMatchBlockchain };