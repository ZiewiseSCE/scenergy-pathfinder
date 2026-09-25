const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8'),controls={installAngle:{value:'0'},rowSpacing:{value:'0'},moduleOrient:{value:'portrait'},modWidth:{value:'3'},modHeight:{value:'1'},arrayStackRows:{value:'1'},sunAltitude:{value:'30'}};
const ctx={window:{},document:{getElementById:id=>controls[id]}};vm.createContext(ctx);
const start=html.indexOf('window.computeMinRowSpacing = function(');
vm.runInContext(html.slice(start,html.indexOf('window.reCalculate =',start)),ctx);
assert.equal(ctx.window.computeMinRowSpacing(0,2.4,2,30),0);ctx.window.autoUpdateRowSpacing();assert.equal(controls.rowSpacing.value,'0');
controls.installAngle.value='30';ctx.window.autoUpdateRowSpacing();assert.equal(controls.rowSpacing.value,'0.9');
controls.moduleOrient.value='landscape';controls.rowSpacing.value='0';ctx.window.autoUpdateRowSpacing();assert.equal(controls.rowSpacing.value,'2.6');
const body=html.slice(html.indexOf('window.reCalculate = async function(){'),html.indexOf('  const recalcSite=PFMainLayout.identity();'))+'};';
let result={status:'assessment_required',features:[],reason:'no image'},saves=[];
Object.assign(ctx,{FEATURE_LEVEL:3,selectedFeatures:new Map([['a',{}]]),currentAnalysisData:{layoutDocument:{geometry:{coordinates:[[]]}}},showToast(){},applyCalibrationToFC:x=>x,PFMainLayout:{buildAsync:async()=>result,persist:async(...args)=>saves.push(args),spec:()=>({tiltDeg:0})}});
vm.runInContext(body,ctx);
(async()=>{await ctx.window.reCalculate();assert.equal(saves.length,0,'Missing imagery must preserve the saved design');result={status:'ok',features:[{}],panelSpec:{tiltDeg:20}};await ctx.window.reCalculate();assert.equal(saves[0][2].tiltDeg,20);assert.equal(saves[0][3],'main-recalculate');console.log('PASS zero tilt, custom dimensions, blocked review preserves design and calculated roof slope persists.');})().catch(e=>{console.error(e);process.exitCode=1;});

