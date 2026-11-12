/* Editor contract, undo/redo, Worker calculation and acknowledged cross-origin sync. */
(function(){'use strict';
  const editSession=crypto.randomUUID();
  const openerWindow=window.opener||(window.parent!==window?window.parent:null);
  const q=new URLSearchParams(location.search),channel=q.get('channel')||'',parentOrigin=q.get('parentOrigin')||'';
  const allowed=(PF_CONFIG.parentOrigins||['https://pathfinder.scenergy.co.kr','https://scenergy.github.io']);
  const validParent=allowed.includes(parentOrigin)||parentOrigin===location.origin;
  let session=null,saving=false,pending=false,image='',version=0,history=[],historyIndex=-1,restoring=false,saveTimer=null,searchSerial=0,needsLayout=false,initialized=false,retainedGeometry=null,keepouts=[],drawKeepout=false,analyzePending=false,lastMessageId=null,closeRequested=false,initializing=false,unacked=null;
  // legacyGaps: explicit gaps of a document saved before 이격 여유율; zoneTool/stroke: the exclusion-zone tool in use.
  let legacyGaps=null,zoneTool=null,zoneStarting=false,stroke=null,canvas=null,drawRaf=null,measurementsClosed=true,dimensionKey='';
  const client=new PFLayoutClient(new URL('layout-worker.js',document.currentScript.src).href);
  const apiBase=PF_CONFIG.apiBase||BK||'';
  // The backend serves the template a few minutes after the scripts are published. A template without the margin
  // input is the previous release: its server still rejects an edge margin or walkway of 0 in a roof plan.
  const oldTemplate=!$('pfMarginPct');
  const layoutMode=()=>curMo==='land'?'land':'roof';
  function notify(text){state(text);T(text,5000);}
  let roofObstacleCheck=false,roofReviewSerial=0,roofPlan=null,roofCacheKey='',roofCache=null,roofHeightTimer=null;const roofRequests=new Map();
  function roofPrepared(){if(!roofObstacleCheck)return null;if(!PFRoofPlan.matchesGeometry(roofPlan,geo()))return null;const k=JSON.stringify([geo(),roofPlan]);if(k!==roofCacheKey){roofCache=PFRoofPlan.prepare(geo(),roofPlan.assessment,roofPlan.settings,turf);roofCacheKey=k;}return roofCache;}
  function allKeepouts(){return [...(roofPrepared()?.keepouts||[]),...keepouts];}
  const status=document.createElement('div');status.id='pfSaveStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.style.cssText='padding:8px;color:#bae6fd;font-size:12px';document.querySelector('.sd').appendChild(status);
  const actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;flex-wrap:wrap';actions.innerHTML='<button class="bt bs" id="pfUndo">되돌리기</button><button class="bt bs" id="pfRedo">다시 실행</button><button class="bt bs" id="pfSave">저장 재시도</button><button class="bt bd2" id="pfCancel">계산 취소</button>';
  document.querySelector('.sd').prepend(actions);
  const roofBox=document.createElement('section');roofBox.id='pfEditorRoofReview';roofBox.style.cssText='padding:10px;margin:8px 0;border:1px solid #4a7a89;border-radius:8px;font-size:12px;color:#d5f0f7';roofBox.innerHTML='<strong>지붕 모양 기준 배치</strong><label style="display:flex;align-items:center;gap:8px;margin:10px 0"><input type="checkbox" data-roof-enabled>영상 장애물 검사 사용 (선택)</label><p data-roof-message></p><button type="button" class="bt bs" data-roof-review>영상 분석·다시 배치</button><button type="button" class="bt bs" data-roof-manual>직접 검토한 영역 사용</button><details><summary>감지 후보 · 높이 보정</summary><div data-roof-objects style="max-height:200px;overflow:auto"></div></details><p>채광창·설비·단차는 설치 제외 영역으로 직접 그려 뺄 수 있습니다. 입력한 높이는 기준 태양고도에서 사방 그림자 여유로 반영합니다.</p>';actions.after(roofBox);
  // New roof plans carry edgeM 0 / walkwayM 0, which only the new server accepts.
  function roofScanBlocked(){if(!oldTemplate||roofPlan)return false;notify('서버 업데이트가 끝난 뒤 영상 장애물 검사를 새로 시작할 수 있습니다. 잠시 후 편집기를 다시 열어 주세요.');return true;}
  async function reviewRoof(){if(curMo!=='roof')return true;const g=geo();if(!g){T('영역을 먼저 완성하세요.');return false;}if(!initialized||!validParent){state('메인 화면에서 편집기를 연결한 뒤 영상 검토를 사용하세요.');return false;}if(roofScanBlocked())return false;const serial=++roofReviewSerial,geometryKey=PFRoofPlan.geometryKey(g),requestId=crypto.randomUUID();state('위성영상 검토 중…');roofBox.querySelector('[data-roof-review]').disabled=true;
    try{const result=await new Promise(resolve=>{const timer=setTimeout(()=>{roofRequests.delete(requestId);resolve({ok:false,message:'영상 조회 시간 초과'});},150000);roofRequests.set(requestId,r=>{clearTimeout(timer);resolve(r);});post('PF_ROOF_ASSESS_REQUEST',{requestId,geometry:g,refresh:false});});
      if(serial!==roofReviewSerial||!roofObstacleCheck)return false;if(geometryKey!==PFRoofPlan.geometryKey(geo())){state('검토 중 영역이 바뀌었습니다. 다시 검토하세요.');return false;}if(!result.ok||result.status!=='review_required'){state(result.message||'영상 검토가 불가능합니다. 직접 영역을 검토해 주세요.');return false;}
      const {preview,...assessment}=result;roofPlan={version:PFRoofPlan.VERSION,geometryKey,assessment,settings:PFRoofPlan.settings(roofPlan?.settings),customKeepouts:keepouts,reviewedAt:null};$('tD').value=roofPlan.settings.verifiedSlopeDeg;needsLayout=true;renderRoofReview();return true;
    }finally{if(serial===roofReviewSerial)roofBox.querySelector('[data-roof-review]').disabled=false;}}
  function renderRoofReview(){roofBox.hidden=curMo!=='roof';roofBox.querySelector('[data-roof-enabled]').checked=roofObstacleCheck;for(const node of roofBox.querySelectorAll('details,[data-roof-review],[data-roof-manual]'))node.hidden=!roofObstacleCheck;const p=roofPrepared();roofBox.querySelector('[data-roof-message]').textContent=p?`${Math.round(p.usableAreaM2||0)}㎡ · ${p.zones.length}개 배치 구역 · 연속 모듈 묶음 · 영상 후보는 현장 추가 상세 확인 권장`:(roofObstacleCheck?'영상 검토 대기 · 기존 배치를 유지합니다.':'기본 배치 · 지붕 모양에 맞춰 바로 배치합니다. 영상 장애물 미검사.');const list=roofBox.querySelector('[data-roof-objects]');list.replaceChildren();
    for(const item of roofPlan?.assessment.obstacles||[]){const row=document.createElement('label');row.style.cssText='display:flex;align-items:center;gap:6px;margin:6px 0';const check=document.createElement('input'),name=document.createElement('span'),height=document.createElement('input');check.type='checkbox';check.checked=item.enabled!==false;name.textContent=item.id.replace('roof-object-','#')+' '+(item.kind==='bright_fixture'?'밝은 설비 후보':'설비·그림자 후보');name.style.flex='1';height.type='number';height.min=0;height.max=30;height.step=.1;height.placeholder='높이 m';height.value=item.heightM??'';height.style.cssText='width:62px;background:#fff;color:#123';height.setAttribute('aria-label',name.textContent+' 높이(m)');row.append(check,name,height);list.append(row);const update=()=>{clearTimeout(roofHeightTimer);item.enabled=check.checked;item.heightM=height.value===''?null:Number(height.value);roofPlan.reviewedAt=null;needsLayout=true;autoLay();};check.onchange=update;height.onchange=update;height.oninput=()=>{item.heightM=height.value===''?null:Number(height.value);roofPlan.reviewedAt=null;needsLayout=true;clearTimeout(roofHeightTimer);roofHeightTimer=setTimeout(update,500);};}
  }
  function cancelRoofReview(){roofReviewSerial++;for(const [requestId,resolve] of roofRequests){post('PF_ROOF_ASSESS_CANCEL',{requestId});resolve({ok:false,message:'검사 취소'});}roofRequests.clear();roofBox.querySelector('[data-roof-review]').disabled=false;}
  roofBox.querySelector('[data-roof-enabled]').onchange=async e=>{cancelRoofReview();roofObstacleCheck=e.target.checked;needsLayout=true;version++;client.cancel();renderRoofReview();await autoLay();};
  roofBox.querySelector('[data-roof-review]').onclick=async()=>{if(await reviewRoof())await autoLay();};
  roofBox.querySelector('[data-roof-manual]').onclick=()=>{const g=geo();if(!g){T('설치 가능한 영역을 먼저 직접 그리세요.');return;}if(roofScanBlocked())return;roofPlan={version:PFRoofPlan.VERSION,geometryKey:PFRoofPlan.geometryKey(g),assessment:{status:'review_required',source:'user-reviewed',obstacles:[]},settings:PFRoofPlan.settings(),customKeepouts:keepouts,reviewedAt:new Date().toISOString()};needsLayout=true;renderRoofReview();autoLay();};
  function post(type,extra={}){if(openerWindow&&validParent)openerWindow.postMessage({type,contractVersion:PFLayout.VERSION,channel,...extra},parentOrigin);}
  function state(text,failed=text.startsWith('저장 실패')||text.includes('갱신한 뒤')){status.textContent=text;post('PF_LAYOUT_STATUS',{text,failed});}
  // One percentage (이격 여유율) sets the gaps: PFLayout.withMargin derives them and fills to the boundary (setback 0).
  // A document saved before the percentage keeps its explicit gaps until a layout parameter changes (useMarginRule).
  function inputSpec(){
    const over=roofPrepared()?.panelOverrides,base={widthM:$('mW').value,heightM:$('mH').value,powerW:$('mP').value,tiltDeg:$('tD').value,stackRows:$('pfRows').value,orientation:$('ori').value,alignment:$('layMode').value,...over};
    return legacyGaps?{...PFLayout.spec({...base,...legacyGaps}),...over}:PFLayout.withMargin({...base,marginPct:$('pfMarginPct').value},layoutMode());
  }
  const MARGIN_HELP='설치 면적 중 점검 통로로 남기는 비율입니다. 기본 10%. 모듈은 어레이로 붙여 놓고 어레이 사이에 통로(약 0.6~1m)를 둡니다. 경사 설치는 겨울 그림자 간격을 따로 둡니다.';
  const settings=document.createElement('div');settings.innerHTML='<label class="lb" for="pfRows">단수</label><input class="ip" id="pfRows" type="number" min="1" max="30" step="1">';$('ori').parentElement.appendChild(settings);
  // URL value, else the mode default (roof: 2 rows, land: 3 rows). rowSpacing / sideGap / setback are no longer read.
  $('pfRows').value=q.get('stackRows')??(q.get('mode')==='land'?'3':'2');
  if(oldTemplate){
    // Previous template: add the margin input here and hide its distance inputs, which no longer feed the layout.
    const box=document.createElement('div');box.innerHTML='<label class="lb" for="pfMarginPct">이격 여유율(%)</label><input class="ip" id="pfMarginPct" type="number" min="0" max="40" step="1" value="10"><div id="pfMarginHelp" style="font-size:11px;line-height:1.5;margin-top:4px;color:var(--dm)"></div>';settings.appendChild(box);
    for(const id of ['rG','sB']){const e=$(id);if(e?.parentElement)e.parentElement.hidden=true;}
  }
  {const raw=q.get('margin'),n=raw===null||raw.trim()===''?NaN:Number(raw);$('pfMarginPct').value=n>=0&&n<=PFLayout.MARGIN_MAX?n:PFLayout.MARGIN_DEFAULT;}
  function marginNote(){
    const note=$('pfMarginHelp');if(!note)return;
    if(legacyGaps){note.textContent='이전에 저장한 설계의 간격(앞뒤 '+legacyGaps.rowGapM+' m · 옆 '+legacyGaps.sideGapM+' m · 경계 '+legacyGaps.setbackM+' m)을 그대로 쓰고 있습니다. 모듈·배치 설정을 바꾸면 이격 여유율로 다시 배치합니다.';return;}
    let gap='';try{gap=' 현재 '+PFLayout.gapText(inputSpec())+'.';}catch(_){/* the input error is reported where the layout is used */}
    note.textContent=MARGIN_HELP+gap;
  }
  // Switch a pre-percentage document to the margin rule: derived gaps, and no saved edge margin or walkway blocks.
  function useMarginRule(){
    if(!legacyGaps)return;legacyGaps=null;
    if(roofPlan&&!oldTemplate&&(roofPlan.settings.edgeM>0||roofPlan.settings.walkwayM>0)){roofPlan.settings.edgeM=0;roofPlan.settings.walkwayM=0;}
  }
  window.gP=function(){const p=inputSpec();return {mW:p.orientation==='landscape'?p.heightM:p.widthM,mH:p.orientation==='landscape'?p.widthM:p.heightM,mP:p.powerW,ti:p.tiltDeg,layMode:p.alignment};};
  function geo(){const saved=retainedGeometry?(retainedGeometry.type==='MultiPolygon'?retainedGeometry.coordinates:[retainedGeometry.coordinates]):[];const parts=layoutAreas().map(ap=>{const co=ap.map(p=>[p.lng,p.lat]);co.push(co[0]);return saved.find(r=>JSON.stringify(r[0])===JSON.stringify(co))||[co];});if(!parts.length)return null;return parts.length===1&&retainedGeometry?.type!=='MultiPolygon'?{type:'Polygon',coordinates:parts[0]}:{type:'MultiPolygon',coordinates:parts};}
  function panel(m){const co=(m.poly||[{lng:m.w,lat:m.s},{lng:m.e,lat:m.s},{lng:m.e,lat:m.n},{lng:m.w,lat:m.n}]).map(p=>[p.lng,p.lat]);co.push(co[0]);const dx=(co[1][0]-co[0][0])*111320*Math.cos(co[0][1]*Math.PI/180),dy=(co[1][1]-co[0][1])*111000;return {type:'Feature',properties:{...m.properties,azimuthDeg:m.properties?.azimuthDeg??((180-Math.atan2(dy,dx)*180/Math.PI)%360+360)%360},geometry:{type:'Polygon',coordinates:[co]}};}
  const originalStats=window.uSt;window.uSt=function(){const p=inputSpec(),direction=PFOrientation.summarize(mods.map(panel),{latitude:cLa,tiltDeg:p.tiltDeg,powerW:p.powerW});lastLayoutMeta={azimuthAngle:direction.groupCount===1?direction.groups[0].azimuthDeg:null,efficiencyPct:Math.round(direction.factor*1000)/10,orientation:direction,layoutMode:p.alignment};originalStats();if(direction.groupCount>1)$('azInfo').textContent='혼합 방향 '+direction.groupCount+'개 · 남향 대비 평균 '+direction.meanDeviationDeg.toFixed(1)+'° · 발전 비율(추정) '+lastLayoutMeta.efficiencyPct+'%';};
  function snapshot(){return {needsLayout,roofObstacleCheck,roofPlan:structuredClone(roofPlan),geometry:geo(),keepouts:structuredClone(keepouts),areas:structuredClone(areas),pts:structuredClone(pts),mods:structuredClone(mods),meta:{...lastLayoutMeta},params:inputSpec(),address:cAd,lat:cLa,lng:cLo,mode:curMo};}
  function restore(s){clearTimeout(roofHeightTimer);restoring=true;needsLayout=!!s.needsLayout;try{stopZone();cancelRoofReview();roofObstacleCheck=s.roofObstacleCheck??!!s.roofPlan;roofPlan=structuredClone(s.roofPlan||null);retainedGeometry=s.geometry||null;
    // A zone that fails the engine's keepout check (a draft written before zones were validated) would block every layout and save.
    keepouts=structuredClone(s.keepouts||[]).filter(k=>PFLayout.validZone(k,turf));
    if(keepouts.length<(s.keepouts||[]).length)T('모양이 올바르지 않은 설치 제외 영역 '+((s.keepouts||[]).length-keepouts.length)+'곳을 뺐습니다. 필요하면 다시 그려 주세요.',6000);
    areas=structuredClone(s.areas);pts=structuredClone(s.pts||[]);mods=structuredClone(s.mods);lastLayoutMeta=s.meta||lastLayoutMeta;cAd=s.address;cLa=s.lat;cLo=s.lng;curMo=s.mode||curMo;
    const p=s.params||{};for(const [id,key] of Object.entries({mW:'widthM',mH:'heightM',mP:'powerW',tD:'tiltDeg',pfRows:'stackRows',ori:'orientation',layMode:'alignment'})){const e=$(id);if(e&&p[key]!==undefined&&p[key]!==null)e.value=p[key];}
    // Show the saved percentage; a document without one keeps its own gaps (see inputSpec).
    if(p.marginPct!==undefined&&p.marginPct!==null){legacyGaps=null;$('pfMarginPct').value=p.marginPct;}
    else legacyGaps=['rowGapM','sideGapM','setbackM'].every(k=>p[k]!==undefined&&p[k]!==null&&p[k]!==''&&Number.isFinite(Number(p[k])))?{rowGapM:p.rowGapM,sideGapM:p.sideGapM,setbackM:p.setbackM}:null;
    if(roofObstacleCheck&&roofPlan)$('tD').value=roofPlan.settings.verifiedSlopeDeg;
    areaPolys.forEach(o=>o.setMap(null));areaPolys=[];if(km){areas.forEach(ap=>{const polygon=new kakao.maps.Polygon({path:ap.map(p=>new kakao.maps.LatLng(p.lat,p.lng)),strokeWeight:2,strokeColor:'#2dd4bf',fillColor:'#06d6a0',fillOpacity:.08});polygon.setMap(km);areaPolys.push(polygon);});fPoly=areaPolys[0]||null;const g=geo();rA=g?turf.area(turf.feature(g)):0;renMods();showMeas(true);uSt();ec(4,areas.length>0);ec(5,true);sn(2,areas.length>0);}
  }finally{restoring=false;renderRoofReview();modeHeader();marginNote();renderZones();}}
  function checkpoint(){if(restoring||!initialized)return;try{const value=snapshot(),encoded=JSON.stringify(value);if(historyIndex>=0&&history[historyIndex]===encoded)return;history=history.slice(0,historyIndex+1);history.push(encoded);while(history.length>50||(history.length>2&&history.reduce((n,s)=>n+s.length,0)>8000000))history.shift();historyIndex=history.length-1;version++;image='';client.cancel();try{localStorage.setItem('pf-layout-draft:'+q.get('layoutId'),JSON.stringify({draftSchema:1,baseRevision:session?.revision??0,editSession,state:value}));}catch(_){/* Server saving still works when local storage is full/disabled. */}clearTimeout(saveTimer);saveTimer=setTimeout(()=>save(),800);state('변경됨 · 자동 저장 대기');}catch(error){state(error.message);}}
  function documentValue(){return {contractVersion:PFLayout.VERSION,engineVersion:PFLayout.ENGINE,projectId:session.projectId,layoutId:session.layoutId,revision:session.revision,siteReview:session.data?.siteReview||null,geometry:geo()||{type:'MultiPolygon',coordinates:[]},keepouts:allKeepouts(),roofObstacleCheck,roofPlan:roofObstacleCheck&&roofPlan?{...PFRoofPlan.serializable(roofPlan),customKeepouts:structuredClone(keepouts)}:null,panelSpec:inputSpec(),panelInstances:mods.map(panel),address:cAd,mode:curMo,lat:cLa,lng:cLo,roofAreaM2:rA,areas,polyPoints:areas,image,azimuthAngle:lastLayoutMeta.azimuthAngle,efficiencyPct:lastLayoutMeta.efficiencyPct,azimuthEfficiency:lastLayoutMeta.efficiencyPct,layoutMode:lastLayoutMeta.layoutMode,provenance:{geometry:'user-drawn',layout:'strict-layout-1',orientationLoss:PFOrientation.MODEL,savedAt:new Date().toISOString()}};}
  const SAVE_FIELDS={panel_outside_boundary_or_setback:'패널이 설치 경계 또는 설치 제외 영역에 걸려 있습니다. 자동 배치를 다시 실행하세요.',overlapping_panels:'겹치는 패널이 있습니다. 자동 배치를 다시 실행하세요.',invalid_keepout:'설치 제외 영역 모양이 올바르지 않습니다. 해당 영역을 삭제하고 다시 그려 주세요.',keepouts:'설치 제외 영역은 최대 100곳입니다.',marginPct:'이격 여유율은 0 ~ 40% 범위로 입력하세요.',edgeM:'서버 업데이트 중입니다. 잠시 후 다시 저장하세요.',walkwayM:'서버 업데이트 중입니다. 잠시 후 다시 저장하세요.',invalid_boundary:'설치 경계가 올바르지 않습니다. 경계를 다시 그려 주세요.',roof_review_required:'지붕 영상 검토를 먼저 완료하세요.'};
  function postLayout(body){return fetch(apiBase+'/api/layouts',{method:'POST',headers:{'Content-Type':'application/json','X-Layout-Token':session.ticket},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}
  // A timed-out POST may still commit. On 409 adopt the head only when this editor wrote it (same editSession prefix).
  async function ownHead(){const response=await fetch(apiBase+'/api/layouts/'+session.layoutId,{headers:{'X-Layout-Token':session.ticket},signal:AbortSignal.timeout(15000)});const result=await response.json().catch(()=>({})),doc=result.data;return response.ok&&result.ok&&Number.isInteger(doc?.revision)&&doc.revision>session.revision&&String(doc.clientMutationId||'').startsWith(editSession+'-')?doc:null;}
  function notifyMain(layout,analyze){const messageId=crypto.randomUUID();lastMessageId=messageId;unacked={layout,analyze,version};openerWindow.postMessage({type:'PF_LAYOUT_SAVED',contractVersion:PFLayout.VERSION,channel,messageId,layout,analyze},parentOrigin);setTimeout(()=>{if(lastMessageId===messageId&&status.textContent.includes('수신 확인 중'))state('서버 저장 완료 · 메인 수신 확인이 없습니다. 저장 재시도를 누르거나 메인에서 같은 설계를 다시 여세요.');},6000);}
  // Retry after a failed main ACK re-sends the saved revision instead of writing a new one.
  function saveOrNotify(){if(unacked&&unacked.version===version&&session&&!saving&&!pending&&!needsLayout&&openerWindow&&validParent){state('서버 저장 완료 · 버전 '+session.revision+' · 메인 수신 확인 중');notifyMain(unacked.layout,unacked.analyze);return;}save();}
  async function save(analyze=false){
    if(needsLayout){closeRequested=false;state('설정이 변경되었습니다. 자동 배치로 위치를 갱신한 뒤 저장하세요.');return null;}
    if(!session){closeRequested=false;state('메인 화면 연결 대기 · 변경은 이 브라우저에 임시 보관됩니다.');return null;}
    analyzePending=analyzePending||analyze;
    if(saving){pending=true;return null;}analyze=analyzePending;analyzePending=false;saving=true;pending=false;const savedVersion=version;
    try{state('저장 중…');const body=documentValue();body.clientMutationId=editSession+'-'+savedVersion;let response=await postLayout(body),result=await response.json().catch(()=>({}));
      if(response.status===409){const head=await ownHead();if(head?.clientMutationId===body.clientMutationId){response={ok:true};result={ok:true,data:head,revision:head.revision};}else if(head){session.revision=head.revision;session.data=head;body.revision=head.revision;body.siteReview=head.siteReview||null;response=await postLayout(body);result=await response.json().catch(()=>({}));}}
      if(!response.ok||!result.ok)throw new Error(response.status===409?'다른 창에서 수정되었습니다. 메인에서 설계를 다시 여세요.':result.message||(result.error==='invalid_layout'?'배치 자료 확인 실패: '+(SAVE_FIELDS[result.field]||result.field||'형식'):result.error)||'저장 실패');session.revision=result.revision;session.data=result.data;
      if(savedVersion!==version){analyzePending=analyzePending||analyze;pending=true;return result.data;}
      uSt();
      try{localStorage.removeItem('pf-layout-draft:'+session.layoutId);}catch(_){}state('서버 저장 완료 · 버전 '+session.revision+' · 메인 수신 확인 중');
      if(openerWindow&&validParent)notifyMain(result.data,analyze);else state('서버 저장 완료 · 버전 '+session.revision);
      return result.data;
    }catch(error){closeRequested=false;const message=error?.name==='TimeoutError'?'서버 응답 시간이 초과되었습니다. 저장 재시도를 누르면 같은 변경의 저장 여부를 확인합니다.':error.message;state('저장 실패: '+message);T(message,5000);return null;}finally{saving=false;if(pending){pending=false;queueMicrotask(()=>save());}}
  }
  window.syncOp=function(){if(!restoring)checkpoint();};
  // Returns 'ok', 'failed' (nothing changed; the reason is shown) or 'superseded' (a newer edit owns the result).
  window.autoLay=async function(){const g=geo();if(!g){T('먼저 영역을 완성하세요.');return 'failed';}if(curMo==='roof'&&roofObstacleCheck&&(!roofPrepared()||roofPrepared().status==='assessment_required')){if(!await reviewRoof())return 'failed';}
    try{const spec=inputSpec(),expected=version;state('배치 계산 중…');const result=await client.calculate({geometry:g,arrayPacking:roofObstacleCheck?"rectangular":undefined,panelSpec:spec,keepouts:allKeepouts()},p=>state('배치 계산 중 · '+p.tested.toLocaleString()+'개 위치 확인'));if(expected!==version)return 'superseded';
      // A size limit is not "nothing fits": keep the current panels and say what to do.
      if(result.status==='invalid'||result.status==='budget_exceeded'){state(result.reason);T(result.reason,7000);return 'failed';}
      needsLayout=false;mods=result.features.map(modFromPoly);const direction=PFOrientation.summarize(result.features,{latitude:cLa,tiltDeg:spec.tiltDeg,powerW:spec.powerW});lastLayoutMeta={azimuthAngle:direction.groups.length===1?direction.groups[0].azimuthDeg:null,efficiencyPct:Math.round(direction.factor*1000)/10,orientation:direction,layoutMode:spec.alignment};renMods();uSt();sn(4,true);ec(5,true);checkpoint();renderRoofReview();renderZones();marginNote();T(result.reason||mods.length+'장 배치 완료',result.reason?6000:undefined);return 'ok';
    }catch(error){if(error.name==='AbortError')return 'superseded';state(error.message);T(error.message,4000);return 'failed';}};
  // A manual module is aligned like the automatic fill of the area it is placed in (roof line or south), not always north-up.
  window.plcMn=function(ll){try{const g=geo();if(!g){T('먼저 영역을 완성하세요.');return;}const spec=inputSpec(),feature=PFLayout.panelAt(g,spec,[ll.getLng(),ll.getLat()],turf);if(!PFLayout.canPlace(g,spec,feature,mods.map(panel),turf,allKeepouts())){T('경계·설치 제외 영역 또는 기존 패널과 겹칩니다.');return;}mods.push(modFromPoly(feature));renMods();uSt();ec(5,true);checkpoint();}catch(error){T(error.message);}};
  // Existing drawing controls remain intact; complete operations are undoable.
  for(const name of ['clrAll','clrMod']){const original=window[name];window[name]=function(...args){if(name==='clrAll'){stopZone();clearTimeout(roofHeightTimer);cancelRoofReview();roofObstacleCheck=false;roofPlan=null;retainedGeometry=null;keepouts=[];drawKeepout=false;legacyGaps=null;}const out=original.apply(this,args);if(name!=='finPoly'){needsLayout=false;renMods();}renderRoofReview();if(name==='clrAll'){renderZones();marginNote();}checkpoint();return out;};}
  // ---- 설치 제외(제척) 영역: click polygon, free-hand area, free-hand path ------------------------------------
  // Built here (not in the template) so the previous template gets the same tools during a deploy window.
  const ZONE_TOOLS={polygon:'다각형',area:'자유곡선 영역',path:'자유곡선 경로'};
  const zoneCard=document.createElement('div');zoneCard.className='cd';zoneCard.id='pfZoneCard';
  zoneCard.innerHTML='<h3>설치 제외(제척) 영역</h3><p class="pf-zone-text">패널을 놓지 않을 곳을 표시하면 나머지를 경계까지 채워 다시 배치합니다.</p>'
    +'<div class="pf-zone-tools" role="group" aria-label="설치 제외 영역 그리기 도구">'+Object.entries(ZONE_TOOLS).map(([kind,label])=>'<button type="button" class="bt bs" data-zone-tool="'+kind+'" aria-pressed="false">'+label+'</button>').join('')+'</div>'
    +'<div class="pf-zone-width"><label class="lb" for="pfZoneWidth">경로 폭(m)</label><input class="ip" id="pfZoneWidth" type="number" min="0.3" max="5" step="0.1" value="1.0"></div>'
    +'<p class="pf-zone-text pf-zone-status" data-zone-status role="status" aria-live="polite"></p><button type="button" class="bt bd2 pf-zone-wide" data-zone-stop hidden>⏹ 그리기 중지</button>'
    +'<p class="pf-zone-text" data-zone-summary></p><ol class="pf-zone-list" data-zone-list></ol><button type="button" class="bt bd2 pf-zone-wide" data-zone-clear hidden>모두 삭제</button>';
  const zoneStyle=document.createElement('style');zoneStyle.textContent='#pfZoneCard [hidden]{display:none!important}.pf-zone-tools{display:flex;gap:6px;flex-wrap:wrap}.pf-zone-tools .bt{flex:1 1 auto}.pf-zone-width{margin-top:8px}.pf-zone-text{font-size:12px;line-height:1.5;margin:6px 0;color:var(--dm)}.pf-zone-status{color:var(--ac);font-weight:600}.pf-zone-status:empty{display:none}.pf-zone-wide{width:100%;margin-top:6px}.pf-zone-list{list-style:none;margin:0;padding:0;max-height:240px;overflow:auto}.pf-zone-list li{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--bd);font-size:12px;font-variant-numeric:tabular-nums}.pf-zone-list li span{flex:1}.pf-zone-no{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:11px;border:1.5px solid #dc2626;color:#b91c1c;background:#fff;font-size:11px;font-weight:700}';
  (document.head||document.documentElement)?.appendChild(zoneStyle);
  {const areaCard=$('s2')?.closest?.('.cd');if(areaCard?.after)areaCard.after(zoneCard);else document.querySelector('.sd').appendChild(zoneCard);}
  const zoneMeta=new WeakMap();
  // Area inside the install boundary (what the report counts) and a label point that lies on the zone.
  function zoneInfo(zone){
    const key=areas.length+':'+rA;let info=zoneMeta.get(zone);if(info?.key===key)return info;
    const feature=turf.feature(zone);let areaM2=0,label=(zone.type==='Polygon'?zone.coordinates:zone.coordinates[0])[0][0];
    try{areaM2=turf.area(feature);const g=geo();if(g){const inside=turf.intersect(turf.featureCollection([feature,turf.feature(g)]));areaM2=inside?turf.area(inside):0;}}catch(_){/* keep the outline area */}
    try{label=turf.pointOnFeature(feature).geometry.coordinates;}catch(_){/* keep the first vertex */}
    info={key,areaM2,label};zoneMeta.set(zone,info);return info;
  }
  function zoneToolUI(){
    for(const button of zoneCard.querySelectorAll('[data-zone-tool]')){const on=button.dataset.zoneTool===zoneTool;button.setAttribute('aria-pressed',String(on));button.classList.toggle('bp',on);button.classList.toggle('bs',!on);}
    zoneCard.querySelector('[data-zone-stop]').hidden=!zoneTool;
    zoneCard.querySelector('[data-zone-status]').textContent=zoneTool==='polygon'?'지도에서 꼭짓점을 차례로 누른 뒤 ‘영역 완성’을 누르세요. Esc 또는 그리기 중지로 취소합니다.':zoneTool==='area'?'지도 위를 누른 채 끌어서 제외할 영역의 테두리를 그리세요. 손을 떼면 영역이 닫힙니다.':zoneTool==='path'?'지도 위를 누른 채 끌어서 경로를 그리세요. 경로 폭만큼 설치에서 제외합니다.':'';
  }
  function renderZones(){
    const list=zoneCard.querySelector('[data-zone-list]');list.replaceChildren();let total=0;
    keepouts.forEach((zone,i)=>{const info=zoneInfo(zone),row=document.createElement('li'),number=document.createElement('b'),text=document.createElement('span'),remove=document.createElement('button');total+=info.areaM2;
      number.className='pf-zone-no';number.textContent=String(i+1);text.textContent=info.areaM2.toFixed(1)+' ㎡';remove.type='button';remove.className='bt bd2';remove.textContent='삭제';remove.dataset.zoneDelete=String(i);remove.setAttribute('aria-label',(i+1)+'번 설치 제외 영역 삭제');row.append(number,text,remove);list.append(row);});
    zoneCard.querySelector('[data-zone-summary]').textContent=keepouts.length?'설치 제외 영역 '+keepouts.length+'곳 · 합계 '+total.toFixed(1)+' ㎡':'지정한 설치 제외 영역이 없습니다.';
    zoneCard.querySelector('[data-zone-clear]').hidden=!keepouts.length;zoneToolUI();
  }
  // Leaving a tool always clears every drawing flag, so the next install area can never be saved as a zone.
  function endZoneTool(){drawKeepout=false;if(stroke){stroke=null;window.PFDetailZoom?.release?.();scheduleDraw();}zoneTool=null;zoneToolUI();}
  function stopZone(){if(drawKeepout&&dM){window.togDr();return;}endZoneTool();modeText();}
  function zoneLimit(){if(allKeepouts().length<PFLayout.ZONE_MAX)return false;notify('설치 제외 영역은 최대 '+PFLayout.ZONE_MAX+'곳까지 지정할 수 있습니다. 기존 영역을 삭제한 뒤 추가하세요.');return true;}
  function startZone(kind){
    if(zoneTool===kind){stopZone();return;}
    if(!geo()){T('설치 영역을 먼저 그리세요.');return;}
    if(zoneLimit())return;
    stopZone();if(mM)window.togMn();
    if(kind==='polygon'){zoneStarting=true;try{if(dM)window.togDr();window.togDr();}finally{zoneStarting=false;}drawKeepout=true;}
    else{
      if(!window.PFDetailZoom?.capture){T('자유곡선 그리기를 불러오지 못했습니다. 새로고침한 뒤 다시 시도하세요.',5000);return;}
      if(dM)window.togDr();
      stroke={kind,points:[],active:false};window.renMods();
      // Map panning is suspended only while this tool is armed; release() gives it back.
      window.PFDetailZoom.capture({start:strokeStart,move:strokeMove,end:strokeEnd,cancel:strokeCancel});
    }
    zoneTool=kind;zoneToolUI();modeText();T('설치 제외 영역 · '+ZONE_TOOLS[kind]);
  }
  const strokePoint=ll=>[ll.getLng(),ll.getLat()];
  function strokeStart(ll){if(!stroke)return;stroke.points=[strokePoint(ll)];stroke.active=true;scheduleDraw();}
  function strokeMove(ll){if(!stroke?.active||stroke.points.length>=5000)return;stroke.points.push(strokePoint(ll));scheduleDraw();}
  function strokeCancel(){if(!stroke)return;stroke.active=false;stroke.points=[];scheduleDraw();}
  function strokeEnd(ll){
    if(!stroke?.active)return;const kind=stroke.kind,points=[...stroke.points,strokePoint(ll)];stroke.active=false;stroke.points=[];scheduleDraw();
    if(points.length<3)return;   // a tap is not a stroke; the tool stays armed
    let zone;try{zone=PFLayout.zoneFromStroke(points,{kind,widthM:$('pfZoneWidth').value},turf);}catch(error){notify(error.message);return;}   // armed for another try
    endZoneTool();modeText();addZone(zone);
  }
  function addZone(zone){
    const g=geo();if(!g){notify('설치 영역을 먼저 그리세요.');return false;}
    if(zoneLimit())return false;
    // Only a zone that passes the engine's keepout check is stored: an invalid one would fail every later layout and save.
    if(!PFLayout.validZone(zone,turf)){notify('제외 영역 모양을 인식하지 못했습니다. 다시 그려 주세요.');return false;}
    let touches=true;try{touches=turf.booleanIntersects(turf.feature(zone),turf.feature(g));}catch(_){/* the engine decides */}
    if(!touches){notify('설치 영역 밖에 그린 영역입니다. 설치 영역 안에서 제외할 곳을 그려 주세요.');return false;}
    keepouts=[...keepouts,zone];repack('설치 제외 영역 '+keepouts.length+'번 추가');return true;
  }
  function removeZone(index){if(!(index>=0&&index<keepouts.length))return;keepouts=keepouts.filter((_,i)=>i!==index);repack((index+1)+'번 설치 제외 영역 삭제');}
  function clearZones(){if(!keepouts.length)return;keepouts=[];repack('설치 제외 영역 모두 삭제');}
  // A zone changes the usable area, so the layout is packed again (not only filtered). The repack's checkpoint is the
  // one undo step; when the repack cannot finish, the filtered layout is recorded so no panel is left inside a zone.
  async function repack(label){
    renderZones();
    try{mods=PFLayout.filterContained(geo(),inputSpec(),mods.map(panel),turf,allKeepouts()).map(modFromPoly);}catch(_){/* autoLay reports the cause */}
    renMods();try{uSt();}catch(_){/* invalid input: reported by autoLay */}
    const outcome=await window.autoLay();
    if(outcome==='failed'){checkpoint();renderZones();}
    else if(outcome==='ok'&&mods.length)T(label+' · '+mods.length+'장으로 다시 배치했습니다.');
    return outcome;
  }
  zoneCard.onclick=e=>{
    const pick=name=>e.target?.closest?.('['+name+']');
    if(pick('data-zone-tool')){startZone(pick('data-zone-tool').dataset.zoneTool);return;}
    if(pick('data-zone-stop')){stopZone();return;}
    if(pick('data-zone-delete')){removeZone(Number(pick('data-zone-delete').dataset.zoneDelete));return;}
    if(pick('data-zone-clear'))clearZones();
  };
  // 중지, Escape or a plain "그리기 시작" ends exclusion drawing and discards its unfinished vertices.
  const drawToggle=window.togDr;window.togDr=function(...args){const vertices=drawKeepout,out=drawToggle.apply(this,args);if(!zoneStarting){if(vertices){pts=[];clrDrOv();window.showMeas(true);}endZoneTool();}return out;};
  // Manual placement and drawing exclude each other; leaving drawing through togDr also resets its button.
  const manualToggle=window.togMn;window.togMn=function(...args){if(!mM){stopZone();if(dM)window.togDr();}return manualToggle.apply(this,args);};
  const finishBoundary=window.finPoly;window.finPoly=function(){if(pts.length<3)return finishBoundary();
    if(drawKeepout){
      // Validate and repair before storing; a refused outline leaves drawing mode with nothing changed.
      const points=pts.map(p=>[p.lng,p.lat]);stopZone();
      let zone;try{zone=PFLayout.zoneFromStroke(points,{kind:'polygon'},turf);}catch(error){notify(error.message);return;}
      addZone(zone);return;
    }
    cancelRoofReview();finishBoundary();roofPlan=null;needsLayout=mods.length>0;checkpoint();renderRoofReview();renderZones();};
  $('pfUndo').onclick=()=>{if(historyIndex>0){client.cancel();restore(JSON.parse(history[--historyIndex]));version++;save();}};
  $('pfRedo').onclick=()=>{if(historyIndex<history.length-1){client.cancel();restore(JSON.parse(history[++historyIndex]));version++;save();}};
  const exportButton=document.createElement('button');exportButton.className='bt bs';exportButton.textContent='설계 JSON';actions.appendChild(exportButton);exportButton.onclick=()=>{if(!session){T('연결 후 내보낼 수 있습니다.');return;}const url=URL.createObjectURL(new Blob([JSON.stringify(documentValue(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='layout-'+session.layoutId+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('pfSave').onclick=()=>saveOrNotify();$('pfCancel').onclick=()=>{cancelRoofReview();client.cancel();state('계산 취소 · 기존 배치는 유지됩니다.');};
  function requestClose(){closeRequested=true;clearTimeout(saveTimer);if(zoneTool&&!pts.length)stopZone();if(dM&&pts.length){closeRequested=false;state('저장 실패: 그리는 중인 영역을 먼저 완성하거나 지워 주세요.');return;}saveOrNotify();}
  const closeButton=document.querySelector('button[aria-label="편집기 닫기"]');if(closeButton&&openerWindow)closeButton.onclick=requestClose;
  function settingsChanged(e){
    // The path width belongs to the drawing tool, not to the layout.
    if(e.id==='iLa'||e.id==='iLo'||e.id==='pfZoneWidth'||e.hasAttribute?.('data-roof-enabled'))return;
    if(roofObstacleCheck&&roofPlan&&e.id==='tD')roofPlan.settings.verifiedSlopeDeg=Number(e.value);
    // Module power does not move panels; any other parameter switches an older document to the margin rule.
    if(e.id!=='mP')useMarginRule();
    needsLayout=needsLayout||(mods.length>0&&e.id!=='mP');
    try{
      inputSpec();
      if(e.id==='mP')uSt();
      checkpoint();
      state(needsLayout?'설정 변경됨 · 자동 배치를 눌러 패널 위치를 갱신하세요.':'출력 변경됨 · 자동 저장 대기');
    }catch(error){state(error.message);}
    marginNote();
  }
  document.querySelectorAll('.sd input,.sd select').forEach(e=>e.addEventListener('change',()=>settingsChanged(e)));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')stopZone();if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'&&!dM){e.preventDefault();(e.shiftKey?$('pfRedo'):$('pfUndo')).click();}});
  // JSONP timeout and sequencing prevent a slow old address from taking over the map.
  window.jp=function(url){return new Promise((resolve,reject)=>{const cb='pfGeo'+Date.now()+Math.random().toString(36).slice(2),script=document.createElement('script');let timer;const clear=()=>{clearTimeout(timer);delete window[cb];script.remove();};window[cb]=data=>{clear();resolve(data);};script.onerror=()=>{clear();reject(new Error('주소 검색 서버에 연결하지 못했습니다.'));};timer=setTimeout(()=>{clear();reject(new Error('주소 검색 시간이 초과되었습니다. 다시 시도하세요.'));},10000);script.src=url+(url.includes('?')?'&':'?')+'callback='+cb;document.head.appendChild(script);});};
  window.sAddr=async function(){const address=$('aS').value.trim(),serial=++searchSerial;if(!address)return;if(!VWK){T('주소 검색 키가 설정되지 않았습니다.');return;}T('주소 검색 중…');try{let found=null;for(const type of ['road','parcel']){const data=await jp('https://api.vworld.kr/req/address?service=address&request=getCoord&version=2.0&crs=epsg:4326&format=json&type='+type+'&address='+encodeURIComponent(address)+'&key='+encodeURIComponent(VWK));if(serial!==searchSerial)return;const point=data?.response?.result?.point;if(point){found=point;break;}}if(!found)throw new Error('주소를 찾지 못했습니다. 도로명 또는 지번을 확인하세요.');cLa=Number(found.y);cLo=Number(found.x);cAd=address;km.setCenter(new kakao.maps.LatLng(cLa,cLo));$('iLa').value=cLa;$('iLo').value=cLo;$('sA').textContent=address;sn(1,true);T('주소 검색 완료');}catch(error){if(serial===searchSerial)T(error.message,5000);}};
  window.sendAn=()=>save(true);
  // Freeze the projection and geometry before waiting for the map image. The static
  // image is the center crop at the same zoom; never stretch full-view bounds into it.
  window.doCapture=async function(){if(!geo()){T('먼저 영역을 그리세요.');return;}const capturedVersion=version;try{const el=$('kMap'),W=Math.min(el.clientWidth,900),H=Math.min(el.clientHeight,900),cx=(el.clientWidth-W)/2,cy=(el.clientHeight-H)/2,pr=PFDetailZoom.projection(km),center=km.getCenter(),level=km.getLevel(),detailScale=PFDetailZoom.get(),rings=areas.map(ap=>ap.map(p=>{const x=pr.containerPointFromCoords(new kakao.maps.LatLng(p.lat,p.lng));return [x.x-cx,x.y-cy];})),panels=mods.map(m=>panel(m).geometry.coordinates[0].map(p=>{const x=pr.containerPointFromCoords(new kakao.maps.LatLng(p[1],p[0]));return [x.x-cx,x.y-cy];}));
      const canvas=document.createElement('canvas');canvas.width=W*2;canvas.height=(H+64)*2;const ctx=canvas.getContext('2d');ctx.scale(2,2);ctx.fillStyle='#0f172a';ctx.fillRect(0,0,W,H);
      let background=false;try{const response=await fetch(apiBase+'/api/map-capture?'+new URLSearchParams({lat:center.getLat(),lng:center.getLng(),level,width:W,height:H}),{signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('map');const bitmap=await createImageBitmap(await response.blob());const bw=bitmap.width/detailScale,bh=bitmap.height/detailScale;ctx.drawImage(bitmap,(bitmap.width-bw)/2,(bitmap.height-bh)/2,bw,bh,0,0,W,H);bitmap.close();background=true;}catch(_){T('지도 배경을 가져오지 못해 도형만 캡처합니다.');}
      function draw(r,fill,stroke){ctx.beginPath();r.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();ctx.fillStyle=fill;ctx.strokeStyle=stroke;ctx.fill();ctx.stroke();}rings.forEach(r=>draw(r,'rgba(6,214,160,.12)','#2dd4bf'));panels.forEach(r=>PFPanelVisuals.drawPanel(ctx,r));drawMeasurements(ctx,pr,W,H,cx,cy,false);
      if(capturedVersion!==version)throw new Error('캡처 중 설계가 변경되었습니다. 다시 캡처하세요.');ctx.fillStyle='#f8fafc';ctx.fillRect(0,H,W,64);ctx.fillStyle='#153c45';ctx.font='600 13px sans-serif';ctx.fillText(mods.length.toLocaleString()+'장 · '+(mods.length*inputSpec().powerW/1000).toLocaleString(undefined,{maximumFractionDigits:3})+' kW DC',14,H+25);ctx.fillStyle='#475569';ctx.font='12px sans-serif';ctx.fillText('SC ENERGY · '+(background?'위성 배치도':'배치 평면도'),14,H+47);image=window.PFPanelVisuals.reportImage(canvas);version++;await save();
    }catch(error){T('캡처 실패: '+error.message,5000);}};
  // One canvas for modules and decluttered measurements, refreshed after pan/zoom/resize.
  const dimensionBox=document.createElement('details');dimensionBox.className='cd';dimensionBox.id='pfDimensions';
  dimensionBox.innerHTML='<summary style="cursor:pointer;font-weight:600">경계 치수</summary><p style="font-size:12px;line-height:1.6;margin:8px 0;color:#cbd5e1">지도에는 겹치지 않는 치수만 표시합니다. 모든 변의 길이는 아래에서 확인하세요.</p><div data-dimensions style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:12px;font-variant-numeric:tabular-nums"></div>';
  document.querySelector('.sd').appendChild(dimensionBox);
  function measurementEdges(){
    const groups=measurementsClosed&&areas.length?areas:[pts],edges=[];
    groups.forEach((ap,g)=>{const n=measurementsClosed&&ap.length>=3?ap.length:ap.length-1;
      for(let i=0;i<n;i++){const a=ap[i],b=ap[(i+1)%ap.length],id=(g+1)+'.'+(i+1);edges.push({a,b,id,text:id+' · '+hav(a,b).toFixed(1)+' m'});}
    });return {groups,edges};
  }
  function drawMeasurements(ctx,pr,W,H,offsetX=0,offsetY=0,reserveUI=true){
    const {groups,edges}=measurementEdges(),xy=p=>{const q=pr.containerPointFromCoords(new kakao.maps.LatLng(p.lat,p.lng));return [q.x-offsetX,q.y-offsetY];};
    const obstacles=[];
    if(reserveUI){const mapRect=$('kMap').parentElement.getBoundingClientRect();document.querySelectorAll('.mw > .ov,.mw > .di,.mw > .zc,.mw > .zl').forEach(el=>{if(!el.getClientRects().length)return;const r=el.getBoundingClientRect();obstacles.push({x:r.left-mapRect.left,y:r.top-mapRect.top,w:r.width,h:r.height});});}
    ctx.font='600 12px system-ui, sans-serif';
    const labels=PFPanelVisuals.placeLabels(edges.map(e=>({...e,a:xy(e.a),b:xy(e.b)})),W,H,t=>ctx.measureText(t).width,obstacles,measurementsClosed?groups.filter(p=>p.length>2).map(ap=>ap.map(xy)):[]);
    PFPanelVisuals.drawLabels(ctx,labels);
    const key=edges.map(e=>e.text).join('|');
    if(reserveUI&&key!==dimensionKey){dimensionKey=key;const list=dimensionBox.querySelector('[data-dimensions]');list.replaceChildren();for(const e of edges){const row=document.createElement('div');row.style.cssText='min-width:0;overflow-wrap:anywhere;padding:5px 0;border-bottom:1px solid #334155';row.textContent=e.text;list.appendChild(row);}dimensionBox.querySelector('summary').textContent='경계 치수 · '+edges.length+'개 변';}
  }
  window.showMeas=function(closed){clrMeasOv();measurementsClosed=!!closed;if(km&&kR)window.renMods();};
  window.renMods=function(){if(!km||!kR)return;modRects.forEach(r=>r.setMap(null));modRects=[];
    if(!canvas){canvas=document.createElement('canvas');canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5';$('kMap').parentElement.appendChild(canvas);
      window.addEventListener('pf-detail-zoom',scheduleDraw);kakao.maps.event.addListener(km,'bounds_changed',scheduleDraw);PFEditorViewport.observe(km,$('kMap'),scheduleDraw);
    }renderCanvas();$('pO').style.display=mods.length?'flex':'none';
  };
  function scheduleDraw(){if(!canvas||drawRaf)return;drawRaf=requestAnimationFrame(()=>{drawRaf=null;renderCanvas();});}
  function renderCanvas(){
    if(!canvas||!km)return;const el=$('kMap'),dpr=Math.min(devicePixelRatio||1,2),W=el.clientWidth,H=el.clientHeight;
    canvas.width=W*dpr;canvas.height=H*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);
    const pr=PFDetailZoom.projection(km),bounds=km.getBounds(),xy=p=>{const q=pr.containerPointFromCoords(new kakao.maps.LatLng(p[1],p[0]));return [q.x,q.y];};
    const trace=k=>{ctx.beginPath();const polygons=k.type==='MultiPolygon'?k.coordinates:[k.coordinates];for(const rings of polygons)for(const r of rings){r.forEach((p,i)=>i?ctx.lineTo(...xy(p)):ctx.moveTo(...xy(p)));ctx.closePath();}};
    for(const k of roofPrepared()?.keepouts||[]){trace(k);ctx.fillStyle='rgba(217,119,6,.24)';ctx.fill('evenodd');}
    for(const k of keepouts){trace(k);ctx.fillStyle='rgba(220,38,38,.2)';ctx.fill('evenodd');ctx.lineWidth=1.5;ctx.strokeStyle='#dc2626';ctx.stroke();}
    for(const m of mods){if(m.e<bounds.getSouthWest().getLng()||m.w>bounds.getNorthEast().getLng()||m.n<bounds.getSouthWest().getLat()||m.s>bounds.getNorthEast().getLat())continue;PFPanelVisuals.drawPanel(ctx,panel(m).geometry.coordinates[0].map(xy));}
    drawMeasurements(ctx,pr,W,H);
    // Zone numbers match the list; drawn above panels and dimensions so a zone is never lost under them.
    ctx.font='700 11px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    keepouts.forEach((k,i)=>{const [x,y]=xy(zoneInfo(k).label);if(x<-12||y<-12||x>W+12||y>H+12)return;ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=1.5;ctx.strokeStyle='#dc2626';ctx.stroke();ctx.fillStyle='#b91c1c';ctx.fillText(String(i+1),x,y+.5);});
    ctx.textAlign='start';ctx.textBaseline='alphabetic';
    // Live free-hand stroke: the outline (area) or the band of the chosen width (path).
    if(stroke?.points.length>1){
      const line=stroke.points.map(xy),run=close=>{ctx.beginPath();line.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));if(close)ctx.closePath();};
      ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
      if(stroke.kind==='path'){const first=stroke.points[0],width=Number($('pfZoneWidth').value)||PFLayout.PATH_WIDTH_DEFAULT,east=xy([first[0]+width/(111320*Math.cos(first[1]*Math.PI/180)),first[1]]);run(false);ctx.strokeStyle='rgba(220,38,38,.3)';ctx.lineWidth=Math.max(3,Math.hypot(east[0]-line[0][0],east[1]-line[0][1]));ctx.stroke();}
      else{run(true);ctx.fillStyle='rgba(220,38,38,.16)';ctx.fill();}
      run(stroke.kind==='area');ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.strokeStyle='#dc2626';ctx.stroke();ctx.restore();
    }
  }
  // A draft survives a timed-out save that still committed: the head then carries the draft's own editSession.
  window.addEventListener('message',e=>{const d=e.data;if(!validParent||e.origin!==parentOrigin||e.source!==openerWindow||d?.channel!==channel||d.contractVersion!==PFLayout.VERSION)return;
    if(d.type==='PF_ROOF_ASSESS_RESULT'){const waiter=roofRequests.get(d.requestId);if(waiter){roofRequests.delete(d.requestId);waiter(d.result);}return;}
    if(d.type==='PF_LAYOUT_INIT'&&!initializing&&d.session?.layoutId===q.get('layoutId')){initializing=true;session=d.session;const apply=()=>{if(!km){setTimeout(apply,100);return;}const saved=session.data;image=saved?.image||'';if(saved){restore({geometry:saved.geometry,roofObstacleCheck:saved.roofObstacleCheck,roofPlan:saved.roofPlan,keepouts:saved.roofPlan?.customKeepouts||saved.keepouts,areas:saved.areas||[],pts:[],mods:saved.panelInstances.map(modFromPoly),params:saved.panelSpec,meta:{azimuthAngle:saved.azimuthAngle,efficiencyPct:saved.efficiencyPct,layoutMode:saved.layoutMode},address:saved.address,lat:saved.lat,lng:saved.lng,mode:saved.mode});}let restoredDraft=false;try{const draft=JSON.parse(localStorage.getItem('pf-layout-draft:'+session.layoutId)||'null');const ownCommit=typeof draft?.editSession==='string'&&String(saved?.clientMutationId||'').startsWith(draft.editSession+'-')&&session.revision>draft.baseRevision;if(draft?.draftSchema===1&&(draft.baseRevision===session.revision||ownCommit)){restore(draft.state);image='';restoredDraft=true;}}catch(_){}history=[JSON.stringify(snapshot())];historyIndex=0;initialized=true;renderRoofReview();modeHeader();marginNote();renderZones();post('PF_LAYOUT_INITIALIZED');state(restoredDraft?'저장되지 않은 변경을 복원했습니다. 저장 상태를 확인하세요.':'연결 완료 · 버전 '+session.revision);if(restoredDraft)save();};apply();}
    if(d.type==='PF_LAYOUT_REQUEST_CLOSE')requestClose();
    // Only an explicit apply failure keeps the editor open; older mains omit reason and mean "other site".
    if(d.type==='PF_LAYOUT_ACK'&&d.messageId===lastMessageId){if(!d.applied&&d.reason&&d.reason!=='other_site'){closeRequested=false;state('서버 저장 완료 · 메인 화면 반영 실패. 저장 재시도를 눌러 다시 반영하세요.',true);return;}unacked=null;state(d.applied?'저장 및 메인 반영 완료 · 버전 '+session.revision:'서버 저장 완료 · 메인은 다른 현장을 보고 있습니다.');if(closeRequested&&!saving&&!pending&&!needsLayout){closeRequested=false;post('PF_LAYOUT_CLOSED');}}
  });
  const hello=setInterval(()=>{if(session){clearInterval(hello);return;}if(openerWindow&&validParent)openerWindow.postMessage({type:'PF_LAYOUT_READY',channel,contractVersion:PFLayout.VERSION},parentOrigin);},500);
  window.addEventListener('beforeunload',e=>{client.cancel();if(saving||pending||status.textContent.startsWith('저장 실패')||status.textContent.startsWith('변경됨')){e.preventDefault();e.returnValue='';}});
  const sidebarToggle=document.createElement('button');sidebarToggle.className='bt bs pfSidebarToggle';sidebarToggle.textContent='설정 접기';sidebarToggle.setAttribute('aria-expanded','true');document.querySelector('.hd').insertBefore(sidebarToggle,closeButton);sidebarToggle.onclick=()=>{const closed=document.body.classList.toggle('pfSidebarClosed');sidebarToggle.textContent=closed?'설정 열기':'설정 접기';sidebarToggle.setAttribute('aria-expanded',String(!closed));renMods();};
  const modeStatus=document.createElement('div');modeStatus.setAttribute('role','status');modeStatus.style.cssText='padding:8px;font-size:13px;color:#fbbf24';actions.after(modeStatus);function modeText(){modeStatus.textContent=zoneTool?'설치 제외 영역 그리는 중 · '+ZONE_TOOLS[zoneTool]:dM?'설치 영역 그리는 중 · 완성 후 연속 그리기':mM?'패널 수동 배치 중':'지도 이동 · 설계 확인';}for(const name of ['togDr','togMn','finPoly','clrAll']){const previous=window[name];if(typeof previous==='function')window[name]=function(...args){const value=previous.apply(this,args);modeText();return value;};}modeText();
  // Mode header. restore() and the mode switch both use it, so a saved land design never shows the roof header.
  function modeHeader(){
    const land=layoutMode()==='land',text=(id,value)=>{const e=$(id);if(e)e.textContent=value;};
    for(const [id,on,name] of [['mR',!land,'ar'],['mL',land,'al']]){const b=$(id);if(!b)continue;b.className=on?name:'';b.setAttribute('aria-pressed',String(on));
      // Inside the studio the installation type belongs to the main page: switching here would wipe the open design.
      b.disabled=initialized&&!on;b.title=initialized&&!on?'설치 유형(지붕·토지)은 메인 화면에서 바꿉니다.':'';}
    text('hI',land?'🌿':'🏠');text('hT',land?'토지 패널 배치':'지붕 패널 배치');text('s1L',land?'토지 선택':'지붕 선택');text('s2L',land?'토지 영역 그리기':'영역 그리기');
  }
  // Mode defaults (roof: tilt 10 / 2 rows / roof line, land: tilt 15 / 3 rows / south, both landscape) unless the URL gives a value.
  function modeDefaults(mode){
    const land=mode==='land',set=(id,value)=>{const e=$(id);if(e)e.value=value;};
    set('tD',q.get('tilt')??q.get('tD')??(land?'15':'10'));set('pfRows',q.get('stackRows')??(land?'3':'2'));set('ori',q.get('orient')??'landscape');set('layMode',land?'south':'roof');
  }
  window.setMode=function(mode){
    mode=mode==='land'?'land':'roof';if(mode===layoutMode())return;
    if(initialized){notify('설치 유형(지붕·토지)은 메인 화면에서 바꿉니다. 편집 중인 설계는 그대로 유지됩니다.');modeHeader();return;}
    if((pts.length||areas.length||mods.length||keepouts.length)&&!confirm((mode==='land'?'토지':'지붕')+' 모드로 바꾸면 그린 영역·설치 제외 영역·패널 배치가 모두 지워집니다. 계속할까요?'))return;
    // The address handed over by the studio (or searched before) stays on screen; only an empty editor asks for one.
    window.clrAll();curMo=mode;modeDefaults(mode);modeHeader();renderRoofReview();marginNote();const hint=$('sA');if(hint&&!cAd){hint.textContent='주소를 검색하세요';sn(1,false);}
    if(mode==='land'&&typeof togCad==='function')togCad(true);T(mode==='land'?'🌿 토지':'🏠 지붕');
  };
  // Rotating flips a layout parameter, so an older document moves to the margin rule like any other change.
  {const rotate=window.rotM;if(typeof rotate==='function')window.rotM=function(...args){if(mods.length)useMarginRule();const out=rotate.apply(this,args);marginNote();return out;};}
  renderRoofReview();renderZones();modeHeader();marginNote();state('메인 화면 연결 대기');
})();
