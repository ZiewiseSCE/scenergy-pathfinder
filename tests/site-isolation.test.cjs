const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8'),core=require('../assets/pathfinder/layout-core.js');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);};
const tick=()=>new Promise(setImmediate);
function deferred(){let resolve;return {promise:new Promise(r=>resolve=r),resolve};}
function roof(x,name,pnu='same-parcel'){return {type:'Feature',properties:{pnu,addr:name},geometry:{type:'Polygon',coordinates:[[[x,37],[x+.0005,37],[x+.0005,37.0005],[x,37.0005],[x,37]]]}};}
// Same harness as multi-roof-selection.test.cjs: the real selection/analysis code in a VM.
function setup(){
  const controls={multiSelectToggle:{checked:false},modPower:{value:640}};
  const ctx={console,URL,URLSearchParams,DOMException,AbortSignal,structuredClone,Promise,Map,Date,Math,FEATURE_LEVEL:3,isMultiSelectMode:false,scanTarget:'building',selectedFeatures:new Map(),currentAnalysisFeature:null,currentAnalysisData:{},
    document:{currentScript:{src:'https://qa.test/assets/pathfinder/main-layout.js'},getElementById:id=>controls[id]},
    el:id=>controls[id],showToast(){},switchTab(){},resetCalibrationInternal(){},applyCalibrationToFC:x=>x,polygonAreaM2:()=>100,
    updateResultCardBasics(){},calculateFinance(){},panelGroup:{clearLayers(){},removeLayer(){}},selectableGroup:{clearLayers(){}},analysisMarkerGroup:{clearLayers(){}},
    renderPanelsFC:fc=>({fc,addTo(){}}),addEventListener(){},PFLayout:core,PFRoofPlan:require('../assets/pathfinder/roof-plan.js'),
    PFRoofPlanner:{clear(){},prepareInput(g,p){return {geometry:g,panelSpec:p,keepouts:[]};},async ensure(){}},
    PFLayoutClient:class{cancel(){} async calculate(input){return core.calculate(input,ctx.turf);}},
    fetch:async()=>({ok:false}),crypto:{randomUUID:()=>''},localStorage:{getItem:()=>null,setItem(){}}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/pathfinder/turf-7.1.0.min.js','utf8'),ctx);
  ctx.L={geoJSON:f=>({getBounds:()=>({getCenter:()=>{const [lng,lat]=ctx.turf.center(f).geometry.coordinates;return {lat,lng};}})})};ctx.map={getCenter:()=>({lat:37,lng:127}),distance:(a,b)=>ctx.turf.distance([a.lng,a.lat],[b.lng,b.lat])*1000};
  for(const [start,end] of [['function getFeatureId(feature){','// Auto-scan candidate collection'],['// Analyze feature (F-6)','// Import the exact public cadastral geometry'],
    ['function getTotalPanelCount(){','// Recalculate panels after parameter changes'],['function clearAnalysisOnly(','// Boot'],['window.toggleMultiSelect = function(){','// Auto scan toggle (F-13/14)']])vm.runInContext(extract(start,end),ctx);
  vm.runInContext(fs.readFileSync('assets/pathfinder/main-layout.js','utf8'),ctx);
  return {ctx,controls,multi(){controls.multiSelectToggle.checked=true;ctx.toggleMultiSelect();}};
}
const evidence=()=>({ai_analysis:{check_list:{grid:{status:'PASS',value:'A 10 MW'}},ai_summary:'A 요약',ordinance_ai:{a:1},law_text:'A 법령'},check_list:{grid:{value:'A'}},
  kepco:{note:'A'},kepco_capacity:'A 10 MW',kepco_note:'A 메모',solar_opt:{sun_hours:3.9},land_estimate:{land_price_won:1},slope_deg:3,dist_road_m:5,dist_residential_m:7,setback_m:100,
  finance:{dcKw:1,dcKwManual:1},roofCapacityKw:99,roofPanelCount:9,roofAreaM2:9,manualLayoutApplied:true,manualLayoutCapacityKw:99,layoutMode:'manual'});
(async()=>{
  const a=roof(127,'A'),b=roof(127.001,'B','other-parcel'),c=roof(127.002,'C');
  // 1) Single selection: site B starts from a fresh object; nothing of A leaks, A's record is untouched.
  let t=setup();await t.ctx.analyzeFeature(a,true);const siteA=t.ctx.currentAnalysisData;Object.assign(siteA,evidence());const runA=siteA.history_run_id;assert.ok(runA);
  await t.ctx.analyzeFeature(b,true);const siteB=t.ctx.currentAnalysisData;
  assert.notEqual(siteB,siteA,'A different site gets a new record, so identity-only stale guards work');assert.equal(t.ctx.window.currentAnalysisData,siteB);
  for(const key of Object.keys(evidence()))assert.equal(siteB[key],undefined,'A '+key+' leaked into B');
  assert.equal(siteB.address,'B');assert.equal(siteB.pnu,'other-parcel');assert.notEqual(siteB.history_run_id,runA);assert.equal(siteA.address,'A');assert.equal(siteA.kepco_capacity,'A 10 MW');
  // 2) Multi-roof: adding a roof keeps the selection record and its single history run (F11), drops only
  //    the now-invalid manual layout capture, and sums the selected roofs' area (F3).
  t=setup();await t.ctx.analyzeFeature(a,true);t.multi();const set=t.ctx.currentAnalysisData;Object.assign(set,evidence());const run=set.history_run_id;
  await t.ctx.analyzeFeature(c,true);assert.equal(t.ctx.currentAnalysisData,set,'Roofs of one selection set share one record');
  assert.equal(set.history_run_id,run,'One history run per selection set');assert.equal(set.ai_analysis.ai_summary,'A 요약');assert.equal(set.address,'C');
  for(const key of ['roofCapacityKw','roofPanelCount','roofAreaM2','manualLayoutApplied','manualLayoutCapacityKw','layoutMode'])assert.equal(set[key],undefined,key+' describes the old layout');
  assert.equal(set.area_m2,200,'Selection area is the sum of both roofs, not the last roof');
  await t.ctx.analyzeFeature(c,true);assert.equal(t.ctx.selectedFeatures.size,1);assert.equal(t.ctx.currentAnalysisData.area_m2,100,'Deselecting recomputes the area');
  t.ctx.clearResults(false);await t.ctx.analyzeFeature(b,true);assert.notEqual(t.ctx.currentAnalysisData.history_run_id,run,'A new selection set starts a new run');assert.equal(t.ctx.currentAnalysisData.ai_analysis,undefined);
  // 3) A stored parcel keeps the fresh seed that PFLoadParcel created for it.
  t=setup();const seed={address:'저장 필지',pnu:'1'.repeat(19),parcelEvidence:{source:'vworld'}};t.ctx.currentAnalysisData=seed;
  await t.ctx.analyzeFeature(roof(127,'저장 필지','1'.repeat(19)),true,{storedParcel:true});assert.equal(t.ctx.currentAnalysisData,seed);assert.equal(seed.parcelEvidence.source,'vworld');assert.ok(seed.history_run_id);

  // 4) The eight-check request never sends the card text (possibly another site's) as kepco_capacity.
  {const nodes={kepcoCapacity:{innerText:'A 현장 12.5 MW',textContent:''}};
   for(const id of ['legalContent','legalPlaceholder','legalLoading','aiAnalysisResult','checksStatus'])nodes[id]={innerHTML:'',textContent:'',setAttribute(){},classList:{add(){},remove(){},contains:()=>false,toggle(){}}};
   const cad={address:'B 현장',mode:'land',lat:35.9,lng:128.3};let payload;
   const ctx={console:{warn(){}},window:{},document:{querySelectorAll:()=>[]},el:id=>nodes[id],Map,Set,location:{search:''},currentAnalysisData:cad,scanTarget:'land',currentAnalysisFeature:null,selectedFeatures:new Set(),
     PFMainLayout:{identity:()=>cad.address,spec:()=>({})},_spLocationCache:{},BACKEND_URL:'https://test.invalid',normalizeInsolationSourceType:()=> 'kma',safeText:(v,f='')=>v==null?f:String(v),__deriveCheckLink:()=>'',
     renderAiFinal(){},renderEightChecksDetail(){},updateSolarOptUI(){},getTotalPanelCount:()=>0,showToast(){},postJson:async(url,body)=>{payload=body;return {ok:false,status:503,data:{}};}};
   ctx.window.currentAnalysisData=cad;ctx.getAnalysisLatLng=()=>cad;vm.createContext(ctx);
   vm.runInContext(extract('function unwrapChecksPayload','window.renderEightChecksFallbackFromCurrentData'),ctx);vm.runInContext(extract('window.fetchEightChecks = function','function __extractSetbackDistancesFromText'),ctx);
   await ctx.window.fetchEightChecks();assert.equal(payload.kepco_capacity,null,'DOM #kepcoCapacity text is not evidence for this site');
   cad.kepco_capacity='B 3 MW';await ctx.window.fetchEightChecks();assert.equal(payload.kepco_capacity,'B 3 MW');
   // Item 10: a genuine long queue wait says the job is still running server-side, not a failure.
   ctx.postJson=async()=>{throw Object.assign(new Error('signal timed out'),{name:'TimeoutError'});};await ctx.window.fetchEightChecks();assert.match(nodes.checksStatus.textContent,/서버에서 아직 진행 중/);assert.doesNotMatch(nodes.checksStatus.textContent,/실패했|불러오지 못/);
   ctx.postJson=async()=>{throw new Error('작업이 계속 진행 중입니다. 작업 ID: j1');};await ctx.window.fetchEightChecks();assert.match(nodes.checksStatus.textContent,/아직 진행 중/);
   assert.equal(vm.runInContext(extract('const POST_JSON_WAIT_MS','async function postJson')+';POST_JSON_WAIT_MS',vm.createContext({})),21*60*1000,'Client waits past the 20-minute transport poll cap');}

  // 5) Item 2: a late reverse-geocode cannot write site A's address into B or start KEPCO with A's address.
  {const geo=[],kepco=[],nodes={analysisAddress:{innerText:''},form_address:{value:''}};
   const ctx={console,Number,String,Date,isFinite,featureAnalysisEpoch:1,currentAnalysisFeature:null,el:id=>nodes[id],
     reverseGeocodeAddress:()=>{const d=deferred();geo.push(d);return d.promise;},updateKepcoCapacity:(addr,pnu)=>kepco.push([addr,pnu])};
   ctx.window=ctx;vm.createContext(ctx);vm.runInContext(extract('function _spIsWeakAddressValue(addr){','window.ensureKakaoServicesReady'),ctx);
   vm.runInContext(extract('window.resolveCurrentAnalysisAddressFromCoords = async function','window.ensureCandidateAddress'),ctx);
   const A={address:'PNU:A',lat:37,lng:127,pnu:'A-pnu'},fA={id:'A'};ctx.currentAnalysisData=A;ctx.currentAnalysisFeature=fA;
   let pending=ctx.resolveCurrentAnalysisAddressFromCoords(true);await tick();
   const B={address:'PNU:B',lat:38,lng:128,pnu:'B-pnu'};ctx.currentAnalysisData=B;ctx.currentAnalysisFeature={id:'B'};ctx.featureAnalysisEpoch++;
   geo[0].resolve('경북 A군 A리 1');assert.equal(await pending,'PNU:B');assert.equal(B.address,'PNU:B');assert.equal(A.address,'PNU:A');assert.equal(kepco.length,0);assert.equal(nodes.analysisAddress.innerText,'');
   // Same record mutated in place (multi-roof add): the new roof's coordinates/PNU also cancel the write.
   const M={address:'PNU:M',lat:37,lng:127,pnu:'M1'};ctx.currentAnalysisData=M;ctx.currentAnalysisFeature=fA;pending=ctx.resolveCurrentAnalysisAddressFromCoords(true);await tick();
   Object.assign(M,{lat:37.001,pnu:'M2'});ctx.currentAnalysisFeature={id:'M2'};geo[1].resolve('경북 M군 M리 1');await pending;assert.equal(M.address,'PNU:M');assert.equal(kepco.length,0);
   // Unchanged site: the resolved address is applied and KEPCO uses that site's own PNU.
   const S={address:'PNU:S',lat:36,lng:128,pnu:'S-pnu'};ctx.currentAnalysisData=S;pending=ctx.resolveCurrentAnalysisAddressFromCoords(true);await tick();
   geo[2].resolve('경북 S군 S리 1');assert.equal(await pending,'경북 S군 S리 1');assert.equal(S.address,'경북 S군 S리 1');assert.deepEqual(kepco,[['경북 S군 S리 1','S-pnu']]);}

  // 6) Item 3 + F10: one report at a time, the popup never keeps spinning, site changes stop the submit.
  {const nodes={},opened=[],toasts=[],submits=[];
   const field=id=>nodes[id]||(nodes[id]={id,value:'',innerText:''});
   for(const id of ['form_address','form_capacity','form_kepco','form_date','form_mode','form_lat','form_lng','form_pnu','form_finance','form_ai','form_solar','form_land','form_score','form_price','form_hardware','form_3d_data','form_shadow','form_roof_panel_capture','analysisAddress','analysisCapacity','kepcoCapacity'])field(id);
   const button=field('btnOpenFullReport');button.disabled=false;
   const form={elements:[],submit(){submits.push({...this});},action:'',target:''};nodes.reportForm=form;
   let checks=null,capture=null,identity='site-1',prepared=0;
   const ctx={console:{log(){},warn(){}},Date,JSON,Promise,Object,Number,String,structuredClone,BACKEND_URL:'https://report.test',scanTarget:'building',
     el:id=>nodes[id],showToast:s=>toasts.push(s),safeText:(v,f='')=>v==null||v===''?f:String(v),ensureFinanceComputed(){},
     document:{getElementById:()=>null},PFMainLayout:{identity:()=>identity,prepareReport(){prepared++;}},
     _spReportJsonValue:v=>JSON.stringify(v||{}),_spCompactAiForReport:v=>v,_spCurrentShadowReport:()=>null,_spCurrentShadowAttempt:()=>null,
     _spRoofCaptureMatchesReport:()=>false,_spNormalizeRoofCaptureForReport:v=>v,_spRoofCaptureIsManualLayout:()=>false,_spReportNumber:Number,
     _spBuildAutoLayoutCaptureForReport:()=>capture?capture.promise:Promise.resolve(null),_spStoreRoofCaptureForReport:async v=>v,_spApplyManualLayoutCapture:v=>v,_spClampFullReportPayload(){}};
   const popup=()=>{const w={closed:false,body:{textContent:''},document:{write(){},close(){}},close(){this.closed=true;}};w.document.body=w.body;return w;};
   ctx.window=ctx;ctx.open=()=>{const w=popup();opened.push(w);return w;};
   ctx.ensureEightChecksForReport=()=>checks?checks.promise:Promise.resolve(true);ctx.saveResult=async()=>true;
   ctx.currentAnalysisData={address:'B 현장',history_run_id:'run-1',ai_analysis:{}};vm.createContext(ctx);vm.runInContext(extract('// One report at a time per site','// ── 수동 패널 배치 도구 연동 ──'),ctx);
   checks=deferred();const first=ctx.openFullReport();await tick();
   assert.equal(button.disabled,true,'Button is disabled while a report is being prepared');
   await ctx.openFullReport();assert.equal(opened.length,1,'A double click opens one popup');assert.match(toasts.at(-1),/작성하고 있습니다/);
   checks.resolve(true);await first;assert.equal(submits.length,1,'One submit');assert.equal(prepared,1);assert.equal(button.disabled,false);
   assert.equal(nodes.form_score.value,'null','A missing score is not reported as 0');
   ctx.currentAnalysisData.ai_analysis.attractiveness_score=0;checks=null;await ctx.openFullReport();assert.equal(nodes.form_score.value,'0','An explicit zero score stays 0');assert.equal(submits.length,2);
   // Early returns inform the popup instead of leaving "작성 중" spinning.
   delete nodes.reportForm;await ctx.openFullReport();assert.match(opened.at(-1).body.textContent,/양식/);assert.equal(button.disabled,false);nodes.reportForm=form;
   ctx.BACKEND_URL='';await ctx.openFullReport();assert.match(opened.at(-1).body.textContent,/backend 미설정/);ctx.BACKEND_URL='https://report.test';
   ctx.ensureEightChecksForReport=async()=>false;await ctx.openFullReport();assert.match(opened.at(-1).body.textContent,/체크사항/);ctx.ensureEightChecksForReport=()=>checks?checks.promise:Promise.resolve(true);
   // Site change while the layout capture is built: no manual capture is applied and nothing is submitted.
   capture=deferred();const changing=ctx.openFullReport();await tick();await tick();
   ctx.currentAnalysisData={address:'C 현장',history_run_id:'run-2'};identity='site-2';capture.resolve({panelCount:3,image:'x'});await changing;
   assert.equal(submits.length,2,'A changed site is never submitted');assert.equal(prepared,2);assert.equal(opened.at(-1).closed,true);assert.equal(button.disabled,false);capture=null;
   // Same site, but its layout identity changed (roof added): also stopped.
   capture=deferred();const relayout=ctx.openFullReport();await tick();await tick();identity='site-2+roof';capture.resolve(null);await relayout;assert.equal(submits.length,2);capture=null;identity='site-2';
   // An unexpected error still releases the button and tells the popup.
   ctx.PFMainLayout.identity=()=>{throw new Error('boom');};await ctx.openFullReport();assert.match(opened.at(-1).body.textContent,/만들지 못했습니다/);assert.equal(button.disabled,false);
   ctx.PFMainLayout.identity=()=>identity;await ctx.openFullReport();assert.equal(submits.length,3,'Guard released after every outcome');}
  // A report waiting on the old site's pending checks ends as soon as another site is selected.
  {const site={mode:'roof',ai_analysis:{}};const ctx={window:{currentAnalysisData:site,__checksPending:{cad:site,promise:new Promise(()=>{})}},scanTarget:'roof',console,setInterval,clearInterval};
   vm.createContext(ctx);vm.runInContext(extract('function _spHasReportChecks(){','function _spReportJsonValue'),ctx);
   const waiting=ctx.window.ensureEightChecksForReport();await tick();ctx.window.currentAnalysisData={mode:'roof'};
   assert.equal(await Promise.race([waiting,new Promise(r=>setTimeout(()=>r('stuck'),3000))]),false,'Site change releases the report wait');}
  // 7) Reservoir: the panel area drawn by hand after '이 저수지로 분석' is still that reservoir (no land cost, the
  //    reservoir DC default yields to the drawn panels); a clicked site or a drawing elsewhere starts clean.
  {const finance=record=>{const els={};for(const [id,v] of Object.entries({modPower:640,modPrice:270,costPerKw:100,smp:120,rec:60,pfPrincipal:0,pfInterestRate:0,pfTenorYears:10,pfLtvPct:70,pfAutoPrincipal:'',landTenureMode:'BUY',pfLandBuyPrice:'',landRentMonthly:0,pfOtherOpexAnnual:0,manualDcKw:''}))els[id]={value:String(v),style:{},checked:false};
     const fx={window:{currentAnalysisData:record},currentAnalysisData:record,document:{getElementById:id=>els[id],querySelectorAll:()=>[]},el:id=>els[id],getAnalysisLatLng:()=>({lat:37,lng:127}),orientationFactor:()=>1,estimateSunHoursHeuristic:()=>4,
       formatNumber:String,formatMillionWon:String,_spCapacityLabel:String,console:{error(){},warn(){}},showToast(){},selectedFeatures:new Map(),PFOrientation:require('../assets/pathfinder/orientation.js')};
     vm.createContext(fx);vm.runInContext(extract('function layoutOrientation(','function formatMillionWon('),fx);vm.runInContext(extract('function _spPayback(','// Finance recalculation helper'),fx);
     record.land_estimate={...record.land_estimate,land_price_won:300000000};// what the land-estimate lookup then writes for the drawn area
     fx.window.calculateFinance(100,4);return record.finance.summary;};
   const reservoir=()=>{const r=setup();Object.assign(r.ctx,{scanTarget:'land',manualDrawMode:true,_resetManualDrawLayer(){},toggleManualDrawMode(){},
       RESERVOIR_ITEMS_CACHE:[{id:'R1',name:'R 저수지',address:'경북 R군 R리',lat:37.00025,lng:127.00325,area_m2:50000,pv_capacity_kw:500}]});r.controls.manualDcKw={value:''};
     vm.runInContext(extract('window.useReservoirCapacity = function(resId){','async function getRoadRouteCoords'),r.ctx);vm.runInContext(extract('window.finishManualDraw = function(){','window.cancelManualDraw'),r.ctx);
     r.draw=async x=>{r.ctx.manualDrawPoints=[[37,x],[37,x+.0005],[37.0005,x+.0005],[37.0005,x]];r.ctx.finishManualDraw();await vm.runInContext('featureAnalysisQueue',r.ctx);return r.ctx.currentAnalysisData;};return r;};
   // Site A analysed, then '이 저수지로 분석', then the real panel area drawn on the reservoir.
   let r=reservoir();await r.ctx.analyzeFeature(a,true);const siteA=r.ctx.currentAnalysisData;Object.assign(siteA,evidence());
   r.ctx.useReservoirCapacity('R1');assert.equal(r.controls.manualDcKw.value,'500.0');assert.equal(r.ctx.manualDcFromReservoir,true);
   let drawn=await r.draw(127.003);
   assert.notEqual(drawn,siteA,'The drawn area still gets its own record');assert.equal(drawn.reservoir?.id,'R1','Reservoir context survives the manual draw');assert.equal(drawn.land_estimate.land_price_won,0);
   for(const key of Object.keys(evidence()).filter(k=>k!=='land_estimate'))assert.equal(drawn[key],undefined,'A '+key+' leaked into the reservoir drawing');
   assert.equal(r.controls.manualDcKw.value,'','Drawn panels, not the 10% reservoir default, set the DC');assert.equal(r.ctx.manualDcFromReservoir,false);
   let s=finance(drawn);assert.equal(s.capex_land_won,0,'Reservoir finance has no land purchase');assert.equal(s.land_mode,'BUY');
   assert.equal((await r.draw(127.0036)).reservoir?.id,'R1','A second area drawn on the same reservoir stays a reservoir');
   // A clicked (not drawn) site after the reservoir is an ordinary site again: land cost applies.
   await r.ctx.analyzeFeature(b,true);let siteB=r.ctx.currentAnalysisData;assert.equal(siteB.reservoir,undefined);assert.equal(siteB.land_estimate,undefined);
   assert.equal(finance(siteB).capex_land_won,300000000,'Ordinary land finance after leaving the reservoir');
   // '이 저수지로 분석' then clicking another site: neither the reservoir nor its DC default follows.
   r=reservoir();r.ctx.useReservoirCapacity('R1');await r.ctx.analyzeFeature(b,true);siteB=r.ctx.currentAnalysisData;
   assert.equal(siteB.reservoir,undefined);assert.equal(r.controls.manualDcKw.value,'','The reservoir DC default is not B\'s manual DC');assert.equal(r.ctx.manualDcFromReservoir,false);
   // A user-typed manual DC is the user's value and stays.
   r=reservoir();r.ctx.useReservoirCapacity('R1');r.controls.manualDcKw.value='77';Object.assign(r.ctx,{manualDcUserOverride:true,manualDcFromReservoir:false});await r.ctx.analyzeFeature(b,true);assert.equal(r.controls.manualDcKw.value,'77');
   // An area drawn far from the reservoir (another site) does not inherit it.
   r=reservoir();r.ctx.useReservoirCapacity('R1');drawn=await r.draw(127.05);assert.equal(drawn.reservoir,undefined,'A drawing 4 km away is not the reservoir');}
  console.log('PASS site isolation: fresh record per site, multi-roof run/area, stored seed, no DOM KEPCO evidence, long-wait wording, late geocode, single report run, popup outcomes, null score, site-change abort and reservoir manual draw');
})().catch(error=>{console.error(error);process.exitCode=1;});
