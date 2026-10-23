const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i);return html.slice(i,j);};
function setup(){
  const nodes={};
  for(const id of ['legalContent','legalPlaceholder','legalLoading','aiAnalysisResult','checksStatus']){
    const classes=new Set(['hidden']);nodes[id]={innerHTML:'',textContent:'',attrs:{},setAttribute(k,v){this.attrs[k]=v;},classList:{add:v=>classes.add(v),remove:v=>classes.delete(v),contains:v=>classes.has(v),toggle(v,on){on?classes.add(v):classes.delete(v);}}};
  }
  const ctx={console:{warn(){}},window:{},document:{querySelectorAll:()=>[]},el:id=>nodes[id],Map,Set,URLSearchParams,location:{search:''},
    currentAnalysisData:{address:'성주군 월항면 수죽리 513',mode:'land',lat:35.98,lng:128.3},scanTarget:'land',currentAnalysisFeature:null,
    selectedFeatures:new Set(),PFMainLayout:{identity:()=>ctx.currentAnalysisData.address,spec:()=>({power:640})},_spLocationCache:{},
    BACKEND_URL:'https://test.invalid',FEATURE_LEVEL:5,normalizeInsolationSourceType:()=> 'kma',safeText:(v,f='')=>v==null?f:String(v),__deriveCheckLink:()=>'',
    renderAiFinal(){},renderEightChecksDetail(){},updateSolarOptUI(){},getTotalPanelCount:()=>0,_aiBarStart(){},_aiBarDone(){},showToast(){},logSystem(){}};
  ctx.window.currentAnalysisData=ctx.currentAnalysisData;ctx.getAnalysisLatLng=()=>ctx.currentAnalysisData;
  vm.createContext(ctx);
  vm.runInContext(extract('function unwrapChecksPayload','window.renderEightChecksFallbackFromCurrentData'),ctx);
  vm.runInContext(extract('window.fetchEightChecks = function','function __extractSetbackDistancesFromText'),ctx);
  vm.runInContext(extract('window.PFLoadStoredAnalysis=function','let isMultiSelectMode'),ctx);
  return {ctx,nodes};
}
const keys=['zoning','ecology','heritage','setback','grid','slope','insolation','land_price'];
const fixture={mode:'land',check_list:Object.fromEntries(keys.map(k=>[k,{status:'WARNING',value:k+' 자료 확인 필요'}]))};
(async()=>{
  let {ctx,nodes}=setup();ctx.window.PFLoadStoredAnalysis(fixture,{address:'경북 성주군 월항면 수죽리 513',mode:'land'});
  assert(!nodes.legalContent.classList.contains('hidden'));assert(nodes.legalPlaceholder.classList.contains('hidden'));
  for(const key of keys)assert(nodes.aiAnalysisResult.innerHTML.includes(key+' 자료 확인 필요'));
  ctx.renderAIResult({ok:true,data:fixture});assert.equal(ctx.checksForDisplay({data:fixture}).length,8);
  assert.equal(ctx.checksForDisplay({...fixture,mode:'roof'}).length,4);
  const zero=ctx.checksForDisplay({mode:'land',check_list:{grid:{value:0}}})[0];
  assert.equal(zero.message,'0');assert.equal(zero.severity,'amber');assert.equal(zero.needs_confirm,true);
  assert.equal(ctx.checksForDisplay({checks:[{key:'grid',status:'WARNING',severity:'green'}]})[0].severity,'amber');
  for(const [status,error,expected] of [[409,'stored_result_unavailable',/실시간 조회/],[401,'authentication_required',/로그인/],[429,'queue_full',/요청이 많아/],[503,'upstream',/불러오지 못/]]){
    ({ctx,nodes}=setup());ctx.postJson=async()=>({ok:false,status,data:{error}});await ctx.window.fetchEightChecks();
    assert(!nodes.legalContent.classList.contains('hidden'));assert.match(nodes.checksStatus.textContent,expected);
    assert(!nodes.aiAnalysisResult.innerHTML.includes('조회 중'));assert.equal(nodes.aiAnalysisResult.attrs['aria-busy'],'false');
  }
  ({ctx,nodes}=setup());ctx.currentAnalysisData.ai_analysis=fixture;
  ctx.postJson=async()=>{throw Object.assign(new Error(),{name:'TimeoutError'});};await ctx.window.fetchEightChecks();
  assert.match(nodes.checksStatus.textContent,/초과.*기존 결과/);assert.match(nodes.aiAnalysisResult.innerHTML,/zoning 자료 확인 필요/);
  ({ctx,nodes}=setup());ctx.postJson=async()=>({ok:true,data:{ok:true,data:fixture}});
  assert.equal(await ctx.window.fetchEightChecks(),true);assert.equal(ctx.currentAnalysisData.ai_analysis.checks.length,8);
  assert(!nodes.legalContent.classList.contains('hidden'));assert.equal(nodes.checksStatus.textContent,'');
  ({ctx,nodes}=setup());ctx.postJson=async()=>({ok:true,data:{ok:true}});await ctx.window.fetchEightChecks();assert.match(nodes.checksStatus.textContent,/항목이 없습니다/);
  // Report generation shares a pending lookup and refreshes estimated sunlight.
  ({ctx,nodes}=setup());let finish,requests=0,saves=0,recalculated;
  ctx.currentAnalysisData.solar_opt={sun_hours:3.61};ctx.currentAnalysisData.finance={dcKw:124.16};
  ctx.window.calculateFinance=(panels,sun,dc)=>{recalculated={sun,dc};};
  ctx.window.saveResult=async options=>{assert.equal(options.reason,'checks_done');assert.equal(ctx.currentAnalysisData.check_list.grid.value,'grid 자료 확인 필요');saves++;};
  ctx.postJson=async(url,payload,options)=>{requests++;assert.equal(options.dataMode,'live');assert.equal(payload.sun_hours,null);return new Promise(resolve=>finish=()=>resolve({ok:true,data:{...fixture,sun_hours:4.14,insolation_source_type:'kma'}}));};
  const first=ctx.window.fetchEightChecks(),second=ctx.window.fetchEightChecks();assert.equal(first,second);assert.equal(requests,1);
  finish();assert(await first);assert.equal(saves,1);assert.deepEqual(recalculated,{sun:4.14,dc:124.16});
  // Late successful/error responses cannot replace a different site's display.
  for(const fail of [false,true]){
    ({ctx,nodes}=setup());let settle;
    ctx.postJson=()=>new Promise((resolve,reject)=>{settle=()=>fail?reject(new Error()):resolve({ok:true,data:fixture});});
    const waiting=ctx.window.fetchEightChecks();ctx.currentAnalysisData={address:'김천 새 현장',mode:'land'};ctx.window.currentAnalysisData=ctx.currentAnalysisData;
    nodes.checksStatus.textContent='새 현장';settle();await waiting;assert.equal(nodes.checksStatus.textContent,'새 현장');
  }
  // Analyze remains pending until the checks stage finishes; a saved miss is not an API outage.
  ({ctx,nodes}=setup());let finishChecks,done=false;ctx.postJson=async()=>({ok:true,data:{checks:[],phase:'basic'}});
  ctx.window.fetchEightChecks=()=>new Promise(resolve=>{finishChecks=resolve;});
  const pending=ctx.window.fetchAIData(35.98,128.3,'성주').then(()=>{done=true;});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(done,false);finishChecks(true);await pending;assert.equal(done,true);
  ({ctx,nodes}=setup());ctx.postJson=async()=>({ok:false,status:409,data:{error:'stored_result_unavailable'}});await ctx.window.fetchAIData(35.98,128.3,'성주');
  assert.match(nodes.checksStatus.textContent,/저장된 체크 결과가 없습니다/);assert(!nodes.legalContent.classList.contains('hidden'));
  console.log('PASS eight checks: saved/live/wrapped payloads, 8 land/4 roof cards, explicit failures, preserved results, stale isolation and full-stage wait');
})().catch(error=>{console.error(error);process.exitCode=1;});
