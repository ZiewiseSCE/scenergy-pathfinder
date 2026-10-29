const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// 8대 체크 상세의 이격 블록: 도로·주거용 건물 거리는 출처(VWorld 필지 경계 / OSM 대표점)대로 '참고 거리'로만 표시하고,
// 조례 거리 수치와 비교·판정하지 않는다. 0 m도 거리다.
const html=fs.readFileSync(process.argv[2]||'solar_pathfinder.html','utf8');
const start=html.indexOf('// 참고 거리: VWorld(필지 경계 기준) 또는 OSM(필지 대표점 기준)');
const end=html.indexOf('// Source',start);
assert(start>0&&end>start,'reference distance block present');
const block=html.slice(start,end);
assert.doesNotMatch(block,/실측|>조례 기준<|FAIL|사업 불가|rules\./,'no ordinance-distance column, verdict or measured wording');
const escapeHtml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function render(cad){const ctx={cad,sh:'',escapeHtml};vm.runInNewContext(block,ctx);return ctx.sh;}
// Values stored before 2026-10-30 carry no source: OSM from the point.
let sh=render({dist_road_m:40.2,dist_house_m:0});
assert.match(sh,/OSM 참고 거리 \(필지 대표점 기준\)/);assert.doesNotMatch(sh,/VWorld/);
assert.match(sh,/도로<\/td><td[^>]*>40m<\/td><td[^>]*>OSM\(필지 대표점 기준\)<\/td>/);
assert.match(sh,/건물·주거지<\/td><td[^>]*>0m<\/td>/,'0 m inside a building or residential area is shown');
assert.match(sh,/OpenStreetMap 도로·건물·주거지역까지 필지 대표점에서 잰 참고값/);
assert.match(sh,/측량값이나 조례 기준 거리가 아니므로/);
sh=render({ai_analysis:{dist_road_m:'7.46',dist_road_source:'OSM 자동 계산(필지 대표점 기준, 참고)'}});
assert.match(sh,/도로<\/td><td[^>]*>7.5m<\/td><td[^>]*>OSM 자동 계산\(필지 대표점 기준, 참고\)<\/td>/);
assert.match(sh,/건물·주거지<\/td><td[^>]*>자료 없음<\/td>/);
// VWorld at the parcel boundary: 0 m kept; "none within 240 m" shows with its dataset, never as a verdict.
const road='VWorld 도로명주소 도로 중심선까지 · 필지 경계 기준',none='VWorld 건축물 용도(단독·공동주택) 기준 필지 경계 240m 안 없음 · 용도 미확인 건물 12.0m';
sh=render({dist_road_m:0,dist_road_source:road,dist_residential_m:null,dist_residential_source:none});
assert.match(sh,/VWorld 참고 거리 \(필지 경계 기준\)/);assert.doesNotMatch(sh,/OSM|OpenStreetMap|대표점/);
assert.match(sh,/도로<\/td><td[^>]*>0m<\/td><td[^>]*>VWorld 도로명주소 도로 중심선까지 · 필지 경계 기준<\/td>/);
assert.match(sh,/주거용 건물<\/td><td[^>]*>240m 안 없음<\/td><td[^>]*>[^<]*용도 미확인 건물 12.0m<\/td>/);
assert.match(sh,/필지 경계에서 240m 안을 잰 참고값/);
sh=render({ai_analysis:{dist_road_m:null,dist_road_source:'VWorld 도로명주소 도로 기준 필지 경계 240m 안 없음(이름 없는 농로·현황도로 미포함)'}});
assert.match(sh,/도로<\/td><td[^>]*>240m 안 없음<\/td>/,'a VWorld answer without any distance still shows');
sh=render({dist_road_m:null,dist_road_source:'VWorld 도로명주소 도로 기준 필지 경계 240m 안 없음(이름 없는 농로·현황도로 미포함) · 일부만 조회'});
assert.match(sh,/도로<\/td><td[^>]*>240m 안 없음 \(일부만 조회\)<\/td>/,'a partial query is not a flat "none"');
// Mixed sources name each row's basis; the source text is escaped.
sh=render({dist_road_m:12,dist_road_source:'입력값',dist_residential_m:85.37,dist_residential_source:'VWorld <b>'});
assert.match(sh,/참고 거리 \(항목별 기준\)/);assert.match(sh,/도로<\/td><td[^>]*>12m<\/td><td[^>]*>입력값<\/td>/);
assert.match(sh,/주거용 건물<\/td><td[^>]*>85m<\/td><td[^>]*>VWorld &lt;b&gt;<\/td>/);
assert.equal(render({}),'');assert.equal(render({dist_road_m:'',dist_house_m:null}),'');
assert.equal(render({dist_road_source:'OSM 자동 계산(필지 대표점 기준, 참고)'}),'','an OSM source without a distance shows nothing');

