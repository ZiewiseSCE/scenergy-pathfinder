const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);};
const tick=async(n=3)=>{for(let i=0;i<n;i++)await new Promise(setImmediate);};
function deferred(){let resolve,reject;return {promise:new Promise((r,j)=>{resolve=r;reject=j;}),resolve,reject};}
// Legacy server-scan panel (items 4-7) run as-is in a VM with a fake DOM, JSONP and backend.
function setup(storedId){
  const nodes={},store=new Map(storedId?[['sp_scan_id',storedId]]:[]),requests=[],downloads=[],alerts=[],intervals=new Map();let load=null,nextTimer=1;
  const node=id=>nodes[id]||(nodes[id]={id,value:'',checked:false,disabled:false,textContent:'',style:{},hidden:new Set(),classList:{add:c=>node(id).hidden.add(c),remove:c=>node(id).hidden.delete(c),contains:c=>node(id).hidden.has(c)},scrollIntoView(){},remove(){}});
  for(const [id,value] of Object.entries({bsSido:'세종특별자치시',bsSigungu:'',bsMinArea:'0',bsMaxSlope:'16',bsMinJiga:'0'}))node(id).value=value;
  node('bsStartBtn').textContent='▶ 서버 스캔 시작';node('bsStopBtn').classList.add('hidden');
  const routes={},respond=(path,body)=>{routes[path]=body;};
  const ctx={console:{log(){},warn(){},error(){}},JSON,Math,Date,Promise,Object,String,Number,Array,parseInt,isFinite,encodeURIComponent,URL,URLSearchParams,VWORLD_TILE_KEY:'k',
    alert:m=>alerts.push(m),showToast(){},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)},
    PFHTTP:{credential:()=> '',download:async url=>{downloads.push(url);}},
    setTimeout:(fn,ms)=>{if(ms===2000){load=fn;return 0;}return setTimeout(fn,0);},clearTimeout,
    setInterval:(fn,ms)=>{const id=nextTimer++;intervals.set(id,{fn,ms});return id;},clearInterval:id=>intervals.delete(id),
    document:{getElementById:node,createElement:()=>({remove(){}}),body:{appendChild(s){const cb=new URL(s.src).searchParams.get('callback');
      const data=s.src.includes('LT_C_ADSIGG_INFO')?{response:{status:'OK',result:{featureCollection:{bbox:[127.28,36.6,127.281,36.601]}}}}
        :{response:{status:'OK',result:{featureCollection:{features:[{properties:{pnu:'3611010100100010000',addr:'세종특별자치시 조치원읍 1',jibun:'1전'},geometry:{type:'Polygon',coordinates:[[[127.28,36.6],[127.281,36.6],[127.281,36.601],[127.28,36.601],[127.28,36.6]]]}}]}}}};
      setImmediate(()=>ctx[cb]&&ctx[cb](data));}}},
    fetch:async(url,options={})=>{const u=new URL(url),body=options.body?JSON.parse(options.body):null;requests.push({path:u.pathname,id:u.searchParams.get('id'),body});
      let r=routes[u.pathname];if(typeof r==='function')r=await r(u,body);if(r instanceof Error)throw r;return {ok:true,json:async()=>r||{ok:false}};}};
  ctx.window=ctx;ctx.location={hostname:'localhost'};ctx.BACKEND_URL='https://api.test';vm.createContext(ctx);
  vm.runInContext(extract('// ===== 서버사이드 전수스캔 =====','\n</script>'),ctx);
  const timerRunning=()=>[...intervals.values()].some(t=>t.ms===1000);
  return {ctx,node,requests,downloads,alerts,respond,runLoad:()=>load&&load(),timerRunning,intervals};
}
const start=t=>t.node('bsStartBtn'),stop=t=>t.node('bsStopBtn');
(async()=>{
  // Item 5: a reload while the durable scan is queued ("pending") recovers it; Start stays unavailable.
  let t=setup('scan_q1');t.respond('/api/scan/status',{ok:true,status:'pending',scan_id:'scan_q1'});t.runLoad();await tick();
  assert.ok(start(t).hidden.has('hidden'),'Start is hidden for a queued scan');assert.equal(start(t).disabled,true,'Start stays disabled: no duplicate scan');
  assert.ok(!stop(t).hidden.has('hidden'),'Stop is offered for the queued scan');assert.match(t.node('bsStatusMsg').textContent,/대기열/);
  assert.ok(t.requests.filter(r=>r.path==='/api/scan/status').length>=2,'Polling continues for a pending scan');
  // Item 4: done/error reset the Start button (enabled, labelled), hide Stop and stop the timer.
  t.respond('/api/scan/status',{ok:true,status:'done',scan_id:'scan_q1',result_count:4,scan_total:4});[...t.intervals.values()].find(v=>v.ms===3000).fn();await tick();
  assert.ok(!start(t).hidden.has('hidden'));assert.equal(start(t).disabled,false,'Start is usable again after done');assert.equal(start(t).textContent,'▶ 새 스캔 시작');assert.ok(stop(t).hidden.has('hidden'));assert.equal(t.timerRunning(),false);
  t=setup('scan_e1');t.respond('/api/scan/status',{ok:true,status:'scanning',scan_id:'scan_e1',scan_done:1,scan_total:9});t.runLoad();await tick();assert.equal(start(t).disabled,true);
  t.respond('/api/scan/status',{ok:true,status:'error',scan_id:'scan_e1',error_message:'worker lost'});[...t.intervals.values()].find(v=>v.ms===3000).fn();await tick();
  assert.equal(start(t).disabled,false,'Start is usable again after an error');assert.ok(stop(t).hidden.has('hidden'));assert.match(t.node('bsStatusMsg').textContent,/error/);

  // Item 6: a late ZIP result for scan A never binds its download link to scan B.
  t=setup('scan_A');t.respond('/api/scan/status',{ok:true,status:'done',scan_id:'scan_A',result_count:5});t.runLoad();await tick();
  const zipA=deferred();t.respond('/api/scan/report-zip/start',()=>zipA.promise);const startingZip=t.ctx._bsStartReportZip(false);await tick();
  t.respond('/api/scan/list',{ok:true,jobs:[{scan_id:'scan_B',status:'done',result_count:3}]});t.ctx._bsCheckExisting();await tick();
  zipA.resolve({ok:true,status:'done',zip_job_id:'pdfzip_A',download_url:'/dl/A.zip'});await startingZip;await tick();
  t.respond('/api/scan/report-zip/status',{ok:true,status:'running',done:0,total:3,zip_job_id:'pdfzip_B'});await t.ctx._bsHandleReportZipClick();
  assert.deepEqual(t.downloads,[],'Scan A\'s ZIP is not offered for scan B');assert.equal(t.requests.at(-1).id,'scan_B','Status is checked for the current scan');
  // A poll answer that arrives after the scan changed is dropped too.
  const late=deferred();t.respond('/api/scan/report-zip/status',()=>late.promise);[...t.intervals.values()].find(v=>v.ms===3000).fn();await tick();
  t.ctx._bsDeletePrev();late.resolve({ok:true,status:'done',download_url:'/dl/B.zip'});await tick();
  t.respond('/api/scan/list',{ok:true,jobs:[{scan_id:'scan_B',status:'done',result_count:3}]});t.ctx._bsCheckExisting();await tick();
  t.respond('/api/scan/report-zip/status',{ok:false});t.respond('/api/scan/report-zip/start',{ok:true,status:'queued',zip_job_id:'pdfzip_B2'});await t.ctx._bsHandleReportZipClick();assert.deepEqual(t.downloads,[]);

  // Item 7: Stop during the start POST stops the new scan once its id is known, never the stored previous id.
  t=setup('scan_prev');const post=deferred();t.respond('/api/scan/start',()=>post.promise);t.respond('/api/scan/stop',{ok:true});t.respond('/api/scan/status',{ok:true,status:'stopped',scan_id:'scan_new',result_count:0});
  const running=t.ctx._bsStartScan();for(let i=0;i<40&&!t.requests.some(r=>r.path==='/api/scan/start');i++)await new Promise(r=>setTimeout(r,20));
  assert.ok(t.requests.some(r=>r.path==='/api/scan/start'),'Parcel collection reached the start POST');
  t.ctx._bsStopScan();assert.equal(t.requests.filter(r=>r.path==='/api/scan/stop').length,0,'The previous stored scan is not stopped');
  post.resolve({ok:true,scan_id:'scan_new',status:'pending'});await running;await tick();
  assert.deepEqual(t.requests.filter(r=>r.path==='/api/scan/stop').map(r=>r.body.scan_id),['scan_new'],'The newly created scan is stopped');
  assert.equal(start(t).disabled,false,'Stopped scan returns to idle controls');assert.ok(stop(t).hidden.has('hidden'));
  // Stop during the boundary/parcel lookup cancels the collection; nothing is started or stopped on the server.
  t=setup('scan_prev');const early=t.ctx._bsStartScan();t.ctx._bsStopScan();await early;
  assert.equal(t.requests.filter(r=>r.path==='/api/scan/start'||r.path==='/api/scan/stop').length,0,'Early stop neither starts a scan nor stops the stored one');
  assert.match(t.node('bsStatusMsg').textContent,/취소/);assert.equal(start(t).disabled,false);assert.equal(t.timerRunning(),false);
  // Item 4: a refused start or a network error leaves usable controls (no visible Stop, no running timer).
  for(const outcome of [{ok:false,message:'license_required'},new Error('offline')]){
    t=setup();t.respond('/api/scan/start',outcome);await t.ctx._bsStartScan();
    assert.equal(start(t).disabled,false);assert.equal(start(t).textContent,'▶ 서버 스캔 시작');assert.ok(stop(t).hidden.has('hidden'),'Stop is hidden after a failed start');assert.equal(t.timerRunning(),false,'Timer stopped after a failed start');assert.equal(t.alerts.length,1);
  }
  console.log('PASS scan controls: queued scan recovered on reload with Start disabled, done/error reset, late ZIP results dropped per scan, stop during start targets the new scan, failed start resets controls');
})().catch(e=>{console.error(e);process.exitCode=1;});
