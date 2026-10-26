(function(){'use strict';
  const asset=new URL('.',document.currentScript.src),worker=new PFLayoutClient(new URL('layout-worker.js',asset));
  const popups=new Map(),roofRequests=new Map();let lastSession=null,editorView=null,calculationSerial=0;
  function cad(){return window.currentAnalysisData||{};}
  function val(id,fallback){const e=document.getElementById(id);return e?e.value:fallback;}
  function spec(){return PFLayout.spec({widthM:val('modWidth',1.13),heightM:val('modHeight',2.4),powerW:val('modPower',640),tiltDeg:val('installAngle',15),rowGapM:val('rowSpacing',.8),sideGapM:val('arraySideGap',.2),setbackM:val('setbackDist',.5),stackRows:val('arrayStackRows',1),orientation:val('moduleOrient','portrait'),alignment:cad().layoutDocument?.panelSpec?.alignment||'roof'});}
  function address(){return String(cad().address||cad().addr||'').trim();}
  function input(geometry){const doc=cad().layoutDocument,same=doc&&PFRoofPlan.geometryKey(doc.geometry)===PFRoofPlan.geometryKey(geometry),keepouts=same?(doc.roofPlan?.customKeepouts||doc.keepouts||[]):[];return window.PFRoofPlanner?.prepareInput(geometry,spec(),keepouts)||{geometry,panelSpec:spec(),keepouts};}
  function blocked(reason){return {type:'FeatureCollection',features:[],status:'assessment_required',reason,capacityKw:null,contractVersion:PFLayout.VERSION,engineVersion:PFLayout.ENGINE};}
  function build(geometry){const i=input(geometry);return i.blocked?blocked(i.reason):PFLayout.calculate(i,window.turf);}
  async function buildAsync(geometry){
    const serial=++calculationSerial,site=identity(),data=cad(),revision=data.layoutRevision,params=JSON.stringify(spec());worker.cancel();
    const current=()=>{if(serial!==calculationSerial||site!==identity()||data!==cad()||revision!==cad().layoutRevision||params!==JSON.stringify(spec()))throw new DOMException('현장 또는 설정 변경으로 계산 취소','AbortError');};
    await window.PFRoofPlanner?.ensure(geometry);current();const i=input(geometry);if(i.blocked){window.showToast?.(i.reason);return blocked(i.reason);}const result=await worker.calculate(i);current();if(result.status==='invalid'||result.status==='budget_exceeded')throw new Error(result.reason);if(result.reason)window.showToast?.(result.reason);return result;
  }
  function identity(){const c=cad();if(c._layoutSiteIdentity)return c._layoutSiteIdentity;const g=window.currentAnalysisFeature?.geometry||c.parcel_geojson?.geometry||c._parcelGeoJSON?.geometry;return JSON.stringify([address(),c.mode||(typeof scanTarget!=='undefined'?scanTarget:window.scanTarget),g||[c.lat,c.lng]]);}
  function ids(){const key='pf-design:'+identity();try{let d=JSON.parse(localStorage.getItem(key)||'null');if(d?.layoutId&&d?.projectId)return d;d={layoutId:crypto.randomUUID(),projectId:crypto.randomUUID()};localStorage.setItem(key,JSON.stringify(d));return d;}catch(_){return {layoutId:crypto.randomUUID(),projectId:crypto.randomUUID()};}}
  function notify(text){if(typeof showToast==='function')showToast(text);}
  function apply(doc,entry){const matches=entry.identity===identity();if(!matches)return false;if(!doc||doc.contractVersion!==PFLayout.VERSION||doc.layoutId!==entry.session.layoutId||doc.projectId!==entry.session.projectId||!Number.isInteger(doc.revision)||doc.revision<entry.session.revision||!Array.isArray(doc.panelInstances))return false;
    const p=PFLayout.spec(doc.panelSpec);if(doc.panelCount!==doc.panelInstances.length||Math.abs(doc.capacityKw-doc.panelInstances.length*p.powerW/1000)>1e-6)return false;
    entry.session.revision=doc.revision;entry.session.data=doc;lastSession=entry;
    const c=cad();c._layoutSiteIdentity=entry.identity;c.layoutDocument=structuredClone(doc);c.layoutId=doc.layoutId;c.layoutRevision=doc.revision;c.projectId=doc.projectId;
    c.address=doc.address||c.address;c.lat=doc.lat??c.lat;c.lng=doc.lng??c.lng;c.mode=doc.mode||c.mode;
    c._panelsFC={type:'FeatureCollection',features:doc.panelInstances};c.parcel_geojson={type:'Feature',properties:{},geometry:doc.geometry};
    window._roofPanelCaptureData=doc;
    window.PFRoofPlanner?.adopt(doc);
    if(typeof selectedFeatures!=='undefined'){const f=window.currentAnalysisFeature;if(f){selectedFeatures.clear();selectedFeatures.set(getFeatureId(f),{feature:f,count:doc.panelCount,panelsFC:c._panelsFC,basePanelsFC:c._panelsFC,address:address()});}}
    for(const [id,key] of Object.entries({modWidth:'widthM',modHeight:'heightM',modPower:'powerW',installAngle:'tiltDeg',rowSpacing:'rowGapM',arraySideGap:'sideGapM',setbackDist:'setbackM',arrayStackRows:'stackRows',moduleOrient:'orientation'})){const el=document.getElementById(id);if(el)el.value=p[key];}
    if(typeof _spApplyManualLayoutCapture==='function')_spApplyManualLayoutCapture(doc,true);
    if(c.finance){c.finance.layoutId=doc.layoutId;c.finance.layoutRevision=doc.revision;}
    try{if(typeof panelGroup!=='undefined'){panelGroup.clearLayers();const layer=renderPanelsFC(c._panelsFC);layer.addTo(panelGroup);const selected=typeof selectedFeatures!=='undefined'&&window.currentAnalysisFeature&&selectedFeatures.get(getFeatureId(window.currentAnalysisFeature));if(selected){selected.layer=layer;selected.analysisData={...c};}}}catch(error){console.warn('layout preview',error);}
    window.dispatchEvent(new CustomEvent('pf-layout-applied'));notify('설계 저장 및 반영: '+doc.panelCount+'장 · '+doc.capacityKw.toFixed(3)+' kW DC');return true;
  }
  function closeEditor(entry){if(editorView?.entry!==entry)return;clearTimeout(entry.readyTimer);clearTimeout(entry.closeTimer);popups.delete(entry.channel);for(const [key,controller] of roofRequests)if(key.startsWith(entry.channel+':')){controller.abort();roofRequests.delete(key);}editorView.root.remove();editorView=null;}
  async function open(){const base=window.BACKEND_URL||(typeof BACKEND_URL!=='undefined'?BACKEND_URL:'');if(!base){notify('서버 주소가 설정되지 않았습니다.');return;}
    if(editorView){editorView.root.focus();return;}
    // The editor and apply() hold one roof; opening it for a multi-roof selection would drop the others.
    const selection=typeof selectedFeatures!=='undefined'?selectedFeatures:window.selectedFeatures;if(selection?.size>1){notify('여러 지붕은 전체 조회·음영 분석에 사용합니다. 수동 배치 편집·저장은 개별 지붕을 선택해 진행하세요.');return;}
    const design=ids(),channel=crypto.randomUUID(),site=identity();
    const root=document.createElement('section');root.id='pfLayoutEditor';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','수동 배치 편집기');root.tabIndex=-1;root.style.cssText='position:fixed;inset:0;z-index:15000;background:#0f172a;display:flex;flex-direction:column';
    const bar=document.createElement('div');bar.style.cssText='display:flex;align-items:center;gap:12px;padding:10px 16px;background:#14243a;color:#e2e8f0;font:13px sans-serif';
    const title=document.createElement('strong');title.textContent='수동 배치';bar.append(title);
    const status=document.createElement('span');status.setAttribute('role','status');status.style.flex='1';status.textContent='설계 연결 중…';bar.append(status);
    const close=document.createElement('button');close.type='button';close.textContent='닫기';close.style.cssText='padding:8px 14px;background:#164e63;color:white;border:1px solid #38bdf8;border-radius:6px';bar.append(close);root.append(bar);
    const frame=document.createElement('iframe');frame.title='수동 배치 지도와 설계 도구';frame.style.cssText='flex:1;width:100%;border:0;min-height:0;pointer-events:none';root.append(frame);document.body.append(root);root.focus();
    editorView={root,frame,status,close,entry:null};
    close.onclick=()=>{const entry=editorView?.entry;if(!entry?.initialized){if(entry)closeEditor(entry);else{root.remove();editorView=null;}return;}
      // After a failed main ACK or an unanswered close request the next click closes: the server holds the save and the editor keeps a local draft.
      if(entry.closeFailed){closeEditor(entry);refresh(entry).catch(()=>notify('메인 화면이 최신 저장 설계를 반영하지 못했습니다. 상세 편집을 다시 열어 확인하세요.'));return;}
      close.disabled=true;entry.closing=true;status.textContent='저장 및 메인 반영을 확인하는 중…';clearTimeout(entry.closeTimer);entry.closeTimer=setTimeout(()=>closeStalled(entry,'편집기 응답이 지연되고 있습니다. 닫기를 다시 누르면 편집기를 닫습니다. 저장되지 않은 변경은 이 브라우저에 임시 보관됩니다.'),20000);entry.popup.postMessage({type:'PF_LAYOUT_REQUEST_CLOSE',contractVersion:PFLayout.VERSION,channel},entry.origin);};
    try{const response=await fetch(base+'/api/layout/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(design),credentials:'include',signal:AbortSignal.timeout(15000)});const session=await response.json();if(!response.ok||!session.ok)throw new Error(response.status===401?'로그인 또는 라이선스 등록 후 다시 열어주세요.':session.error||'설계 연결 실패');
      if(site!==identity())throw new Error('분석 현장이 변경되었습니다. 편집기를 닫고 다시 열어 주세요.');
      const c=cad(),p=spec(),geometry=window.currentAnalysisFeature?.geometry;
      // First opening must carry the visible boundary and panels into the editor.
      // A saved revision always takes precedence over a newly calculated preview.
      if(!session.data&&geometry&&['Polygon','MultiPolygon'].includes(geometry.type)){
        status.textContent='현재 경계와 배치를 저장하는 중…';
        lastSession={session,identity:site,base};
        session.data=await persist(geometry,c._panelsFC?.features||[],p,'main-editor-init');
        session.revision=session.data.revision;
        if(site!==identity())throw new Error('분석 현장이 변경되었습니다. 편집기를 닫고 다시 열어 주세요.');
      }
      const params=new URLSearchParams({parentOrigin:location.origin,channel,layoutId:session.layoutId,lat:c.lat??c.center?.lat??'',lng:c.lng??c.center?.lng??'',address:address(),mode:(typeof scanTarget!=='undefined'?scanTarget:window.scanTarget)==='land'?'land':'roof',mW:p.widthM,mH:p.heightM,mP:p.powerW,tilt:p.tiltDeg,rowSpacing:p.rowGapM,sideGap:p.sideGapM,setback:p.setbackM,stackRows:p.stackRows,orient:p.orientation});
      const editorUrl=new URL(window.PF_EDITOR_URL||base+'/roof-layout',location.href);params.set('backend',base);editorUrl.search=params.toString();
      if(!root.isConnected)return;
      const entry={popup:frame.contentWindow,session,identity:site,origin:editorUrl.origin,channel,base,initialized:false};editorView.entry=entry;popups.set(channel,entry);lastSession=entry;if(session.data)apply(session.data,entry);frame.src=editorUrl.href;
      status.textContent='지도와 편집 도구를 불러오는 중…';entry.readyTimer=setTimeout(()=>{if(!entry.initialized&&editorView?.entry===entry)status.textContent='지도 연결이 지연되고 있습니다. 잠시 후 닫았다가 다시 열어 주세요.';},25000);
    }catch(error){if(root.isConnected)status.textContent=error.message;notify(error.message);}
  }
  function closeStalled(entry,text){if(editorView?.entry!==entry)return;clearTimeout(entry.closeTimer);entry.closing=false;entry.closeFailed=true;editorView.close.disabled=false;editorView.status.textContent=text;}
  async function refresh(entry=lastSession){if(!entry||entry.identity!==identity())return;const response=await fetch(entry.base+'/api/layouts/'+entry.session.layoutId,{headers:{'X-Layout-Token':entry.session.ticket},signal:AbortSignal.timeout(15000)});if(response.status===404)return;if(!response.ok)throw new Error('설계 동기화 실패 ('+response.status+')');const result=await response.json();if(entry.identity===identity()&&result.ok)apply(result.data,entry);}
  window.addEventListener('message',async event=>{const d=event.data,entry=popups.get(d?.channel);if(!entry||event.origin!==entry.origin||event.source!==entry.popup||d.contractVersion!==PFLayout.VERSION)return;
    if(d.type==='PF_ROOF_ASSESS_CANCEL'){roofRequests.get(d.channel+':'+d.requestId)?.abort();return;}
    // Aborting only stops waiting (server work may finish and be cached); a toggle/close is not reported as a timeout or failure.
    if(d.type==='PF_ROOF_ASSESS_REQUEST'){const requestKey=d.channel+':'+d.requestId,controller=new AbortController();let timedOut=false;const timer=setTimeout(()=>{timedOut=true;controller.abort();},150000);roofRequests.set(requestKey,controller);try{const response=await fetch(entry.base+'/api/roof/assess',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({geometry:d.geometry,refresh:!!d.refresh}),signal:controller.signal});const result=await response.json();entry.popup.postMessage({type:'PF_ROOF_ASSESS_RESULT',contractVersion:PFLayout.VERSION,channel:d.channel,requestId:d.requestId,result},entry.origin);}catch(error){if(!controller.signal.aborted||timedOut)entry.popup.postMessage({type:'PF_ROOF_ASSESS_RESULT',contractVersion:PFLayout.VERSION,channel:d.channel,requestId:d.requestId,result:{ok:false,message:timedOut?'영상 검토 시간이 초과되었습니다. 영상 분석을 다시 눌러 주세요.':error?.name==='AbortError'?'영상 검사가 중단되었습니다. 영상 분석을 다시 눌러 주세요.':'지붕 영상 조회에 실패했습니다.'}},entry.origin);}finally{clearTimeout(timer);roofRequests.delete(requestKey);}return;}
    if(d.type==='PF_LAYOUT_READY'){entry.popup.postMessage({type:'PF_LAYOUT_INIT',contractVersion:PFLayout.VERSION,channel:d.channel,session:entry.session},entry.origin);return;}
    if(d.type==='PF_LAYOUT_INITIALIZED'){entry.initialized=true;clearTimeout(entry.readyTimer);if(editorView?.entry===entry){editorView.frame.style.pointerEvents='auto';editorView.close.textContent='저장하고 닫기';editorView.status.textContent='연결 완료 · 변경사항은 자동 저장됩니다.';}return;}
    if(d.type==='PF_LAYOUT_STATUS'){if(editorView?.entry===entry){editorView.status.textContent=String(d.text||'').slice(0,300);if(d.failed){editorView.close.disabled=false;entry.closing=false;clearTimeout(entry.closeTimer);}}return;}
    if(d.type==='PF_LAYOUT_CLOSED'){closeEditor(entry);return;}
    if(d.type!=='PF_LAYOUT_SAVED'||typeof d.messageId!=='string')return;
    // Fetch the authenticated exact revision; postMessage data is never trusted as a server ACK.
    // Every SAVED gets an ACK. reason tells the editor whether main is elsewhere (other_site: closing is safe) or failed to apply (keep the editor open and retry).
    let applied=false,reason=null;const doc=d.layout;
    if(doc?.layoutId!==entry.session.layoutId||!Number.isInteger(doc?.revision))reason='layout_mismatch';
    else try{const response=await fetch(entry.base+'/api/layouts/'+doc.layoutId+'?revision='+doc.revision,{headers:{'X-Layout-Token':entry.session.ticket},signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('저장 버전 확인 실패 ('+response.status+')');const result=await response.json();applied=apply(result.data,entry);if(applied&&d.analyze&&typeof window.fetchEightChecks==='function')window.fetchEightChecks();}catch(error){notify(error?.name==='TimeoutError'?'저장 버전 확인 시간이 초과되었습니다.':error.message);}
    if(!applied&&!reason)reason=entry.identity!==identity()?'other_site':'fetch_failed';
    if(applied)entry.closeFailed=false;else if(reason!=='other_site'&&entry.closing)closeStalled(entry,'서버 저장은 완료됐지만 메인 화면에 반영하지 못했습니다. 편집기의 저장 재시도로 다시 반영하거나 닫기를 다시 누르세요.');
    entry.popup.postMessage({type:'PF_LAYOUT_ACK',contractVersion:PFLayout.VERSION,channel:d.channel,messageId:d.messageId,applied,...(applied?{}:{reason})},entry.origin);
  });
  function prepareReport(form){function hidden(name,value){let e=form.querySelector('[name="'+name+'"]');if(!e){e=document.createElement('input');e.type='hidden';e.name=name;form.appendChild(e);}e.value=value;}
    const doc=cad().layoutDocument,financeField=form.querySelector('#form_finance');if(doc&&financeField){try{const f=JSON.parse(financeField.value||'{}');if(Number(f.dcKw??f.project_dc_kw)===doc.capacityKw&&Number(f.totalPanels)===doc.panelCount){f.layoutId=doc.layoutId;f.layoutRevision=doc.revision;financeField.value=JSON.stringify(f);}}catch(_){}}
    const key=window.PFHTTP?.credential();if(key)hidden('license_key',key);if(window.PFDevice)hidden('pf_device',window.PFDevice.secret());
    if(lastSession?.identity===identity()&&cad().layoutDocument){hidden('layoutToken',lastSession.session.ticket);hidden('layoutId',cad().layoutDocument.layoutId);hidden('layoutRevision',String(cad().layoutDocument.revision));}
  }
  async function loadSaved(){const site=identity(),base=window.BACKEND_URL||(typeof BACKEND_URL!=='undefined'?BACKEND_URL:'');try{const response=await fetch(base+'/api/layout/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ids()),signal:AbortSignal.timeout(6000)});if(!response.ok)return false;const session=await response.json();if(session.data&&site===identity())return apply(session.data,{identity:site,session,base});}catch(error){notify('저장 설계를 확인하지 못했습니다. 상세 편집을 다시 열어 확인하세요.');}return false;}
  async function persist(geometry,panels,p,source='3d-editor'){
    const site=identity(),base=window.BACKEND_URL||(typeof BACKEND_URL!=='undefined'?BACKEND_URL:'');let entry=lastSession;
    if(!entry||entry.identity!==site){const r=await fetch(base+'/api/layout/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ids()),signal:AbortSignal.timeout(15000)});const session=await r.json();if(!r.ok||!session.ok)throw new Error(session.error||'설계 연결 실패');entry={session,identity:site,base};}
    if(site!==identity())throw new Error('분석 현장이 변경되었습니다.');
    const g=geometry.type==='Feature'?geometry.geometry:geometry,parts=g.type==='MultiPolygon'?g.coordinates:[g.coordinates],c=cad();
    const prepared=input(g),roofPlan=window.PFRoofPlanner?.serialized(g)||null;
    if(roofPlan&&c.layoutDocument&&PFRoofPlan.geometryKey(c.layoutDocument.geometry)===PFRoofPlan.geometryKey(g))roofPlan.customKeepouts=structuredClone(c.layoutDocument.roofPlan?.customKeepouts||c.layoutDocument.keepouts||[]);
    if(source==='3d-editor'){prepared.panelSpec={...p,setbackM:roofPlan?0:p.setbackM};if(roofPlan)roofPlan.settings.verifiedSlopeDeg=p.tiltDeg;}
    const doc={contractVersion:PFLayout.VERSION,engineVersion:PFLayout.ENGINE,layoutId:entry.session.layoutId,projectId:entry.session.projectId,revision:entry.session.revision,geometry:g,siteReview:PFRoofPlan.geometryKey(c.layoutDocument?.geometry)===PFRoofPlan.geometryKey(g)?c.layoutDocument.siteReview:null,keepouts:prepared.keepouts||[],roofObstacleCheck:!!window.PFRoofPlanner?.enabled(g),roofPlan,panelSpec:prepared.panelSpec||p,panelInstances:panels,address:address(),mode:c.mode,lat:c.lat,lng:c.lng,roofAreaM2:turf.area(turf.feature(g)),areas:parts.map(r=>r[0].slice(0,-1).map(co=>({lng:co[0],lat:co[1]}))),provenance:{layout:PFLayout.ENGINE,source,geometry:'selected-site'},image:''};
    const r=await fetch(base+'/api/layouts',{method:'POST',headers:{'Content-Type':'application/json','X-Layout-Token':entry.session.ticket},body:JSON.stringify(doc)});const result=await r.json();
    // A stale main revision must not 409 forever: adopt the saved head once and let the user retry on top of it.
    if(r.status===409){let synced=false;try{await refresh(entry);synced=entry.session.revision>doc.revision;}catch(_){}throw new Error(synced?'다른 창에서 저장된 최신 설계를 불러왔습니다. 화면을 확인한 뒤 다시 저장하세요.':'다른 창에서 설계가 수정되었습니다. 상세 편집을 다시 열어 최신 설계를 확인하세요.');}
    if(!r.ok||!result.ok)throw new Error(result.error||'저장 실패');apply(result.data,entry);return result.data;
  }
  async function saveReview(inputs,revision){const entry=lastSession,doc=cad().layoutDocument;if(!entry||entry.identity!==identity()||!doc||doc.revision!==revision)throw new Error('설계가 변경되었습니다. 다시 확인하세요.');const r=await fetch(entry.base+'/api/layouts/'+doc.layoutId+'/site-review',{method:'POST',headers:{'Content-Type':'application/json','X-Layout-Token':entry.session.ticket},body:JSON.stringify({revision,inputs})});const result=await r.json();if(!r.ok||!result.ok)throw new Error(r.status===409?'다른 창에서 수정되었습니다. 저장 설계를 다시 여세요.':'입력값을 확인하세요: '+(result.field||result.error));if(!apply(result.data,entry))throw new Error('현장이 변경되었습니다. 원래 현장에서 저장 설계를 다시 여세요.');return result.data;}
  window.PFMainLayout={spec,input,build,buildAsync,open,refresh,prepareReport,identity,persist,saveReview,loadSaved,cancel:()=>{calculationSerial++;worker.cancel();}};
  window.openRoofLayoutTool=open;
})();
