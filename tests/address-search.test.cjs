const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);};
// The real studio address search in a VM: the server's correction note reaches the user,
// and the analysis address is the located parcel, not the raw spreadsheet row.
function setup(response){
  const nodes={addrInput:{value:'',disabled:false}},logs=[],timers=[],requests=[];
  const progress={id:'pfAddressProgress',textContent:'',hidden:true,style:{},setAttribute(){}};
  const ctx={console,encodeURIComponent,Number,String,AbortSignal,BACKEND_URL:'https://api.test',VWORLD_TILE_KEY:'',FEATURE_LEVEL:0,scanTarget:'building',
    el:id=>nodes[id],showToast(){},cancelFeatureAnalysis(){},logSystem:m=>logs.push(m),showSmartClickLoading(){},_aiBarDone(){},
    jsonpRequest:async()=>{throw new Error('vworld must not be needed');},map:{setView(){}},setTimeout:(f,ms)=>timers.push(ms),
    fetch:async url=>{requests.push(url);return {status:response.status||200,json:async()=>response.body};},
    document:{querySelector:()=>null,getElementById:id=>id==='pfAddressProgress'&&!progress.hidden?progress:(id==='pfAddressProgress'?progress:null),createElement:()=>progress,body:{append(){}}}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext('let currentAnalysisData={};'+extract('window.searchAddress = async function(){','// Multi-select mode (existing toggle)'),ctx);
  return {ctx,nodes,progress,logs,timers,requests};
}
(async()=>{
  const row='경기도 가상시 예시읍 이가리 637  외 4필지';
  let t=setup({body:{ok:true,item:{lat:37.8,lng:127.1,address:'경기 가상시 예시읍 이가리 637'},warning:'입력한 주소를 “경기도 가상시 예시읍 이가리 637”로 보정해 찾았습니다. 여러 필지가 적힌 주소입니다. 첫 필지 위치만 찾았습니다.'}});
  t.nodes.addrInput.value=row;await t.ctx.searchAddress();
  assert.equal(t.requests.length,1);assert.ok(t.requests[0].includes(encodeURIComponent(row)),'The row is sent as typed; the server cleans it');
  assert.equal(t.ctx.window.currentAnalysisData.address,'경기 가상시 예시읍 이가리 637','Checks run on the located parcel');
  assert.match(t.progress.textContent,/보정해 찾았습니다/);assert.match(t.progress.textContent,/첫 필지/);assert.match(t.progress.textContent,/찾은 위치: 경기 가상시 예시읍 이가리 637/);
  assert.equal(t.timers.at(-1),15000,'A correction note stays visible longer');assert.ok(t.logs.some(m=>m.startsWith('address note:')));
  // A clean address keeps the previous message and timing.
  t=setup({body:{ok:true,item:{lat:37.5,lng:126.9,address:'경기 가상시 예시동 768-10'},warning:''}});
  t.nodes.addrInput.value='경기도 가상시 산업로 27';await t.ctx.searchAddress();
  assert.equal(t.progress.textContent,'주소 이동 완료 · 확인된 경계가 없습니다. 수동 배치에서 설치 영역을 그려 주세요.');assert.equal(t.timers.at(-1),8000);
  // Older servers without warning still work.
  t=setup({body:{ok:true,item:{lat:37.5,lng:126.9,address:'경기 가상시 예시동 1'}}});
  t.nodes.addrInput.value='경기도 가상시 예시동 1';await t.ctx.searchAddress();
  assert.equal(t.ctx.window.currentAnalysisData.address,'경기 가상시 예시동 1');assert.doesNotMatch(t.progress.textContent,/undefined|찾은 위치/);
  console.log('address-search ok');
})().catch(e=>{console.error(e);process.exit(1);});
