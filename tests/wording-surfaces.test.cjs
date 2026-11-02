const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// The owner's wording on the studio surfaces that print stored KEPCO / check texts outside the 8대 체크 panel, and on the PC
// Solbi rich card (ai_assistant.js, the backend's static/ai_assistant.js): the page's own code with
// assets/pathfinder/check-wording.js — the value, or the closest one plus '추가 상세 확인 권장', never a bare '확인 필요'.
const html=fs.readFileSync('solar_pathfinder.html','utf8'),explore=fs.readFileSync('explore.html','utf8'),pc=fs.readFileSync('ai_assistant.js','utf8');
const wording=fs.readFileSync('assets/pathfinder/check-wording.js','utf8'),bare=/(^|[^가-힣])확인 필요(?![가-힣])/;
const slice=(src,start,end)=>{const i=src.indexOf(start);assert.ok(i>=0,start);const j=src.indexOf(end,i+start.length);assert.ok(j>i,end);return src.slice(i,j);};
const fn=(src,start)=>slice(src,start,'\n}\n')+'\n}\n';
const node=()=>({textContent:'',innerText:'',innerHTML:'',classList:{add(){},remove(){}},querySelector:()=>({addEventListener(){}})});

// 1) PC Solbi single_address cards; both pages load check-wording.js before ai_assistant.js.
for(const page of [html,explore])assert.ok(page.indexOf('assets/pathfinder/check-wording.js?v=')>=0&&page.indexOf('assets/pathfinder/check-wording.js?v=')<page.indexOf('ai_assistant.js?v='));
{
  const shown=[];const ctx={window:{},state:{},console,addMessage:(role,content,opts)=>{shown.push(opts.html);return node();}};
  vm.createContext(ctx);vm.runInContext(wording,ctx);
  vm.runInContext(slice(pc,'  function escapeHtml(s) {','  function mdToHtml(s) {')+slice(pc,'  function renderRichResult(intent, result) {','  function downloadAsCsv(list, intent) {'),ctx);
  ctx.renderRichResult('single_address',{checks:[{key:'roof_use',title:'지붕 사용 조건',status:'WARNING',message:'현장·서류 확인 필요 · 소유·임대 구분'},
    {key:'ecology',title:'생태자연도',status:'WARNING',message:'확인 필요 · 생태자연도·보전지역 여부는 별도 확인 필요'},{key:'grid',title:'한전 여유용량',status:'WARNING',message:'한전 여유용량 확인 필요'}]});
  const out=shown.join('');assert.doesNotMatch(out,bare,out);
  assert.match(out,/현장·서류 추가 상세 확인 권장 · 소유·임대 구분/);assert.match(out,/미확인 — 추가 상세 확인 권장 · 생태자연도·보전지역 여부는 별도 추가 상세 확인 권장/);
  assert.match(out,/미확인 — 한전ON 추가 상세 확인 권장/);
}

// 2) KEPCO progress panel: /api/infra/kepco's notes and reasons.
{
  const ctx={window:{}};vm.createContext(ctx);vm.runInContext(wording,ctx);
  vm.runInContext(fn(html,'function _pfw(){')+slice(html,'window._kpEsc = function(v){','\n};\n')+'\n};\n'+slice(html,'window._renderKepcoChainPanel = function(state, sectionHtml){','window.startKepcoChainAnimation = function'),ctx);
  const out=ctx.window._renderKepcoChainPanel({failed:true,progress:100,summary:'',reason:'한전 원천 응답 확인 필요',note:'(실제 한전에 최종 확인 필요)'},'');
  assert.doesNotMatch(out,bare,out);assert.match(out,/한전 원천 응답 추가 상세 확인 권장/);assert.match(out,/\(실제 한전에 최종 추가 상세 확인 권장\)/);
}

// 3) A failed lookup's message on the capacity line (a near-lot reference note says '한전 확인 필요.').
(async()=>{
  const nodes={};for(const id of ['kepcoCapacity','kepcoDistributionTable','kepcoFacilityLabel','kepcoDistributionWarning','kepcoDistributionNotes'])nodes[id]=node();
  const win={currentAnalysisData:{address:'A'},__kepcoChainRuntime:{state:{requestId:0}},startKepcoChainAnimation(){return ++this.__kepcoChainRuntime.state.requestId;},
    finishKepcoChainAnimation(){},renderKepcoPlanTables(){},renderKepcoVisualCards(){},renderKepcoDistributionTable(){}};
  const note='참고용 · 근접 지번 기준입니다. 해당 현장의 접속 가능 용량을 확정하는 값이 아닙니다. 한전 확인 필요.';
  const ctx={window:win,document:{getElementById:id=>nodes[id]},el:id=>nodes[id],URLSearchParams,console,Set,JSON,
    fetch:async()=>({ok:false,json:async()=>({reference:{reference_only:true,note}})})};
  vm.createContext(ctx);vm.runInContext(wording,ctx);
  vm.runInContext(fn(html,'function _pfw(){')+slice(html,'window.kepcoLookupMessage =','window.renderKepcoVisualCards =')+slice(html,'window.updateKepcoCapacity = async function','let infraDebounce ='),ctx);
  await win.updateKepcoCapacity('A','p');
  assert.equal(nodes.kepcoCapacity.innerText,'참고용 · 근접 지번 기준입니다. 해당 현장의 접속 가능 용량을 확정하는 값이 아닙니다 — 한전 추가 상세 확인 권장.');

  // 4) 종합 판정 panel (renderAiFinal): the amber 사업성 판정 and stored texts as the 8대 체크 score panel prints them.
  const els={};for(const id of ['aiFinalPanel','finalScoreValue','finalConfidence','aiBusinessComment','aiFinalSummary'])els[id]=node();
  const fctx={window:{},el:id=>els[id],console,buildBusinessComment:()=>'',normalizeRoofChecksPayload:p=>p};vm.createContext(fctx);vm.runInContext(wording,fctx);
  vm.runInContext(fn(html,'function _pfw(){')+fn(html,'function renderAiFinal(payload){'),fctx);
  fctx.renderAiFinal({business_label:'확인 필요',attractiveness_score:62,overall_severity:'amber',business_comment:'인허가 확인 필요',summary:'보호구역·문화재: PASS / 토지가격: 확인 필요(WARNING)'});
  assert.equal(els.finalScoreValue.textContent,'검토 가능 · 추가 상세 확인 권장 · 62점');assert.equal(els.finalConfidence.textContent,'검토 가능 · 추가 상세 확인 권장');
  assert.equal(els.aiBusinessComment.textContent,'인허가 추가 상세 확인 권장');
  assert.doesNotMatch(els.aiFinalSummary.textContent,bare);assert.doesNotMatch(els.aiFinalSummary.textContent,/PASS|WARNING/);
  fctx.renderAiFinal({business_label:'확인 필요',attractiveness_score:30,critical_items:[{key:'zoning'}]});assert.equal(els.finalScoreValue.textContent,'추가 상세 확인 권장 · 30점');
  console.log('PASS wording surfaces: PC Solbi cards, KEPCO panel and line, 종합 판정 in the owner\'s wording');
})().catch(e=>{console.error(e);process.exit(1);});
