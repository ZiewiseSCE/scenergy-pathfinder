const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8'),start=html.indexOf('function _spPayback('),end=html.indexOf('// Finance recalculation helper',start);
const values={modPower:640,modPrice:270,costPerKw:100,smp:120,rec:60,pfPrincipal:1000000,pfInterestRate:0,pfTenorYears:10,pfDscrTarget:1.2,pfLoanRatio:70,pfLtvPct:70,pfAutoPrincipal:'',landTenureMode:'ROOF_LEASE',landRentMonthly:10000,pfMaintOpexAnnual:100000,pfOtherOpexAnnual:200000,manualDcKw:0};
const els=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{value:String(value),style:{},checked:false}]));
const errors=[],window={},currentAnalysisData={mode:'roof',address:'QA',solar_opt:{sun_hours:4},finance:{roi25y:{total_cf_25y_with_land:999,total_cf_pfterm_with_land:999}}};
const ctx={window,currentAnalysisData,document:{getElementById:id=>els[id],querySelectorAll:()=>[]},el:id=>els[id],getAnalysisLatLng:()=>({lat:37,lng:127}),orientationFactor:()=>1,estimateSunHoursHeuristic:()=>4,formatNumber:String,formatMillionWon:String,_spCapacityLabel:String,console:{error:(...e)=>errors.push(e)},showToast(){}};
ctx.PFOrientation=require('../assets/pathfinder/orientation.js');ctx.selectedFeatures=new Map();window.currentAnalysisData=currentAnalysisData;vm.createContext(ctx);vm.runInContext(html.slice(html.indexOf('function layoutOrientation('),html.indexOf('function formatMillionWon(')),ctx);vm.runInContext(html.slice(start,end),ctx);
window.calculateFinance(100,4,64);assert.equal(errors.length,0,JSON.stringify(errors));
let f=currentAnalysisData.finance;assert.equal(f.dcKw,64);assert.equal(f.totalInterestWon,0);
const sum=(a,n)=>a.slice(0,n+1).reduce((x,y)=>x+y,0);
assert.equal(f.roi25y.total_cf_25y_no_land,sum(f.roi25y.cashflows_no_land,20));
assert.equal(f.roi25y.total_cf_pfterm_no_land,sum(f.roi25y.cashflows_no_land,10));
assert.equal(f.pf_table.cashflow.net_25_won,f.roi25y.total_cf_25y_with_land);
assert.ok(f.pf_table.profit.depr_25_total_won<=f.totalCostWon+.001);
assert.ok(Math.abs(f.pf_table.profit.depr_25_total_won-f.totalCostWon)<.001);
assert.ok(f.pf_table.profit.revenue_25_total_won<f.annualRevenueWon*20);
assert.ok(f.pf_table.profit.other_annual_won===320000,'Rent must be included in the visible operating expense');
for(const horizon of ['pf','25']){const c=f.pf_table.cashflow;assert.ok(Math.abs(c['op_'+horizon+'_won']+c['inv_'+horizon+'_won']+c['fin_'+horizon+'_won']-c['net_'+horizon+'_won'])<.01);}
els.pfInterestRate.value='6.5';window.calculateFinance(100,4,64);f=currentAnalysisData.finance;
assert.ok(f.totalInterestWon>0);assert.ok(Math.abs(f.pf_table.profit.int_25_total_won-f.totalInterestWon)<1);
assert.ok(Math.abs(f.pf_table.profit.int_pf_total_won-f.totalInterestWon)<1);
els.pfPrincipal.value='0';window.calculateFinance(100,4,64);assert.equal(currentAnalysisData.finance.loanAmountWon,0);
els.smp.value='0';els.rec.value='0';window.calculateFinance(100,4,64);assert.equal(currentAnalysisData.finance.annualRevenueWon,0);
els.manualDcKw.value='';window.calculateFinance(0,4,0);assert.equal(currentAnalysisData.finance.dcKw,0,'An explicitly cleared layout cannot reuse its old capacity');assert.equal(currentAnalysisData.finance.dcKwManual,null);
els.manualDcKw.value='500';window.calculateFinance(0,4,0);assert.equal(currentAnalysisData.finance.dcKw,500,'A manual DC typed now is the user\'s current value, even over a saved zero-panel layout');
assert.equal(currentAnalysisData.finance.dcKwManual,500);assert.equal(currentAnalysisData.finance.layoutDcKw,0);els.manualDcKw.value='';
assert.equal(errors.length,0,JSON.stringify(errors));
const args={revenue:100,maint:0,other:0,rent:0,degradation:0,inflation:0,capital:150,depreciationAnnual:10,debt:[],cashNoLand:[-150,100,100],replacementYear:13,replacementPct:0};
assert.equal(ctx._spPayback(args.cashNoLand),1.5,'Initial investment must count once, with partial-year recovery');
assert.equal(ctx._spPayback([0,100,100]),null,'No initial investment has no meaningful recovery period');
assert.equal(ctx._spPayback([-150,0,-10]),null);
assert.equal(ctx._spPayback([-150,NaN,100]),null);
// Invoke the real UI wrapper too: it must forward an explicit zero override.
const wrapperStart=html.indexOf('    const origCalc = window.calculateFinance;'),wrapperEnd=html.indexOf('\n  }catch(e){}\n})();',wrapperStart);
vm.runInContext(html.slice(wrapperStart,wrapperEnd),ctx);window.calculateFinance(0,4,0);assert.equal(currentAnalysisData.finance.dcKw,0);
console.log('PASS main finance: full 20-year/PF cashflows, payback, capped depreciation, actual interest, rent, current snapshot, zero loan/rates/prices/capacity.');