// The analysis request never sends an earlier answer back (it would be read as an input value, not measured again).
const fStart=html.indexOf('window.fetchEightChecks = '),fEnd=html.indexOf('async function updateOrdinanceSetbackOverlay',fStart);
assert(fStart>0&&fEnd>fStart,'checks request present');
const request=html.slice(fStart,fEnd),pStart=request.indexOf('const payload = {'),payload=request.slice(pStart,request.indexOf('\n    };',pStart));
assert(pStart>0,'request payload present');
assert.match(payload,/\n      dist_road_m: null,\n/);assert.match(payload,/\n      dist_residential_m: null,\n/);
assert.doesNotMatch(payload,/dist_(?:road|residential|house)_m: [^n\n]/,'no other distance expression');
if(!/^window\.fetchEightChecks = (?:async )?function\s*\(\s*options/.test(request))assert.doesNotMatch(payload,/options\./,'no options in a function without them');
// The map overlay reads no ordinance number and compares nothing (no circles, no 미충족 / 사업 불가); it only clears.
const oStart=fEnd,oEnd=html.indexOf('// Report / History',oStart);
const overlay=html.slice(oStart,oEnd);
assert.doesNotMatch(overlay,/L\.circle|미충족|사업 불가|setback_m|road_setback_m_text/);
assert.equal(html.includes('__extractSetbackDistancesFromText'),false,'no parser of distance numbers in ordinance text');
let cleared=0;vm.runInNewContext(overlay+';updateOrdinanceSetbackOverlay({setback_m:2,ordinance_ai:{road_setback_m_text:"도로 300m"}});',{ordinanceSetbackGroup:{clearLayers(){cleared++;}}});
assert.equal(cleared,1);
// The response: a sourced answer replaces the earlier distance and source; an unsourced one only fills a gap.
const mStart=html.indexOf('    // 참고 거리와 출처(VWorld 필지 경계'),mEnd=html.indexOf('    if(typeof d.dist_substation_m',mStart);
assert(mStart>0&&mEnd>mStart,'response merge present');
function merge(cad,d){vm.runInNewContext(html.slice(mStart,mEnd),{cad,d});return cad;}
let cad=merge({dist_road_m:40,dist_residential_m:30,ai_analysis:{dist_road_m:40,dist_house_m:30}},
  {dist_road_m:0,dist_road_source:road,dist_house_m:null,dist_residential_source:none});
assert.equal(cad.dist_road_m,0);assert.equal(cad.ai_analysis.dist_road_m,0);assert.equal(cad.dist_road_source,road);
assert.equal(cad.dist_residential_m,null);assert.equal(cad.ai_analysis.dist_house_m,null);assert.equal(cad.ai_analysis.dist_residential_source,none);
assert.equal(render(cad).includes('30m'),false,'the old OSM value is gone with the new answer');
cad=merge({dist_road_m:40,ai_analysis:{dist_road_m:40}},{dist_road_m:12,dist_house_m:50});
assert.equal(cad.dist_road_m,40);assert.equal(cad.dist_residential_m,50);assert.equal(cad.dist_road_source,undefined);
// An unsourced value filling a VWorld "none" never shows under that VWorld source.
cad=merge({dist_road_m:null,dist_road_source:'VWorld 도로명주소 도로 기준 필지 경계 240m 안 없음',ai_analysis:{dist_road_source:'VWorld 도로명주소 도로 기준 필지 경계 240m 안 없음'}},{dist_road_m:40});
assert.equal(cad.dist_road_m,40);assert.equal(cad.dist_road_source,'');assert.equal(cad.ai_analysis.dist_road_source,'');
assert.match(render(cad),/OSM 참고 거리 \(필지 대표점 기준\)/);
// 0 m is a distance: an unsourced answer never replaces it or its source.
const zero={dist_road_m:0,dist_road_source:road,ai_analysis:{dist_road_m:0,dist_road_source:road}};
cad=merge(zero,{dist_road_m:40});
assert.deepEqual([cad.dist_road_m,cad.dist_road_source,cad.ai_analysis.dist_road_m,cad.ai_analysis.dist_road_source],[0,road,0,road]);

// The boundary inset (setback_m, a design input echoed by /api/analyze/basic) is never shown as an ordinance distance,
// and no reference distance is compared with an ordinance number anywhere in the studio.
assert.doesNotMatch(html,/\["기준 거리", setbackM/);assert.equal(html.includes('_measParts'),false);
const cStart=html.indexOf("// [UI] 정밀 분석 카드에 '이격거리(조례 기준)' 표기"),cEnd=html.indexOf('sbEl.innerText',cStart);
assert(cStart>0&&cEnd>cStart,'setback card present');assert.doesNotMatch(html.slice(cStart,cEnd),/\.setback_m\b/);
console.log('PASS reference distances: VWorld boundary or OSM point by source, 0 m kept, never sent back, no ordinance number or comparison on the map');
