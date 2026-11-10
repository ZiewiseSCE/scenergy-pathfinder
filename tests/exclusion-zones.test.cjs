// 설치 제외(제척) zones of the applied design on the main map: drawn translucent red and non-interactive,
// replaced with each design and removed when the site, the selection or the layout is reset.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8'),core=require('../assets/pathfinder/layout-core.js');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);};
function roof(x,name){return {type:'Feature',properties:{pnu:name,addr:name},geometry:{type:'Polygon',coordinates:[[[x,37],[x+.0005,37],[x+.0005,37.0005],[x,37.0005],[x,37]]]}};}
const zone=x=>({type:'Polygon',coordinates:[[[x+.0001,37.0001],[x+.0002,37.0001],[x+.0002,37.0002],[x+.0001,37.0002],[x+.0001,37.0001]]]});
// Leaflet double: remembers the layers currently on the map and how they were created.
function leaflet(ctx){
  const onMap=new Set(),panes={};
  ctx.map={getPane:name=>panes[name]||null,createPane:name=>(panes[name]={style:{}}),getCenter:()=>({lat:37,lng:127}),distance:(a,b)=>ctx.turf.distance([a.lng,a.lat],[b.lng,b.lat])*1000};
  ctx.L={geoJSON:(data,options={})=>{const layer={data,options,addTo(target){if(target===ctx.map)onMap.add(layer);return layer;},remove(){onMap.delete(layer);},
    getBounds:()=>({getCenter:()=>{const [lng,lat]=ctx.turf.center(data).geometry.coordinates;return {lat,lng};}})};return layer;}};
  return {panes,zones:()=>[...onMap].filter(l=>l.options.pane==='pfExclusionZones')};
}
function setup(){
  const controls={multiSelectToggle:{checked:false},modPower:{value:640}},harness={docs:new Map()};
  const ctx={console,URL,URLSearchParams,DOMException,AbortSignal,structuredClone,Promise,Map,Date,Math,FEATURE_LEVEL:3,isMultiSelectMode:false,scanTarget:'building',selectedFeatures:new Map(),currentAnalysisFeature:null,currentAnalysisData:{},
    CustomEvent:class{constructor(type){this.type=type;}},dispatchEvent(){},
    document:{currentScript:{src:'https://qa.test/assets/pathfinder/main-layout.js'},getElementById:id=>controls[id]},
    el:id=>controls[id],showToast(){},switchTab(){},resetCalibrationInternal(){},applyCalibrationToFC:x=>x,polygonAreaM2:()=>100,
    updateResultCardBasics(){},calculateFinance(){},panelGroup:{clearLayers(){},removeLayer(){}},selectableGroup:{clearLayers(){}},analysisMarkerGroup:{clearLayers(){}},
    addEventListener(){},PFLayout:core,PFRoofPlan:require('../assets/pathfinder/roof-plan.js'),
    PFRoofPlanner:{clear(){},adopt(){},prepareInput(g,p,keepouts){return {geometry:g,panelSpec:p,keepouts};},async ensure(){}},
    PFLayoutClient:class{cancel(){} async calculate(input){return core.calculate(input,ctx.turf);}},
    crypto:{randomUUID:()=>'id'},localStorage:{getItem:()=>null,setItem(){}},
    // A saved design exists only for the sites registered in harness.docs (keyed by address).
    fetch:async()=>{const doc=harness.docs.get(ctx.currentAnalysisData.address);return {ok:true,json:async()=>({ok:true,layoutId:'layout',projectId:'project',revision:1,ticket:'t',data:doc?structuredClone(doc):undefined})};}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync('assets/pathfinder/turf-7.1.0.min.js','utf8'),ctx);
  const view=leaflet(ctx);
  for(const [start,end] of [['var _spModuleRenderer=','function getFeatureId('],['function getFeatureId(feature){','// Auto-scan candidate collection'],['// Analyze feature (F-6)','// Import the exact public cadastral geometry'],
    ['function getTotalPanelCount(){','// Recalculate panels after parameter changes'],['function clearAnalysisOnly(','// Boot'],['window.toggleMultiSelect = function(){','// Auto scan toggle (F-13/14)']])vm.runInContext(extract(start,end),ctx);
  vm.runInContext(fs.readFileSync('assets/pathfinder/main-layout.js','utf8'),ctx);
  const design=(feature,extra)=>harness.docs.set(feature.properties.addr,{contractVersion:core.VERSION,layoutId:'layout',projectId:'project',revision:1,geometry:feature.geometry,
    panelSpec:core.withMargin({widthM:1.134,heightM:2.465,powerW:640,tiltDeg:10,stackRows:2,orientation:'landscape',alignment:'roof',marginPct:10},'roof'),panelInstances:[],panelCount:0,capacityKw:0,address:feature.properties.addr,...extra});
  return {ctx,view,design,multi(){controls.multiSelectToggle.checked=true;ctx.toggleMultiSelect();}};
}
(async()=>{
  const a=roof(127,'A'),b=roof(127.001,'B'),c=roof(127.002,'C');
  // 1) The page's draw function: one non-interactive red layer in its own pane above the modules.
  let t=setup();assert.equal(t.ctx._spDrawExclusionZones([zone(127),zone(127.0003)]),2);
  let layers=t.view.zones();assert.equal(layers.length,1);
  const {options,data}=layers[0];assert.equal(options.interactive,false);assert.equal(options.pane,'pfExclusionZones');
  assert.equal(t.view.panes.pfExclusionZones.style.pointerEvents,'none');assert.ok(Number(t.view.panes.pfExclusionZones.style.zIndex)>450,'Above the module preview pane');
  assert.match(options.style.fillColor,/^#ef4444$/i);assert.match(options.style.color,/^#dc2626$/i);assert.ok(options.style.fillOpacity>0&&options.style.fillOpacity<.6,'Translucent fill');assert.ok(options.style.weight>=1,'Outline');
  assert.equal(data.features.length,2);assert.deepEqual(JSON.parse(JSON.stringify(data.features[0].geometry)),zone(127));
  // Each call replaces the previous zones; an empty list clears.
  t.ctx._spDrawExclusionZones([zone(127)]);assert.equal(t.view.zones().length,1);assert.equal(t.view.zones()[0].data.features.length,1);
  assert.equal(t.ctx._spDrawExclusionZones([]),0);assert.equal(t.view.zones().length,0);assert.equal(t.ctx._spDrawExclusionZones(null),0);
  // 2) Selecting a site with a saved design draws its zones; the next site (no design) removes them.
  t=setup();t.design(a,{keepouts:[zone(127)]});
  await t.ctx.analyzeFeature(a,true);assert.equal(t.ctx.currentAnalysisData.layoutDocument.revision,1,'saved design applied');
  layers=t.view.zones();assert.equal(layers.length,1);assert.deepEqual(JSON.parse(JSON.stringify(layers[0].data.features.map(f=>f.geometry))),[zone(127)]);
  await t.ctx.analyzeFeature(b,true);assert.equal(t.ctx.currentAnalysisData.layoutDocument,undefined);assert.equal(t.view.zones().length,0,'Zones of the previous site are removed');
  // Only the zones the user drew: scan-derived keepouts of a roof plan stay off the map.
  t=setup();t.design(a,{keepouts:[zone(127.0003),zone(127)],roofPlan:null});await t.ctx.analyzeFeature(a,true);assert.equal(t.view.zones()[0].data.features.length,2);
  t=setup();t.design(a,{keepouts:[zone(127.0003),zone(127)],roofPlan:{customKeepouts:[zone(127)]},roofObstacleCheck:false});await t.ctx.analyzeFeature(a,true);
  assert.deepEqual(JSON.parse(JSON.stringify(t.view.zones()[0].data.features.map(f=>f.geometry))),[zone(127)]);
  // 3) Reset, analysis-only clear and adding a roof to a multi-selection (the design no longer describes it) remove them.
  t.ctx.clearResults(false);assert.equal(t.view.zones().length,0,'clearResults');
  t=setup();t.design(a,{keepouts:[zone(127)]});await t.ctx.analyzeFeature(a,true);assert.equal(t.view.zones().length,1);t.ctx.clearAnalysisOnly();assert.equal(t.view.zones().length,0,'clearAnalysisOnly');
  t=setup();t.design(a,{keepouts:[zone(127)]});await t.ctx.analyzeFeature(a,true);assert.equal(t.view.zones().length,1);t.multi();await t.ctx.analyzeFeature(c,true);
  assert.equal(t.ctx.selectedFeatures.size,2);assert.equal(t.view.zones().length,0,'A changed selection drops the design and its zones');
  // Deselecting the added roof makes the designed roof the current site again: its zones are shown with its design.
  await t.ctx.analyzeFeature(c,true);assert.equal(t.ctx.selectedFeatures.size,1);
  assert.equal(t.view.zones().length,t.ctx.currentAnalysisData.layoutDocument?1:0,'Zones follow the current design');assert.ok(t.ctx.currentAnalysisData.layoutDocument,'the remaining roof keeps its design');
  // A new map scan resets the selection the same way.
  const scan=extract('async function scanBuildings(','// Auto-scan candidate collection');
  assert.match(scan,/panelGroup\.clearLayers\(\);\s*window\._spDrawExclusionZones\?\.\(\[\]\);/);
  console.log('PASS exclusion zones: translucent red non-interactive layer above the modules, drawn from the applied design (user zones only), replaced per design, removed on site change, reset, clear and multi-selection.');
})().catch(e=>{console.error(e);process.exitCode=1;});
