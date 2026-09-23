/* Deterministic, unlevered, pre-tax 20-year scenarios. All prices are user assumptions. */
(function(root){'use strict';
  function calculate(p){
    const ranges={kw:[.1,1000000],hours:[.1,8],capex:[0,10000000],opex:[0,1000000],price:[0,10000],discount:[0,50],degradation:[0,10]};
    for(const [k,[lo,hi]] of Object.entries(ranges))if(!Number.isFinite(p[k])||p[k]<lo||p[k]>hi)throw new Error('입력 범위를 확인하세요: '+k);
    const initial=p.kw*p.capex,rate=p.discount/100,rows=[];let cumulative=-initial,npv=-initial,costPv=initial,energyPv=0,payback=null;
    for(let year=1;year<=20;year++){
      const kwh=p.kw*p.hours*365*(1-p.degradation/100)**(year-1),revenue=kwh*p.price,expense=p.kw*p.opex,cash=revenue-expense,previous=cumulative;
      cumulative+=cash;npv+=cash/(1+rate)**year;costPv+=expense/(1+rate)**year;energyPv+=kwh/(1+rate)**year;
      if(payback===null&&previous<0&&cumulative>=0&&cash>0)payback=year-1+(-previous/cash);
      rows.push({year,kwh,revenue,expense,cash,cumulative});
    }
    function value(r){return rows.reduce((sum,x)=>sum+x.cash/(1+r)**x.year,-initial);}
    let irr=null;
    if(initial>0&&rows.some(x=>x.cash>0)){
      let lo=-.999,hi=1;while(value(hi)>0&&hi<1024)hi*=2;
      if(value(lo)*value(hi)<0){for(let i=0;i<100;i++){const mid=(lo+hi)/2;if(value(mid)>0)lo=mid;else hi=mid;}irr=(lo+hi)/2*100;}
    }
    return {initial,npv,irr,payback:initial===0?0:payback,lcoe:energyPv>0?costPv/energyPv:null,rows,assumptions:p};
  }
  root.PFExploreFinance={calculate};if(typeof module!=='undefined')module.exports={calculate};
})(typeof window!=='undefined'?window:globalThis);
