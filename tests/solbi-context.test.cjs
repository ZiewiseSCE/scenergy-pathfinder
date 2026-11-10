const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const source=fs.readFileSync('assets/pathfinder/solbi-context.js','utf8'),shared=new Map();
function boot(license){
  const store={getItem:k=>shared.get(k)||null,setItem:(k,v)=>shared.set(k,v),removeItem:k=>shared.delete(k)};
  store.setItem('spf_token',license);
  const window={currentAnalysisData:{},PFDataMode:{get:()=> 'stored'}};
  vm.runInNewContext(source,{window,sessionStorage:store,localStorage:store,crypto:webcrypto,TextEncoder,URLSearchParams,location:{search:''}});
  return window;
}
(async()=>{
  const a=boot('LIC-fixture-a');await a.PFSolbiContext.ready;
  a.currentAnalysisData={address:'현장 A',layoutId:'layout-a',layoutRevision:3,capacityMw:999,score:999};
  const c=a.PFSolbiContext.get();assert.equal(c.revision,3);assert.equal(c.capacityMw,undefined);assert.equal(c.score,undefined);
  a.PFSolbiContext.set({address:'현장 B',capacityMw:999});assert.equal(a.PFSolbiContext.get().address,'현장 B');
  a.currentAnalysisData={address:'현장 C'};assert.equal(a.PFSolbiContext.get().address,'현장 C');
  a.currentAnalysisData={};assert.equal(a.PFSolbiContext.get().address,undefined);
  a.PFSolbiContext.set({address:'이전 대화 현장'});const keyA=a.PFSolbiContext.storageKey('chat');
  const aReload=boot('LIC-fixture-a');await aReload.PFSolbiContext.ready;assert.equal(aReload.PFSolbiContext.get().address,'이전 대화 현장');
  const b=boot('LIC-fixture-b');await b.PFSolbiContext.ready;assert.notEqual(keyA,b.PFSolbiContext.storageKey('chat'));assert.equal(b.PFSolbiContext.get().address,undefined);
  // The pending analysis conditions card (2026-11-10): only its locator {id}, per account and conversation, echoed by both
  // pages as context.analysisDraft until a reply clears it; never part of get() (the site locators).
  const draft='ao_'+'a'.repeat(32),ctxA=aReload.PFSolbiContext;
  assert.equal(ctxA.analysisDraft('conv-1'),null);
  assert.equal(ctxA.acceptDraft({address:'현장 A'},'conv-1'),null,'a reply without the key changes nothing');
  assert.equal(ctxA.acceptDraft({analysisDraft:{id:draft},conversationId:'conv-1'},'conv-1'),null);
  assert.equal(ctxA.analysisDraft('conv-1').id,draft);assert.equal(ctxA.analysisDraft('conv-2'),null,'another conversation never echoes it');
  assert.equal(ctxA.get().analysisDraft,undefined);
  const aAgain=boot('LIC-fixture-a');await aAgain.PFSolbiContext.ready;assert.equal(aAgain.PFSolbiContext.analysisDraft('conv-1').id,draft,'kept across a reload');
  const other=boot('LIC-fixture-b');await other.PFSolbiContext.ready;assert.equal(other.PFSolbiContext.analysisDraft('conv-1'),null,'never another account\'s');
  assert.equal(aAgain.PFSolbiContext.acceptDraft({analysisDraft:null},'conv-1'),draft,'the closed draft is returned: its card goes read-only');
  assert.equal(aAgain.PFSolbiContext.analysisDraft('conv-1'),null);
  assert.equal(aAgain.PFSolbiContext.acceptDraft({analysisDraft:{id:'x'}},'conv-1'),null);assert.equal(aAgain.PFSolbiContext.analysisDraft('conv-1'),null,'only a draft id');
  aAgain.PFSolbiContext.acceptDraft({analysisDraft:{id:draft}},'conv-1');aAgain.PFSolbiContext.clear();assert.equal(aAgain.PFSolbiContext.analysisDraft('conv-1'),null,'a new conversation drops it');
  console.log('PASS Solbi locator-only context, explicit follow-up, changed/cleared selection, LIC isolation and the analysis-card draft locator');
})().catch(e=>{console.error(e);process.exitCode=1});
