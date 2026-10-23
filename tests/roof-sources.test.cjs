const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const extract=(a,b)=>html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));
(async()=>{
 for(const mode of ['roof','building','rooftop','roof_top','land']){
  const calls=[],ctx={window:{},currentAnalysisData:{mode,address:'검증 현장'},BACKEND_URL:'https://test.invalid',
   getAnalysisLatLng:()=>({lat:36,lng:128}),getBackendBase:()=> 'https://test.invalid',
   postJson:async(url,payload)=>{calls.push({url,payload});return {ok:false};},fetch:async(url,options)=>{calls.push({url,payload:JSON.parse(options.body)});return {json:async()=>({ok:false})};},console};
  vm.createContext(ctx);
  vm.runInContext(extract('window.refreshSolarLandEstimates = async function','function formatNumber('),ctx);
  vm.runInContext(extract('window.fetchLandPriceEstimate = async function','async function scanBuildings('),ctx);
  await ctx.window.refreshSolarLandEstimates();await ctx.window.fetchLandPriceEstimate('검증 현장',36,128);
  const prices=calls.filter(c=>c.url.endsWith('/land/estimate'));
  assert.equal(prices.length,mode==='land'?2:0,mode);
  assert(prices.every(c=>c.payload.mode==='land'));
 }
 console.log('PASS all roof aliases make zero land-price requests in both frontend entry points');
})().catch(e=>{console.error(e);process.exitCode=1;});
