// 이격 여유율 in the studio bridge (main-layout.js): spec() per mode, defaults, old designs, editor URL,
// the 3D save path and the 설치 제외 zones handed to the map. Runs in the backend and the frontend checkout.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),assets=path.join(root,fs.existsSync(path.join(root,'static/pathfinder/main-layout.js'))?'static/pathfinder':'assets/pathfinder');
const core=require(path.join(assets,'layout-core.js'));
const geometry={type:'Polygon',coordinates:[[[127,37],[127.001,37],[127.001,37.001],[127,37.001],[127,37]]]};
const panel={type:'Feature',properties:{},geometry:{type:'Polygon',coordinates:[[[127.0001,37.0001],[127.00012,37.0001],[127.00012,37.00012],[127.0001,37.00012],[127.0001,37.0001]]]}};
const zone={type:'Polygon',coordinates:[[[127.0004,37.0004],[127.0005,37.0004],[127.0005,37.0005],[127.0004,37.0005],[127.0004,37.0004]]]};
const derived={type:'Polygon',coordinates:[[[127.0006,37.0006],[127.0007,37.0006],[127.0007,37.0007],[127.0006,37.0007],[127.0006,37.0006]]]};
const STUDIO={modWidth:1.134,modHeight:2.465,modPower:640,installAngle:10,arrayStackRows:2,moduleOrient:'landscape',layoutMarginPct:10};
function setup({target='building',inputs=STUDIO}={}){
  const controls={},elements=[],posts=[],drawn=[],state=new Map(),harness={doc:null,revision:0};let sequence=0;
  for(const [id,value] of Object.entries(inputs||{}))controls[id]={id,value:String(value)};
  function element(tag){const e={tag,style:{},children:[],isConnected:true,contentWindow:{postMessage(){}},setAttribute(){},append(...items){this.children.push(...items);},focus(){},remove(){this.isConnected=false;}};elements.push(e);return e;}
  const window={BACKEND_URL:'https://api.test',currentAnalysisData:{address:'QA',lat:37,lng:127},currentAnalysisFeature:{geometry},addEventListener(){},dispatchEvent(){},confirm:()=>true};
  const context={window,document:{currentScript:{src:'https://front.test/assets/pathfinder/main-layout.js'},body:element('body'),createElement:element,getElementById:id=>controls[id]||null},
    console,URL,URLSearchParams,AbortSignal,AbortController,DOMException,structuredClone,CustomEvent:class{constructor(type){this.type=type;}},
    PFLayout:core,PFRoofPlan:require(path.join(assets,'roof-plan.js')),PFLayoutClient:class{cancel(){}},scanTarget:target,
    crypto:{randomUUID:()=>'00000000-0000-4000-8000-'+String(++sequence).padStart(12,'0')},localStorage:{getItem:k=>state.get(k),setItem:(k,v)=>state.set(k,v)},
    location:{href:'https://front.test/studio',origin:'https://front.test'},setTimeout:()=>1,clearTimeout(){},showToast(){},
    _spDrawExclusionZones:zones=>drawn.push(JSON.parse(JSON.stringify(zones))),
    fetch:async(url,options={})=>{
      if(url.endsWith('/api/layout/session'))return {ok:true,status:200,json:async()=>({ok:true,layoutId:'layout',projectId:'project',revision:harness.revision,ticket:'ticket',data:harness.doc?structuredClone(harness.doc):undefined})};
      assert.ok(url.endsWith('/api/layouts'),url);const body=JSON.parse(options.body);posts.push(body);
      return {ok:true,status:200,json:async()=>({ok:true,data:{...body,revision:body.revision+1,panelCount:body.panelInstances.length,capacityKw:body.panelInstances.length*body.panelSpec.powerW/1000}})};
    }};
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(assets,'turf-7.1.0.min.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(assets,'main-layout.js'),'utf8'),context);
  const saved=(panelSpec,extra={})=>{harness.revision=3;harness.doc={contractVersion:core.VERSION,layoutId:'layout',projectId:'project',revision:3,geometry,panelSpec,panelInstances:[panel],panelCount:1,capacityKw:panelSpec.powerW/1000,address:'QA',...extra};};
  return {api:window.PFMainLayout,window,context,controls,elements,posts,drawn,saved,set(values){for(const [id,value] of Object.entries(values))controls[id].value=String(value);}};
}
const shade=p=>p.stackRows*(p.orientation==='landscape'?p.widthM:p.heightM)*Math.sin(p.tiltDeg*Math.PI/180)/Math.tan(core.SUN_ALTITUDE_DEG*Math.PI/180);
(async()=>{
  // 1) The DESIGN parity vectors through the studio inputs: 'building' is a roof, only 'land' is land.
  for(const [mode,w,h,tilt,stack,orientation,pct,row,side] of [
    ['roof',1.134,2.465,10,2,'landscape',10,.682,.02],['roof',1.134,2.465,0,1,'portrait',10,.02,.02],['roof',1.134,2.465,10,2,'landscape',0,.682,0],
    ['roof',1.134,2.465,10,2,'landscape',20,.682,.02],['land',1.134,2.465,15,3,'landscape',10,1.525,.02],['land',1.303,2.384,15,3,'landscape',15,1.752,.02],
    ['land',1.134,2.465,0,1,'portrait',10,.02,.02],['land',1.134,2.465,30,2,'portrait',5,4.27,.02],['roof',1.134,1.961,10,2,'landscape',40,1.402,.02]]){
    const t=setup({target:mode==='land'?'land':'building'});t.set({modWidth:w,modHeight:h,installAngle:tilt,arrayStackRows:stack,moduleOrient:orientation,layoutMarginPct:pct});
    const p=t.api.spec(),label=[mode,w,h,tilt,stack,orientation,pct].join(' ');
    assert.deepEqual([p.rowGapM,p.sideGapM,p.setbackM,p.marginPct],[row,side,0,pct],label);assert.equal(t.api.mode(),mode);
    // Tilted rows (roof racks and land) keep the winter shade pitch; flat rows get walk aisles both ways instead.
    // (at a margin above what 1.3 m aisles hold, the rows are wider than the shade pitch)
    if(tilt>0)assert.ok(p.shadeGapM===Math.round(shade(p)*1000)/1000&&p.rowGapM>=p.shadeGapM&&(pct>20||p.rowGapM===p.shadeGapM),'tilted rows keep the shade pitch: '+label);
    else assert.ok(p.rowGapM===p.sideGapM&&p.rowAisleEvery>0&&p.aisleEvery>0,'flat rows: aisles both ways: '+label);
  }
  // 2) No studio inputs (other pages, tests): the sales defaults of the mode, never a 0.8 / 0.2 / 0.5 m fallback.
  let t=setup({inputs:null});let p=t.api.spec();
  assert.deepEqual([p.widthM,p.heightM,p.powerW,p.tiltDeg,p.stackRows,p.orientation,p.alignment,p.marginPct,p.rowGapM,p.sideGapM,p.setbackM],[1.134,2.465,640,10,2,'landscape','roof',10,.682,.02,0]);
  t=setup({target:'land',inputs:null});p=t.api.spec();
  assert.deepEqual([p.tiltDeg,p.stackRows,p.orientation,p.alignment,p.marginPct,p.rowGapM,p.sideGapM,p.setbackM],[15,3,'landscape','south',10,1.525,.02,0]);
  // The page helper wins over the raw variable; anything that is not 'land' is a roof.
  t=setup({target:'land'});t.window.PFScanMode=()=>'roof';assert.equal(t.api.mode(),'roof');assert.equal(t.api.spec().alignment,'roof');
  t=setup({target:'reservoir'});assert.equal(t.api.mode(),'roof');
  // 3) The open document's alignment wins over the mode default.
  t=setup();t.window.currentAnalysisData.layoutDocument={panelSpec:{alignment:'south'}};assert.equal(t.api.spec().alignment,'south');
  t=setup({target:'land'});t.window.currentAnalysisData.layoutDocument={panelSpec:{alignment:'roof'}};assert.equal(t.api.spec().alignment,'roof');
  // 4) A margin outside 0–40 or blank is an error with the field name, not a silent default.
  t=setup();t.set({layoutMarginPct:55});assert.throws(()=>t.api.spec(),/이격 여유율/);t.set({layoutMarginPct:''});assert.throws(()=>t.api.spec(),/이격 여유율/);
  // 5) A design with marginPct writes it back to the studio input.
  t=setup();t.saved(core.withMargin({widthM:1.303,heightM:2.384,powerW:720,tiltDeg:12,stackRows:1,orientation:'portrait',alignment:'roof',marginPct:15},'roof'));
  assert.equal(await t.api.loadSaved(),true);
  assert.deepEqual(['modWidth','modHeight','modPower','installAngle','arrayStackRows','moduleOrient','layoutMarginPct'].map(id=>String(t.controls[id].value)),['1.303','2.384','720','12','1','portrait','15']);
  p=t.api.spec();assert.equal(p.marginPct,15);assert.deepEqual([p.rowGapM,p.sideGapM,p.setbackM],[t.window.currentAnalysisData.layoutDocument.panelSpec.rowGapM,t.window.currentAnalysisData.layoutDocument.panelSpec.sideGapM,0]);
  // 6) An older design (explicit gaps, no marginPct) loads, leaves the margin input alone and keeps its gaps
  //    until the user changes a layout parameter; from then on the gaps come from the margin.
  t=setup();t.saved(core.spec({widthM:1.13,heightM:2.4,powerW:640,tiltDeg:15,rowGapM:.8,sideGapM:.2,setbackM:.5,stackRows:1,orientation:'portrait',alignment:'roof'}));
  assert.equal(await t.api.loadSaved(),true);assert.equal(t.controls.layoutMarginPct.value,'10','The margin input is not invented for an old design');
  p=t.api.spec();assert.deepEqual([p.rowGapM,p.sideGapM,p.setbackM,p.marginPct,p.tiltDeg],[.8,.2,.5,undefined,15]);
  assert.equal(t.api.marginSpec().marginPct,10,'The sales estimate always follows the margin');
  t.set({modPower:700});assert.equal(t.api.spec().rowGapM,.8,'Module output alone does not change the layout');
  t.set({installAngle:12});p=t.api.spec();assert.equal(p.marginPct,10);assert.equal(p.setbackM,0);assert.ok(p.shadeGapM>0&&p.rowGapM===p.shadeGapM&&p.aisleEvery>0);assert.notEqual(p.rowGapM,.8);
  t.set({installAngle:15});assert.equal(t.api.spec().rowGapM,.8,'Back on the saved values the saved gaps describe the design again');
  t.set({layoutMarginPct:12});assert.equal(t.api.spec().marginPct,12,'Changing the margin itself ends the old gaps');
  // 7) Editor URL: margin replaces rowSpacing/sideGap/setback; the other parameters stay; mode is roof for 'building'.
  for(const [target,mode] of [['building','roof'],['land','land']]){
    t=setup({target});t.set({layoutMarginPct:15});await t.api.open();
    const url=new URL(t.elements.find(e=>e.tag==='iframe').src),q=url.searchParams;
    assert.equal(q.get('margin'),'15');for(const gone of ['rowSpacing','sideGap','setback'])assert.equal(q.has(gone),false,gone+' must not be sent');
    assert.deepEqual(['mode','mW','mH','mP','tilt','stackRows','orient','layoutId','parentOrigin','backend'].map(k=>q.get(k)),[mode,'1.134','2.465','640','10','2','landscape','layout','https://front.test','https://api.test']);
    assert.ok(q.get('channel'));
    // The first opening stores the visible layout with the margin and its derived gaps.
    assert.equal(t.posts[0].provenance.source,'main-editor-init');assert.equal(t.posts[0].panelSpec.marginPct,15);assert.equal(t.posts[0].panelSpec.setbackM,0);
  }
  // 8) Saving from 3D keeps marginPct and the gaps of the 3D spec.
  t=setup();const sceneSpec=core.withMargin({widthM:1.134,heightM:2.465,powerW:640,tiltDeg:20,stackRows:2,orientation:'landscape',alignment:'roof',marginPct:20},'roof');
  let doc=await t.api.persist(geometry,[panel],sceneSpec);
  assert.equal(t.posts.at(-1).provenance.source,'3d-editor');assert.deepEqual(t.posts.at(-1).panelSpec,sceneSpec);assert.equal(doc.panelSpec.marginPct,20);
  assert.equal(String(t.controls.layoutMarginPct.value),'20','The saved 3D margin reaches the studio input');assert.equal(String(t.controls.installAngle.value),'20');
  // 9) 설치 제외 zones of the applied design reach the map-draw function; scan-derived zones do not; none clears.
  t=setup();t.saved(core.withMargin({...p,marginPct:10},'roof'),{keepouts:[zone]});await t.api.loadSaved();
  assert.deepEqual(t.drawn.at(-1),[zone]);assert.deepEqual(JSON.parse(JSON.stringify(t.api.exclusionZones())),[zone]);
  t=setup();t.saved(core.withMargin({...p,marginPct:10},'roof'),{keepouts:[derived,zone],roofPlan:{customKeepouts:[zone]}});await t.api.loadSaved();
  assert.deepEqual(t.drawn.at(-1),[zone],'Only the zones the user drew, not the scan-derived ones');
  t=setup();t.saved(core.withMargin({...p,marginPct:10},'roof'));await t.api.loadSaved();assert.deepEqual(t.drawn.at(-1),[],'A design without zones clears the map');
  assert.equal(t.api.exclusionZones(null).length,0);
  // Zones are the keepouts the engine reuses for the same boundary.
  t=setup();t.saved(core.withMargin({...p,marginPct:10},'roof'),{keepouts:[zone]});await t.api.loadSaved();
  assert.deepEqual(JSON.parse(JSON.stringify(t.api.input(geometry).keepouts)),[zone]);
  console.log('PASS main layout margin: DESIGN vectors in both modes, mode defaults without inputs, document alignment, old designs keep gaps until a parameter changes, editor URL margin, 3D save keeps marginPct, exclusion zones reach the map.');
})().catch(e=>{console.error(e);process.exitCode=1;});
