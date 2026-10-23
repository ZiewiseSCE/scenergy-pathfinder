const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8').replace(/\r\n/g,'\n');
const slice=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
const cad={address:'경북 김천시 개령면 광천리 1204',history_run_id:'qa-run',mode:'roof',lat:36.17,lng:128.20,finance:{dcKw:124.16}};
const calls=[],pending=[];
const ctx={window:{currentAnalysisData:cad},currentAnalysisData:cad,scanTarget:'roof',_historySaveStates:new Map(),_historyAutoSaveTimer:null,
  Promise,Map,Date,JSON,console,ensureFinanceComputed(){},safeText:(v,f)=>v||f,getTotalPanelCount:()=>194,
  _historyApiBase:()=>'/api/hist',bindCommaInput(){},renderHistory(){},showToast(){},
  fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push(body);await new Promise(resolve=>pending.push(resolve));return {ok:true,json:async()=>({ok:true,id:'saved-id',data:{revision:calls.length}})};}};
vm.createContext(ctx);vm.runInContext(slice('function _historyRunId(){','window.clearHistory = function'),ctx);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  const first=ctx.window.saveResult({auto:true,reason:'analysis_fallback'});await flush();
  cad.ai_analysis={check_list:{grid:{status:'WARNING',value:0,msg:'원천 확인 필요',needs_confirm:true}},overall_severity:'amber'};
  const complete=ctx.window.saveResult({auto:true,reason:'checks_done'});await flush();
  assert.equal(calls.length,1,'Complete save waits for provisional save, preventing response reordering');
  pending.shift()();await first;await flush();assert.equal(calls.length,2);
  assert.equal(calls[1].history_entry_id,'saved-id');assert.equal(calls[1].history_revision,1);
  assert.equal(calls[1].checks.grid.value,0);assert.equal(calls[1].checks.grid.msg,'원천 확인 필요');assert.equal(calls[1].severity,'amber');
  pending.shift()();await complete;
  await ctx.window.saveResult({auto:true,reason:'checks_done'});assert.equal(calls.length,2,'Unchanged completed result is deduplicated');
  cad.finance.dcKw=128;const edited=ctx.window.saveResult({auto:true,reason:'report_ready'});await flush();
  assert.equal(calls[2].history_revision,2);pending.shift()();await edited;
  ctx.window.currentAnalysisData=ctx.currentAnalysisData={address:'다른 현장',finance:{dcKw:3},mode:'roof'};
  const next=ctx.window.saveResult({auto:true});await flush();assert.equal(calls[3].history_entry_id,undefined);pending.shift()();await next;
  console.log('PASS provisional→completed history updates, serialized revisions, preserved evidence/zero, finance edits and site isolation');
})().catch(e=>{console.error(e);process.exitCode=1;});
