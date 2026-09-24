(function(){'use strict';
  const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const api=window.BACKEND_URL,kindLabel={ess:'ESS',substation:'변전소',line:'송전선로',plant:'발전시설',company:'기업',scan:'전수스캔',analysis:'내 분석',selection:'선택 위치',cluster:'묶음'};
  const format=(x,d=1)=>typeof x==='number'&&Number.isFinite(x)?x.toLocaleString('ko-KR',{maximumFractionDigits:d}):'미확인';
  const stamp=x=>x?new Date(x*1000).toLocaleString('ko-KR'):'기준 시각 미확인';
  let map,layer,tiles,cadastral,labelsLayer,boundaryLayer,config,points=[],selected=null,compared=[],mode='stored',generation=0,controller,workspace=[],sources={},measurement=null,vertices=[],measureLayer,scenario;
  let toastTimer;function toast(s){$('toast').textContent=s;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,6000);}
  async function request(path,options={}){
    const r=await fetch(api+'/api/explore'+path,{...options,headers:{'Content-Type':'application/json',...options.headers}});
    const j=await r.json();if(!r.ok||j.ok===false){if(r.status===401){$('resultHint').innerHTML='인증이 필요합니다. <a href="index.html?next=explore.html">라이선스로 로그인</a>';}throw new Error(({authentication_required:'라이선스 인증 후 이용해 주세요.',address_required:'정확한 지번 또는 도로명 주소가 필요합니다.',address_not_found:'주소를 찾지 못했습니다.',watch_limit_20:'자동 갱신은 라이선스당 최대 20개 현장입니다.'})[j.error]||j.message||j.error||'조회 실패');}return j;
  }
  const post=(path,body)=>request(path,{method:'POST',body:JSON.stringify(body)});
  function color(p){if(typeof p.capacityRatio==='number')return p.capacityRatio>=70?'#16a377':p.capacityRatio>=40?'#df9a29':'#df6162';return typeof p.capacityMw!=='number'?'#8795a2':p.capacityMw>0?'#16a377':p.capacityMw===0?'#df9a29':'#df6162';}
  function capacity(p){return typeof p.capacityMw==='number'?format(p.capacityMw,2)+' MW':'용량 미확인';}
  function studio(p,tool=''){
    const u=new URL('solar_pathfinder.html',location.href);if(p){u.searchParams.set('siteLat',p.lat);u.searchParams.set('siteLng',p.lng);u.searchParams.set('siteAddress',p.address||p.name||'');if(p.pnu)u.searchParams.set('sitePnu',p.pnu);}
    if(p?.id&&p.kind!=='selection')u.searchParams.set('siteId',p.id);
    u.searchParams.set('dataMode',mode);if(tool)u.searchParams.set('tool',tool);return u.href;
  }
  function draw(){
    layer.clearLayers();
    for(const p of points){
      if(p.kind==='cluster'){
        L.marker([p.lat,p.lng],{icon:L.divIcon({className:'cluster',html:esc(p.count),iconSize:[44,44]})}).on('click',()=>map.setView([p.lat,p.lng],Math.min(12,map.getZoom()+2))).addTo(layer);continue;
      }
      if(p.kind==='line'&&p.geometry?.length>1){L.polyline(p.geometry.map(v=>[v[1],v[0]]),{color:String(p.voltage).includes('345000')||String(p.voltage).includes('765000')?'#ba5b90':'#be9355',weight:2,opacity:.7}).on('click',()=>select(p)).addTo(layer);continue;}
      const marker=L.circleMarker([p.lat,p.lng],{radius:p.kind==='substation'?7:5,color:'#fff',weight:1.5,fillColor:color(p),fillOpacity:.92,bubblingMouseEvents:false});
      const tip=document.createElement('span');tip.textContent=p.name+' · '+capacity(p);marker.bindTooltip(tip).on('click',()=>select(p)).addTo(layer);
    }
    $('results').innerHTML=points.length?points.slice(0,80).map((p,i)=>`<button class="result" data-result="${i}"><span class="tag">${esc(kindLabel[p.kind])}</span><strong>${esc(p.name)}</strong><small>${p.kind==='cluster'?'확대해서 개별 현장 보기':esc(capacity(p))+' · '+esc(p.source||'저장 자료')}</small></button>`).join(''):'<div class="empty">이 범위에서 조건에 맞는 저장 자료가 없습니다.<br>범위를 넓히거나 레이어·용량 조건을 변경해 주세요.<br><br>주소 검색 또는 지도 클릭으로 현장을 선택한 뒤 실시간 확인할 수 있습니다.</div>';
    $('results').querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>{const p=points[Number(b.dataset.result)];if(p.kind==='cluster')map.setView([p.lat,p.lng],Math.min(12,map.getZoom()+2));else{map.panTo([p.lat,p.lng]);select(p);}});
  }
  async function load(){
    if(!map)return;const gen=++generation;controller?.abort();controller=new AbortController();
    const b=map.getBounds(),bbox=[Math.max(124,b.getWest()),Math.max(32,b.getSouth()),Math.min(132,b.getEast()),Math.min(39,b.getNorth())];
    const kinds=[...$('layers').querySelectorAll('input:checked')].map(x=>x.value);
    if(!kinds.length||bbox[0]>=bbox[2]||bbox[1]>=bbox[3]){points=[];draw();$('resultCount').textContent='표시 레이어를 선택해 주세요';return;}
    const qs=new URLSearchParams({bbox:bbox.join(','),zoom:map.getZoom(),kinds:kinds.join(','),q:$('query').value.trim()});
    if($('ratioBand'))qs.set('ratio',$('ratioBand').value);
    if($('minMw').value!=='')qs.set('minMw',$('minMw').value);if($('overload').checked)qs.set('capacity','overload');
    $('resultHint').textContent='저장 자료를 불러오는 중…';
    try{const j=await request('/map?'+qs,{signal:controller.signal});if(gen!==generation)return;points=j.items;sources=j.sources||sources;draw();$('resultCount').textContent=format(j.total,0)+'개 지점';$('resultHint').textContent=(j.truncated?'표시 한도에 도달했습니다. 지도를 확대해 주세요. ':`${stamp(j.readAt)} 서버 자료 확인 · `)+(points.some(p=>p.kind==='cluster')?'묶음 숫자를 누르면 확대합니다.':'목록은 최대 80개, 지도는 최대 600개 표시');}
    catch(e){if(e.name!=='AbortError'){if(!String(e.message).includes('라이선스'))$('resultHint').textContent='자료를 읽지 못했습니다. 기존 표시를 유지합니다.';toast(e.message);}}
  }
  function setMode(value){mode=value;for(const v of ['stored','live'])$(v+'Mode').setAttribute('aria-pressed',String(v===mode));$('dataBadge').textContent=mode==='stored'?'저장 자료 탐색':'현장 실시간 확인 준비';$('modeHelp').textContent=mode==='stored'?'저장된 최신 결과를 바로 표시합니다. 지도 이동으로 실시간 조회가 발생하지 않습니다.':'현장을 선택한 뒤 ‘지금 실시간 조회’를 누르세요. 지도 전체를 자동 조회하지 않습니다.';if(selected)renderDetail();}
  async function select(p){selected={...p};if(p.kind==='selection')selected.id='selection-'+Number(p.lat).toFixed(6)+'-'+Number(p.lng).toFixed(6);if(p.kind==='cluster')return;$('detail').hidden=false;renderDetail();if(p.kind==='selection')return;try{const j=await request(p.kind==='parcel'?'/parcel/'+encodeURIComponent(p.pnu):'/site/'+encodeURIComponent(p.id));if(selected?.id!==p.id)return;selected={...selected,...(j.item||j.data),observedAt:j.observedAt};renderDetail();}catch(e){toast(e.message);}}
  function renderDetail(){
    const p=selected;if(!p)return;
    $('detail').innerHTML=`<button class="close" id="closeDetail" aria-label="현장 상세 닫기">✕</button><span class="eyebrow">${esc(kindLabel[p.kind]||'현장')}</span><h2>${esc(p.name||p.address||'선택 현장')}</h2><div class="metric"><div>접속 여유용량<b style="color:${color(p)}">${esc(typeof p.capacityMw==='number'?format(p.capacityMw,2):'—')}</b>${typeof p.capacityMw==='number'?'MW':'미확인'}</div><div>분석 점수<b>${esc(format(p.score,0))}</b>저장 분석 기준</div></div><p class="hint">${esc(p.capacityNote||'정확한 주소를 입력하고 현장 조회를 선택하세요.')}</p><p class="hint">자료 기준: ${esc(stamp(p.capacityObservedAt||p.observedAt))}<br>출처: ${esc(p.source||'아직 조회하지 않음')}${p.sourceDate?'<br>원천 기준: '+esc(p.sourceDate):''}${p.observedAt&&Date.now()/1000-p.observedAt>86400?'<br><b>24시간이 지난 자료입니다.</b>':''}${p.capacityStatus==='previous_observation'?'<br><b>최근 용량 확인이 불완전하여 이전 값을 표시합니다.</b>':''}</p><label>조회할 지번·도로명 주소<input id="siteAddress" value="${esc(p.address||'')}" placeholder="정확한 주소 입력"></label><button class="action primary" id="refreshSite">${mode==='live'?'지금 실시간 조회':'이 현장만 실시간 확인'}</button><p class="hint">한전·공공자료에 새 조회를 요청합니다. 원천 서비스의 캐시·미제공 자료는 결과에 남을 수 있습니다.</p><div id="refreshStatus" class="hint" role="status"></div><label><input type="checkbox" id="watchSite"> 이 현장 24시간마다 갱신</label><button class="action" id="favoriteSite">☆ 관심 현장 저장</button><button class="action" id="compareSite">후보 비교에 추가 (최대 4개)</button><button class="action" id="noteSite">현장 메모 작성</button><button class="action" id="nearbyGrid">주변 선로 표시</button><a class="action" id="designSite" href="${esc(studio(p))}">상세 설계 · 8대 검사 · AI 보고서 ↗</a><a class="action" href="${esc(studio(p,'scan'))}">이 현장에서 전수스캔 ↗</a><p class="hint">위치 기반 근접 시설이며 실제 계통 연결 관계를 보증하지 않습니다.</p>`;
    $('closeDetail').onclick=()=>{$('detail').hidden=true;selected=null;};
    if(p.data){
      const checks=p.data.check_list||p.data.ai?.check_list||p.data.checks||{};
      const names={zoning:'용도지역',ecology:'생태',heritage:'문화재',setback:'이격거리',grid:'한전 계통',slope:'경사도',insolation:'일사량',land_price:'토지가격'};
      const entries=Object.entries(checks).filter(([,v])=>v&&typeof v==='object');
      if(entries.length){const d=document.createElement('details');d.innerHTML='<summary>저장된 검사 결과 ('+entries.length+')</summary><table>'+entries.map(([k,v])=>'<tr><th>'+esc(names[k]||v.title||k)+'</th><td>'+esc(({PASS:'통과',FAIL:'제한',WARNING:'확인 필요'})[v.status]||'확인 필요')+'<br>'+esc(v.value||v.msg||'근거 미제공')+'</td></tr>').join('')+'</table>';$('detail').appendChild(d);}
    }
    $('siteAddress').oninput=e=>{p.address=e.target.value;$('designSite').href=studio(p);};
    $('refreshSite').onclick=refreshSite;
    $('favoriteSite').onclick=()=>saveWorkspace({type:'favorite',name:p.name,site:cleanSite(p)});
    $('compareSite').onclick=()=>{if(compared.some(x=>x.id===p.id))return toast('이미 비교에 추가했습니다.');if(compared.length>=4)return toast('최대 4개 현장을 비교할 수 있습니다.');compared.push(cleanSite(p));$('compareCount').textContent=compared.length;toast('비교에 추가했습니다.');};
    $('noteSite').onclick=()=>openPanel('note');
    $('nearbyGrid').onclick=()=>{$('layers').querySelector('[value=line]').checked=true;map.setView([p.lat,p.lng],12);load();toast('저장된 송전선로를 표시합니다. 실제 배전 경로 형상은 원천에서 제공된 경우에만 확인할 수 있습니다.');};
    $('watchSite').onchange=async e=>{try{await request('/watch',{method:e.target.checked?'POST':'DELETE',body:JSON.stringify({id:p.id})});toast(e.target.checked?'24시간 주기 갱신을 등록했습니다.':'주기 갱신을 해제했습니다.');}catch(error){e.target.checked=!e.target.checked;toast(error.message);}};
    if(p.kind==='selection'){$('watchSite').disabled=true;$('watchSite').parentElement.append(' · 첫 실시간 확인 후 등록');}
    request('/watch').then(j=>{if(selected?.id===p.id&&$('watchSite'))$('watchSite').checked=j.items.some(x=>x.id===p.id);}).catch(()=>{});
    window.PFExploreTools?.detail(p);
    window.PFExploreDiscovery?.detail(p);
    window.PFCompletionUI?.detail(p);
  }
  function cleanSite(p){const {id,name,address,lat,lng,kind,capacityMw,capacityNote,observedAt,source,pnu,score,areaM2,mode}=p;return {id,name,address,lat,lng,kind,capacityMw,capacityNote,observedAt,source,pnu,score,areaM2,mode};}
  async function refreshSite(){
    const p={...selected,address:$('siteAddress').value.trim()};if(p.address.length<5)return toast('정확한 주소를 먼저 입력해 주세요.');
    const button=$('refreshSite');button.disabled=true;$('refreshStatus').textContent='조회 작업이 저장되었습니다. 원천 자료를 확인하는 동안 기다려 주세요.';
    try{const result=await post('/refresh',p);toast('현장 조회가 완료되었습니다. 저장 결과를 새로 표시합니다.');await load();if(selected?.id===p.id){const refreshed=points.find(x=>x.kind==='analysis'&&Math.abs(x.lat-p.lat)<.00001&&Math.abs(x.lng-p.lng)<.00001);if(refreshed)await select(refreshed);else{$('refreshStatus').textContent=result.summary||'조회 완료. 해당 범위의 내 분석 레이어를 확인해 주세요.';}}}
    catch(e){toast('조회 실패: '+e.message);if(selected?.id===p.id)$('refreshStatus').textContent='실시간 확인에 실패했습니다. 이전 저장 결과는 유지됩니다.';}
    finally{if(button.isConnected)button.disabled=false;}
  }
  async function saveWorkspace(d){try{await post('/workspace',d);toast('내 작업공간에 저장했습니다.');return true;}catch(e){toast(e.message);return false;}}
  function csv(rows,name){const text='\uFEFF'+rows.map(row=>row.map(v=>'"'+(typeof v==='number'?String(v):String(v??'').replace(/^[=+@-]/,"'$&")).replace(/"/g,'""')+'"').join(',')).join('\r\n');download(text,name,'text/csv;charset=utf-8');}
  function download(data,name,type){const u=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  const titles={workspace:'내 관심 현장 · 메모 · 시나리오',compare:'후보지 비교',finance:'20년 사업성 시나리오',sources:'데이터 출처와 갱신 현황',note:'현장 메모',trends:'현재 지도 범위의 용량 변화',scenarioCompare:'저장 시나리오 비교'};
  async function openPanel(type){
    window.PFExploreDiscovery?.invalidate?.();
    window.PFCompletionUI?.invalidate?.();
    window.PFWorkspaceUI?.invalidate?.();
    if(type==='map')return;$('panelTitle').textContent=titles[type];$('panelContent').innerHTML='<p class="hint">불러오는 중…</p>';$('panel').showModal();
    if(window.PFCompletionUI?.handles(type)){try{await window.PFCompletionUI.open(type);}catch(e){$('panelContent').textContent=e.message;}return;}
    if(window.PFExploreDiscovery?.handles(type)){try{await window.PFExploreDiscovery.open(type);}catch(e){toast(e.message);}return;}
    if(window.PFWorkspaceUI?.handles(type)){try{await window.PFWorkspaceUI.open(type);}catch(e){$('panelContent').textContent=e.message;}return;}
    if(window.PFExploreTools?.handles(type)){try{await window.PFExploreTools.open(type);}catch(e){$('panelContent').textContent=e.message;}return;}
    if(type==='finance')return finance();
    if(type==='trends'){
      const changed=points.filter(p=>typeof p.capacityMw==='number'&&typeof p.previousCapacityMw==='number'&&p.capacityMw!==p.previousCapacityMw).sort((a,b)=>Math.abs(b.capacityMw-b.previousCapacityMw)-Math.abs(a.capacityMw-a.previousCapacityMw));
      $('panelContent').innerHTML='<p class="hint">같은 현장을 두 번 이상 확인한 결과의 차이입니다. 전국 시장 통계가 아닌 현재 표시 범위의 저장 관측입니다.</p>'+(changed.length?'<table><tr><th>현장</th><th>이전 MW</th><th>현재 MW</th><th>변화 MW</th><th>확인 시각</th></tr>'+changed.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+format(p.previousCapacityMw,2)+'</td><td>'+format(p.capacityMw,2)+'</td><td>'+format(p.capacityMw-p.previousCapacityMw,2)+'</td><td>'+stamp(p.observedAt)+'</td></tr>').join('')+'</table>':'<p class="empty">비교 가능한 용량 변화가 아직 없습니다. 관심 현장의 주기 갱신을 켜면 반복 관측 결과가 쌓입니다. 묶음 지도에서는 확대 후 확인해 주세요.</p>');return;
    }
    if(type==='scenarioCompare'){
      try{const j=await request('/workspace');const cases=j.items.filter(x=>x.type==='scenario').slice(0,4).map(x=>({name:x.name,result:PFExploreFinance.calculate(x.assumptions)}));$('panelContent').innerHTML=cases.length?'<p class="hint">최근 저장한 최대 4개 시나리오 · 가정에 따른 계산 비교</p><table><tr><th>시나리오</th><th>용량 kW</th><th>단가 원/kWh</th><th>IRR %</th><th>NPV 만원</th><th>LCOE 원/kWh</th></tr>'+cases.map(c=>'<tr>'+[c.name,format(c.result.assumptions.kw),format(c.result.assumptions.price),format(c.result.irr),format(c.result.npv/10000,0),format(c.result.lcoe)].map(x=>'<td>'+esc(x)+'</td>').join('')+'</tr>').join('')+'</table>':'<p>사업성 화면에서 시나리오를 먼저 저장해 주세요.</p>';}catch(e){$('panelContent').textContent=e.message;}return;
    }
    if(type==='compare'){
      $('panelContent').innerHTML=compared.length?`<p class="hint">동일한 기준의 현장을 비교하세요. 미확인 값은 0으로 계산하지 않습니다.</p><div class="table-wrap"><table><tr><th>현장</th>${compared.map(p=>'<th>'+esc(p.name)+'</th>').join('')}</tr>${[['접속 여유용량',p=>capacity(p)],['면적 m²',p=>format(p.areaM2)],['분석 점수',p=>format(p.score,0)],['자료 시각',p=>stamp(p.observedAt)],['출처',p=>p.source||'미확인']].map(([label,value])=>'<tr><th>'+label+'</th>'+compared.map(p=>'<td>'+esc(value(p))+'</td>').join('')+'</tr>').join('')}</table></div><div class="toolbar"><button id="exportCompare">CSV 내려받기</button><button id="clearCompare">비교 비우기</button></div>`:'<p class="empty">지도에서 현장을 선택한 뒤 ‘후보 비교에 추가’를 눌러 주세요.</p>';
      if($('clearCompare'))$('clearCompare').onclick=()=>{compared=[];$('compareCount').textContent=0;openPanel('compare');};if($('exportCompare'))$('exportCompare').onclick=()=>csv([['현장','주소','여유용량 MW','기준 시각','출처'],...compared.map(p=>[p.name,p.address,p.capacityMw,stamp(p.observedAt),p.source])],'pathfinder-candidates.csv');return;
    }
    if(type==='sources'){
      const o=sources.osm||{},l=sources.local||{};
      $('panelContent').innerHTML=`<p>지도 이동은 저장된 자료만 읽습니다. SMP·REC는 전력거래소 공개자료를 시간당 수집하며, 날씨는 선택한 현장의 기상청 예보를 요청할 때 수집합니다. 화면이 열려 있는 동안 5분마다 서버 저장본을 확인합니다.</p><table><tr><th>자료</th><th>수집·반영 주기</th><th>최근 성공</th></tr><tr><td>기업·내 분석·전수스캔</td><td>시간당 증분 반영</td><td>${esc(stamp(l.lastSuccess))}</td></tr><tr><td>OSM 변전소·송전선·발전시설 위치</td><td>7일 / 실패 시 다음 날 재시도</td><td>${esc(stamp(o.lastSuccess))}</td></tr><tr><td>관심 현장 실시간 확인</td><td>사용자가 켠 현장만 24시간, 최대 20곳</td><td>각 현장의 결과 기준 시각</td></tr></table><p class="hint">OSM은 공공 편집 지도이며 누락·위치 오차가 있을 수 있습니다. 한전 공식 계통 연결도나 전국 실시간 여유용량 DB가 아닙니다. ${o.error?'최근 OSM 갱신 실패: 이전 성공 자료를 유지하고 있습니다.':''}</p><p>전국 변전소의 공식 여유용량·총용량 일괄 원천과 배전선로 경로 형상은 현재 별도 원천 연동이 필요합니다. 이 항목을 가상 수치로 채우지 않습니다.</p><p>신규 자료 수집 시각과 원천 자료 기준일은 다를 수 있습니다. 현장별 실시간 조회는 기존 RPA·공공 API·로컬 AI를 사용합니다.</p><p><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap contributors · ODbL</a> · VWorld / 국토교통부</p>`;return;
    }
    if(type==='note'){
      const p=cleanSite(selected);$('panelContent').innerHTML=`<p>${esc(p.name)}</p><label for="noteText">현장 관찰 · 연락 진행 · 검토 의견</label><textarea id="noteText" rows="8" maxlength="8000" style="width:100%;margin:12px 0" placeholder="내 라이선스에서만 볼 수 있는 메모입니다."></textarea><button id="saveNote" class="primary">메모 저장</button>`;$('saveNote').onclick=async()=>{const text=$('noteText').value.trim();if(!text)return toast('메모를 입력해 주세요.');if(await saveWorkspace({type:'note',name:p.name,site:p,text}))$('panel').close();};return;
    }
    try{const j=await request('/workspace');workspace=j.items;$('panelContent').innerHTML=workspace.length?workspace.map((w,i)=>`<article class="work-item"><b>${esc(({favorite:'☆ 관심 현장',note:'현장 메모',scenario:'사업성 시나리오'})[w.type])} · ${esc(w.name||'이름 없음')}</b><p class="hint">${esc(stamp(w.updatedAt))}</p>${w.text?'<pre>'+esc(w.text)+'</pre>':''}<div class="toolbar"><button data-open="${i}">${w.type==='scenario'?'시나리오 열기':'지도에서 보기'}</button><button data-remove="${i}">삭제</button></div></article>`).join(''):'<p class="empty">관심 현장, 메모, 사업성 시나리오를 저장하면 여기에 나타납니다.</p>';
      $('panelContent').querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{const w=workspace[+b.dataset.open];if(w.type==='scenario'){scenario={...w.assumptions,scenarioName:w.name,workspaceRef:{id:w.id,revision:w.revision}};if(w.site)selected=w.site;openPanel('finance');}else{$('panel').close();map.setView([w.site.lat,w.site.lng],15);select(w.site);}});
      $('panelContent').querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{try{await request('/workspace/'+encodeURIComponent(workspace[+b.dataset.remove].id),{method:'DELETE'});openPanel('workspace');}catch(e){toast(e.message);}});
    }catch(e){$('panelContent').textContent=e.message;}
  }
  function finance(){
    const defaults=scenario||{kw:100,hours:3.6,capex:1200000,opex:18000,price:160,discount:5,degradation:.5},labels={kw:'설치용량 (kW)',hours:'일평균 발전시간 (h)',capex:'총 투자비 (원/kW)',opex:'연간 운영비 (원/kW)',price:'총 판매단가 (원/kWh)',discount:'할인율 (%)',degradation:'연간 출력저하율 (%)'};
    $('panelContent').innerHTML=`<p class="hint">세전 · 무차입 · 20년 단순 시나리오입니다. 아래 초기값은 계산 예시이며 현재 시세나 견적이 아닙니다. 토지·계통·철거 비용은 총 투자비·운영비에 포함해 입력하세요.</p><div class="form-grid">${Object.keys(labels).map(k=>`<label>${labels[k]}<input id="fin-${k}" type="number" step="any" value="${esc(defaults[k])}"></label>`).join('')}<label>시나리오 이름<input id="scenarioName" value="${esc(selected?.name||'검토 시나리오')}" maxlength="100"></label></div><div class="toolbar"><button id="calculate" class="primary">다시 계산</button><button id="saveScenario">시나리오 저장</button><button id="exportCashflow">현금흐름 CSV</button><button id="exportReport">검토 보고서 HTML</button></div><div class="finance-results" id="financeResults"></div>`;
    let result;
    function calculate(){try{const p={};for(const k of Object.keys(labels))p[k]=Number($('fin-'+k).value);result=PFExploreFinance.calculate(p);scenario=p;const max=Math.max(...result.rows.map(r=>Math.abs(r.cash)),1);$('financeResults').innerHTML=`<div class="cards"><div class="card">IRR<b>${result.irr===null?'산출 불가':format(result.irr,1)+'%'}</b>내부수익률</div><div class="card">NPV<b>${format(result.npv/10000,0)}만원</b>할인율 ${p.discount}%</div><div class="card">LCOE<b>${format(result.lcoe,1)}원</b>할인 발전원가 / kWh</div><div class="card">회수기간<b>${result.payback===null?'20년 내 미회수':format(result.payback,1)+'년'}</b>단순 누적 현금흐름</div></div><p class="hint">연도별 순현금흐름 · 초기 투자 ${format(result.initial/10000,0)}만원</p><div class="sparkbars">${result.rows.map(r=>`<span title="${r.year}년: ${format(r.cash,0)}원" style="height:${Math.max(2,Math.abs(r.cash)/max*100)}%;background:${r.cash<0?'#dc6868':'#2a9c77'}"></span>`).join('')}</div><div class="table-wrap"><table><tr><th>연도</th><th>발전량 kWh</th><th>수입 원</th><th>운영비 원</th><th>순현금 원</th><th>누적 원</th></tr>${result.rows.map(r=>'<tr>'+[r.year,r.kwh,r.revenue,r.expense,r.cash,r.cumulative].map(v=>'<td>'+format(v,0)+'</td>').join('')+'</tr>').join('')}</table></div>`;return result;}catch(e){result=null;$('financeResults').textContent=e.message;return null;}}
    $('calculate').onclick=calculate;$('saveScenario').onclick=()=>{if(calculate())saveWorkspace({type:'scenario',name:$('scenarioName').value,assumptions:scenario,site:selected?cleanSite(selected):null});};
    const compareButton=document.createElement('button');compareButton.textContent='저장 시나리오 비교';compareButton.onclick=()=>openPanel('scenarioCompare');$('saveScenario').parentElement.appendChild(compareButton);
    $('exportCashflow').onclick=()=>{if(calculate())csv([['연도','발전량 kWh','수입 원','운영비 원','순현금 원','누적 원'],[0,0,0,result.initial,-result.initial,-result.initial],...result.rows.map(r=>[r.year,r.kwh,r.revenue,r.expense,r.cash,r.cumulative])],'pathfinder-cashflow.csv');};
    $('exportReport').onclick=()=>{if(!calculate())return;const assumptions=Object.keys(labels).map(k=>esc(labels[k])+': '+esc(scenario[k])).join(' · ');download('<!doctype html><html lang="ko"><meta charset="utf-8"><title>Pathfinder 검토 보고서</title><style>body{font-family:sans-serif;padding:40px;color:#18352a}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #ddd}.cards{display:flex;gap:30px}.card b{display:block}</style><h1>'+esc($('scenarioName').value)+'</h1><p>'+esc(new Date().toLocaleString('ko-KR'))+'</p><p>사용자 가정에 따른 세전 무차입 20년 계산. 실제 가격·수익을 보증하지 않음.</p><p>'+assumptions+'</p>'+$('financeResults').innerHTML+'</html>','pathfinder-feasibility.html','text/html;charset=utf-8');};calculate();
  }
  function measure(kind){measurement=kind;vertices=[];measureLayer.clearLayers();$('measureStatus').textContent=kind==='distance'?'지도를 차례로 눌러 거리를 측정하세요.':'지도를 3번 이상 눌러 면적을 측정하세요.';}
  function mapClick(e){
    if(window.PFExploreDiscovery?.mapClick(e))return;
    if(window.PFExploreTools?.mapClick(e))return;
    if(measurement){vertices.push([e.latlng.lng,e.latlng.lat]);measureLayer.clearLayers();if(vertices.length>1)L.polyline(vertices.map(v=>[v[1],v[0]]),{color:'#167557',weight:3}).addTo(measureLayer);
      if(measurement==='area'&&vertices.length>=3){const ring=[...vertices,vertices[0]];L.polygon(vertices.map(v=>[v[1],v[0]]),{color:'#167557'}).addTo(measureLayer);$('measureStatus').textContent='면적 '+format(turf.area(turf.polygon([ring])),1)+' m² · 지적 측량이 아닌 지도상 근사값';}
      else if(vertices.length>1)$('measureStatus').textContent='거리 '+format(turf.length(turf.lineString(vertices),{units:'kilometers'})*1000,1)+' m · 다음 점을 계속 누를 수 있습니다.';return;}
    select({id:'selected-location',lat:e.latlng.lat,lng:e.latlng.lng,name:'선택 현장',kind:'selection',address:'',source:'지도 선택'});
  }
  async function start(){
    map=L.map('map',{preferCanvas:true,zoomControl:false,minZoom:6,maxZoom:19,maxBounds:[[31.5,123],[39.5,133]]}).setView([36.3,127.5],7);L.control.zoom({position:'bottomright'}).addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);layer=L.layerGroup().addTo(map);measureLayer=L.layerGroup().addTo(map);
    window.PFExploreTools?.init({$,esc,format,stamp,request,post,toast,csv,download,openPanel,select,load,saveWorkspace,cleanSite,studio,map,getSelected:()=>selected,getScenario:()=>scenario,setScenario:p=>scenario=p});
    window.PFExploreDiscovery?.init({$,esc,format,stamp,request,post,toast,csv,download,openPanel,select,load,saveWorkspace,cleanSite,studio,map,getSelected:()=>selected,getScenario:()=>scenario,setScenario:p=>scenario=p});
    window.PFWorkspaceUI?.init({$,esc,format,stamp,request,post,toast,csv,download,openPanel,select,load,saveWorkspace,cleanSite,studio,map,getSelected:()=>selected,getScenario:()=>scenario,setScenario:p=>scenario=p});
    window.PFCompletionUI?.init({$,esc,format,stamp,request,post,toast,csv,download,openPanel,select,load,saveWorkspace,cleanSite,studio,map,getSelected:()=>selected,getScenario:()=>scenario,setScenario:p=>scenario=p});
    if($('ratioBand'))$('ratioBand').onchange=load;
    let timer;map.on('moveend',()=>{clearTimeout(timer);timer=setTimeout(load,350);});map.on('click',mapClick);
    try{const r=await fetch(api+'/api/config/client');config=await r.json();if(!config.vworld_tile_key)throw new Error('지도 키 미설정');function setBase(){if(tiles)map.removeLayer(tiles);const type=$('basemap').value;tiles=L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/'+encodeURIComponent(config.vworld_tile_key)+'/'+type+'/{z}/{y}/{x}.'+(type==='Satellite'?'jpeg':'png'),{maxZoom:19,attribution:'© <a href="https://www.vworld.kr/">VWorld</a> · 국토교통부 · <a href="https://www.openstreetmap.org/copyright">OSM contributors (ODbL)</a>'}).addTo(map);}$('basemap').onchange=()=>{setBase();if(labelsLayer)labelsLayer.bringToFront();if(boundaryLayer)boundaryLayer.bringToFront();};setBase();
      $('mapLabels').onchange=()=>{if(labelsLayer)map.removeLayer(labelsLayer);if($('mapLabels').checked)labelsLayer=L.tileLayer('https://api.vworld.kr/req/wmts/1.0.0/'+encodeURIComponent(config.vworld_tile_key)+'/Hybrid/{z}/{y}/{x}.png',{maxZoom:19}).addTo(map);};
      $('adminBoundary').onchange=()=>{if(boundaryLayer)map.removeLayer(boundaryLayer);const value=$('adminBoundary').value;if(value)boundaryLayer=L.tileLayer.wms('https://api.vworld.kr/req/wms',{layers:value,styles:value,format:'image/png',transparent:true,version:'1.3.0',key:config.vworld_tile_key,domain:location.hostname}).addTo(map);};
      $('cadastral').onchange=()=>{if($('cadastral').checked){cadastral=L.tileLayer.wms('https://api.vworld.kr/req/wms',{layers:'lp_pa_cbnd_bubun',styles:'lp_pa_cbnd_bubun',format:'image/png',transparent:true,version:'1.3.0',key:config.vworld_tile_key,domain:location.hostname}).addTo(map);}else if(cadastral)map.removeLayer(cadastral);};}
    catch(e){toast('배경지도 설정을 읽지 못했습니다. 저장 지점 조회는 계속할 수 있습니다.');}
    $('storedMode').onclick=()=>setMode('stored');$('liveMode').onclick=()=>setMode('live');$('reload').onclick=load;$('layers').onchange=load;$('minMw').onchange=load;$('overload').onchange=load;$('search').onsubmit=e=>{e.preventDefault();load();};
    $('addressSearch').onclick=async()=>{try{const j=await request('/search-address?q='+encodeURIComponent($('query').value));$('query').value='';map.setView([j.item.lat,j.item.lng],16);select(j.item);}catch(e){toast(e.message);}};
    $('resetView').onclick=()=>{$('query').value='';map.setView([36.3,127.5],7);load();};$('toggleList').onclick=()=>{document.body.classList.toggle('list-hidden');const hidden=document.body.classList.contains('list-hidden');$('toggleList').textContent=hidden?'목록 열기':'목록 접기';$('toggleList').setAttribute('aria-expanded',String(!hidden));map.invalidateSize();};
    if(matchMedia('(max-width:700px)').matches){document.body.classList.add('list-hidden');$('toggleList').textContent='목록 열기';$('toggleList').setAttribute('aria-expanded','false');}
    document.querySelectorAll('[data-panel]').forEach(b=>b.onclick=()=>openPanel(b.dataset.panel));$('closePanel').onclick=()=>$('panel').close();$('measureDistance').onclick=()=>measure('distance');$('measureArea').onclick=()=>measure('area');$('measureClear').onclick=()=>{measurement=null;vertices=[];measureLayer.clearLayers();$('measureStatus').textContent='';};$('siteExplore').onclick=()=>{measurement=null;select({id:'selected-location',lat:map.getCenter().lat,lng:map.getCenter().lng,name:'지도 중심 현장',kind:'selection',address:''});toast('지도에서 위치를 선택하고 정확한 주소를 입력하세요.');};
    window.addEventListener('pf-job-progress',e=>{if(e.detail.path!=='/api/explore/refresh')return;if($('refreshStatus'))$('refreshStatus').textContent=(e.detail.status==='queued'?'순서를 기다리는 중':'원천 자료 조회 중')+' · 다른 화면에서도 저장 자료를 탐색할 수 있습니다.';});
    await load();setInterval(()=>{if(!document.hidden)load();},300000);
  }
  start().catch(e=>toast('지도를 시작하지 못했습니다: '+e.message));
})();
