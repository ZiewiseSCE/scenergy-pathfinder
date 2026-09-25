const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const core=require('../assets/pathfinder/layout-core.js');
const geometry={type:'Polygon',coordinates:[[[127,37],[127.001,37],[127.001,37.001],[127,37.001],[127,37]]]};
const panel={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[127.0001,37.0001],[127.00012,37.0001],[127.00012,37.00012],[127.0001,37.00012],[127.0001,37.0001]]]}};
async function run({saved=false,empty=false,fail=false,changeSite=false}={}){
  const elements=[],calls=[],listeners={},state=new Map();let sequence=0;
  function element(tag){const e={tag,style:{},children:[],isConnected:true,contentWindow:{postMessage(){}},setAttribute(){},append(...items){this.children.push(...items);},focus(){},remove(){this.isConnected=false;}};elements.push(e);return e;}
  const window={BACKEND_URL:'https://api.example.test',currentAnalysisData:{address:'QA',mode:'land',lat:37,lng:127,_panelsFC:{features:[panel,panel]}},currentAnalysisFeature:empty?null:{geometry},addEventListener(name,fn){listeners[name]=fn;},dispatchEvent(event){assert.equal(event.type,'pf-layout-applied');}};
  const session={ok:true,layoutId:'layout',projectId:'project',revision:saved?7:0,ticket:'qa'};
  if(saved)session.data={contractVersion:core.VERSION,layoutId:'layout',projectId:'project',revision:7,geometry,panelSpec:core.spec({widthM:1.13,heightM:2.4,powerW:700,tiltDeg:15,rowGapM:.8,sideGapM:.2,setbackM:.5,stackRows:1,orientation:'portrait',alignment:'roof'}),panelInstances:[panel],panelCount:1,capacityKw:.7,address:'QA'};
  const document={currentScript:{src:'https://front.example.test/assets/pathfinder/main-layout.js'},body:element('body'),createElement:element,getElementById(){return null;}};
  const context={CustomEvent:class{constructor(type){this.type=type;}},window,document,console,URL,URLSearchParams,AbortSignal,structuredClone,PFLayout:core,PFRoofPlan:require('../assets/pathfinder/roof-plan.js'),PFLayoutClient:class{},scanTarget:'land',crypto:{randomUUID:()=>String(++sequence)},localStorage:{getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v)},location:{href:'https://front.example.test/studio',origin:'https://front.example.test'},setTimeout:()=>1,clearTimeout(){},fetch:async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});
    if(url.endsWith('/session'))return {ok:true,json:async()=>structuredClone(session)};
    assert.ok(url.endsWith('/api/layouts'));const doc=JSON.parse(options.body);
    if(changeSite)window.currentAnalysisData.address='Different site';
    return {ok:!fail,json:async()=>fail?{error:'save failed'}:{ok:true,data:{...doc,revision:1,panelCount:doc.panelInstances.length,capacityKw:doc.panelInstances.length*doc.panelSpec.powerW/1000}}};
  }};
  vm.createContext(context);vm.runInContext(fs.readFileSync('assets/pathfinder/turf-7.1.0.min.js','utf8'),context);vm.runInContext(fs.readFileSync('assets/pathfinder/main-layout.js','utf8'),context);
  await window.PFMainLayout.open();
  const frame=elements.find(e=>e.tag==='iframe');
  if(fail||changeSite){assert.equal(frame.src,undefined,'Failed/stale save must not open an empty editor');return;}
  assert.ok(frame.src?.startsWith('https://api.example.test/roof-layout?'));
  if(saved){assert.equal(calls.length,1,'Never overwrite a saved revision with the preview');assert.equal(window.currentAnalysisData.layoutDocument.revision,7);assert.equal(window.currentAnalysisData.layoutDocument.capacityKw,.7);}
  else if(empty){assert.equal(calls.length,1,'Unselected address remains a new drawing');}
  else {assert.equal(calls.length,2);assert.deepEqual(calls[1].body.geometry,geometry);assert.equal(calls[1].body.panelInstances.length,2);assert.equal(calls[1].body.provenance.source,'main-editor-init');assert.equal(window.currentAnalysisData.layoutDocument.capacityKw,1.28);}
}
(async()=>{for(const options of [{},{saved:true},{empty:true},{fail:true},{changeSite:true}])await run(options);console.log('PASS first editor handoff, saved revision precedence, blank drawing, failed save and changed site');})().catch(e=>{console.error(e);process.exitCode=1;});

const html=fs.readFileSync('solar_pathfinder.html','utf8'), labelContext={window:{currentAnalysisData:{layoutDocument:{capacityKw:543.4,siteReview:{inputs:{connectionAcKw:500}}}}}};vm.createContext(labelContext);vm.runInContext(html.slice(html.indexOf('function _spCapacityLabel'),html.indexOf('function _spCapacityLabel')+html.slice(html.indexOf('function _spCapacityLabel')).indexOf('\n')),labelContext);assert.match(labelContext._spCapacityLabel(543.4),/신청 예정 AC 500.0/);assert.match(labelContext._spCapacityLabel(600),/AC 환산 추정/);
