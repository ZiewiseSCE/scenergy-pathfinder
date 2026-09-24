/* Shared PC/mobile conversation scope. Only locators cross the trust boundary. */
(function(){'use strict';
  let owner='signed-out',last={},viewIdentity=null;
  const ready=(async()=>{
    const key=sessionStorage.getItem('spf_token');
    if(key){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));owner=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');}
    try{last=JSON.parse(sessionStorage.getItem('solbi_context_v2:'+owner)||'{}');}catch(_){last={};}
    // Old shared browser history had no owner boundary. Never import it.
    for(const key of ['solbi_chat_v1','solbi_jobs_v1','aiast_jobs_v1'])localStorage.removeItem(key);
  })();
  function clean(data){const out={};for(const k of ['siteId','layoutId','revision','address','pnu','lat','lng','mode','dataMode'])if(['string','number'].includes(typeof data?.[k]))out[k]=data[k];return out;}
  function get(){
    const c=window.currentAnalysisData||{},q=new URLSearchParams(location.search);
    const view=clean(window.PFSolbiSelectedSite?.()||{address:c.address,pnu:c.pnu,lat:c.lat,lng:c.lng,mode:c.mode,layoutId:c.layoutId,revision:c.layoutRevision,siteId:(!c.address||c.address===q.get('siteAddress'))?q.get('siteId'):undefined});
    delete view.dataMode;
    const identity=JSON.stringify(view);
    if(identity!==viewIdentity){if(Object.keys(view).length||viewIdentity!==null)last=view;viewIdentity=identity;}
    return {...last,dataMode:window.PFDataMode?.get?.()||window.PFSolbiSelectedSite?.()?.dataMode||'stored'};
  }
  function set(context){if(!context)return;last=clean(context);try{sessionStorage.setItem('solbi_context_v2:'+owner,JSON.stringify(last));}catch(_){}}
  function clear(){last={};viewIdentity=null;sessionStorage.removeItem('solbi_context_v2:'+owner);}
  window.PFSolbiContext={ready,get,set,clear,storageKey:prefix=>prefix+':'+owner};
})();
