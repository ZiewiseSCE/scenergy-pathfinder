(function(){'use strict';
  const asset=new URL('.',document.currentScript.src),worker=new PFLayoutClient(new URL('layout-worker.js',asset));
  const popups=new Map();let lastSession=null;
  function cad(){return window.currentAnalysisData||{};}
  function val(id,fallback){const e=document.getElementById(id);return e?e.value:fallback;}
  function spec(){return PFLayout.spec({widthM:val('modWidth',1.13),heightM:val('modHeight',2.4),powerW:val('modPower',640),tiltDeg:val('installAngle',15),rowGapM:val('rowSpacing',.8),sideGapM:val('arraySideGap',.2),setbackM:val('setbackDist',.5),stackRows:val('arrayStackRows',1),orientation:val('moduleOrient','portrait'),alignment:'roof'});}
  function address(){return String(cad().address||cad().addr||'').trim();}
  function input(geometry){return {geometry,panelSpec:spec(),keepouts:cad().layoutDocument?.keepouts||[]};}
  function build(geometry){return PFLayout.calculate(input(geometry),window.turf);}
  async function buildAsync(geometry){const result=await worker.calculate(input(geometry));if(result.status==='invalid'||result.status==='budget_exceeded')throw new Error(result.reason);if(result.reason)window.showToast?.(result.reason);return result;}
  function identity(){const c=cad(),g=window.currentAnalysisFeature?.geometry||c.parcel_geojson?.geometry||c._parcelGeoJSON?.geometry;return JSON.stringify([address(),c.mode||(typeof scanTarget!=='undefined'?scanTarget:window.scanTarget),g||[c.lat,c.lng]]);}
  function ids(){const key='pf-design:'+identity();try{let d=JSON.parse(localStorage.getItem(key)||'null');if(d?.layoutId&&d?.projectId)return d;d={layoutId:crypto.randomUUID(),projectId:crypto.randomUUID()};localStorage.setItem(key,JSON.stringify(d));return d;}catch(_){return {layoutId:crypto.randomUUID(),projectId:crypto.randomUUID()};}}
  function notify(text){if(typeof showToast==='function')showToast(text);}
  function apply(doc,entry){const matches=entry.identity===identity();if(!matches)return false;if(!doc||doc.contractVersion!==PFLayout.VERSION||doc.layoutId!==entry.session.layoutId||doc.projectId!==entry.session.projectId||!Number.isInteger(doc.revision)||doc.revision<entry.session.revision||!Array.isArray(doc.panelInstances))return false;
    const p=PFLayout.spec(doc.panelSpec);if(doc.panelCount!==doc.panelInstances.length||Math.abs(doc.capacityKw-doc.panelInstances.length*p.powerW/1000)>1e-6)return false;
    entry.session.revision=doc.revision;entry.session.data=doc;lastSession=entry;
    const c=cad();c.layoutDocument=structuredClone(doc);c.layoutId=doc.layoutId;c.layoutRevision=doc.revision;c.projectId=doc.projectId;
    c._panelsFC={type:'FeatureCollection',features:doc.panelInstances};c.parcel_geojson={type:'Feature',properties:{},geometry:doc.geometry};
    window._roofPanelCaptureData=doc;
    if(typeof selectedFeatures!=='undefined'){const f=window.currentAnalysisFeature;if(f){selectedFeatures.clear();selectedFeatures.set(getFeatureId(f),{feature:f,count:doc.panelCount,panelsFC:c._panelsFC,basePanelsFC:c._panelsFC,address:address()});}}
    for(const [id,key] of Object.entries({modWidth:'widthM',modHeight:'heightM',modPower:'powerW',installAngle:'tiltDeg',rowSpacing:'rowGapM',arraySideGap:'sideGapM',setbackDist:'setbackM',arrayStackRows:'stackRows',moduleOrient:'orientation'})){const el=document.getElementById(id);if(el)el.value=p[key];}
    if(typeof _spApplyManualLayoutCapture==='function')_spApplyManualLayoutCapture(doc,true);
    if(c.finance){c.finance.layoutId=doc.layoutId;c.finance.layoutRevision=doc.revision;}
    try{if(typeof panelGroup!=='undefined'){panelGroup.clearLayers();renderPanelsFC(c._panelsFC).addTo(panelGroup);}}catch(error){console.warn('layout preview',error);}
    notify('설계 저장 및 반영: '+doc.panelCount+'장 · '+doc.capacityKw.toFixed(3)+' kW DC');return true;
  }
  async function open(){const base=window.BACKEND_URL||(typeof BACKEND_URL!=='undefined'?BACKEND_URL:'');if(!base){notify('서버 주소가 설정되지 않았습니다.');return;}
    const design=ids(),channel=crypto.randomUUID(),site=identity(),popup=window.open('about:blank','roofLayout-'+design.layoutId,'width=1400,height=900');if(!popup){notify('팝업을 허용한 뒤 다시 열어주세요.');return;}
    popup.document.body.textContent='설계 연결 중…';
    try{const response=await fetch(base+'/api/layout/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(design),credentials:'include',signal:AbortSignal.timeout(15000)});const session=await response.json();if(!response.ok||!session.ok)throw new Error(response.status===401?'로그인 또는 라이선스 등록 후 다시 열어주세요.':session.error||'설계 연결 실패');
      const c=cad(),p=spec(),params=new URLSearchParams({parentOrigin:location.origin,channel,layoutId:session.layoutId,lat:c.lat??c.center?.lat??'',lng:c.lng??c.center?.lng??'',address:address(),mode:(typeof scanTarget!=='undefined'?scanTarget:window.scanTarget)==='land'?'land':'roof',mW:p.widthM,mH:p.heightM,mP:p.powerW,tilt:p.tiltDeg,rowSpacing:p.rowGapM,sideGap:p.sideGapM,setback:p.setbackM,stackRows:p.stackRows,orient:p.orientation});
      const entry={popup,session,identity:site,origin:new URL(base).origin,channel,base};popups.set(channel,entry);lastSession=entry;if(session.data)apply(session.data,entry);popup.location.href=base+'/roof-layout?'+params;
      const timer=setInterval(()=>{if(popup.closed){clearInterval(timer);popups.delete(channel);if(entry.identity===identity())refresh(entry).catch(error=>notify(error.message));}},1500);
    }catch(error){popup.document.body.textContent=error.message;notify(error.message);}
  }
  async function refresh(entry=lastSession){if(!entry||entry.identity!==identity())return;const response=await fetch(entry.base+'/api/layouts/'+entry.session.layoutId,{headers:{'X-Layout-Token':entry.session.ticket}});if(response.status===404)return;if(!response.ok)throw new Error('설계 동기화 실패 ('+response.status+')');const result=await response.json();if(entry.identity===identity()&&result.ok)apply(result.data,entry);}
  window.addEventListener('message',async event=>{const d=event.data,entry=popups.get(d?.channel);if(!entry||event.origin!==entry.origin||event.source!==entry.popup||d.contractVersion!==PFLayout.VERSION)return;
    if(d.type==='PF_LAYOUT_READY'){entry.popup.postMessage({type:'PF_LAYOUT_INIT',contractVersion:PFLayout.VERSION,channel:d.channel,session:entry.session},entry.origin);return;}
    if(d.type!=='PF_LAYOUT_SAVED'||typeof d.messageId!=='string')return;
    // Fetch the authenticated exact revision; postMessage data is never trusted as a server ACK.
    let applied=false;try{const doc=d.layout;if(doc?.layoutId!==entry.session.layoutId||!Number.isInteger(doc.revision))return;const response=await fetch(entry.base+'/api/layouts/'+doc.layoutId+'?revision='+doc.revision,{headers:{'X-Layout-Token':entry.session.ticket}});if(!response.ok)throw new Error('저장 버전 확인 실패');const result=await response.json();applied=apply(result.data,entry);if(applied&&d.analyze&&typeof window.fetchEightChecks==='function')window.fetchEightChecks();}catch(error){notify(error.message);}
    entry.popup.postMessage({type:'PF_LAYOUT_ACK',contractVersion:PFLayout.VERSION,channel:d.channel,messageId:d.messageId,applied},entry.origin);
  });
  function prepareReport(form){function hidden(name,value){let e=form.querySelector('[name="'+name+'"]');if(!e){e=document.createElement('input');e.type='hidden';e.name=name;form.appendChild(e);}e.value=value;}
    const doc=cad().layoutDocument,financeField=form.querySelector('#form_finance');if(doc&&financeField){try{const f=JSON.parse(financeField.value||'{}');if(Number(f.dcKw??f.project_dc_kw)===doc.capacityKw&&Number(f.totalPanels)===doc.panelCount){f.layoutId=doc.layoutId;f.layoutRevision=doc.revision;financeField.value=JSON.stringify(f);}}catch(_){}}
    const key=window.PFHTTP?.credential();if(key)hidden('license_key',key);
    if(lastSession?.identity===identity()&&cad().layoutDocument){hidden('layoutToken',lastSession.session.ticket);hidden('layoutId',cad().layoutDocument.layoutId);hidden('layoutRevision',String(cad().layoutDocument.revision));}
  }
  async function loadSaved(){const site=identity(),base=window.BACKEND_URL||(typeof BACKEND_URL!=='undefined'?BACKEND_URL:'');try{const response=await fetch(base+'/api/layout/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ids()),signal:AbortSignal.timeout(6000)});if(!response.ok)return false;const session=await response.json();if(session.data&&site===identity())return apply(session.data,{identity:site,session,base});}catch(error){notify('저장 설계를 확인하지 못했습니다. 상세 편집을 다시 열어 확인하세요.');}return false;}
  async function persist(geometry,panels,p){
    const site=identity(),base=window.BACKEND_URL||(typeof BACKEND_URL!=='undefined'?BACKEND_URL:'');let entry=lastSession;
    if(!entry||entry.identity!==site){const r=await fetch(base+'/api/layout/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ids())});const session=await r.json();if(!r.ok||!session.ok)throw new Error(session.error||'설계 연결 실패');entry={session,identity:site,base};}
    if(site!==identity())throw new Error('분석 현장이 변경되었습니다.');
    const g=geometry.type==='Feature'?geometry.geometry:geometry,parts=g.type==='MultiPolygon'?g.coordinates:[g.coordinates],c=cad();
    const doc={contractVersion:PFLayout.VERSION,engineVersion:PFLayout.ENGINE,layoutId:entry.session.layoutId,projectId:entry.session.projectId,revision:entry.session.revision,geometry:g,keepouts:cad().layoutDocument?.keepouts||[],panelSpec:p,panelInstances:panels,address:address(),mode:c.mode,lat:c.lat,lng:c.lng,roofAreaM2:turf.area(turf.feature(g)),areas:parts.map(r=>r[0].slice(0,-1).map(co=>({lng:co[0],lat:co[1]}))),provenance:{layout:PFLayout.ENGINE,source:'3d-editor',geometry:'selected-site'},image:''};
    const r=await fetch(base+'/api/layouts',{method:'POST',headers:{'Content-Type':'application/json','X-Layout-Token':entry.session.ticket},body:JSON.stringify(doc)});const result=await r.json();if(!r.ok||!result.ok)throw new Error(result.error||'저장 실패');apply(result.data,entry);return result.data;
  }
  window.PFMainLayout={spec,build,buildAsync,open,refresh,prepareReport,identity,persist,loadSaved,cancel:()=>worker.cancel()};
  window.openRoofLayoutTool=open;
})();
