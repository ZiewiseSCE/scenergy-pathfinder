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
els.manualDcKw.value='500';window.calculateFinance(0,4,0);assert.equal(currentAnalysisData.finance.dcKw,0,'An explicitly cleared layout cannot reuse its old/manual capacity');
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
