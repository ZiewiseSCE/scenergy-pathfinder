// Scan-candidate quick estimate: the lattice density of 이격 여유율 (1 - margin on a roof, shade pitch on tilted
// land) times the polygon shape loss, read-only on the studio inputs.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8'),core=require('../assets/pathfinder/layout-core.js');
const start=html.indexOf('function spQuickPanelDensity(){'),end=html.indexOf('function spAddScanCandidate(',start);
assert.ok(start>0&&end>start,'quick estimate present');const code=html.slice(start,end);
function setup(target,values){
  const writes=[],controls={};
  for(const [id,value] of Object.entries({modWidth:1.134,modHeight:2.465,modPower:640,installAngle:10,arrayStackRows:2,moduleOrient:'landscape',layoutMarginPct:10,...values})){
    let current=String(value);controls[id]={id,get value(){return current;},set value(v){writes.push([id,v]);current=String(v);}};
  }
  const window={addEventListener(){},currentAnalysisData:{}};
  const ctx={window,console:{warn(){}},document:{currentScript:{src:'https://qa.test/assets/pathfinder/main-layout.js'},getElementById:id=>controls[id]||null},el:id=>controls[id],URL,scanTarget:target,
    PFLayout:core,PFRoofPlan:require('../assets/pathfinder/roof-plan.js'),PFLayoutClient:class{cancel(){}},
    turf:{center:()=>({geometry:{coordinates:[127,37]}})},getFeatureId:f=>f.properties.pnu,polygonAreaM2:g=>g.areaM2};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/pathfinder/main-layout.js','utf8'),ctx);vm.runInContext(code,ctx);
  const candidate=(areaM2,mode)=>ctx.spBuildCandidateFromFeature({properties:{pnu:'p'+areaM2,addr:'QA'},geometry:{type:'Polygon',areaM2}},null,mode);
  return {ctx,window,controls,writes,candidate};
}
const cos=deg=>Math.cos(deg*Math.PI/180);
// Roof: floor(A × (1 − margin) × 0.92 / (across × slope × cos tilt)), the same formula as the server's area estimate.
let t=setup('building'),c=t.candidate(1000,'roof');
assert.equal(c.panel_count,Math.floor(1000*.9*.92/(2.465*1.134*cos(10))));assert.equal(c.panel_count,300);
assert.equal(c.project_dc_kw,300*640/1000);assert.equal(c.area_m2,1000);assert.equal(c.mode,'roof');
assert.deepEqual(t.writes,[],'The estimate never writes to a studio input');
// The margin is the only spacing knob: 0% fills everything but the shape loss, 40% leaves 60%.
t=setup('building',{layoutMarginPct:0});assert.equal(t.candidate(1000,'roof').panel_count,Math.floor(1000*.92/(2.465*1.134*cos(10))));
t=setup('building',{layoutMarginPct:40});c=t.candidate(1000,'roof').panel_count;assert.ok(Math.abs(c-1000*.6*.92/(2.465*1.134*cos(10)))<=1,String(c));
// The selected module's size and output are used (not a fixed 1.13 × 2.4 m panel).
t=setup('building',{modWidth:1.303,modHeight:2.384,modPower:720});c=t.candidate(1000,'roof');
assert.equal(c.panel_count,Math.floor(1000*.9*.92/(2.384*1.303*cos(10))));assert.equal(c.project_dc_kw,c.panel_count*720/1000);
// Land: tilted rows keep their shade pitch, so the density is the layout engine's lattice, below 1 − margin.
t=setup('land',{installAngle:15,arrayStackRows:3});const p=t.window.PFMainLayout.spec();
assert.deepEqual([p.rowGapM,p.sideGapM],[1.525,.152]);c=t.candidate(10000,'land');
assert.equal(c.panel_count,Math.floor(10000*.92*3/((2.465+.152)*(3*1.134*cos(15)+1.525))));
assert.ok(c.panel_count<Math.floor(10000*.9*.92/(2.465*1.134*cos(15))),'Shade pitch lowers the land estimate');assert.deepEqual(t.writes,[]);
// Flat land (0°) has no shade pitch: exactly 1 − margin again.
t=setup('land',{installAngle:0,arrayStackRows:1,moduleOrient:'portrait'});c=t.candidate(10000,'land').panel_count;
assert.ok(Math.abs(c-10000*.9*.92/(2.465*1.134))<=2,String(c));
// No area or invalid inputs: no estimate, never a guessed packing ratio.
t=setup('building');c=t.candidate(0,'roof');assert.equal(c.panel_count,null);assert.equal(c.project_dc_kw,null);
t=setup('building',{layoutMarginPct:''});c=t.candidate(1000,'roof');assert.equal(c.panel_count,null);assert.equal(c.project_dc_kw,null);assert.equal(c.area_m2,1000);
assert.equal(/PACKING_RATIO|equipDeductArea|\.value\s*=/.test(code),false,'No packing constants, equipment-room deduction or input writes remain');
console.log('PASS scan quick estimate: 1 − 이격 여유율 on roofs (300 panels / 1,000 ㎡ with module #1), shade pitch on tilted land, selected module size, read-only inputs, no estimate for invalid input.');
