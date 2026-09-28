const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const helper=html.slice(html.indexOf('window.PFSelectMapLocation=function'),html.indexOf('window.PFLoadStoredAnalysis=function'));
const field={value:'',textContent:''},markers=[];
const ctx={window:{},currentAnalysisData:{address:'이전 현장'},scanTarget:'building',el:()=>field,document:{createElement:()=>({})},analysisMarkerGroup:{clearLayers(){markers.length=0;}},L:{circleMarker:(point)=>({bindTooltip(){return this;},addTo(){markers.push(point);}})}};
vm.runInNewContext(helper,ctx);
ctx.window.PFSelectMapLocation({lat:37.566,lng:126.978,address:'서울 중구 정동 5-1'});
assert.equal(ctx.currentAnalysisData,ctx.window.currentAnalysisData);assert.equal(ctx.currentAnalysisData.address,'서울 중구 정동 5-1');assert.equal(ctx.currentAnalysisData.lat,37.566);assert.equal(markers.length,1);assert.equal(ctx.currentAnalysisData.ai_analysis,undefined);

let ready,tick,analyze,lookups=0,runs=0;const select={value:''},help={textContent:''},status={textContent:''};
const box={style:{},querySelector:s=>s==='select'?select:s==='[data-mode-help]'?help:status,append(b){analyze=b;}};
const w={map:{setView(){}},addEventListener:(event,cb)=>{if(event==='DOMContentLoaded')ready=cb;},PFSelectMapLocation:site=>{w.currentAnalysisData={...site};},fetchAIData:async(lat,lng,address)=>{runs++;assert.equal(lat,37.566);assert.equal(lng,126.978);assert.equal(address,'선택 주소');}};
vm.runInNewContext(fs.readFileSync('assets/pathfinder/data-mode.js','utf8'),{window:w,location:{search:'?siteLat=37.566&siteLng=126.978&siteAddress='+encodeURIComponent('선택 주소')+'&dataMode=live'},URLSearchParams,Number,document:{createElement:tag=>tag==='div'?box:{style:{}},body:{appendChild(){}},getElementById:()=>field},setInterval:cb=>{tick=cb;return 1;},clearInterval(){},setTimeout(){},fetch:async()=>{lookups++;throw Error('must not fetch on entry');}});
(async()=>{ready();await tick();assert.equal(lookups,0);assert.equal(runs,0);assert.equal(w.currentAnalysisData.address,'선택 주소');assert.match(status.textContent,/선택 위치/);await analyze.onclick();assert.equal(runs,1);console.log('PASS map handoff initializes exact coordinates/address and only explicit Analyze runs analysis, including live mode');})().catch(e=>{console.error(e);process.exitCode=1;});
