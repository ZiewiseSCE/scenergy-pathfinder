const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// 8대 체크 상세의 이격 블록: OSM 거리는 '참고 거리'로만 표시하고, 조례 거리 수치와 비교·판정하지 않는다. 0 m도 거리다.
const html=fs.readFileSync(process.argv[2]||'solar_pathfinder.html','utf8');
const start=html.indexOf('// OSM 참고 거리(필지 대표점 기준)');
const end=html.indexOf('// Source',start);
assert(start>0&&end>start,'OSM reference block present');
const block=html.slice(start,end);
assert.doesNotMatch(block,/실측|>조례 기준<|FAIL|사업 불가|rules\./,'no ordinance-distance column, verdict or measured wording');
function render(cad){const ctx={cad,sh:''};vm.runInNewContext(block,ctx);return ctx.sh;}
let sh=render({dist_road_m:40.2,dist_house_m:0});
assert.match(sh,/OSM 참고 거리 \(필지 대표점 기준\)/);
assert.match(sh,/도로<\/td><td[^>]*>40m<\/td>/);
assert.match(sh,/건물·주거지<\/td><td[^>]*>0m<\/td>/,'0 m inside a building or residential area is shown');
assert.match(sh,/측량값이나 조례 기준 거리가 아니므로/);
sh=render({ai_analysis:{dist_road_m:'7.46'}});
assert.match(sh,/도로<\/td><td[^>]*>7.5m<\/td>/);assert.match(sh,/건물·주거지<\/td><td[^>]*>자료 없음<\/td>/);
assert.equal(render({}),'');assert.equal(render({dist_road_m:'',dist_house_m:null}),'');
console.log('PASS OSM reference distances: labelled as references, 0 m kept, no ordinance comparison');
