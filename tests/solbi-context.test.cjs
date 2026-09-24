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
  console.log('PASS Solbi locator-only context, explicit follow-up, changed/cleared selection and LIC isolation');
})().catch(e=>{console.error(e);process.exitCode=1});
