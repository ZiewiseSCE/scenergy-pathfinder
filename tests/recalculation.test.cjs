// 이격 여유율 is the only spacing input: changing it recalculates, and the spec gaps follow the shared vectors.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8'),core=require('../assets/pathfinder/layout-core.js');
const input=(id,value)=>({id,value:String(value),dataset:{}});
const controls=Object.fromEntries(Object.entries({modWidth:1.134,modHeight:2.465,modPower:640,installAngle:15,arrayStackRows:3,moduleOrient:'portrait',layoutMarginPct:25}).map(([id,value])=>[id,input(id,value)]));
let mode='roof',recalculations=0;
const window={addEventListener(){},currentAnalysisData:{},PFScanMode:()=>mode,reCalculate:()=>{recalculations++;return 'queued';}};
const page={window,document:{currentScript:{src:'https://qa.test/assets/pathfinder/main-layout.js'},getElementById:id=>controls[id]||null},el:id=>controls[id],URL,PFLayout:core,PFRoofPlan:require('../assets/pathfinder/roof-plan.js'),PFLayoutClient:class{cancel(){}}};
vm.createContext(page);vm.runInContext(fs.readFileSync('assets/pathfinder/main-layout.js','utf8'),page);
// The real mode-defaults / parameter-input code of the page (also runs the page-load call: roof defaults).
const start=html.indexOf('const PF_MODE_DEFAULTS = {'),end=html.indexOf('// Feature 2: Mode toggle (F-5)',start);
assert.ok(start>0&&end>start,'mode defaults block present');vm.runInContext(html.slice(start,end),page);
const spec=()=>window.PFMainLayout.spec(),values=()=>Object.fromEntries(Object.entries(controls).map(([id,c])=>[id,c.value]));
assert.deepEqual(values(),{modWidth:'1.134',modHeight:'2.465',modPower:'640',installAngle:'10',arrayStackRows:'2',moduleOrient:'landscape',layoutMarginPct:'10'},'The page starts with the roof defaults');
assert.deepEqual([spec().rowGapM,spec().sideGapM,spec().setbackM,spec().marginPct,spec().edgePct],[.682,.02,0,10,10]);

// The inputs call the real handler from their markup.
const tag=id=>{const m=html.match(new RegExp('<(?:input|select)\\b[^>]*\\bid="'+id+'"[^>]*>'));assert.ok(m,id+' input present');return m[0];};
const change=(id,value)=>{controls[id].value=String(value);const handler=tag(id).match(/onchange="([^"]+)"/)[1];return vm.runInContext('(function(){return '+handler+'}).call(document.getElementById("'+id+'"))',page);};
for(const id of ['modWidth','modHeight','modPower','installAngle','arrayStackRows','moduleOrient','layoutMarginPct'])assert.match(tag(id),/onchange="window\.onLayoutParamInput\(this\)"/,id);
assert.match(tag('layoutMarginPct'),/type="number"/);for(const attribute of ['min="0"','max="40"','step="1"','value="10"'])assert.ok(tag('layoutMarginPct').includes(attribute),attribute);
assert.ok(html.includes('이격 여유율(%)</label>'));assert.ok(html.includes('경계(지적도·지붕 외곽) 면적 중 가장자리에 비워 두는 비율입니다. 기본 10%면 경계에서 안쪽으로 면적의 10%를 띄우고 그 안에 모듈을 붙여 배치합니다. 경사 설치는 줄 사이에 겨울 그림자 간격을 둡니다.'));

