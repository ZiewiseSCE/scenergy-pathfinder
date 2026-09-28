/* One selected location: parcel evidence, nearby observations, next actions. */
(function(){'use strict';
let c,outline,nearby,epoch=0,key='',view='land',radius=3,sort='distance',basis='sites',parcel=null;
const $=id=>c.$(id),e=v=>c.esc(v),f=(v,d=1)=>c.format(v,d),t=v=>c.stamp(v);
const known=v=>typeof v==='number'&&Number.isFinite(v);
const valid=n=>n===epoch&&$('siteInsight');
function clear(){epoch++;key='';parcel=null;outline?.clearLayers();nearby?.clearLayers();}
function fit(bounds){const box=$('detail').getBoundingClientRect(),small=matchMedia('(max-width:1100px)').matches;c.map.fitBounds(bounds,{maxZoom:17,animate:false,paddingTopLeft:[30,45],paddingBottomRight:small?[30,box.height+35]:[box.width+35,40]});}
function parcelCard(item){
 parcel=item;outline.clearLayers();
 if(item.geometry)L.geoJSON(item.geometry,{style:{color:'#2563eb',weight:3,fillOpacity:.14},interactive:false}).addTo(outline);
 const p=c.getSelected();Object.assign(p,{pnu:item.pnu,areaM2:item.areaM2,mode:'land'});
 $('designSite').href=c.studio(p);
 $('landStatus').textContent=item.stale?'저장 자료 · 갱신 시점 확인 필요':'선택 좌표를 포함하는 실제 지적 필지';
 $('landBody').innerHTML='<strong class="parcel-address">'+e(item.address||item.name)+'</strong><dl class="land-facts">'+[['지목',item.landKind||'미제공'],['용도지역',(item.zoning||[]).join(' · ')||'미제공'],['면적',f(item.areaM2,0)+' m²'],['공시지가',f(item.officialPrice,0)+' 원/m²']].map(([a,b])=>'<div><dt>'+e(a)+'</dt><dd>'+e(b)+'</dd></div>').join('')+'</dl><p class="hint">토지특성 기준 '+e(item.characteristicDate||'미제공')+' · 수집 '+e(t(item.fetchedAt))+'<br>'+e(item.source||'VWorld / 국토교통부')+'</p><div class="toolbar"><button id="fitParcel">필지 경계 보기</button><button id="reviewParcel">건물·이격 검토 →</button></div>';
 $('fitParcel').onclick=()=>{const b=L.geoJSON(item.geometry).getBounds();if(b.isValid())fit(b);};
 $('reviewParcel').onclick=()=>c.openPanel('surroundings');
}
function chooseParcels(items){
 outline.clearLayers();parcel=null;
 const p=c.getSelected();delete p.pnu;delete p.areaM2;$('designSite').href=c.studio(p);
 $('landStatus').textContent=items.length?'경계에 여러 필지가 걸립니다. 주소를 확인하고 선택하세요.':'이 위치의 저장 토지정보가 없습니다. 공공자료를 확인해 주세요.';
 $('landBody').innerHTML=items.map((p,i)=>'<button class="result" data-choose-parcel="'+i+'"><strong>'+e(p.address||p.pnu)+'</strong><small>'+e(p.landKind||'지목 미제공')+' · '+f(p.areaM2,0)+' m²</small></button>').join('');
 $('landBody').querySelectorAll('[data-choose-parcel]').forEach(b=>b.onclick=()=>parcelCard(items[+b.dataset.chooseParcel]));
}
async function land(n,p){
 $('siteInsight').innerHTML='<div class="insight-head"><b>선택 부지 정보</b><span>필지 기준</span></div><p id="landStatus" class="hint" role="status">저장된 지적 필지를 확인하고 있습니다…</p><div id="landBody"></div><button class="action" id="readLand">이 위치 공공 토지정보 확인·갱신</button>';
 $('readLand').onclick=async()=>{const button=$('readLand');button.disabled=true;$('landStatus').textContent='지적 경계와 토지특성을 확인하고 있습니다…';try{await c.post('/parcels/refresh',{lat:p.lat,lng:p.lng});if(!valid(n))return;const j=await c.request('/parcel-at?'+new URLSearchParams({lat:p.lat,lng:p.lng}));if(valid(n)){if(j.item)parcelCard(j.item);else chooseParcels(j.items||[]);}}catch(err){if(valid(n))$('landStatus').textContent='토지정보 확인 실패: '+err.message;}finally{if(button.isConnected)button.disabled=false;}};
 try{if(parcel){parcelCard(parcel);return;}const j=await c.request('/parcel-at?'+new URLSearchParams({lat:p.lat,lng:p.lng}));if(!valid(n))return;if(j.item)parcelCard(j.item);else chooseParcels(j.items||[]);}catch(err){if(valid(n))$('landStatus').textContent='저장 자료를 읽지 못했습니다: '+err.message;}
}
function rangeText(ref){return known(ref.availableMw)?f(ref.availableMw,2)+' MW':ref.rangeMw?f(ref.rangeMw.min,2)+'–'+f(ref.rangeMw.max,2)+' MW':'원천 값 미제공';}
function station(p){
 const ref=p.officialCapacity;if(p.kind!=='substation')return '';
 if(ref?.status==='name_reference')return '<div class="station-evidence"><span>동명 한전 변전소 자료</span><strong>'+e(rangeText(ref))+'</strong><small>'+e(ref.name)+' · 코드 '+e(ref.code)+' · 배전자료 '+f(ref.lineCount,0)+'건</small><p class="hint">'+e(ref.basis)+'<br>'+e(t(ref.observedAt))+(ref.rangeMw?'<br>원천 응답 간 값이 달라 범위로 표시합니다.':'')+'</p><button id="stationLines">이 변전소의 공식 배전자료 보기</button></div>';
 return '<p class="station-evidence hint">'+e(p.capacityNote||'한전 자료와 대응되는 명칭을 아직 확인하지 못했습니다.')+'</p>';
}
function rowCard(x,i,official=false){
 const mw=official?(known(x.lineAvailableKw)?x.lineAvailableKw/1000:null):x.availableMw;
 const base=official?null:(known(x.baseKw)?x.baseKw/1000:null);
 const ratio=known(mw)&&known(base)&&base>0?Math.max(0,Math.min(100,mw/base*100)):null;
 const tone=known(mw)?(mw<0?'short':mw===0?'zero':'ample'):'unknown';
 return '<button class="feeder-card '+tone+'" data-feeder="'+i+'"><span class="feeder-heading"><b>'+e(x.substation||'변전소 미제공')+'</b><small>'+(!official&&known(x.distanceKm)?f(x.distanceKm,2)+' km':'공식 저장자료')+'</small></span><span class="feeder-name">⚡ '+e(official?x.line:x.name)+' <small>MTR '+e(x.transformer||'미제공')+'</small></span><span class="feeder-cap"><b>'+e(known(mw)?f(mw,2)+' MW':'용량 미제공')+'</b>'+(known(base)?' / 기준 '+f(base,2)+' MW':'')+'</span>'+(ratio!==null?'<span class="capacity-track"><i style="width:'+ratio+'%"></i></span>':'')+'<small>'+e(official?'선로 코드 '+x.lineCode:x.address||'조회 필지 주소 미제공')+'</small><small>'+e(t(x.observedAt))+'</small></button>';
}
async function grid(n,p,official=false){
 nearby.clearLayers();
 $('siteInsight').innerHTML='<div class="insight-head"><b>'+(official?'공식 배전자료':'주변 배전선로 찾기')+'</b><span id="feederCount">조회 중</span></div>'+(official?'<p class="hint">변전소 코드 '+e(p.officialCapacity.code)+'의 배전자료입니다. 선로의 경로 좌표가 없어 주변 거리로 정렬하지 않습니다.</p>':'<div class="segmented radius-buttons" aria-label="배전 탐색 반경">'+[1,3,5,10].map(r=>'<button data-radius="'+r+'" aria-pressed="'+(r===radius)+'">'+r+' km</button>').join('')+'</div><div class="segmented feeder-sort" aria-label="배전 정렬">'+[['distance','거리순'],['capacity','여유용량순'],['overload','과부하순']].map(([v,l])=>'<button data-sort="'+v+'" aria-pressed="'+(v===sort)+'">'+l+'</button>').join('')+'</div><p class="hint">내 조회·전수스캔의 저장 관측입니다. 거리는 선택 위치에서 <b>조회된 필지</b>까지이며, 실제 선로·접속 거리와 다릅니다.</p>')+'<div id="feederStatus" class="hint" role="status"></div><div id="feederRows"></div>';
 $('siteInsight').querySelectorAll('[data-radius]').forEach(b=>b.onclick=()=>{radius=+b.dataset.radius;render();});
 $('siteInsight').querySelectorAll('[data-sort]').forEach(b=>b.onclick=()=>{sort=b.dataset.sort;render();});
 if(!official){
  const toggle=document.createElement('div');toggle.className='segmented feeder-basis';toggle.setAttribute('aria-label','주변 배전 거리 기준');
  toggle.innerHTML=[['sites','조회 필지 기준'],['stations','변전소 기준']].map(([v,l])=>'<button data-basis="'+v+'" aria-pressed="'+(basis===v)+'">'+l+'</button>').join('');
  $('siteInsight').insertBefore(toggle,$('siteInsight').querySelector('.radius-buttons'));
  toggle.querySelectorAll('button').forEach(b=>b.onclick=()=>{basis=b.dataset.basis;render();});
  if(basis==='stations')$('siteInsight').querySelector('p.hint').innerHTML='주변 지도 변전소와 <b>명칭이 대응된</b> 한전 배전자료입니다. 거리는 <b>변전소까지</b>이며 선로 위치·필지 접속 관계는 미확인입니다.';
 }
 if(!official){const circle=L.circle([p.lat,p.lng],{radius:radius*1000,color:'#087a62',weight:2,fillOpacity:.06,interactive:false}).addTo(nearby);fit(circle.getBounds());}
 try{
 const qs=new URLSearchParams(official?{substationCode:p.officialCapacity.code,limit:500}:{lat:p.lat,lng:p.lng,radiusKm:radius,sort,kind:'distribution_line'});
 const j=await c.request((official?'/distribution?':basis==='stations'?'/grid/nearby-substations?':'/grid/search?')+qs);if(!valid(n))return;
 $('feederCount').textContent=f(j.total,0)+(official||basis==='stations'?'건':'개 관측');
 $('feederStatus').textContent=(j.truncated||official&&j.total>j.items.length?'표시 한도에 도달했습니다. ':'')+(j.stale?'갱신 시점을 확인하세요. ':'')+(j.unverifiedSites?'주소 대응 미확인 관측 '+j.unverifiedSites+'곳 제외.':'');
 $('feederRows').innerHTML=j.items.length?j.items.map((x,i)=>rowCard(x,i,official)).join(''):'<div class="insight-empty"><b>이 반경에 저장된 배전 관측이 없습니다.</b><p>실제 배전선로가 없다는 뜻은 아닙니다. 반경을 넓히거나 이 현장을 조회해 연결 정보를 쌓으세요.</p><button id="emptyLive">이 현장 조회로 이동</button><button id="emptyOfficial">전국 공식 배전자료</button></div>';
 if($('emptyLive'))$('emptyLive').onclick=()=>{view='actions';render();};
 if($('emptyOfficial'))$('emptyOfficial').onclick=()=>c.openPanel('distribution');
 if($('emptyLive')&&basis==='sites'){const button=document.createElement('button');button.textContent='주변 변전소 배전자료 보기';button.onclick=()=>{basis='stations';render();};$('feederRows').querySelector('.insight-empty').append(button);}
 const markers=[];
 if(!official)for(const [i,x] of j.items.entries()){const marker=L.circleMarker([x.lat,x.lng],{radius:6,color:'#fff',weight:2,fillColor:known(x.availableMw)?x.availableMw>0?'#087a62':'#c44848':'#8795a2',fillOpacity:1,bubblingMouseEvents:false}).bindTooltip(e(x.name)+' · '+(basis==='stations'?'변전소':'조회 필지')+' '+f(x.distanceKm,2)+' km').on('click',()=>highlight(i,false)).addTo(nearby);markers.push(marker);}
 function highlight(i,pan=true){const x=j.items[i];$('feederRows').querySelectorAll('[data-feeder]').forEach(b=>b.setAttribute('aria-pressed',String(+b.dataset.feeder===i)));const b=$('feederRows').querySelector('[data-feeder="'+i+'"]');b?.scrollIntoView({block:'nearest'});if(!official){markers[i]?.openTooltip();if(pan){const box=$('detail').getBoundingClientRect();c.map.setView([x.lat,x.lng],15,{animate:false});c.map.panBy(matchMedia('(max-width:1100px)').matches?[0,box.height/2]:[box.width/2,0],{animate:false});}}$('feederStatus').textContent=official?'선로 '+x.line+' · 원천 제공 코드 '+x.lineCode:'선택 관측: '+(x.address||x.siteName)+' · '+(x.warning||'조회 당시 계통 응답입니다. 현재 접속 여부는 해당 필지를 다시 확인하세요.');}
 $('feederRows').querySelectorAll('[data-feeder]').forEach(b=>b.onclick=()=>highlight(+b.dataset.feeder));
 }catch(err){if(valid(n)){$('feederCount').textContent='조회 실패';$('feederStatus').textContent=err.message;}}
}
function render(){
 const n=++epoch,p=c.getSelected();if(!p||!$('siteInsight'))return;
 const reference=$('detail').querySelector('.station-evidence');if(reference)reference.hidden=view!=='land';
 $('siteTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.siteView===view)));
 $('siteAdvanced').hidden=view!=='actions';$('siteInsight').hidden=view==='actions';
 nearby.clearLayers();
 if(view==='land')land(n,p);else if(view==='grid')grid(n,p);else if(view==='official')grid(n,p,true);
}
window.PFExploreSite={clear,init(ctx){c=ctx;outline=L.layerGroup().addTo(c.map);nearby=L.layerGroup().addTo(c.map);},
 handles:type=>type==='parcel'||type==='gridSearch',open(type){if(!c.getSelected()){const p=c.map.getCenter();c.select({kind:'selection',name:'지도 중심 현장',address:'',lat:p.lat,lng:p.lng});}view=type==='gridSearch'?'grid':'land';$('detail').hidden=false;render();},
 detail(p){
  const nextKey=p.lat+','+p.lng;if(nextKey!==key){clear();key=nextKey;view='land';radius=3;sort='distance';basis='sites';}
  const advanced=document.createElement('div');advanced.id='siteAdvanced';
  const start=$('detail').querySelector('.saved-heading');let node=start;
  while(node){const next=node.nextSibling;advanced.append(node);node=next;}
  $('detail').append(advanced);
  const wrap=document.createElement('section');wrap.className='site-workflow';wrap.innerHTML=station(p)+'<div class="site-tabs" id="siteTabs" aria-label="현장 검토 단계"><button data-site-view="land">① 부지 정보</button><button data-site-view="grid">② 주변 배전</button><button data-site-view="actions">③ 검토·활용</button></div><div id="siteInsight"></div>';
  $('detail').insertBefore(wrap,$('detail').querySelector('.site-next'));
  $('siteTabs').querySelectorAll('button').forEach(b=>b.onclick=()=>{view=b.dataset.siteView;render();$('detail').scrollTop=0;});
  if($('stationLines'))$('stationLines').onclick=()=>{view='official';render();};
  render();
 }
};
})();