// Two roofs facing different directions: use all drawn modules and apply the loss once.
els.installAngle={value:'15'};els.manualDcKw.value='0';els.smp.value='120';els.rec.value='60';
const east={properties:{azimuthDeg:90,tiltDeg:15}},south={properties:{azimuthDeg:180,tiltDeg:15}};
ctx.selectedFeatures.set('east',{panelsFC:{features:[east]}});ctx.selectedFeatures.set('south',{panelsFC:{features:[south,south]}});
window.calculateFinance(3,4,1.92);let direction=currentAnalysisData.finance.assumptions.orientation;
assert.equal(direction.panelCount,3);assert.equal(direction.meanDeviationDeg,30);
assert.ok(Math.abs(direction.factor-(ctx.PFOrientation.ratio(37,90,15)+2)/3)<1e-12);
assert.equal(direction.southReferenceKwhY1,1.92*4*365*.9);assert.equal(direction.adjustedKwhY1,direction.southReferenceKwhY1*direction.factor);
window.calculateFinance(3,4,1.92);assert.equal(currentAnalysisData.finance.assumptions.orientation.adjustedKwhY1,direction.adjustedKwhY1,'Repeated calculations cannot compound the loss');
east.properties.azimuthDeg=0;window.calculateFinance(3,4,1.92);assert.ok(currentAnalysisData.finance.assumptions.orientation.adjustedKwhY1<direction.adjustedKwhY1,'Same panel count with a changed direction still updates yield');
assert.equal(currentAnalysisData.finance.assumptions.sunHours,4);assert.equal(errors.length,0,JSON.stringify(errors));
console.log('PASS mixed-roof financial direction, stable repeated calculation and unchanged capacity/sun baseline.');
const originalPaybackTests=()=>{
  ctx.selectedFeatures.clear();els.installAngle.value='0';els.modPrice.value='220';els.costPerKw.value='80';
  els.pfMaintOpexAnnual.value='0';els.pfOtherOpexAnnual.value='0';els.landRentMonthly.value='0';
  els.pfInterestRate.value='5.5';els.pfTenorYears.value='15';els.pfLoanRatio.value='100';els.pfLtvPct.value='100';
  els.smp.value=String(50379000/(183.68*4*365*.9));els.rec.value='0';
  const results=[];
  for(const ratio of [0,.7,.9]){
    els.pfPrincipal.value=String(187353600*ratio);window.calculateFinance(287,4,183.68);
    const f=currentAnalysisData.finance;results.push(f);
    assert.equal(f.totalCostWon,187353600);assert.equal(f.annualRevenueWon,50379000);
    assert.equal(f.paybackModel,'project-equity-v1');assert.equal(f.roi25y.cashflows_project[0],-187353600);
    assert.ok(f.paybackYears>3.7&&f.paybackYears<3.8);
  }
  assert.equal(results[0].paybackYears,results[1].paybackYears);
  assert.equal(results[0].paybackYears,results[2].paybackYears);
  assert.equal(results[1].equityPaybackYears.toFixed(1),'1.5');
  assert.ok(results[2].equityPaybackYears<results[1].equityPaybackYears);
  assert.equal(results[0].equityPaybackYears,results[0].paybackYears);
  els.pfPrincipal.value='0';els.pfMaintOpexAnnual.value='5000000';window.calculateFinance(287,4,183.68);
  assert.ok(currentAnalysisData.finance.paybackYears>results[0].paybackYears,'Operating costs must delay project recovery');
  els.pfMaintOpexAnnual.value='0';els.installAngle.value='30';ctx.selectedFeatures.set('north',{panelsFC:{features:Array.from({length:287},()=>({properties:{azimuthDeg:0,tiltDeg:30}}))}});
  window.calculateFinance(287,4,183.68);assert.ok(currentAnalysisData.finance.paybackYears>results[0].paybackYears,'Direction loss cannot shorten recovery');
  ctx.selectedFeatures.clear();els.installAngle.value='0';currentAnalysisData.mode='land';els.landTenureMode.value='BUY';currentAnalysisData.land_estimate={land_price_won:20000000};
  window.calculateFinance(287,4,183.68);const land=currentAnalysisData.finance;
  assert.equal(land.roi25y.cashflows_project[0],-207353600);assert.equal(land.roi25y.cashflows_with_land[0],-207353600);
  assert.equal(land.roi25y.cashflows_with_land[1],land.roi25y.cashflows_no_land[1]);
  assert.ok(land.paybackYears>results[0].paybackYears);
  currentAnalysisData.mode='roof';els.landTenureMode.value='ROOF_LEASE';window.calculateFinance(0,4,0);assert.equal(currentAnalysisData.finance.paybackYears,null);
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log('PASS screenshot: project '+results[1].paybackYears.toFixed(3)+' years / equity '+results[1].equityPaybackYears.toFixed(3)+' years; loan invariance, upfront land, zero capacity, costs and direction.');
};originalPaybackTests();

