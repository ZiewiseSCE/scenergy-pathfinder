/* Shared PC/mobile conversation scope. Only locators cross the trust boundary. */
(function(){'use strict';
  let owner='signed-out',last={},viewIdentity=null,draft=null;
  const ready=(async()=>{
    const key=sessionStorage.getItem('spf_token');
    if(/^[a-f0-9]{64}$/.test(window.PFSolbiIdentity||''))owner=window.PFSolbiIdentity;
    else if(key){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));owner=Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('');}
    try{last=JSON.parse(sessionStorage.getItem('solbi_context_v2:'+owner)||'{}');}catch(_){last={};}
    try{draft=cleanDraft(JSON.parse(sessionStorage.getItem('solbi_analysis_draft_v1:'+owner)||'null'));}catch(_){draft=null;}
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
  // The pending analysis-conditions card of a conversation (pf_solbi_analysis_options): only its locator {id}, echoed with
  // every message of that conversation as context.analysisDraft until a reply clears it — like the clarification locator.
  function cleanDraft(value){return value&&/^ao_[0-9a-f]{32}$/.test(String(value.id||''))&&typeof value.scope==='string'?{id:value.id,scope:value.scope}:null;}
  function keepDraft(){try{if(draft)sessionStorage.setItem('solbi_analysis_draft_v1:'+owner,JSON.stringify(draft));else sessionStorage.removeItem('solbi_analysis_draft_v1:'+owner);}catch(_){}}
  /* A reply's context: analysisDraft {id} opens the locator for `scope` (the conversation id the request was sent with),
     analysisDraft null closes it. Returns the id that was closed (the page then makes that card read-only), else null. */
  function acceptDraft(context,scope){
    if(!context||typeof context!=='object'||!Object.prototype.hasOwnProperty.call(context,'analysisDraft'))return null;
    const previous=draft?draft.id:null,next=cleanDraft({id:context.analysisDraft&&context.analysisDraft.id,scope:String(context.conversationId||scope||'')});
    draft=next;keepDraft();
    return previous&&(!next||next.id!==previous)?previous:null;
  }
  function analysisDraft(scope){return draft&&draft.scope===String(scope||'')?{id:draft.id}:null;}
  function clear(){last={};viewIdentity=null;draft=null;sessionStorage.removeItem('solbi_context_v2:'+owner);keepDraft();}
  window.PFSolbiContext={ready,get,set,clear,acceptDraft,analysisDraft,storageKey:prefix=>prefix+':'+owner};
})();
