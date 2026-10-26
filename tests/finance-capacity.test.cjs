const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('solar_pathfinder.html','utf8');
const extract=(a,b)=>{const i=html.indexOf(a),j=html.indexOf(b,i);assert(i>=0&&j>i,a);return html.slice(i,j);};
// Real calculateFinance/requestFinanceRecalc/onFinanceInput, manual DC field wiring and layout capture apply.
const values={modPower:640,modPrice:270,costPerKw:100,smp:120,rec:60,pfPrincipal:1000000,pfInterestRate:5,pfTenorYears:10,pfDscrTarget:1.2,pfLoanRatio:70,pfLtvPct:70,pfAutoPrincipal:'',landTenureMode:'ROOF_LEASE',landRentMonthly:0,pfMaintOpexAnnual:0,pfOtherOpexAnnual:0,pfDeprRatePct:''};
const els=Object.fromEntries(Object.entries(values).map(([id,value])=>[id,{id,value:String(value),style:{},checked:false,dataset:{},tagName:'INPUT',type:'number'}]));
const listeners={};let manual=null;
els.pfPrincipal.parentElement={tagName:'DIV',parentElement:{insertBefore(){manual=els.manualDcKw={id:'manualDcKw',value:'',dataset:{},addEventListener:(type,fn)=>{listeners[type]=fn;}};}}};
els.pfTenorNote={textContent:'',hidden:true,classList:{toggle(name,on){els.pfTenorNote.hidden=on;}}};els.pfFinanceInputStatus={};els.analysisCapacity={innerText:''};els.analysisCount={innerText:''};
const errors=[],window={},currentAnalysisData={mode:'roof',address:'QA',solar_opt:{sun_hours:4}};
const ctx={window,currentAnalysisData,document:{readyState:'complete',getElementById:id=>els[id],querySelectorAll:()=>[],createElement:()=>({})},el:id=>els[id],getAnalysisLatLng:()=>({lat:37,lng:127}),
  estimateSunHoursHeuristic:()=>4,formatNumber:String,formatMillionWon:String,_spCapacityLabel:dc=>'DC '+dc.toFixed(1)+' kW',console:{error:(...e)=>errors.push(e),warn:(...e)=>errors.push(e)},showToast(){},
  selectedFeatures:new Map([['a',{count:100}]]),_spNormalizeRoofCaptureForReport:x=>x,_spRoofCaptureIsManualLayout:()=>true,_spReportNumber:v=>Number.isFinite(Number(v))?Number(v):0};
