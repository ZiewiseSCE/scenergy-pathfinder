const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);};
// Item 11: numeric, signed capacity parsing (same cases as the backend _grid_blocked tests).
const text={window:{}};vm.createContext(text);vm.runInContext(extract('window._spKepcoCapacityValues = function','// ---------------------------------------------------------\n// [배치 단수]'),text);
const w=text.window;
for(const s of ['10 MW','20 MW (변전소: 가상)','20MW','1.0 MW','여유용량 0.5 MW','여유용량 0.5MW','변전소: 2026년 10MW','656kW','1,200 kW','10.0 MW','5-10MW','연간 0 kWh 감소'])assert.equal(w._spKepcoNoMargin(s),false,s+' is not zero');
for(const s of ['0 MW','-3.2 MW (변전소: 가상)','−1.5MW','여유용량 0','여유용량: -2','잔여용량 0','0kW','변전소 12.5MW / 배전선로 0MW','신규 접속 불가','재생e: 2025년 -1.5MW(여유)'])assert.equal(w._spKepcoNoMargin(s),true,s+' has no margin');
assert.deepEqual(Array.from(w._spKepcoCapacityValues('주변압기 −2.5 MW / 배전 1,200kW')),[-2.5,1200]);
// The business label follows the number: 10 MW passes, a negative margin is critical.
const pass={checks:[{key:'grid',status:'PASS',title:'한전 여유용량',value:'10 MW',severity:'green'}]};
assert.equal(w._businessLabelFromPayload(pass),'사업성 검토 가능','"10 MW" contains "0 MW" but is ten megawatts');
assert.equal(w._businessLabelFromPayload({checks:[{key:'grid',status:'PASS',title:'한전 여유용량',value:'20MW'}]}),'사업성 검토 가능');
assert.equal(w._businessLabelFromPayload({checks:[{key:'grid',status:'PASS',title:'한전 여유용량',value:'-3 MW'}]}),'사업성 없음','A negative margin must not lose its sign');
assert.equal(w._businessLabelFromPayload({checks:[{key:'grid',status:'PASS',title:'한전 여유용량',value:'여유용량 0.5MW'}]}),'사업성 검토 가능');

// Item 9: a weak/failed lookup shows the new state; the earlier value is only an explicitly labelled previous value.
const nodes={};for(const id of ['kepcoCapacity','kepcoDistributionTable','kepcoFacilityLabel','kepcoDistributionWarning','kepcoDistributionNotes'])nodes[id]={textContent:'',innerText:'',classList:{add(){},remove(){}}};
const win={currentAnalysisData:{address:'A',lat:37,lng:127,pnu:'p'},__kepcoChainRuntime:{state:{requestId:0}},startKepcoChainAnimation(){return ++this.__kepcoChainRuntime.state.requestId;},finishKepcoChainAnimation(){},renderKepcoPlanTables(){},renderKepcoVisualCards(){}};
const ctx={window:win,document:{getElementById:id=>nodes[id]},el:id=>nodes[id],URLSearchParams,console,Set,JSON,fetch:null};vm.createContext(ctx);
vm.runInContext(extract('window.kepcoLookupMessage =','window.renderKepcoVisualCards ='),ctx);vm.runInContext(extract('window.updateKepcoCapacity = async function','let infraDebounce ='),ctx);
const respond=body=>{ctx.fetch=async()=>({ok:true,json:async()=>body});};
(async()=>{
  const cad=win.currentAnalysisData;
  respond({kepco_capacity:'12.5 MW'});await win.updateKepcoCapacity('A','p');
  assert.equal(nodes.kepcoCapacity.innerText,'12.5 MW');assert.equal(cad.kepco_capacity,'12.5 MW');assert.equal(cad.kepco_capacity_previous,undefined);
  respond({kepco_capacity:null,reason:'remote timeout'});await win.updateKepcoCapacity('A','p');
  assert.match(nodes.kepcoCapacity.innerText,/^조회 불가.*· 이전 조회값: 12\.5 MW$/,'New unknown state first, old value explicitly labelled');
  assert.match(cad.kepco_capacity,/조회 불가/,'The old value is not stored as this lookup\'s capacity');assert.equal(cad.ai_analysis.kepco_capacity,cad.kepco_capacity);
  assert.equal(cad.kepco_capacity_previous,'12.5 MW');
  respond({kepco_capacity:null});await win.updateKepcoCapacity('A','p');assert.match(nodes.kepcoCapacity.innerText,/이전 조회값: 12\.5 MW/,'A second failure still labels the last confirmed value');
  ctx.fetch=async()=>{throw new Error('network down');};await win.updateKepcoCapacity('A','p');assert.equal(nodes.kepcoCapacity.innerText,'조회 실패 · 이전 조회값: 12.5 MW');assert.match(cad.kepco_capacity,/조회 불가/);
  ctx.fetch=async()=>({ok:false,json:async()=>({error:'stored_result_unavailable'})});await win.updateKepcoCapacity('A','p');assert.match(nodes.kepcoCapacity.innerText,/저장 관측이 없습니다.*이전 조회값: 12\.5 MW/);
  respond({kepco_capacity:'8 MW'});await win.updateKepcoCapacity('A','p');assert.equal(nodes.kepcoCapacity.innerText,'8 MW');assert.equal(cad.kepco_capacity,'8 MW');assert.equal(cad.kepco_capacity_previous,undefined);
  // A fresh site record has no previous value to show.
  win.currentAnalysisData={address:'B',lat:36,lng:128};respond({kepco_capacity:null});await win.updateKepcoCapacity('B');assert.doesNotMatch(nodes.kepcoCapacity.innerText,/이전 조회값/);
  // Section summaries keep negative values (unicode minus, numeric strings) instead of dropping the sign.
  win.currentAnalysisData={address:'C',lat:35,lng:127};
  respond({kepco_capacity:null,meta:{sections:{renewable:{title:'재생e',unit:'MW',years:[2025,2026],rows:[{values:['−1.5','2']}]}}}});await win.updateKepcoCapacity('C');
  assert.match(nodes.kepcoCapacity.innerText,/2025년 -1\.5MW/);assert.equal(w._spKepcoNoMargin(nodes.kepcoCapacity.innerText),true);
  respond({kepco_capacity:null,meta:{sections:{supply:{title:'공급',unit:'MW',tables:[{rows:[{year:'2025',value:'−0.8 MW'},{year:'2026',value:'1,200'}]}]}}}});await win.updateKepcoCapacity('C');
  assert.match(nodes.kepcoCapacity.innerText,/2025년 -0\.8MW → 2026년 1200MW/);
  console.log('PASS KEPCO capacity text: signed numeric zero/negative parsing, 10/20 MW not zero, business label, labelled previous value never stored as current, failure/error paths and signed section summaries');
})().catch(e=>{console.error(e);process.exitCode=1;});
