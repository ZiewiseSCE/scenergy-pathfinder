const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const assets=fs.existsSync('static/pathfinder/scene-lifecycle.js')?'static/pathfinder/':'assets/pathfinder/';
const source=fs.readFileSync(assets+'scene-lifecycle.js','utf8'),turf=require('../'+assets+'turf-7.1.0.min.js');
const p={widthM:1.13,heightM:2.4,powerW:640,tiltDeg:0,rowGapM:.7,sideGapM:.05,stackRows:2};
const a=turf.polygon([[[127,37],[127.001,37],[127.001,37.001],[127,37.001],[127,37]]]);
const b=turf.transformTranslate(a,.2,90),combined=turf.multiPolygon([a.geometry.coordinates,b.geometry.coordinates]);
const last={geometry:b.geometry,panelInstances:[b],panelSpec:p,revision:7};
const all={type:'FeatureCollection',features:[a,b]},errors=[],sim={};
const env={window:{SolarSim3D:sim,currentAnalysisData:{layoutDocument:last,mode:'roof'},selectedFeatures:new Map([['a',a],['b',b]]),_spGetReportParcelFeature:()=>combined,_spCollectPanelsFCForReport:()=>all,showToast:m=>errors.push(m)},document:{currentScript:{src:'https://qa.test/scene-lifecycle.js'},getElementById:()=>null},PFMainLayout:{spec:()=>p,buildAsync:()=>{throw Error('Must not rebuild a combined scene');}},PFLayoutClient:class{},turf,URL,AbortController,structuredClone};
vm.createContext(env);vm.runInContext(source,env);
(async()=>{
  const actualOpen=sim.open;let payload;sim.open=data=>{payload=data;};
  await env.window._sim3dOpen();assert.equal(errors.length,0);assert.equal(payload.panelsFC.features.length,2);assert.equal(payload.parcelGeoJSON.geometry.type,'MultiPolygon');assert.equal(payload.selectionScope,'multiple');assert.equal(payload.layoutRevision,undefined,'Last-roof revision must not label a combined preview');
  // Exercise the second canonical override in real open(), stopping before WebGL.
  sim.close=()=>{};
  try{actualOpen.call(sim,payload);}catch(e){assert.match(e.message,/cloneNode/);}
  assert.equal(sim._data.panelsFC.features.length,2,'open must not replace combined panels with the last document');assert.equal(sim._data.parcelGeoJSON.geometry.type,'MultiPolygon');
  for(const name of ['updateLayout','recalcPF','removeSelectedPanel','adjustPanel','resetSelectedPanel'])await sim[name]();
  assert.equal(errors.length,5);assert.equal(sim._data.panelsFC.features.length,2);
  env.window.selectedFeatures=new Map([['b',b]]);await env.window._sim3dOpen();assert.equal(payload.panelsFC.features.length,1);assert.equal(payload.layoutRevision,7);assert.equal(payload.selectionScope,'single');
  env.window.selectedFeatures=new Map([['a',a],['b',b]]);env.window._spCollectPanelsFCForReport=()=>({features:[]});await env.window._sim3dOpen();assert.match(errors.at(-1),/배치가 없습니다/);
  console.log('PASS multi-selection scene: final runtime entry, canonical override, full boundary/count, edit guard, single-selection revision, no stale fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
