const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const create=require('../assets/pathfinder/finance-preferences.js'),html=fs.readFileSync('solar_pathfinder.html','utf8');
const storage=new Map(),store={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
function open(scope='workspace-a',extra={}){
  const nodes={};
  for(const match of html.matchAll(/<(input|select)\b[^>]*\bid="([^"]+)"[^>]*>/g)){
    const tag=match[0];nodes[match[2]]={id:match[2],tagName:match[1].toUpperCase(),type:tag.match(/type="([^"]+)"/)?.[1]||'text',value:tag.match(/value="([^"]*)"/)?.[1]||'',checked:/\bchecked(?:[\s=>/])/.test(tag),dataset:{}};
  }
  nodes.pfFinanceInputStatus={};
  const preferences=create({getElement:id=>nodes[id],storage:()=>store,scope:async()=>scope,...extra});
  const ctx={window:{PFFinancePreferences:preferences},el:id=>nodes[id],currentAnalysisData:{},selectedFeatures:new Map(),getTotalPanelCount:()=>0};
  vm.createContext(ctx);
  const start=html.indexOf('window.requestFinanceRecalc = function(){');vm.runInContext(html.slice(start,html.indexOf('// Auto-recalc when panel count changes',start)),ctx);
  const edit=(id,value)=>{if(nodes[id].type==='checkbox')nodes[id].checked=value;else nodes[id].value=String(value);ctx.window.onFinanceInput(nodes[id]);};
  return {nodes,preferences,edit,window:ctx.window,ctx};
}
(async()=>{
  let page=open();await page.preferences.ready;
  for(const [id,value] of Object.entries(page.preferences.defaults))assert.equal(typeof value==='boolean'?page.nodes[id].checked:Number(page.nodes[id].value),value,'First visit default: '+id);
  assert.equal(storage.size,0,'Do not persist unedited defaults or calculated totals');
  page.edit('smp',125);page.edit('costPerKw',135);page.edit('landRentMonthly',0);page.edit('pfMaintOpexAnnual',0);page.edit('pfPrincipal',0);page.edit('pfInterestRate',6.2);page.edit('rec',0);page.edit('pfOtherCapexWon','12,000,000');page.nodes.landTenureMode.value='OWN';page.window.onFinanceInput(page.nodes.landTenureMode);
  page=open();await page.preferences.ready;
  assert.equal(page.nodes.smp.value,'125');assert.equal(page.nodes.costPerKw.value,'135');assert.equal(page.nodes.costPerKw.dataset.pfManual,'1');
  assert.equal(page.nodes.rec.value,'0');assert.equal(page.nodes.pfOtherCapexWon.value,'12000000');assert.equal(page.nodes.landTenureMode.value,'OWN');
  for(const [value,flag] of [['landRentMonthly','pfRentDefault'],['pfMaintOpexAnnual','pfMaintDefault'],['pfPrincipal','pfAutoPrincipal']]){assert.equal(page.nodes[value].value,'0');assert.equal(page.nodes[flag].checked,false);}
  assert.equal(page.nodes.modPrice.value,'280','Untouched field follows startup default');
  assert.equal(page.nodes.pfInterestRate.value,'6.2');
  page.nodes.pfPrincipal.value='123456';page.edit('pfAutoPrincipal',true);page.nodes.pfMaintOpexAnnual.value='444444';page.edit('pfMaintDefault',true);
  page=open();await page.preferences.ready;
  assert.equal(page.nodes.pfAutoPrincipal.checked,true);assert.equal(page.nodes.pfPrincipal.value,'0','Derived loan will recalculate for new capacity');
  assert.equal(page.nodes.pfMaintDefault.checked,true);assert.equal(page.nodes.pfMaintOpexAnnual.value,'0');
  page.edit('smp','');page=open();await page.preferences.ready;assert.equal(page.nodes.smp.value,'125','Incomplete typing cannot erase last saved value');
  const other=open('workspace-b');await other.preferences.ready;assert.equal(other.nodes.smp.value,'110');assert.equal(other.nodes.pfRentDefault.checked,true);
  // Slow scope loading must not overwrite edits made while preferences are loading.
  let resolve;page=open('workspace-a',{scope:()=>new Promise(r=>{resolve=r;})});await Promise.resolve();page.edit('smp',132);page.edit('landRentMonthly',0);resolve('workspace-a');await page.preferences.ready;
  assert.equal(page.nodes.smp.value,'132');assert.equal(page.nodes.landRentMonthly.value,'0');
  page=open();await page.preferences.ready;assert.equal(page.nodes.smp.value,'132');
  page.window.applyRoofFinanceDefaults();page=open();await page.preferences.ready;
  assert.equal(page.nodes.smp.value,'110');assert.equal(page.nodes.costPerKw.value,'100');assert.equal(page.nodes.pfRentDefault.checked,true);assert.equal(page.nodes.pfOtherCapexWon.value,'0');
  assert.equal(page.nodes.landTenureMode.value,'OWN','Explicit reset keeps ownership choice');
  const malformed=open('bad',{storage:()=>({getItem:()=>'{invalid',setItem(){}})});await malformed.preferences.ready;assert.equal(malformed.nodes.rec.value,'90');
  const unavailable=open('blocked',{storage:()=>{throw new Error('Storage disabled');}});await unavailable.preferences.ready;unavailable.edit('smp',121);assert.equal(unavailable.nodes.smp.value,'121');assert.match(unavailable.nodes.pfFinanceInputStatus.textContent,/저장 불가/);
  storage.set('pf_finance_inputs_v1:invalid',JSON.stringify({version:1,overrides:{smp:-1,rec:null,pfLoanRatio:500,pfTenorYears:0,landTenureMode:'invalid',pfRentDefault:'false',unknown:4}}));
  const invalid=open('invalid');await invalid.preferences.ready;assert.equal(invalid.nodes.smp.value,'110');assert.equal(invalid.nodes.pfLoanRatio.value,'70');assert.equal(invalid.nodes.pfRentDefault.checked,true);
  // Only the newest deferred calculation runs after restoration.
  let unlock;const slow=open('new',{scope:()=>new Promise(r=>{unlock=r;})});await Promise.resolve();let count=0;
  slow.preferences.afterRestore(()=>count=1);slow.preferences.afterRestore(()=>count=2);unlock('new');await slow.preferences.ready;assert.equal(count,2);
  assert.ok(![...storage.keys()].some(key=>key.includes('LIC-')));
  assert.ok(html.includes('window.PFFinancePreferences?.remember(pr)'),'Explicit model choice must persist its price');
  assert.equal((html.match(/document.addEventListener\("DOMContentLoaded", initHardwareDropdown\)/g)||[]).length,1);
  console.log('PASS finance startup/defaults, reload/manual zero, auto flags, initial input race, workspace isolation, reset, invalid storage and storage failure.');
})().catch(error=>{console.error(error);process.exitCode=1;});
