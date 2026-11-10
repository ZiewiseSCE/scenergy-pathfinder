// Hardware catalog in the studio: default module #1 / inverter #2 by catalog number, the selected module's
// size drives modWidth/modHeight, and the inverter price field (만원 despite its name) is read in the right unit.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const start=html.indexOf('/* Hardware dropdown binding (Modules/Inverters) */'),end=html.indexOf('// Daily API usage counters',start);
assert.ok(start>0&&end>start,'hardware block present');const code=html.slice(start,html.lastIndexOf('// ----',end));
// Catalog as the API returns it: the old default was the entry nearest to 640 W / 280 won (#9 here).
const modules=[
  {no:9,brand:'한화큐셀(한)',model:'Q.TRON XL-G2R.9 BFG',power_w:640,price_won_per_w:270,module_type:'N-Type',features:'재고 소진 후 단종예정'},
  {no:1,brand:'한화큐셀(한)',model:'Q.TRON XL-G2.13 BFG',power_w:640,size:'2,465 x 1,134 x 30',price_won_per_w:210,module_type:'N-Type',features:'[4등급]'},
  {no:5,brand:'트리나',model:'TSM-720NEG21C.20K',power_w:720,width_m:1.303,height_m:2.384,size:'9,999 x 9,999 x 33',price_won_per_w:200,features:'대형'},
  {no:14,brand:'Evergiant',model:'ENE-RF108NE',power_w:500,price_won_per_w:280,features:'경량 | size: 1,961 x 1,134 x 30'},
  {no:15,brand:'Evergiant',model:'ENE-RH108NE',power_w:500,price_won_per_w:280,features:'치수 미기재'}];
const inverters=[
  {no:1,brand:'현대에너지솔루션',model:'HPC-036HL-V1-OU',capacity_kw:36,price_million_won:350,price_won:3500000},
  {no:2,brand:'현대에너지솔루션',model:'HPC-060HL-D1-OU',capacity_kw:60,price_million_won:390,price_won:null},
  {no:3,brand:'현대에너지솔루션',model:'HPC-125HL-V1-OU',capacity_kw:125,price_million_won:590,price_won:5900000}];
