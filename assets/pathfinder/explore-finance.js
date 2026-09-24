/* Annual end-of-year cash flows. KRW, kW, kWh. No tax or tariff is assumed law. */
(function(root){'use strict';
  const defaults={years:20,debt:0,interest:0,term:10,grace:0,tax:0,inflation:0,escalation:0,depreciation:20,fixedCapex:0,replacement:0,replacementYear:10,residual:0,decommission:0,curtailment:0,rec:0,weight:1,priceMode:'manual',costMode:'aggregate'};
  function costItems(p){
    if(!['aggregate','items'].includes(p.costMode))throw new Error('비용 계산 방식을 확인하세요.');
    if(p.costMode!=='items')return [];
    if(!Array.isArray(p.costItems)||p.costItems.length<1||p.costItems.length>100)throw new Error('비용 항목은 1~100개 입력하세요.');
    return p.costItems.map(item=>{
      if(!item||!['capex','opex'].includes(item.kind)||!Number.isFinite(item.amount)||item.amount<0||item.amount>1e12)throw new Error('비용 금액을 확인하세요.');
      const row={...item,name:String(item.name||'비용 항목').slice(0,100)},required=item.kind==='capex'?[['year',0,40],['depreciationYears',0,40]]:[['startYear',1,40],['endYear',1,40]];
      for(const [key,lo,hi] of required)if(!Number.isInteger(row[key])||row[key]<lo||row[key]>hi)throw new Error('비용 발생·상각 연도를 확인하세요: '+key);
      if(row.kind==='opex'&&(!['annual','monthly','once'].includes(row.frequency)||row.endYear<row.startYear))throw new Error('운영비 주기와 기간을 확인하세요.');
      return row;
    });
  }
  function costYear(items,year,inflation){
    let expense=0,replacement=0,depreciation=0;
    for(const item of items){if(item.kind==='capex'){if(item.year===year)replacement+=item.amount;const start=Math.max(1,item.year),life=item.depreciationYears;if(life&&year>=start&&year<start+life)depreciation+=item.amount/life;}else if(year>=item.startYear&&year<=item.endYear&&(item.frequency!=='once'||year===item.startYear))expense+=item.amount*(item.frequency==='monthly'?12:1);}
    return {expense:expense*(1+inflation/100)**(year-1),replacement,depreciation};
  }
  function irrOf(initial,flows){
    if(initial<=0||!flows.some(x=>x>0))return null;
    const signs=[-initial,...flows].filter(x=>x!==0).map(Math.sign);
    if(signs.slice(1).filter((s,i)=>s!==signs[i]).length!==1)return null;
    const value=r=>flows.reduce((sum,x,i)=>sum+x/(1+r)**(i+1),-initial);
    let lo=-.999,hi=1;while(value(hi)>0&&hi<1024)hi*=2;
    if(!(value(lo)>0&&value(hi)<0))return null;
    for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(value(mid)>0)lo=mid;else hi=mid;}
    return (lo+hi)/2*100;
  }
  function calculate(input){
    const p={...defaults,...input};
    const ranges={kw:[.1,1000000],hours:[.1,8],capex:[0,10000000],opex:[0,1000000],price:[0,10000],discount:[0,50],degradation:[0,10],years:[1,40],debt:[0,95],interest:[0,50],term:[1,40],grace:[0,39],tax:[0,60],inflation:[-10,30],escalation:[-20,30],depreciation:[1,40],fixedCapex:[0,1e12],replacement:[0,1e12],replacementYear:[1,40],residual:[0,1e12],decommission:[0,1e12],curtailment:[0,100],rec:[0,1e6],weight:[0,10]};
    for(const [k,[lo,hi]] of Object.entries(ranges))if(!Number.isFinite(p[k])||p[k]<lo||p[k]>hi)throw new Error('입력 범위를 확인하세요: '+k);
    for(const k of ['years','term','grace','depreciation','replacementYear'])if(!Number.isInteger(p[k]))throw new Error('연도는 정수로 입력하세요: '+k);
    if(p.debt>0&&(p.term>p.years||p.grace>=p.term))throw new Error('대출 만기는 사업기간 이내, 거치기간은 대출 만기 미만이어야 합니다.');
    if(!['manual','market'].includes(p.priceMode))throw new Error('판매단가 방식을 확인하세요.');
    const items=costItems(p);if(p.costMode==='items')p.costItems=items;
    const initial=p.costMode==='items'?items.filter(i=>i.kind==='capex'&&i.year===0).reduce((s,i)=>s+i.amount,0):p.kw*p.capex+p.fixedCapex,loan=initial*p.debt/100,equity=initial-loan,rate=p.discount/100,rows=[];
    const salePrice=p.price+(p.priceMode==='market'?p.rec*p.weight/1000:0);
    let cumulative=-equity,npv=-equity,projectNpv=-initial,costPv=initial,energyPv=0,payback=null,balance=loan,loss=0,projectLoss=0;
    for(let year=1;year<=p.years;year++){
      const kwh=p.kw*p.hours*365*(1-p.degradation/100)**(year-1)*(1-p.curtailment/100),price=salePrice*(1+p.escalation/100)**(year-1),revenue=kwh*price;
      const {expense,replacement,depreciation}=p.costMode==='items'?costYear(items,year,p.inflation):{expense:p.kw*p.opex*(1+p.inflation/100)**(year-1),replacement:year===p.replacementYear?p.replacement:0,depreciation:year<=p.depreciation?initial/p.depreciation:0};
      const interest=balance*p.interest/100,principal=year>p.grace&&year<=p.term?Math.min(balance,loan/(p.term-p.grace)):0;
      const taxable=revenue-expense-interest-depreciation,tax=Math.max(0,taxable-loss)*p.tax/100;loss=Math.max(0,loss-taxable);
      const taxableProject=revenue-expense-depreciation,projectTax=Math.max(0,taxableProject-projectLoss)*p.tax/100;projectLoss=Math.max(0,projectLoss-taxableProject);
      const terminal=year===p.years?p.residual-p.decommission:0,cash=revenue-expense-replacement-interest-principal-tax+terminal,projectCash=revenue-expense-replacement-projectTax+terminal,previous=cumulative;
      balance=Math.max(0,balance-principal);cumulative+=cash;npv+=cash/(1+rate)**year;projectNpv+=projectCash/(1+rate)**year;
      costPv+=(expense+replacement+(year===p.years?p.decommission-p.residual:0))/(1+rate)**year;energyPv+=kwh/(1+rate)**year;
      if(payback===null&&previous<0&&cumulative>=0&&cash>0)payback=year-1+(-previous/cash);
      rows.push({year,kwh,price,revenue,expense,replacement,depreciation,interest,principal,tax,balance,cash,projectCash,cumulative,dscr:interest+principal>0?(revenue-expense-tax)/(interest+principal):null});
    }
    const dscr=rows.filter(r=>r.dscr!==null).map(r=>r.dscr);
    return {initial,equity,loan,salePrice,npv,projectNpv,irr:irrOf(equity,rows.map(x=>x.cash)),projectIrr:irrOf(initial,rows.map(x=>x.projectCash)),minDscr:dscr.length?Math.min(...dscr):null,payback:equity===0?0:payback,lcoe:energyPv>0?costPv/energyPv:null,rows,assumptions:p};
  }
  function sensitivity(p){return [-20,-10,0,10,20].map(change=>({change,priceNpv:calculate({...p,price:p.price*(1+change/100),rec:(p.rec||0)*(1+change/100)}).npv,capexNpv:calculate({...p,capex:p.capex*(1+change/100),fixedCapex:(p.fixedCapex||0)*(1+change/100),costItems:p.costItems?.map(i=>({...i,amount:i.kind==='capex'?i.amount*(1+change/100):i.amount}))}).npv,outputNpv:calculate({...p,hours:Math.min(8,p.hours*(1+change/100))}).npv}));}
  root.PFExploreFinance={calculate,sensitivity,defaults};if(typeof module!=='undefined')module.exports={calculate,sensitivity,defaults};
})(typeof window!=='undefined'?window:globalThis);
