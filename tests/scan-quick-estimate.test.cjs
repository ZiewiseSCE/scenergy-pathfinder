// Scan-candidate quick estimate: the engine's lattice share of 이격 여유율 (the edge margin leaves 1 - margin of the area,
// tilted rows also keep the winter shade pitch) times the polygon shape loss, read-only on the studio inputs.
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
// Roof (10° racks): floor(A × lattice share × 0.92 / (across × slope × cos tilt)), the server's area estimate. The share is
// the engine's: the edge margin leaves 90% of the boundary's area, the joined modules keep the 2 cm clamp gap and the racks
// the winter shade pitch H / (H + shade).
const H10=2*1.134*cos(10),shade10=2*1.134*Math.sin(10*Math.PI/180)/Math.tan(30*Math.PI/180),rows10=2.465/2.485*H10/(H10+shade10),share10=.9*rows10;
let t=setup('building'),c=t.candidate(1000,'roof');
assert.ok(Math.abs(core.latticeShare(t.window.PFMainLayout.marginSpec())-share10)<.001);
assert.equal(c.panel_count,Math.floor(1000*core.latticeShare(t.window.PFMainLayout.marginSpec())*.92/(2.465*1.134*cos(10))));assert.equal(c.panel_count,228);
assert.equal(c.project_dc_kw,228*640/1000);assert.equal(c.area_m2,1000);assert.equal(c.mode,'roof');
assert.deepEqual(t.writes,[],'The estimate never writes to a studio input');
// The margin is the only knob on top of the row spacing: 0% keeps the whole area, 40% leaves 60% of it.
t=setup('building',{layoutMarginPct:0});c=t.candidate(1000,'roof').panel_count;assert.ok(Math.abs(c-1000*rows10*.92/(2.465*1.134*cos(10)))<=1,String(c));
t=setup('building',{layoutMarginPct:40});c=t.candidate(1000,'roof').panel_count;assert.ok(Math.abs(c-1000*.6*rows10*.92/(2.465*1.134*cos(10)))<=1,String(c));
// The selected module's size and output are used (not a fixed 1.13 × 2.4 m panel).
t=setup('building',{modWidth:1.303,modHeight:2.384,modPower:720});c=t.candidate(1000,'roof');
assert.equal(c.panel_count,Math.floor(1000*core.latticeShare(t.window.PFMainLayout.marginSpec())*.92/(2.384*1.303*cos(10))));assert.equal(c.project_dc_kw,c.panel_count*720/1000);
// Land: tilted rows keep their shade pitch, so the density is below 1 − margin.
t=setup('land',{installAngle:15,arrayStackRows:3});const p=t.window.PFMainLayout.spec();
assert.deepEqual([p.rowGapM,p.sideGapM,p.edgePct],[1.525,.02,10]);c=t.candidate(10000,'land');
const block15=3*1.134*cos(15);assert.equal(c.panel_count,Math.floor(10000*.92*core.latticeShare(p)/(2.465*1.134*cos(15))));
assert.ok(Math.abs(core.latticeShare(p)-.9*2.465/2.485*block15/(block15+1.525))<1e-9);
assert.ok(c.panel_count<Math.floor(10000*.9*.92/(2.465*1.134*cos(15))),'Shade pitch lowers the land estimate');assert.deepEqual(t.writes,[]);
// Flat land (0°) has no shade pitch: 1 − margin of the area, less the clamp gaps of the joined modules.
t=setup('land',{installAngle:0,arrayStackRows:1,moduleOrient:'portrait'});c=t.candidate(10000,'land').panel_count;
assert.ok(Math.abs(c-10000*.9*(1.134/1.154)*(2.465/2.485)*.92/(2.465*1.134))<=1,String(c));
// No area or invalid inputs: no estimate, never a guessed packing ratio.
t=setup('building');c=t.candidate(0,'roof');assert.equal(c.panel_count,null);assert.equal(c.project_dc_kw,null);
t=setup('building',{layoutMarginPct:''});c=t.candidate(1000,'roof');assert.equal(c.panel_count,null);assert.equal(c.project_dc_kw,null);assert.equal(c.area_m2,1000);
assert.equal(/PACKING_RATIO|equipDeductArea|\.value\s*=/.test(code),false,'No packing constants, equipment-room deduction or input writes remain');
console.log('PASS scan quick estimate: engine lattice share on roofs (228 panels / 1,000 ㎡ with module #1: 10% edge margin + 10° shade pitch), shade pitch on tilted land, selected module size, read-only inputs, no estimate for invalid input.');
