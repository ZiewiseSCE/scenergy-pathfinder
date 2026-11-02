const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Studio scan picker after the 2026-07-01 reorganisations (VWorld LT_C_ADSIGG_INFO, 2026-11-02): 전남광주통합특별시 (전라남도 +
// 광주광역시, its 27 시군구) and the new 인천 구. VWorld names only the merged province, so a picker that sent 전라남도 / 광주광역시
// found no 시군구 boundary and every scan there stopped at '행정구역 경계를 확인하지 못했습니다'.
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);};
const MERGED='전남광주통합특별시';
const options=[...extract('id="bsSido"','</select>').matchAll(/<option>([^<]+)<\/option>/g)].map(m=>m[1]);
assert.ok(options.includes(MERGED),'the merged province is offered');
assert.ok(!options.includes('전라남도')&&!options.includes('광주광역시'),'the former names are not offered');
assert.equal(options.length,16,'16 provinces since 2026-07-01');
const ctx={};vm.createContext(ctx);
vm.runInContext('var data='+extract('var _bsSigunguData = ','window._bsUpdateSigungu').replace('var _bsSigunguData = ','').trim().replace(/;$/,'')+';',ctx);
vm.runInContext('var bbox='+extract('var _bsRegionBBox = ','window._bsStartScan').replace('var _bsRegionBBox = ','').trim().replace(/;$/,'')+';',ctx);
const merged=ctx.data[MERGED];
assert.deepEqual([...merged].sort(),['강진군','고흥군','곡성군','광산구','광양시','구례군','나주시','남구','담양군','동구','목포시','무안군','보성군','북구','서구',
 '순천시','신안군','여수시','영광군','영암군','완도군','장성군','장흥군','진도군','함평군','해남군','화순군'].sort(),'the 27 시군구 of pf_region_codes.TABLE');
assert.deepEqual([...ctx.data['인천광역시']],['제물포구','영종구','미추홀구','연수구','남동구','부평구','계양구','서해구','검단구','강화군','옹진군']);
assert.ok(!('전라남도' in ctx.data)&&!('광주광역시' in ctx.data));
assert.deepEqual([...ctx.bbox[MERGED]],[125.053,33.945,127.596,35.501]);
for(const option of options)assert.ok(option in ctx.data&&option in ctx.bbox,option+' has its 시군구 list and bbox');
// _bsSidoAliases: a stored or typed former name still resolves to the merged one first
vm.runInContext(extract('function _bsSidoAliases(sidoName){','async function _bsResolveAdminBbox'),ctx);
assert.deepEqual([...ctx._bsSidoAliases(MERGED)],[MERGED,'전라남도','광주광역시']);
assert.deepEqual([...ctx._bsSidoAliases('전라남도')],[MERGED,'전라남도']);
assert.deepEqual([...ctx._bsSidoAliases('광주광역시')],[MERGED,'광주광역시']);
assert.deepEqual([...ctx._bsSidoAliases('강원도')],['강원도','강원특별자치도']);
assert.deepEqual([...ctx._bsSidoAliases('경상북도')],['경상북도']);
// The full_nm queries the bbox resolver sends: '전남광주통합특별시 해남군' first (the only row VWorld has)
const resolver=extract('async function _bsResolveAdminBbox','function _bsFirstText');
assert.match(resolver,/_bsSidoAliases\(sidoName\)/);
console.log('PASS scan region: 전남광주통합특별시 and the new 인천 구 in the studio scan picker');
