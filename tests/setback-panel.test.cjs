const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Energy-map 법적 이격 panel: ordinance pointers as links with short quotes, no ordinance distance table.
const file=process.argv[2]||'assets/pathfinder/explore-completion.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const URL1='https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=2112719';
const POINTER={title:'김천시 도시계획 조례',url:URL1,effectiveDate:'2026-02-26',label:'제27조(개발행위허가의 기준) ②',kind:'text',exemption:false,
 quote:'② 시장은 태양광발전시설이 다음 각 호의 기준에 적합한 경우 허가할 수 있다.\n1. 도로에서 <script>x</script> 직선거리 이내에 입지하지 아니할 것 '+'가'.repeat(400)};
const ANNEX={title:'김천시 도시계획 조례',url:URL1,effectiveDate:'2026-02-26',label:'[별표 1] 개발행위허가기준',kind:'annex-generic',exemption:false,quote:''};
const BAD={title:'가짜',url:'javascript:alert(1)',label:'제1조',kind:'text',quote:'q'};
const OTHER={title:'다른 사이트',url:'https://evil.example/ordinInfoP.do',label:'제2조',kind:'text',quote:''};
const geometry={type:'Polygon',coordinates:[[[128,36],[128.001,36],[128.001,36.001],[128,36]]]};
const base={pnu:'4715034021100010000',verdict:'needs_review',checks:[],fetchedAt:1761700000,remainingGeometry:geometry,
 note:'조례 거리 기준은 자동으로 적용하지 않습니다. 조례 원문 위치에서 기준을 확인하고 필지 경계에서 240m 안의 건물·도로와 비교하세요.',
 buildings:{items:[{geometry,distanceM:12.5,residential:true,purpose:'단독주택'},{geometry,distanceM:80,residential:false,purpose:'기타 용도'}],rangeM:240,complete:true},
 roads:{items:[{geometry,distanceM:3}],rangeM:240,complete:true}};
const unread=Object.assign({},base,{missingEvidence:['김천시 도시계획 조례 제27조(개발행위허가의 기준) ② 원문의 거리 기준 확인 (수치 자동 적용 안 함)'],
 source:{ok:false,reason:'ordinance_rules_unread',url:URL1,pointers:[POINTER,ANNEX,BAD,OTHER,{...POINTER,label:'제28조',exemption:true}],
  summary:'조례 원문 확인 필요 · 김천시 도시계획 조례 제27조(개발행위허가의 기준) ② 태양광 기준 (수치 자동 적용 안 함)'}});
const notFound=Object.assign({},base,{missingEvidence:['현행 조례 본문에서 태양광 이격 조항을 찾지 못함(별표 첨부는 자동으로 읽지 않음) · 개발행위허가 운영지침 등 지자체 확인'],
 buildings:{items:[{geometry,distanceM:40,residential:false,purpose:'기타 용도'}],rangeM:240,complete:false},roads:{items:[],rangeM:240,complete:true},
 source:{ok:false,reason:'ordinance_rule_not_found',url:'',pointers:[],summary:'법제처 현행 자치법규 본문에서 강화군 태양광 이격 조항을 찾지 못함',
  searched:[{title:'인천광역시 강화군 군계획 조례',url:'https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=100',effectiveDate:'2025-01-01'},{title:'<b>x</b>',url:'javascript:1'}]}});
