import crypto from 'node:crypto';
import fs from 'node:fs';
import { promises as fsAsync } from 'node:fs';
import path from 'node:path';
import { setImmediate as yieldEventLoop } from 'node:timers/promises';
class Block {
  constructor(index,timestamp,data,previousHash) { Object.assign(this,{index,timestamp,data,previousHash,nonce:0}); this.hash=this.calculateHash(); }
  calculateHash() { return crypto.createHash('sha256').update(this.index+this.previousHash+this.timestamp+JSON.stringify(this.data)+this.nonce).digest('hex'); }
  async mineBlock(difficulty) {
    const prefix='0'.repeat(difficulty);
    while (!this.hash.startsWith(prefix)) { this.nonce++; this.hash=this.calculateHash(); if (this.nonce%256===0) await yieldEventLoop(); }
  }
}
export class VitalMatchBlockchain {
  constructor({ directory=process.cwd(), writeFile=fsAsync.writeFile, rename=fsAsync.rename }={}) {
    this.directory=directory; this.writeFile=writeFile; this.rename=rename;
    this.difficulty=2; this.chain=[new Block(0,Date.now(),{type:'genesis',message:'VitalMatch Blockchain Genesis Block',version:'1.0.0'},'0')];
    this.pendingTransactions=[]; this.queue=Promise.resolve(); this.stateFile=path.join(directory,'blockchain-state.json');
    const state=fs.existsSync(this.stateFile) ? JSON.parse(fs.readFileSync(this.stateFile,'utf8')) : null;
    const oldChain=path.join(directory,'blockchain.json'),oldPending=path.join(directory,'blockchain-pending.json');
    const chain=state?.chain || (fs.existsSync(oldChain) ? JSON.parse(fs.readFileSync(oldChain,'utf8')) : null);
    if (chain) {
      if (!Array.isArray(chain) || !chain.length) throw new Error('Ledger history is invalid; restore from backup');
      this.chain=chain.map(data=>Object.assign(new Block(data.index,data.timestamp,data.data,data.previousHash),data));
    }
    this.pendingTransactions=state?.pending || (fs.existsSync(oldPending) ? JSON.parse(fs.readFileSync(oldPending,'utf8')) : []);
    if (!Array.isArray(this.pendingTransactions) || !this.isChainValid()) throw new Error('Ledger integrity failed; preserve files and restore from backup');
    // A legacy crash may have saved the chain before clearing its second file.
    // Compare exact transaction fingerprints to avoid re-mining those records.
    const recorded=new Set(this.chain.flatMap(b=>Array.isArray(b.data)?b.data:[]).map(t=>JSON.stringify(t)));
    this.pendingTransactions=this.pendingTransactions.filter(t=>!recorded.has(JSON.stringify(t)));
  }
  serialize(operation) { const result=this.queue.then(operation); this.queue=result.catch(()=>{}); return result; }
  async persist(chain,pending) {
    await fsAsync.mkdir(this.directory,{recursive:true});
    const temporary=`${this.stateFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
    try { await this.writeFile(temporary,JSON.stringify({version:1,chain,pending}),{mode:0o600}); await this.rename(temporary,this.stateFile); }
    finally { await fsAsync.rm(temporary,{force:true}); }
  }
  addRecord(record) { return this.serialize(async()=>{ const next=[...this.pendingTransactions,record]; await this.persist(this.chain,next); this.pendingTransactions=next; return record; }); }
  async addDonationRecord(donorId,data) {
    if (!Number.isInteger(Number(data.units)) || Number(data.units)<=0) throw new Error('Only actual positive-unit donations are donation records');
    return this.addRecord({type:'donation',donorId,timestamp:Date.now(),data:{bloodType:data.bloodType,units:Number(data.units)}});
  }
  async addRequestRecord(requestId,data) { return this.addRecord({type:'request',requestId,timestamp:Date.now(),data:{bloodType:data.bloodType,units:data.unitsRequired,urgency:data.urgency,status:data.status}}); }
  async addFulfillmentRecord(requestId,donorId,data) {
    if (!Number.isInteger(Number(data.units)) || Number(data.units)<=0) throw new Error('Invalid actual fulfillment units');
    return this.addRecord({type:'fulfillment',requestId,donorId,timestamp:Date.now(),data:{unitsProvided:Number(data.units)}});
  }
  minePendingTransactions() { return this.serialize(async()=>{
    if (!this.pendingTransactions.length) return false;
    const block=new Block(this.chain.length,Date.now(),structuredClone(this.pendingTransactions),this.getLatestBlock().hash);
    await block.mineBlock(this.difficulty);
    const chain=[...this.chain,block];
    // Chain and pending are committed in one file. Memory only advances when
    // durable persistence succeeds; errors reach the caller for visible retry.
    await this.persist(chain,[]); this.chain=chain; this.pendingTransactions=[]; return true;
  }); }
  getLatestBlock() { return this.chain.at(-1); }
  isChainValid() { return this.chain.length > 0 && this.chain.every((b,i)=>b.index===i && b.hash===b.calculateHash() && (i===0 ? b.previousHash==='0' : b.previousHash===this.chain[i-1].hash && b.hash.startsWith('0'.repeat(this.difficulty)))); }
  getDonorHistory(id) { return this.chain.flatMap(b=>Array.isArray(b.data)?b.data.filter(t=>t.type==='donation'&&String(t.donorId)===String(id)).map(t=>({blockIndex:b.index,timestamp:t.timestamp,data:t.data,blockHash:b.hash})):[]); }
  getRequestChain(id) { return this.chain.flatMap(b=>Array.isArray(b.data)?b.data.filter(t=>String(t.requestId)===String(id)).map(t=>({type:t.type,blockIndex:b.index,timestamp:t.timestamp,data:t.data,blockHash:b.hash})):[]).sort((a,b)=>a.timestamp-b.timestamp); }
  getStats() { const data=this.chain.flatMap(b=>Array.isArray(b.data)?b.data:[]); return {totalBlocks:this.chain.length,pendingTransactions:this.pendingTransactions.length,donations:data.filter(t=>t.type==='donation').length,requests:data.filter(t=>t.type==='request').length,fulfillments:data.filter(t=>t.type==='fulfillment').length,isValid:this.isChainValid(),mode:'single-node historical ledger; current outcomes are recorded in the database'}; }
}
export const vitalMatchBlockchain=new VitalMatchBlockchain();