// Changing the margin recalculates once and the spacing follows the shared vector (roof, 10°, 2 rows, landscape, 20%):
// the percentage is the edge margin (edgePct), the modules stay joined and the tilted racks keep the winter shade pitch.
assert.equal(change('layoutMarginPct',20),'queued');assert.equal(recalculations,1);assert.equal(controls.layoutMarginPct.dataset.pfUserEdited,'1');
assert.deepEqual([spec().marginPct,spec().edgePct,spec().rowGapM,spec().sideGapM,spec().setbackM],[20,20,.682,.02,0]);
change('layoutMarginPct',0);assert.deepEqual([spec().rowGapM,spec().sideGapM,spec().edgePct],[.682,.02,0]);assert.equal(recalculations,2);
// Typing outside 0–40 or nothing becomes a usable value, so later calculations never fail on the margin.
change('layoutMarginPct',55);assert.equal(controls.layoutMarginPct.value,'40');change('layoutMarginPct',-3);assert.equal(controls.layoutMarginPct.value,'0');
change('layoutMarginPct','');assert.equal(controls.layoutMarginPct.value,'10');change('layoutMarginPct',12.5);assert.equal(spec().marginPct,12.5);
// Every shared vector through the page inputs, in both modes.
for(const [m,w,h,tilt,stack,orientation,pct,row,side] of [
  ['roof',1.134,2.465,10,2,'landscape',10,.682,.02],['roof',1.134,2.465,0,1,'portrait',10,.02,.02],['roof',1.134,2.465,10,2,'landscape',0,.682,.02],
  ['roof',1.134,2.465,10,2,'landscape',20,.682,.02],['land',1.134,2.465,15,3,'landscape',10,1.525,.02],['land',1.303,2.384,15,3,'landscape',15,1.752,.02],
  ['land',1.134,2.465,0,1,'portrait',10,.02,.02],['land',1.134,2.465,30,2,'portrait',5,4.27,.02],['roof',1.134,1.961,10,2,'landscape',40,.682,.02]]){
  mode=m;change('modWidth',w);change('modHeight',h);change('installAngle',tilt);change('arrayStackRows',stack);change('moduleOrient',orientation);change('layoutMarginPct',pct);
  const p=spec();assert.deepEqual([p.rowGapM,p.sideGapM,p.setbackM,p.marginPct],[row,side,0,pct],[m,w,h,tilt,stack,orientation,pct].join(' '));
}
// The distance inputs and the row-spacing machinery that fed them are gone.
assert.doesNotMatch(html,/\bid="(?:setbackDist|rowSpacing|arraySideGap|sunAltitude|installHeight|arrayRows|arrayCols|sim3dRowGapSlider|sim3dPanelGapSlider)"/);
assert.equal(html.includes('autoUpdateRowSpacing'),false);assert.equal(html.includes('window.computeMinRowSpacing = function('),false);
assert.doesNotMatch(html,/getElementById\("(?:setbackDist|rowSpacing|arraySideGap|sunAltitude|installHeight|arrayRows|arrayCols)"\)|el\("(?:setbackDist|rowSpacing|arraySideGap|sunAltitude|installHeight|arrayRows|arrayCols)"\)/,'No reader of a removed input remains');
assert.doesNotMatch(html,/\bsetback_m\s*:\s*(?:parseFloat|\(function)/,'setback_m is not sent with an analysis request');

// A saved design: a blocked roof review keeps it, a successful recalculation persists the calculated spec.
const ctx={window:{}};vm.createContext(ctx);
const body=html.slice(html.indexOf('async function recalculateSelectedFeatures(){'),html.indexOf('  const recalcSite=PFMainLayout.identity();'))+'}; window.reCalculate=recalculateSelectedFeatures;';
let result={status:'assessment_required',features:[],reason:'no image'},saves=[];
Object.assign(ctx,{FEATURE_LEVEL:3,selectedFeatures:new Map([['a',{}]]),currentAnalysisData:{layoutDocument:{geometry:{coordinates:[[]]}}},showToast(){},applyCalibrationToFC:x=>x,PFMainLayout:{buildAsync:async()=>result,persist:async(...args)=>saves.push(args),spec:()=>({tiltDeg:0})}});
vm.runInContext(body,ctx);
(async()=>{await ctx.window.reCalculate();assert.equal(saves.length,0,'Missing imagery must preserve the saved design');result={status:'ok',features:[{}],panelSpec:{tiltDeg:20,marginPct:15}};await ctx.window.reCalculate();assert.equal(saves[0][2].tiltDeg,20);assert.equal(saves[0][2].marginPct,15);assert.equal(saves[0][3],'main-recalculate');console.log('PASS margin input recalculates, shared gap vectors in both modes, input clamping, removed distance inputs, blocked review preserves design and the calculated spec persists.');})().catch(e=>{console.error(e);process.exitCode=1;});