const unknown=Object.assign({},base,{missingEvidence:['현행 조례 원문 조회 미확인 · 조례 거리 기준 확인'],source:{ok:false,rules:{},summary:'',url:''}});  // RPA _unknown_ordinance: no pointers key
function harness(item,refreshed){
 const nodes=new Proxy({panel:{addEventListener(){},close(){}},panelTitle:{},panelContent:{}},{get(t,k){return t[k]??={};}});
 const context={window:{},L:{layerGroup:()=>({addTo(){return this},clearLayers(){}})}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 let downloaded;
 context.window.PFCompletionUI.init({$:id=>nodes[id],esc:escape,format:v=>typeof v==='number'?String(v):'미확인',stamp:x=>x?'T'+x:'기준 시각 미확인',map:{},
  getSelected:()=>({pnu:'4715034021100010000',address:'경북 김천시 아포읍 국사리 1'}),openPanel(){},download:x=>downloaded=x,
  request:async path=>{assert.match(path,/^\/setback\?pnu=\d{19}$/);return {ok:true,item};},post:async(path,body)=>{assert.equal(path,'/setback/refresh');assert.equal(body.pnu,'4715034021100010000');return {ok:true,item:refreshed};}});
 return {nodes,ui:context.window.PFCompletionUI,downloaded:()=>downloaded};
}
(async()=>{
 let h=harness(unread);await h.ui.open('legal');let html=h.nodes.legalResult.innerHTML;
 assert.match(html,/<b>조례 원문 확인 필요<\/b>/,'needs_review header');
 assert.match(html,/<a target="_blank" rel="noopener" href="https:\/\/www\.law\.go\.kr\/LSW\/ordinInfoP\.do\?ordinSeq=2112719">김천시 도시계획 조례 제27조\(개발행위허가의 기준\) ② ↗<\/a> · 시행 2026-02-26/);
 assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script/);
 assert.doesNotMatch(html,/javascript:|evil\.example/,'only official law-site https pointers become links');assert.match(html,/가짜 제1조/);
 const quote=html.match(/<blockquote>([^<]*)<\/blockquote>/)[1];assert.ok(quote.length<=200,'short quote');assert.ok(quote.endsWith(' …'));
 assert.doesNotMatch(quote,/\n/);
 assert.match(html,/\[별표 1\] 개발행위허가기준 ↗<\/a> · 시행 2026-02-26 · 이 별표에 태양광 기준이 있을 수 있음<\/li>/,'annex without quote');
 assert.match(html,/<details><summary>다른 위치 2곳<\/summary>.*제28조.*예외 조항/s);
 assert.doesNotMatch(html,/<table|<th>조례 거리<\/th>|requiredM|undefined|NaN/);
 assert.match(html,/건물 2개 \(주거용 1개\) · 도로 1개 · 조회 240m/);
 assert.match(html,/최근접 거리\(조례 기준 아님\): 주거용 건물 12\.5m · 건물 12\.5m · 도로 3m/);
 assert.doesNotMatch(html,/원천 응답|조회 한도에서 끊겨/,'the source summary repeats the first place');
 h.nodes.legalExport.onclick();assert.equal(JSON.parse(h.downloaded()).source.pointers[0].url,URL1,'export keeps the pointers');
 h=harness(notFound);await h.ui.open('legal');html=h.nodes.legalResult.innerHTML;
 assert.match(html,/본문에서 태양광 이격 조항을 찾지 못함/);assert.doesNotMatch(html,/<b>조례 원문 위치<\/b>|<table|undefined/);
 assert.match(html,/<b>검색한 현행 조례<\/b><\/p><ul><li><a target="_blank" rel="noopener" href="https:\/\/www\.law\.go\.kr\/LSW\/ordinInfoP\.do\?ordinSeq=100">인천광역시 강화군 군계획 조례 ↗<\/a> · 시행 2025-01-01<\/li><li>&lt;b&gt;x&lt;\/b&gt;<\/li><\/ul>/);
 assert.match(html,/주거용 건물 수집 범위 안 없음 · 건물 40m · 도로 수집 범위 안 없음/);
 assert.match(html,/조회 한도에서 끊겨 일부 건물·도로가 빠졌을 수 있습니다/);
 h=harness(unknown);await h.ui.open('legal');html=h.nodes.legalResult.innerHTML;
 assert.match(html,/원천 응답: 조회 미확인/);assert.doesNotMatch(html,/<b>조례 원문 위치<\/b>|<a |<table|undefined/);
 h=harness(null,unread);await h.ui.open('legal');assert.equal(h.nodes.legalResult.innerHTML,'저장된 대조 결과가 없습니다.');
 await h.nodes.legalRefresh.onclick();assert.match(h.nodes.legalResult.innerHTML,/ordinSeq=2112719/,'a refresh shows the pointers');
 console.log('PASS setback panel: ordinance pointers as safe links with short quotes, no ordinance distance table');
})().catch(error=>{console.error(error);process.exitCode=1});
