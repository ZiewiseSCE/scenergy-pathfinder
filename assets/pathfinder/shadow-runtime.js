/* Public-source roof shadow model. No synthetic obstacle or success fallback. */
(function(){'use strict';
  const api=window.ShadowSim;if(!api)return;
  const fetcher=api.OSMFetcher,engine=api.ShadowEngine;
  const pending=new Map();
  fetcher.fetch=async function(lat,lng,radius=500){
    const key=[lat,lng,radius].join(',');if(pending.has(key))return pending.get(key);
    const task=(async()=>{try{
      const base=window.BACKEND_URL||(typeof BACKEND_URL!=='undefined'?BACKEND_URL:location.origin);
      const response=await fetch(new URL('/api/shadow/sources',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat,lng,radius})});
      const payload=await response.json();
      if(!response.ok||!payload.ok||payload.data?._sourceStatus!=='complete')throw new Error(payload.message||payload.error||'장애물 원천 조회 실패');
      return payload.data;
    }catch(error){return {buildings:[],trees:[],_failed:true,error:error.message};}})();
    pending.set(key,task);try{return await task;}finally{pending.delete(key);}
  };
  function buildingFeature(b){return b.geometry?turf.feature(b.geometry):turf.polygon([b.coords.map(p=>[p.lng,p.lat])]);}
  engine.prepareModel=function(source,panels,options={}){
    if(source?._failed||source?._sourceStatus!=='complete'||!source.buildings?.length)throw new Error('주변 건물 원천자료 미확인');
    const roof=options.mode==='roof',fallback=Number(options.receiverHeightM),buildings=source.buildings.map(b=>({b,f:buildingFeature(b)}));
    if(roof&&(!Number.isFinite(fallback)||fallback<=0))throw new Error('지붕 분석 기준 높이 미확인');
    const groups=new Map(),hosts=new Set();let matched=0,ambiguous=0;
    for(const panel of panels.features){
      const point=turf.centroid(panel);
      const candidates=roof?buildings.filter(x=>turf.booleanPointInPolygon(point,x.f)).sort((a,b)=>turf.area(a.f)-turf.area(b.f)):[];
      const host=candidates[0]?.b;
      // A higher footprint covering the same receiving point cannot be treated
      // as an external shadow caster without resolving the conflicting roofs.
      if(host&&candidates.some(x=>x.b.height>host.height+.5))ambiguous++;
      if(host){matched++;hosts.add(host.id);}
      // Public building height is a reference plane, not a measured roof face.
      const height=roof?(host?.height??fallback):0;
      const key=height.toFixed(3)+'|'+(host?.id||'unmatched');if(!groups.has(key))groups.set(key,{height,hostId:host?.id,panels:[]});groups.get(key).panels.push(panel);
    }
    if(ambiguous){const error=new Error('공공 건물 경계·높이가 중복되어 패널 '+ambiguous+'장의 지붕 기준 높이를 확정할 수 없습니다. 중복 건물·높이 자료 확인 필요.');error.code='roof_height_conflict';throw error;}
    const model={mode:roof?'roof':'land',method:'public-obstacle-horizontal-plane-v1',
      panelCount:panels.features.length,matchedRoofPanels:matched,fallbackRoofPanels:roof?panels.features.length-matched:0,
      receiverHeightMinM:Math.min(...[...groups.values()].map(g=>g.height)),receiverHeightMaxM:Math.max(...[...groups.values()].map(g=>g.height)),
      excludedHostBuildings:hosts.size,source:source.provenance||null,
      note:'공공 건물 기재 높이를 수평 수광면으로 적용한 주변 장애물 모델. 실측 지붕면·지형·옥상 설비·패널 상호 음영은 미반영.'};
    if(model.fallbackRoofPanels)model.note+=' 건물 경계와 매칭되지 않은 패널은 화면의 건물 높이 '+fallback+'m 가정을 적용했습니다.';
    return {...source,_model:model,_groups:[...groups.values()].map(g=>({height:g.height,panels:{type:'FeatureCollection',features:g.panels},
      obstacles:{buildings:source.buildings.filter(b=>b.id!==g.hostId&&b.height>g.height).map(b=>({...b,height:b.height-g.height})),
                 trees:source.trees.filter(t=>t.height>g.height).map(t=>({...t,height:t.height-g.height}))}}))};
  };
  function planarArea(feature){
    function ringArea(r){let a=0;for(let i=1;i<r.length;i++)a+=r[i-1][0]*r[i][1]-r[i][0]*r[i-1][1];return Math.abs(a)/2;}
    function area(rings){return Math.max(0,ringArea(rings[0])-rings.slice(1).reduce((s,r)=>s+ringArea(r),0));}
    const g=feature.geometry;return g.type==='Polygon'?area(g.coordinates):g.coordinates.reduce((s,p)=>s+area(p),0);
  }
  engine._buildAllShadows=function(lat,lng,source,sun){
    if(source._groups)return source._groups.flatMap(g=>this._buildAllShadows(lat,lng,g.obstacles,sun));
    const shadows=[];
    for(const b of source.buildings||[]){
      const parts=b.geometry?(b.geometry.type==='MultiPolygon'?b.geometry.coordinates:[b.geometry.coordinates]):[ [b.coords.map(p=>[p.lng,p.lat])] ];
      for(const rings of parts){const shadow=this.buildingShadow(rings[0].map(p=>({lng:p[0],lat:p[1]})),b.height,sun);if(shadow)shadows.push(shadow);}
    }
    for(const t of source.trees||[]){const shadow=t.type==='tree'?this.treeShadow(t.lat,t.lng,t.height,3,sun):this.buildingShadow(t.coords,t.height,sun);if(shadow)shadows.push(shadow);}
    return shadows;
  };
  engine.calcShadingRatio=function(panels,shadows){
    if(!panels?.features?.length||!Array.isArray(shadows))throw new Error('음영 계산 입력 미확인');
    const origin=turf.centroid(panels).geometry.coordinates,sx=111320*Math.cos(origin[1]*Math.PI/180),sy=110540;
    function project(feature){const out=JSON.parse(JSON.stringify(feature));turf.coordEach(out,c=>{c[0]=Math.round((c[0]-origin[0])*sx*1000)/1000;c[1]=Math.round((c[1]-origin[1])*sy*1000)/1000;});return turf.cleanCoords(out);}
    const local=panels.features.map(project),total=local.reduce((s,p)=>s+planarArea(p),0);
    if(!Number.isFinite(total)||total<=0)throw new Error('패널 면적 미확인');if(!shadows.length)return 0;
    const box=turf.bbox(turf.featureCollection(local)),overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
    const nearby=shadows.map(s=>project(turf.polygon([s]))).filter(s=>overlaps(turf.bbox(s),box));
    if(!nearby.length)return 0;
    // Turf 7 takes a FeatureCollection. Do not retry an obsolete API signature,
    // which hid the original geometry error behind "at least 2 geometries".
    const union=nearby.length===1?nearby[0]:turf.union(turf.featureCollection(nearby));
    if(!union)throw new Error('장애물 그림자 병합 실패');
    const ub=turf.bbox(union);let shaded=0;
    for(const p of local){if(!overlaps(turf.bbox(p),ub))continue;const hit=turf.intersect(turf.featureCollection([p,union]));if(hit)shaded+=planarArea(hit);}
    if(!Number.isFinite(shaded))throw new Error('음영 계산 결과 미확인');return Math.min(1,Math.max(0,shaded/total));
  };
  const originalDaily=engine.calcDailyShading;
  engine.calcInstantShading=function(lat,lng,panels,source,sun){
    if(!source._groups)return this.calcShadingRatio(panels,this._buildAllShadows(lat,lng,source,sun));
    const total=panels.features.reduce((s,p)=>s+turf.area(p),0);
    return source._groups.reduce((sum,g)=>sum+g.panels.features.reduce((s,p)=>s+turf.area(p),0)/total*this.calcShadingRatio(g.panels,this._buildAllShadows(lat,lng,g.obstacles,sun)),0);
  };
  engine.calcDailyShading=function(lat,lng,date,panels,source){
    if(!source._groups)return originalDaily.call(this,lat,lng,date,panels,source);
    const groups=source._groups,total=panels.features.reduce((s,p)=>s+turf.area(p),0),times=api.SunCalc.getSunTimes(lat,lng,date),result=[];
    for(let hour=Math.ceil(times.sunrise);hour<=Math.floor(times.sunset);hour+=.5){
      const sun=api.SunCalc.getPosition(lat,lng,date,hour);if(sun.elevation<=0)continue;
      const ratio=this.calcInstantShading(lat,lng,panels,source,sun);
      result.push({hour,elevation:sun.elevation,azimuth:sun.azimuth,shadingRatio:ratio,effectiveSun:1-ratio});
    }
    return result;
  };
  const record=window.recordCompletedShadowAnalysis;
  if(record)window.recordCompletedShadowAnalysis=function(results,source,panels){
    const value=record(results,source,panels);if(value)value._analysis.model=source._model||null;return value;
  };
  if(api.ShadowViz)api.ShadowViz.autoAnalyzeAll=async function(){
    if(!this._osmData||!this._panelsFC?.features?.length)return;
    this.stop();const source=this._osmData,panels=this._panelsFC,results={};
    try{for(const season of ['spring','summer','fall','winter']){
      await new Promise(r=>setTimeout(r,30));if(this._osmData!==source||this._panelsFC!==panels)return;
      const daily=engine.calcDailyShading(this._lat,this._lng,api.SunCalc.getSeasonDate(season,new Date().getFullYear()),panels,source);
      const total=daily.length*.5,effective=daily.reduce((s,d)=>s+.5*d.effectiveSun,0);
      if(!total||!Number.isFinite(effective))throw new Error('일사 계산 자료 부족');
      results[season]={totalSunHours:total,effectiveSunHours:Math.round(effective*100)/100,avgShadingPct:Math.round((1-effective/total)*1000)/10};
    }
    const value=window.recordCompletedShadowAnalysis?.(results,source,panels);if(value){this._renderSeasonalReport(value);api.ShadowReport.render(value,window.currentAnalysisData?.solar_opt?.sun_hours);}
    }catch(error){window.recordUnavailableShadowAnalysis?.(error.code==='roof_height_conflict'?error.code:'analysis_failed',source,panels);api.ShadowReport.render(null,null);}
  };
  const render=api.ShadowReport.render;
  api.ShadowReport.render=function(results,base){
    if(!results?._analysis?.model)return render.call(this,results,base);
    const value=render.call(this,results,base),container=document.getElementById('shadowReportContainer');
    if(container){
      const m=results._analysis.model,p=m.source,escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const keys=['spring','summer','fall','winter'],labels=['춘분','하지','추분','동지'];
      const avg=keys.reduce((s,k)=>s+results[k].avgShadingPct,0)/4;
      container.innerHTML='<div class="bg-slate-800/80 rounded-xl p-4 border border-slate-600/50"><h3 class="text-cyan-300 font-bold text-sm mb-3">공공자료 기반 음영 모델 · 가정 포함</h3><p>4계절 대표일 평균 '+avg.toFixed(1)+'% · 계산 완료</p><div class="grid grid-cols-4 gap-2 mt-3">'+keys.map((k,i)=>'<div>'+labels[i]+'<br><b>'+results[k].avgShadingPct.toFixed(1)+'%</b></div>').join('')+'</div><p class="text-xs mt-3">'+escape(m.note)+'</p><p class="text-xs">실제 현장 전체 음영률·연간 발전량 손실·실효 일사량: 미확인. 재무표는 지역 일사량 기준이며 이 면적 음영률을 발전 손실률로 적용하지 않습니다.</p><p class="text-xs">건물 '+results._analysis.sourceCounts.buildings+'동 · 수목/산림 '+results._analysis.sourceCounts.trees+'건 · 조회 '+(p?.radiusM||500)+'m · 분석 '+escape(results._analysis.completedAt)+'</p><p class="text-xs">'+escape((p?.warnings||[]).join(' '))+'</p></div>';
    }
    return value;
  };
  const show=window.SolarSim3D?.show3dShadowReport;
  if(show)window.SolarSim3D.show3dShadowReport=function(results){show.call(this,results);const avg=document.getElementById('sim3dShadowAvg');if(avg&&results?._analysis?.model){const n=['spring','summer','fall','winter'].reduce((s,k)=>s+results[k].avgShadingPct,0)/4;avg.textContent='대표일 평균 '+n.toFixed(1)+'% · 공공자료 모델';}};
})();