function select(){const s={options:[],listeners:{},value:'',appendChild(o){this.options.push(o);},addEventListener(type,fn){this.listeners[type]=fn;}};Object.defineProperty(s,'innerHTML',{set(){s.options=[];},get:()=>''});return s;}
async function setup({edited=false,design=false,catalog={modules,inverters}}={}){
  const field=value=>({value,dataset:{},readOnly:false,addEventListener(){}});
  const els={modPower:field('640'),modPrice:field('280'),modWidth:field('1.134'),modHeight:field('2.465'),invCap:field(''),invPrice:field(''),moduleMeta:{textContent:''},inverterMeta:{textContent:''},moduleSelect:select(),inverterSelect:select()};
  if(edited){els.modWidth.value='1.2';els.modWidth.dataset.pfUserEdited='1';}
  let recalculations=0;const requests=[];
  const window={currentAnalysisData:design?{layoutDocument:{revision:3}}:{},reCalculate:()=>{recalculations++;},requestFinanceRecalc(){}};
  if(design){els.modWidth.value='1.303';els.modHeight.value='2.384';}
  const ctx={window,console,BACKEND_URL:'https://api.test',document:{readyState:'complete',getElementById:id=>els[id],createElement:()=>({value:'',textContent:''})},
    fetch:async url=>{requests.push(url);const items=url.endsWith('/modules')?catalog.modules:catalog.inverters;return {status:200,json:async()=>({ok:true,items})};}};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  for(let i=0;i<6;i++)await new Promise(setImmediate);
  const pick=(id,value)=>{els[id].value=String(value);els[id].listeners.change();};
  return {els,window,pick,requests,recalculations:()=>recalculations};
}
(async()=>{
  // 1) Defaults by catalog number, not by nearness to the current inputs or list order.
  let t=await setup();
  assert.deepEqual(t.requests,['https://api.test/api/hardware/modules','https://api.test/api/hardware/inverters']);
  assert.equal(t.els.moduleSelect.value,'1');assert.equal(t.els.inverterSelect.value,'2');
  assert.equal(t.window.spHardware.selectedModule.no,1);assert.equal(t.window.spHardware.selectedInverter.no,2);
  // Module #1: 640 W and its size from the catalog text (longer side is the height); the planning price stays.
  assert.deepEqual([String(t.els.modPower.value),String(t.els.modWidth.value),String(t.els.modHeight.value),t.els.modPrice.value],['640','1.134','2.465','280']);
  assert.match(t.els.moduleMeta.textContent,/2\.465×1\.134m/);
  // Inverter #2: 60 kW; 390 (만원) is 3,900,000 won, not 390,000,000.
  assert.deepEqual([String(t.els.invCap.value),String(t.els.invPrice.value)],['60','3900000']);
  const label=t.els.inverterSelect.options.find(o=>o.value==='2').textContent;assert.match(label,/390만원/);assert.doesNotMatch(label,/백만원/);
  assert.doesNotMatch(html,/백만원`/,'No 백만원 label for the inverter price');assert.doesNotMatch(html,/price_million_won\)\s*\*\s*1000000/);
  // 2) Picking a module sets size, output and its quoted price; API width_m/height_m win over the size text.
  t.pick('moduleSelect',5);assert.deepEqual([String(t.els.modPower.value),String(t.els.modWidth.value),String(t.els.modHeight.value),String(t.els.modPrice.value)],['720','1.303','2.384','200']);
  // The DB route appends the size to features: it is parsed and not shown twice.
  t.pick('moduleSelect',14);assert.deepEqual([String(t.els.modWidth.value),String(t.els.modHeight.value)],['1.134','1.961']);
  assert.match(t.els.moduleMeta.textContent,/1\.961×1\.134m/);assert.doesNotMatch(t.els.moduleMeta.textContent,/size:/);
  // No size in the catalog entry: the dimensions stay as they are (no guess).
  t.pick('moduleSelect',15);assert.deepEqual([String(t.els.modPower.value),String(t.els.modWidth.value),String(t.els.modHeight.value)],['500','1.134','1.961']);
  assert.ok(t.recalculations()>=4,'Every pick lays out again');
  // An inverter pick never touches the module size.
  t.pick('moduleSelect',1);t.pick('inverterSelect',3);assert.deepEqual([String(t.els.modWidth.value),String(t.els.modHeight.value),String(t.els.invCap.value),String(t.els.invPrice.value)],['1.134','2.465','125','5900000']);
  // 3) A size the user typed survives the default pick at load, and an explicit pick replaces it.
  t=await setup({edited:true});assert.equal(t.els.modWidth.value,'1.2');assert.equal(t.els.modHeight.value,'2.465');
  t.pick('moduleSelect',5);assert.deepEqual([String(t.els.modWidth.value),String(t.els.modHeight.value)],['1.303','2.384']);
  // A design opened before the catalog arrived keeps the size it wrote (the default pick must not re-lay it out).
  t=await setup({design:true});assert.equal(t.els.moduleSelect.value,'1');assert.deepEqual([t.els.modWidth.value,t.els.modHeight.value],['1.303','2.384']);
  t.pick('moduleSelect',1);assert.deepEqual([String(t.els.modWidth.value),String(t.els.modHeight.value)],['1.134','2.465'],'An explicit pick still applies');
  // 4) A catalog without #1 / #2 falls back to the first usable entries instead of nothing.
  t=await setup({catalog:{modules:modules.filter(m=>m.no!==1),inverters:inverters.filter(i=>i.no!==2)}});
  assert.equal(t.els.moduleSelect.value,'9');assert.equal(t.els.inverterSelect.value,'1');
  console.log('PASS module selection: default module #1 / inverter #2, size from width_m/height_m, size text and features, kept user size, 만원 inverter price, catalog fallback.');
})().catch(e=>{console.error(e);process.exitCode=1;});
