const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8'),core=require('../assets/pathfinder/layout-core.js');
const tick=()=>new Promise(setImmediate);
function deferred(){let resolve;return {promise:new Promise(r=>resolve=r),resolve};}
function roof(x,name){return {type:'Feature',properties:{pnu:'same-parcel',addr:name},geometry:{type:'Polygon',coordinates:[[[x,37],[x+.0005,37],[x+.0005,37.0005],[x,37.0005],[x,37]]]}};}
function setup(){
  const holds=[],calls=[],toasts=[],controls={multiSelectToggle:{checked:false},modPower:{value:640}},layers=new Set();
  let block=false,fail=false;
  const ctx={console,URL,URLSearchParams,DOMException,AbortSignal,structuredClone,Promise,Map,Date,Math,FEATURE_LEVEL:3,isMultiSelectMode:false,scanTarget:'building',selectedFeatures:new Map(),currentAnalysisFeature:null,currentAnalysisData:{},
    document:{currentScript:{src:'https://qa.test/assets/pathfinder/main-layout.js'},getElementById:id=>controls[id]},
    el:id=>controls[id],showToast:s=>toasts.push(s),switchTab(){},resetCalibrationInternal(){},applyCalibrationToFC:x=>x,polygonAreaM2:()=>100,
    updateResultCardBasics:(addr,count)=>{ctx.result={addr,count};},calculateFinance:count=>{ctx.financeCount=count;},
    panelGroup:{clearLayers:()=>layers.clear(),removeLayer:layer=>layers.delete(layer)},selectableGroup:{clearLayers(){ctx.candidates=[];}},analysisMarkerGroup:{clearLayers(){}},candidates:['A','B','C'],
    renderPanelsFC:fc=>({fc,addTo(){layers.add(this);}}),addEventListener(){},
    PFLayout:core,PFRoofPlan:require('../assets/pathfinder/roof-plan.js'),
    PFRoofPlanner:{clear(){},prepareInput(g,p){return block?{blocked:true,reason:'no imagery'}:{geometry:g,panelSpec:p,keepouts:[]};},async ensure(g){calls.push(g);const h=holds.shift();if(h)await h.promise;if(fail){fail=false;throw new Error('assessment failed');}}},
    PFLayoutClient:class{cancel(){} async calculate(input){return core.calculate(input,ctx.turf);}},
    fetch:async()=>({ok:false}),crypto:{randomUUID:()=>''},localStorage:{getItem:()=>null,setItem(){}},
  };
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/pathfinder/turf-7.1.0.min.js','utf8'),ctx);
  ctx.L={geoJSON:f=>({getBounds:()=>({getCenter:()=>{const [lng,lat]=ctx.turf.center(f).geometry.coordinates;return {lat,lng};}})})};ctx.map={getCenter:()=>({lat:37,lng:127}),distance:(a,b)=>ctx.turf.distance([a.lng,a.lat],[b.lng,b.lat])*1000};
  for(const [start,end] of [
    ['function getFeatureId(feature){','// Auto-scan candidate collection'],
    ['// Analyze feature (F-6)','// Import the exact public cadastral geometry'],
    ['function getTotalPanelCount(){','// Recalculate panels after parameter changes'],
    ['window.reCalculate = function(){','// D-pad calibration (F-10)'],
    ['function clearAnalysisOnly(','// Boot'],
    ['window.toggleMultiSelect = function(){','// Auto scan toggle (F-13/14)'],
  ]){const pos=html.indexOf(start);assert.ok(pos>=0,start);vm.runInContext(html.slice(pos,html.indexOf(end,pos)),ctx);}
  vm.runInContext(fs.readFileSync('assets/pathfinder/main-layout.js','utf8'),ctx);
  return {ctx,calls,layers,toasts,holds,controls,setBlocked:v=>block=v,setFailure:()=>fail=true,multi(){controls.multiSelectToggle.checked=true;ctx.toggleMultiSelect();}};
}
(async()=>{
  const pane={style:{}},preview={map:{getPane:()=>null,createPane:()=>pane},L:{geoJSON:(fc,options)=>options},PFPanelVisuals:{leafletRenderer:(_L,options)=>options}};preview.window=preview;vm.createContext(preview);
  vm.runInContext(html.slice(html.indexOf('var _spModuleRenderer='),html.indexOf('function getFeatureId(')),preview);
  const rendered=preview.renderPanelsFC({features:[]});assert.equal(pane.style.pointerEvents,'none');assert.equal(rendered.interactive,false);assert.equal(rendered.renderer.pane,'pfModulePreview','Panel texture canvas must not intercept roof clicks');
  const a=roof(127,'A'),b=roof(127.001,'B'),c=roof(127.002,'C');
  let t=setup();assert.notEqual(t.ctx.getFeatureId(a),t.ctx.getFeatureId(b),'Separate roofs on the same parcel need separate selection IDs');
  assert.equal(t.ctx.getFeatureId(a),t.ctx.getFeatureId({...a,geometry:{coordinates:a.geometry.coordinates,type:'Polygon'}}),'Object key order must not change selection identity');
  await t.ctx.analyzeFeature(a,true);const countA=t.ctx.getTotalPanelCount();assert.ok(countA>0);
  t.multi();assert.equal(t.ctx.candidates.length,3,'Enabling multi-select preserves clickable search results');assert.equal(t.ctx.getTotalPanelCount(),countA);
  const gate=deferred();t.holds.push(gate);const second=t.ctx.analyzeFeature(b,true);await tick();const third=t.ctx.analyzeFeature(c,true);await tick();
  assert.equal(t.calls.length,2,'Third roof waits while the second roof is being assessed');gate.resolve();await Promise.all([second,third]);
  assert.equal(t.ctx.selectedFeatures.size,3);assert.equal(t.layers.size,3);assert.equal(t.ctx.getTotalPanelCount(),countA*3);assert.equal(t.ctx.financeCount,countA*3);
  await t.ctx.analyzeFeature(c,true);assert.equal(t.ctx.selectedFeatures.size,2);assert.equal(t.layers.size,2);assert.equal(t.ctx.currentAnalysisFeature,b);assert.equal(t.ctx.currentAnalysisData.address,'B');assert.equal(t.ctx.result.count,countA*2);
  // Recalculation and another click share the queue, without cancelling a roof.
  const recalcGate=deferred();t.holds.push(recalcGate);const recalc=t.ctx.reCalculate();await tick();const reselect=t.ctx.analyzeFeature(c,true);recalcGate.resolve();await Promise.all([recalc,reselect]);assert.equal(t.layers.size,3);
  t.setBlocked(true);const previous=[...t.layers];await t.ctx.reCalculate();assert.deepEqual([...t.layers],previous,'Missing imagery must not erase existing layouts');t.setBlocked(false);
  await t.ctx.analyzeFeature(a,true);assert.equal(t.ctx.currentAnalysisFeature,c,'Deselecting another roof keeps the current roof metadata');assert.equal(t.ctx.currentAnalysisData.address,'C');
  await t.ctx.analyzeFeature(b,true);await t.ctx.analyzeFeature(c,true);assert.equal(t.layers.size,0);assert.equal(t.ctx.getTotalPanelCount(),0);
  await t.ctx.analyzeFeature(a,true);await Promise.all([t.ctx.analyzeFeature(a,true),t.ctx.analyzeFeature(b,true)]);assert.equal(t.ctx.selectedFeatures.size,1);assert.equal(t.ctx.currentAnalysisFeature,b,'Removing the last roof must not drop the next queued click');
  // Reset and a new site must proceed immediately, even if an old request hangs.
  t=setup();t.multi();const stale=deferred();t.holds.push(stale);const old=t.ctx.analyzeFeature(a,true);await tick();const queued=t.ctx.analyzeFeature(b,true);t.ctx.clearResults(false);await t.ctx.analyzeFeature(c,true);stale.resolve();await Promise.all([old,queued]);assert.equal(t.ctx.selectedFeatures.size,1);assert.equal(t.ctx.currentAnalysisFeature,c);assert.equal(t.layers.size,1);
  // A failure cannot strand later selected roofs.
  t=setup();t.multi();t.setFailure();await Promise.all([t.ctx.analyzeFeature(a,true),t.ctx.analyzeFeature(b,true)]);assert.equal(t.ctx.selectedFeatures.size,1);assert.equal(t.ctx.currentAnalysisFeature,b);
  // Single selection still has latest-click-wins behavior.
  t=setup();const slow=deferred();t.holds.push(slow);const first=t.ctx.analyzeFeature(a,true);await tick();await t.ctx.analyzeFeature(b,true);slow.resolve();await first;assert.equal(t.ctx.selectedFeatures.size,1);assert.equal(t.ctx.currentAnalysisFeature,b);
  // Turning accumulation off cancels queued work, while retaining search targets.
  t=setup();t.multi();const pending=deferred();t.holds.push(pending);const selecting=t.ctx.analyzeFeature(a,true);await tick();const waiting=t.ctx.analyzeFeature(b,true);t.controls.multiSelectToggle.checked=false;t.ctx.toggleMultiSelect();pending.resolve();await Promise.all([selecting,waiting]);assert.equal(t.ctx.selectedFeatures.size,0);assert.equal(t.ctx.candidates.length,3);
  console.log('PASS multi-roof selection: same parcel, preserved candidates, rapid clicks, deselection, totals, recalculation, imagery failure, reset, mode change and latest single selection.');
})().catch(error=>{console.error(error);process.exitCode=1;});