ctx.getTotalPanelCount=()=>[...ctx.selectedFeatures.values()].reduce((n,v)=>n+(v.count||0),0);
ctx.PFOrientation=require('../assets/pathfinder/orientation.js');window.currentAnalysisData=currentAnalysisData;vm.createContext(ctx);
vm.runInContext(extract('function layoutOrientation(','function formatMillionWon('),ctx);
vm.runInContext(extract('function _spPayback(','// Finance recalculation helper'),ctx);
vm.runInContext(extract('window.requestFinanceRecalc = function(){','// Auto-recalc when panel count changes'),ctx);
vm.runInContext(extract('// 수동 설계용량(DC, kW) 입력 필드 추가','</script>'),ctx);
vm.runInContext(extract('function _spApplyManualLayoutCapture(','function _spRoofCaptureMatchesReport('),ctx);
const f=()=>currentAnalysisData.finance;
const setManual=v=>{manual.value=String(v);listeners.input.call(manual);};
const edit=(id,v)=>{els[id].value=String(v);window.onFinanceInput(els[id]);};
assert.ok(manual&&listeners.input,'Manual DC field is created and wired');
// F1: manual DC is applied immediately, survives finance edits, and clearing it is not sticky.
window.calculateFinance(100);assert.equal(f().dcKw,64);assert.equal(f().dcKwManual,null);assert.equal(f().layoutDcKw,null);
setManual(99.9);assert.equal(f().dcKw,99.9,'Typing a manual DC recalculates');assert.equal(f().dcKwManual,99.9);
edit('smp',130);assert.equal(f().dcKw,99.9,'A finance edit keeps the manual DC (not the old 64 kW)');assert.equal(f().dcKwManual,99.9);
setManual('');assert.equal(f().dcKw,64,'Clearing the manual DC returns to the layout capacity');assert.equal(f().dcKwManual,null);
edit('smp',120);assert.equal(f().dcKw,64);assert.equal(f().dcKwManual,null,'Report must not print "수동 DC 64.0 kW" without a manual entry');
// Exact layout DC (mixed power/saved revision) lives in layoutDcKw and is replayed only for the same layout.
window.calculateFinance(100,4,70);assert.equal(f().dcKw,70);assert.equal(f().layoutDcKw,70);assert.equal(f().dcKwManual,null);
edit('rec',70);assert.equal(f().dcKw,70,'Same layout replays its exact capacity');assert.equal(f().layoutDcKw,70);
setManual(99.9);assert.equal(f().dcKw,99.9,'Manual input wins over the layout capacity');assert.equal(f().layoutDcKw,70);
setManual('');assert.equal(f().dcKw,70);
ctx.selectedFeatures.set('a',{count:120});edit('rec',60);assert.equal(f().dcKw,76.8,'A changed layout cannot replay the old exact capacity');assert.equal(f().layoutDcKw,null);
// F2: 0 panels + manual DC keeps capacity and cost after a finance edit; a saved zero layout without manual stays 0.
ctx.selectedFeatures.set('a',{count:0});setManual(500);assert.equal(f().dcKw,500);edit('smp',125);assert.equal(f().dcKw,500,'0 panels + manual 500 after an SMP edit');assert.ok(f().totalCostWon>0);
setManual('');assert.equal(f().dcKw,0);window.calculateFinance(0,4,0);edit('smp',120);assert.equal(f().dcKw,0);assert.equal(f().layoutDcKw,0,'A saved zero-panel layout is replayed as zero');
// Layout capture keeps a user manual DC (labelled) instead of silently dropping it.
ctx.selectedFeatures.set('a',{count:100});setManual(99.9);
ctx._spApplyManualLayoutCapture({panelCount:100,capacityKw:70},true);
assert.equal(f().dcKw,99.9);assert.equal(f().capacitySource,'manual_input');assert.equal(f().layoutCapacityKw,70);assert.equal(currentAnalysisData.dc_kw,99.9);assert.match(els.analysisCapacity.innerText,/수동 입력 \(배치 70\.0 kW\)/);
setManual('');ctx._spApplyManualLayoutCapture({panelCount:100,capacityKw:70},true);
assert.equal(f().dcKw,70);assert.equal(f().capacitySource,'manual_layout');assert.equal(currentAnalysisData.dc_kw,70);assert.equal(f().layoutDcKw,70);
// F4: tenor is limited to the 20-year horizon (no unpaid principal), 0 is rejected visibly, explicit 0% depreciation is kept.
els.pfAutoPrincipal.checked=true;els.pfLtvPct.value='70';els.pfLoanRatio.value='70';
els.pfTenorYears.value='30';window.calculateFinance(100);
let a=f().assumptions;assert.equal(a.debt_years,20);assert.equal(a.debt_years_input,30);assert.match(els.pfTenorNote.textContent,/30년.*20년/);assert.equal(els.pfTenorNote.hidden,false);
assert.ok(Math.abs(f().pf_table.cashflow.loan_repay_25_won-f().loanAmountWon)<2,'The whole loan is repaid inside the cash flows');
assert.ok(Math.abs(f().pf_table.profit.int_25_total_won-f().totalInterestWon)<2,'Total interest equals the interest inside the horizon');
assert.ok(Math.abs(a.ltv-f().loanAmountWon/f().totalCostWon)<1e-9,'assumptions.ltv is the applied loan ratio for the report');assert.equal(a.ltvInputPct,70);
els.pfTenorYears.value='0';window.calculateFinance(100);assert.equal(f().assumptions.debt_years,1);assert.match(els.pfTenorNote.textContent,/0년은 계산할 수 없어/);
els.pfTenorYears.value='';window.calculateFinance(100);assert.equal(f().assumptions.debt_years,10);assert.equal(els.pfTenorNote.textContent,'');assert.equal(els.pfTenorNote.hidden,true);
els.pfTenorYears.value='15';window.calculateFinance(100);assert.equal(f().assumptions.debt_years,15);assert.equal(els.pfTenorNote.textContent,'');
els.pfDeprRatePct.value='0';window.calculateFinance(100);assert.equal(f().assumptions.depr_rate_pct,0,'Explicit 0% depreciation is not replaced by 6.25%');assert.equal(f().pf_table.profit.depr_25_total_won,0);
els.pfDeprRatePct.value='';window.calculateFinance(100);assert.equal(f().assumptions.depr_rate_pct,6.25);assert.ok(f().pf_table.profit.depr_25_total_won>0);
assert.equal(errors.length,0,JSON.stringify(errors));
console.log('PASS finance capacity: manual DC wired/re-read/not sticky, layout DC replay only for the same layout, 0-panel manual DC, labelled manual over layout capture, 20-year tenor cap, rejected 0 tenor, explicit 0% depreciation and report LTV');
