/* Financial preferences contain only explicit edits, scoped to the signed-in workspace. */
(function(root,factory){
  if(typeof module==='object' && module.exports)module.exports=factory;
  else root.PFFinancePreferences=factory({
    getElement:id=>document.getElementById(id),
    domReady:document.readyState==='loading'?new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true})):Promise.resolve(),
    storage:()=>localStorage,
    scope:async()=>{
      const token=sessionStorage.getItem('spf_token');if(!token)return null;
      const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('pf-finance-inputs-v1:'+token));
      if(sessionStorage.getItem('spf_token')!==token)return null;
      return Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('');
    },
    restored:()=>{root.updateTenureUi?.();root.syncHardwareSelectionToCurrent?.();},
    recalculate:()=>root.requestFinanceRecalc?.(),
    defaultValue:(id,value)=>id==='costPerKw'&&document.querySelector('input[name="scanTarget"]:checked')?.value==='land'?150:value
  });
})(typeof window!=='undefined'?window:globalThis,function createFinancePreferences(options){
  'use strict';
  const defaults=Object.freeze({modPrice:280,costPerKw:100,smp:110,rec:90,pfLoanRatio:70,pfLtvPct:70,pfInterestRate:5.5,pfTenorYears:15,pfDscrTarget:1.2,pfPrincipal:0,pfLandBuyPrice:0,landRentMonthly:0,pfMaintOpexAnnual:0,pfOtherOpexAnnual:0,pfOtherCapexWon:0,pfOtherAssetWon:0,pfRentDefault:true,pfMaintDefault:true,pfAutoPrincipal:true});
  const pairs={landRentMonthly:'pfRentDefault',pfMaintOpexAnnual:'pfMaintDefault',pfPrincipal:'pfAutoPrincipal'};
  const fields=new Set([...Object.keys(defaults),'landTenureMode','invPrice']);
  let key=null,loaded=false,writable=true,overrides={},pending={},afterLoad=null;
  const own=(object,id)=>Object.prototype.hasOwnProperty.call(object,id);
  function valid(id,value){
    if(!fields.has(id))return false;
    if(typeof defaults[id]==='boolean')return typeof value==='boolean';
    if(id==='landTenureMode')return ['BUY','OWN','LAND_LEASE','ROOF_LEASE'].includes(value);
    return typeof value==='number' && Number.isFinite(value) && value>=0 && value<=Number.MAX_SAFE_INTEGER &&
      (id!=='pfTenorYears'||(Number.isInteger(value)&&value>=1&&value<=50)) &&
      (!['pfLtvPct','pfLoanRatio'].includes(id)||value<=100) && (id!=='pfDscrTarget'||value>0);
  }
  function valueOf(id){
    const node=options.getElement(id);if(!node)return undefined;
    if(typeof defaults[id]==='boolean')return !!node.checked;
    if(id==='landTenureMode')return node.value;
    const raw=String(node.value).replace(/,/g,'').trim();return raw===''?undefined:Number(raw);
  }
  function write(){
    if(!loaded)return true;
    if(!key)return false;
    try{options.storage().setItem(key,JSON.stringify({version:1,overrides}));writable=true;return true;}
    catch(_){writable=false;return false;}
  }
  function change(id,value){
    if(value===null)delete overrides[id];else overrides[id]=value;
    if(!loaded)pending[id]=value;
  }
  function remember(input){
    const id=typeof input==='string'?input:input?.id,value=valueOf(id);
    if(!valid(id,value))return false;
    change(id,value);
    const auto=pairs[id];
    if(auto){change(auto,false);const control=options.getElement(auto);if(control)control.checked=false;}
    for(const [amount,control] of Object.entries(pairs)){
      if(id!==control)continue;
      if(value)change(amount,null);
      else {const current=valueOf(amount);if(valid(amount,current))change(amount,current);}
    }
    return write();
  }
  function reset(ids){
    for(const id of ids){if(fields.has(id))change(id,null);}
    return write();
  }
  const api={defaults,remember,reset,afterRestore:callback=>{if(loaded)callback();else afterLoad=callback;},get loaded(){return loaded;},get writable(){return writable;}};
  api.ready=(async()=>{
    await (options.domReady||Promise.resolve());
    let saved={};
    try{
      const scope=await options.scope();
      if(scope){
        key='pf_finance_inputs_v1:'+scope;
        const data=JSON.parse(options.storage().getItem(key)||'null');
        if(data?.version===1 && data.overrides && typeof data.overrides==='object'){
          for(const [id,value] of Object.entries(data.overrides))if(valid(id,value))saved[id]=value;
        }
      }
    }catch(_){writable=false;}
    for(const [id,value] of Object.entries(pending)){if(value===null)delete saved[id];else saved[id]=value;}
    overrides=saved;
    // Auto-calculated totals are not sticky preferences; they scale with each new layout.
    for(const [amount,control] of Object.entries(pairs)){
      if(overrides[control]===true)delete overrides[amount];
      else if(own(overrides,amount))overrides[control]=false;
    }
    for(const id of fields){
      const node=options.getElement(id);if(!node)continue;
      const manual=own(overrides,id),value=manual?overrides[id]:(options.defaultValue?options.defaultValue(id,defaults[id]):defaults[id]);
      if(value===undefined)continue;
      if(typeof value==='boolean')node.checked=value;else node.value=String(value);
      if(manual)node.dataset.pfManual='1';else delete node.dataset.pfManual;
    }
    const edited=Object.keys(overrides).length>0;
    loaded=true;
    if(Object.keys(pending).length)write();pending={};
    const status=options.getElement('pfFinanceInputStatus');
    if(status)status.textContent=!writable?'기본값 적용 · 브라우저 저장을 사용할 수 없어 이번 입력은 현재 화면에서만 유지됩니다.':edited?'저장한 입력값을 복원했습니다. 변경하지 않은 항목은 기본값을 사용합니다.':'지붕 기본값 자동 적용 · 수정한 값은 이 브라우저에서 다음 접속에도 유지됩니다.';
    const callback=afterLoad;afterLoad=null;
    options.restored?.();
    if(callback)callback();else options.recalculate?.();
    return api;
  })();
  return api;
});