// Roof reference defaults scale with DC capacity; direct edits (even zero) win.
els.pfRentDefault={checked:true};els.pfMaintDefault={checked:true};els.pfCostBasisNote={};
ctx.selectedFeatures.clear();els.installAngle.value='0';els.modPrice.value='220';els.costPerKw.value='80';
els.pfOtherOpexAnnual.value='0';els.pfPrincipal.value=String(208896000*.7);
els.smp.value=String(54666203/(204.8*3.92*365*.9));els.rec.value='0';
window.calculateFinance(320,3.92,204.8);const corrected=currentAnalysisData.finance;
assert.equal(corrected.summary.land_rent_monthly_won,426667);
assert.equal(corrected.summary.annual_maint_opex_won,3458867);
assert.equal(corrected.summary.annual_opex_total_won,8578871);
assert.ok(Math.abs(corrected.paybackYears-4.6197993)<.000001);
assert.equal(corrected.assumptions.operatingCostBasis.maintMode,'research');
assert.equal(corrected.pf_table.profit.other_annual_won,5120004);
window.calculateFinance(320,3.92,204.8);assert.equal(currentAnalysisData.finance.paybackYears,corrected.paybackYears);
window.calculateFinance(160,3.92,102.4);assert.equal(currentAnalysisData.finance.summary.annual_maint_opex_won,1729434);
els.pfRentDefault.checked=false;els.pfMaintDefault.checked=false;els.landRentMonthly.value='0';els.pfMaintOpexAnnual.value='0';
window.calculateFinance(320,3.92,204.8);assert.equal(currentAnalysisData.finance.summary.annual_opex_total_won,0);
assert.equal(currentAnalysisData.finance.assumptions.operatingCostBasis.maintMode,'manual');
assert.ok(currentAnalysisData.finance.paybackYears<corrected.paybackYears);
els.landRentMonthly.value='500000';els.pfMaintOpexAnnual.value='6000000';window.calculateFinance(320,3.92,204.8);
assert.equal(currentAnalysisData.finance.summary.annual_opex_total_won,12000000);
els.pfRentDefault.checked=true;els.pfMaintDefault.checked=true;els.landTenureMode.value='OWN';
window.calculateFinance(320,3.92,204.8);assert.equal(currentAnalysisData.finance.summary.annual_opex_total_won,3458867,'Owned roof must not pay roof rent');
window.calculateFinance(0,3.92,0);assert.equal(currentAnalysisData.finance.summary.annual_opex_total_won,0);
assert.equal(errors.length,0,JSON.stringify(errors));
console.log('PASS researched roof costs, 4.620-year saved case, scaled capacity, no double counting, editable explicit zero, owned roof and zero layout.');
// Real input events must update finance synchronously without queueing layout/API work.
const controlsStart=html.indexOf('window.requestFinanceRecalc = function(){');
vm.runInContext(html.slice(controlsStart,html.indexOf('// Auto-recalc when panel count changes',controlsStart)),ctx);
ctx.getTotalPanelCount=()=>[...ctx.selectedFeatures.values()].reduce((n,v)=>n+(v.count||0),0);
window.reCalculate=()=>{throw new Error('Financial edits cannot rebuild the roof');};
ctx.updateResultCardBasics=()=>{throw new Error('Financial edits cannot request KEPCO');};
const inputIds=['modPrice','costPerKw','smp','rec','pfLoanRatio','pfInterestRate','pfTenorYears','pfDscrTarget','pfLtvPct','pfPrincipal','pfLandBuyPrice','landRentMonthly','pfMaintOpexAnnual','pfOtherOpexAnnual','pfOtherCapexWon','pfOtherAssetWon','pfRentDefault','pfMaintDefault','pfAutoPrincipal'];
for(const id of inputIds){
  els[id] ||= {value:'0',checked:false};Object.assign(els[id],{id,dataset:{},tagName:'INPUT',type:id.endsWith('Default')||id==='pfAutoPrincipal'?'checkbox':'number'});
}
els.pfFinanceInputStatus={};
function type(id,value){
  els[id].value=String(value);
  const tag=html.match(new RegExp('<input\\b[^>]*\\bid="'+id+'"[^>]*>'))[0];
  const handler=tag.match(/oninput="([^"]+)"/)[1];
  vm.runInContext('(function(){'+handler+'}).call(document.getElementById("'+id+'"))',ctx);
}
currentAnalysisData.mode='roof';currentAnalysisData.solar_opt.sun_hours=3.92;els.landTenureMode.value='ROOF_LEASE';
ctx.selectedFeatures.clear();ctx.selectedFeatures.set('a',{count:320});
ctx.layoutOrientation=()=>({factor:0.9253786966529429,panelCount:320,groups:[],meanDeviationDeg:76.34});
els.manualDcKw.value='0';window.calculateFinance(320,3.92,204.8);
window.applyRoofFinanceDefaults();const baseline=currentAnalysisData.finance;
assert.equal(baseline.totalCostWon,262144000);assert.equal(baseline.assumptions.smp+baseline.assumptions.rec,200);
assert.equal(baseline.summary.annual_opex_total_won,8578871);
assert.ok(baseline.paybackYears>6.5&&baseline.paybackYears<7.2);
assert.equal(baseline.assumptions.parameterBasis.mode,'planning');
type('smp',130);assert.ok(currentAnalysisData.finance.paybackYears<baseline.paybackYears);
assert.equal(currentAnalysisData.finance.totalPanels,320);assert.equal(currentAnalysisData.finance.dcKw,204.8);
assert.equal(currentAnalysisData.finance.assumptions.parameterBasis.mode,'custom');
type('costPerKw',130);const expensive=currentAnalysisData.finance;assert.ok(expensive.totalCostWon>baseline.totalCostWon);
assert.equal(els.costPerKw.dataset.pfManual,'1');
type('pfMaintOpexAnnual',0);assert.equal(els.pfMaintDefault.checked,false);
assert.equal(currentAnalysisData.finance.summary.annual_maint_opex_won,0);
type('landRentMonthly',0);assert.equal(els.pfRentDefault.checked,false);
assert.equal(currentAnalysisData.finance.summary.annual_opex_total_won,0);
type('pfPrincipal',0);assert.equal(els.pfAutoPrincipal.checked,false);assert.equal(currentAnalysisData.finance.loanAmountWon,0);
type('pfPrincipal',100000000);const interestBefore=currentAnalysisData.finance.totalInterestWon,projectBefore=currentAnalysisData.finance.paybackYears;
type('pfInterestRate',8);assert.ok(currentAnalysisData.finance.totalInterestWon>interestBefore);assert.equal(currentAnalysisData.finance.paybackYears,projectBefore);
type('smp',0);type('rec',0);assert.equal(currentAnalysisData.finance.annualRevenueWon,0);assert.equal(currentAnalysisData.finance.paybackYears,null);
type('smp','');assert.equal(currentAnalysisData.finance.annualRevenueWon,0);assert.match(els.pfFinanceInputStatus.textContent,/입력 중/);
type('smp',110);type('rec',90);type('pfOtherCapexWon',10000000);assert.equal(currentAnalysisData.finance.summary.capex_other_won,10000000);
// Capacity change scales only enabled reference costs and preserves custom fields.
window.calculateFinance(160,3.92,102.4);assert.equal(els.costPerKw.value,'130');assert.equal(currentAnalysisData.finance.summary.annual_opex_total_won,0);
ctx.selectedFeatures.set('a',{count:0});els.manualDcKw.value='';window.requestFinanceRecalc();assert.equal(currentAnalysisData.finance.dcKw,0);
els.manualDcKw.value='500';window.requestFinanceRecalc();assert.equal(currentAnalysisData.finance.dcKw,500,'0 panels + manual DC keeps the manual capacity after a finance edit');
assert.ok(currentAnalysisData.finance.totalCostWon>0);els.manualDcKw.value='';window.requestFinanceRecalc();assert.equal(currentAnalysisData.finance.dcKw,0,'Clearing the manual DC is not sticky');
assert.equal(errors.length,0,JSON.stringify(errors));
console.log('PASS live inputs: baseline '+baseline.paybackYears.toFixed(4)+' years; instant prices/costs/loan edits, explicit zero, incomplete typing, manual overrides, cleared layout and no network/geometry.');
if(process.env.PF_FINANCE_AUDIT){fs.writeFileSync(process.env.PF_FINANCE_AUDIT,JSON.stringify({case:'Cheongju 320 panels / DC 204.8 kW',finance:baseline},null,2));}

// Changing an inverter or loading the catalog cannot overwrite a custom module price.
const hardwareStart=html.indexOf('  function applySelected(changedSelect){'),hardwareEnd=html.indexOf('  function readNumInput(',hardwareStart);
ctx.state={selectedModule:{power_w:640,price_won_per_w:220},selectedInverter:{capacity_kw:100,price_won:9000000}};
for(const id of ['modPower','modPrice','invCap','invPrice'])els[id] ||= {value:'',dataset:{}};
window.reCalculate=()=>{};vm.runInContext(html.slice(hardwareStart,hardwareEnd),ctx);
els.modPrice.value='280';ctx.applySelected();assert.equal(els.modPrice.value,'280','Initial catalog must preserve planning price');
els.modPrice.value='333';ctx.applySelected('inverterSelect');assert.equal(els.modPrice.value,'333');
ctx.applySelected('moduleSelect');assert.equal(Number(els.modPrice.value),220,'Explicit model selection applies its quoted price');
console.log('PASS catalog price ownership: initial default, custom edits and unrelated inverter choices are preserved.');
