// Mode defaults (DESIGN section 2): one function at page load, on the roof/land toggle and when a saved
// site or parcel sets the mode. A value the user changed in this session is never overwritten.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8'),core=require('../assets/pathfinder/layout-core.js');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i+a.length);assert(i>=0&&j>i,a);return html.slice(i,j);};
function classes(...initial){const set=new Set(initial);return {toggle(name,on){on?set.add(name):set.delete(name);},contains:name=>set.has(name)};}
function setup(markup={}){
  const input=(id,value)=>({id,value:String(value),dataset:{}});
  // Start from values that are NOT the defaults, as a stale page or a design written back by apply() would leave them.
  const controls=Object.fromEntries(Object.entries({installAngle:23,arrayStackRows:4,moduleOrient:'portrait',layoutMarginPct:25,costPerKw:100,...markup}).map(([id,value])=>[id,input(id,value)]));
  controls.pfRoofDefaultsBtn={classList:classes()};controls.setbackRowBlock={style:{}};
  const radios=[{value:'land',checked:false},{value:'building',checked:true}],toasts=[],log=[];let recalculations=0,cleared=0,synced=[];
  const window={reCalculate:()=>{recalculations++;},updateTenureUi(){},SolarSim3D:{syncMargin:value=>synced.push(String(value))}};
  const ctx={window,document:{readyState:'complete',getElementsByName:()=>radios,getElementById:id=>controls[id],querySelectorAll:()=>radios},el:id=>controls[id],PFLayout:core,FEATURE_LEVEL:5,
    showToast:text=>toasts.push(text),logSystem:text=>log.push(text),clearResults:()=>{cleared++;},console};
  vm.createContext(ctx);
  vm.runInContext(extract('let scanTarget = "building";','let autoScanMode'),ctx);
  vm.runInContext(extract('const PF_MODE_DEFAULTS = {','// Feature 2: Mode toggle (F-5)'),ctx);
  vm.runInContext(extract('window.toggleTarget = function(){','// Feature 1: Address search (F-4)'),ctx);
  const values=()=>['installAngle','arrayStackRows','moduleOrient','layoutMarginPct','costPerKw'].map(id=>controls[id].value);
  const toggle=target=>{for(const r of radios)r.checked=r.value===target;window.toggleTarget();};
  const edit=(id,value)=>{controls[id].value=String(value);window.onLayoutParamInput(controls[id]);};
  return {ctx,window,controls,radios,toasts,values,toggle,edit,synced,counts:()=>({recalculations,cleared})};
}
// Markup: the page ships the roof row (tilt 10, 2 rows, landscape, 10%) and module #1's size.
for(const [id,value] of [['installAngle','10'],['arrayStackRows','2'],['layoutMarginPct','10'],['modWidth','1.134'],['modHeight','2.465'],['modPower','640'],['costPerKw','100']]){
  const tag=html.match(new RegExp('<input\\b[^>]*\\bid="'+id+'"[^>]*>'));assert.ok(tag,id);assert.ok(tag[0].includes('value="'+value+'"'),id+' default '+value+': '+tag[0].match(/value="[^"]*"/));
}
assert.match(html,/<select[^>]*id="moduleOrient"[^>]*><option value="landscape" selected>/);

// 1) Page load: roof mode with the roof row, whatever the fields held.
let t=setup();assert.equal(t.window.PFScanMode(),'roof','scanTarget "building" is a roof');
assert.deepEqual(t.values(),['10','2','landscape','10','100']);assert.equal(t.controls.pfRoofDefaultsBtn.classList.contains('hidden'),false);
assert.deepEqual(t.synced,['10'],'The 3D margin slider follows');
// 2) Toggle to land and back: tilt 15/10, rows 3/2, 시공비 150/100; the selection is cleared, nothing is recalculated.
t.toggle('land');assert.equal(t.window.PFScanMode(),'land');assert.deepEqual(t.values(),['15','3','landscape','10','150']);
assert.equal(t.toasts.at(-1),'토지 모드: 경사 15° · 3단 · 이격 여유율 10% · 시공비 150만/kW');assert.equal(t.controls.setbackRowBlock.style.display,'');
assert.equal(t.controls.pfRoofDefaultsBtn.classList.contains('hidden'),true,'The roof reference reset is hidden in land mode');
t.toggle('building');assert.deepEqual(t.values(),['10','2','landscape','10','100']);assert.equal(t.toasts.at(-1),'지붕 모드: 경사 10° · 2단 · 이격 여유율 10% · 시공비 100만/kW');
assert.equal(t.controls.pfRoofDefaultsBtn.classList.contains('hidden'),false);assert.equal(t.controls.setbackRowBlock.style.display,'none');
assert.deepEqual(t.counts(),{recalculations:0,cleared:2});
for(const toast of t.toasts)assert.doesNotMatch(toast,/이격 2m|이격 0\.5m|이격 [0-9.]+m/,'No boundary distance in the mode toast');
// 3) User edits are kept explicitly: even a value that looks like a default (the old heuristic overwrote 2/3 and 5…25).
t=setup();t.edit('arrayStackRows',3);t.edit('installAngle',20);t.edit('layoutMarginPct',15);assert.equal(t.counts().recalculations,3);
t.toggle('land');assert.deepEqual(t.values(),['20','3','landscape','15','150']);assert.match(t.toasts.at(-1),/^토지 모드: 경사 20° · 3단 · 이격 여유율 15% · 시공비 150만\/kW \(직접 수정한 값은 유지\)$/);
t.toggle('building');assert.deepEqual(t.values(),['20','3','landscape','15','100'],'The user-chosen 3 rows / 20° / 15% survive the round trip');
// … while an untouched value follows the table even when it does not look like a default.
t.controls.moduleOrient.value='portrait';t.toggle('land');assert.equal(t.controls.moduleOrient.value,'landscape');
// 4) 시공비 uses its own edit flag (finance inputs / saved preferences).
t=setup();t.controls.costPerKw.value='130';t.controls.costPerKw.dataset.pfManual='1';t.toggle('land');assert.equal(t.controls.costPerKw.value,'130');
assert.match(t.toasts.at(-1),/시공비 130만\/kW \(직접 수정한 값은 유지\)$/);
delete t.controls.costPerKw.dataset.pfManual;t.toggle('building');assert.equal(t.controls.costPerKw.value,'100');
// 5) A stored parcel switches to land without the toggle: it is laid out with the land defaults.
(async()=>{
  t=setup();const seen=[];
  Object.assign(t.ctx,{clearAnalysisOnly(){},analyzeFeature:async()=>{seen.push(t.values());},map:null,currentAnalysisData:{}});
  vm.runInContext(extract('window.PFLoadParcel=async function(parcel){','function getTotalPanelCount(){'),t.ctx);
  t.edit('layoutMarginPct',20);
  await t.window.PFLoadParcel({geometry:{type:'Polygon',coordinates:[]},pnu:'1'.repeat(19),address:'저장 필지',lat:37,lng:127,areaM2:100});
  assert.deepEqual(seen,[['15','3','landscape','20','150']],'Land defaults before the layout, the edited margin kept');assert.equal(t.window.PFScanMode(),'land');
  // 6) A stored analysis sets the mode too.
  t=setup();Object.assign(t.ctx,{normalizeRoofChecksPayload:x=>x,currentAnalysisData:{},URLSearchParams,location:{search:''}});
  vm.runInContext(extract('window.PFLoadStoredAnalysis=function','\n};\n')+'\n};',t.ctx);
  t.window.PFLoadStoredAnalysis({mode:'land'},{address:'저장 현장',mode:'land'});assert.deepEqual(t.values(),['15','3','landscape','10','150']);
  t.window.PFLoadStoredAnalysis({},{address:'저장 지붕',mode:'roof'});assert.deepEqual(t.values(),['10','2','landscape','10','100']);
  console.log('PASS mode defaults: roof row at load, land/roof toggle, explicit user edits kept (also default-looking ones), 시공비 flag, hidden roof reset in land, stored parcel and stored analysis.');
})().catch(e=>{console.error(e);process.exitCode=1;});
