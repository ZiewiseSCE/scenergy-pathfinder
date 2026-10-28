const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);};
// The real studio address search in a VM: the server's correction note reaches the user,
// and the analysis address is the located parcel, not the raw spreadsheet row.
function setup(response,opts={}){
  const nodes={addrInput:{value:'',disabled:false}},logs=[],timers=[],requests=[],analysed=[],views=[];
  const progress={id:'pfAddressProgress',textContent:'',hidden:true,style:{},setAttribute(){}};
  // Parcels are axis-aligned boxes [minLng,minLat,maxLng,maxLat] in properties.box.
  const inBox=(p,f)=>{const [x,y]=p,b=f.properties.box;return x>=b[0]&&x<=b[2]&&y>=b[1]&&y<=b[3];};
  const ctx={console,encodeURIComponent,Number,String,AbortSignal,BACKEND_URL:'https://api.test',VWORLD_TILE_KEY:'',FEATURE_LEVEL:opts.features?3:0,scanTarget:opts.scanTarget||'building',
    el:id=>nodes[id],showToast(){},cancelFeatureAnalysis(){},logSystem:m=>logs.push(m),showSmartClickLoading(){},_aiBarDone(){},
    jsonpRequest:opts.vworld||(async()=>{throw new Error('vworld must not be needed');}),map:{setView:c=>views.push(c)},setTimeout:(f,ms)=>timers.push(ms),
    scanBuildings:async()=>({features:(opts.features||[]).map(f=>({...f,properties:{...f.properties}}))}),
    analyzeFeature:async f=>analysed.push(f),
    turf:{point:c=>c,booleanPointInPolygon:inBox,center:f=>[(f.properties.box[0]+f.properties.box[2])/2,(f.properties.box[1]+f.properties.box[3])/2],distance:(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])},
    fetch:async url=>{requests.push(url);return {status:response.status||200,json:async()=>response.body};},
    document:{querySelector:()=>null,getElementById:id=>id==='pfAddressProgress'&&!progress.hidden?progress:(id==='pfAddressProgress'?progress:null),createElement:()=>progress,body:{append(){}}}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext('let currentAnalysisData={};'+extract('window.searchAddress = async function(){','// Multi-select mode (existing toggle)'),ctx);
  return {ctx,nodes,progress,logs,timers,requests,analysed,views};
}
// 온수리 673-10: Kakao's point (126.49072, 37.62958) lies on 673-6; the named lot is ~100 m north.
const lot6={properties:{pnu:'2871033021106730006',addr:'인천광역시 가상군 예시면 온수리 673-6',box:[126.4905,37.6294,126.4908,37.6298]}};
const lot10={properties:{pnu:'2871033021106730010',addr:'인천광역시 가상군 예시면 온수리 673-10',box:[126.4907,37.6301,126.4913,37.6308]}};
const kakao={ok:true,item:{lat:37.62958,lng:126.49072,address:'인천 가상군 예시면 온수리 673-10',pnu:'2871033021106730010',parcel:{lat:37.6305,lng:126.4910,movedM:103,pnu:'2871033021106730010'}},warning:''};
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
  // Land: the named lot is analysed under its address, even though Kakao's point is on the neighbour.
  t=setup({body:kakao},{scanTarget:'land',features:[lot6,lot10]});
  t.nodes.addrInput.value='인천 가상군 예시면 온수리 673-10';await t.ctx.searchAddress();
  assert.equal(t.analysed.length,1);assert.equal(t.analysed[0].properties.pnu,'2871033021106730010','the named lot, not the parcel under the Kakao point');
  assert.equal(JSON.stringify(t.views[0]),JSON.stringify([37.6305,126.4910]),'the map centres inside the named lot');
  assert.equal(t.analysed[0].properties.addr,'인천 가상군 예시면 온수리 673-10');assert.match(t.progress.textContent,/이웃 필지/);
  // Even without the server's parcel point, the scanned outline with that PNU wins over the point.
  t=setup({body:{...kakao,item:{...kakao.item,parcel:null}}},{scanTarget:'land',features:[lot6,lot10]});
  t.nodes.addrInput.value='인천 가상군 예시면 온수리 673-10';await t.ctx.searchAddress();
  assert.equal(t.analysed[0].properties.pnu,'2871033021106730010');assert.equal(JSON.stringify(t.views[0]),JSON.stringify([37.62958,126.49072]));
  // The named outline is not among the scanned parcels: the parcel under the point keeps its own address.
  t=setup({body:{...kakao,item:{...kakao.item,parcel:null}}},{scanTarget:'land',features:[lot6]});
  t.nodes.addrInput.value='인천 가상군 예시면 온수리 673-10';await t.ctx.searchAddress();
  assert.equal(t.analysed[0].properties.addr,'인천광역시 가상군 예시면 온수리 673-6','another parcel is never labelled with the searched lot');
  assert.match(t.progress.textContent,/필지 경계를 찾지 못해/);assert.match(t.progress.textContent,/찾은 위치: 인천광역시 가상군 예시면 온수리 673-6/);
  // Roofs keep the building under Kakao's point (a road-address entrance) and ignore the parcel point.
  const roof={properties:{bd_mgt_sn:'2871033021106730006000001',box:[126.4906,37.6295,126.4908,37.6297]}};
  t=setup({body:kakao},{scanTarget:'building',features:[roof]});
  t.nodes.addrInput.value='인천 가상군 예시면 온수리 673-10';await t.ctx.searchAddress();
  assert.equal(JSON.stringify(t.views[0]),JSON.stringify([37.62958,126.49072]));assert.equal(t.analysed[0].properties.addr,'인천 가상군 예시면 온수리 673-10');
  // VWorld fallback: a refined lot is shown as found, never under the typed lot.
  t=setup({status:404,body:{ok:false,error:'address_not_found'}},{scanTarget:'land',features:[lot6],
    vworld:async url=>url.includes('type=parcel')?{response:{status:'OK',refined:{text:'경기도 가상시 예시면 도하리 307-4'},result:{point:{x:'126.4906',y:'37.6296'}}}}:{response:{status:'NOT_FOUND'}}});
  t.nodes.addrInput.value='경기도 가상시 예시면 도하리 307번지';await t.ctx.searchAddress();
  assert.equal(t.analysed[0].properties.addr,'경기도 가상시 예시면 도하리 307-4');assert.match(t.progress.textContent,/VWorld가 찾은/);
  console.log('address-search ok');
})().catch(e=>{console.error(e);process.exit(1);});
