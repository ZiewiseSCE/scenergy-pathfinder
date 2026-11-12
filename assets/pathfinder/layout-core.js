(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PFLayout=api;})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const VERSION='layout-v1', ENGINE='strict-layout-1', EPS=1e-7;
  function number(value,name,min,max){
    if(value===''||value===null||typeof value==='boolean')throw new Error(name+' 값을 입력하세요.');
    const n=Number(value);if(!Number.isFinite(n)||n<min||n>max)throw new Error(name+' 범위: '+min+' ~ '+max);return n;
  }
  function spec(p){if(!Number.isInteger(Number(p.stackRows??1)))throw new Error('단수는 정수여야 합니다.');return {
    widthM:number(p.widthM,'모듈 가로',.05,20),heightM:number(p.heightM,'모듈 세로',.05,20),powerW:number(p.powerW,'출력',1,3000),
    tiltDeg:number(p.tiltDeg,'경사',0,80),rowGapM:number(p.rowGapM,'열간격',0,100),sideGapM:number(p.sideGapM,'옆간격',0,100),
    setbackM:number(p.setbackM,'이격',0,100),stackRows:number(p.stackRows??1,'단수',1,30),
    orientation:p.orientation==='landscape'?'landscape':'portrait',alignment:p.alignment==='roof'?'roof':'south',
    ...(p.marginPct===undefined||p.marginPct===null||p.marginPct===''?{}:{marginPct:number(p.marginPct,'이격 여유율',0,MARGIN_MAX)}),
    ...(p.shadeGapM===undefined||p.shadeGapM===null||p.shadeGapM===''?{}:{shadeGapM:number(p.shadeGapM,'그림자 간격',0,100)}),
    ...aisle(p,'aisleM','aisleEvery','통로'),...aisle(p,'rowAisleM','rowAisleEvery','앞뒤 통로')};}
  // Walk aisles of the margin rule: `every` modules (or row bands), then an aisle `width` m wide. Absent or 0: none.
  function aisle(p,width,every,name){const n=p[every];if(n===undefined||n===null||n===''||Number(n)===0)return {};
    if(!Number.isInteger(Number(n)))throw new Error(name+' 간격은 정수여야 합니다.');return {[width]:number(p[width],name+' 폭',0,10),[every]:number(n,name+' 간격',1,1000)};}
  // Sales layout rule (2026-11-12, owner: modules not packed edge to edge, a shade pitch and walk aisles): modules
  // stand in joined arrays (2 cm clamp gap) and 이격 여유율 becomes straight walk aisles (about 0.6~1 m) between
  // them, so the modules cover (100 - pct)% of the field the rows leave. Tilted rows (racks on a flat roof, land)
  // also keep the winter shade pitch between rows, and their aisles cross the rows. A module flush on its roof
  // (mode 'flush': tilt = roof slope) or a flat (0°) layout has no shade pitch: its aisles run both ways, the share
  // split evenly. The fill still reaches the boundary (no setback). pf_sales_params.margin_gaps is the server twin.
  const MARGIN_DEFAULT=10, MARGIN_MAX=40, SUN_ALTITUDE_DEG=30, CLAMP_GAP_M=.02, AISLE_MIN_M=.6, AISLE_TARGET_M=.8;
  // Modules of `size` in a line leave `share` of it free: blocks of `every` modules with clamp gaps and an aisle after
  // each block, the aisle nearest 0.8 m that is at least 0.6 m. A share too small for such an aisle is a uniform gap.
  function aisleLine(size,share){
    if(share<=0)return {gap:0,every:0,aisle:0};
    const free=size*share/(1-share);
    if(free<=CLAMP_GAP_M+1e-9)return {gap:free,every:0,aisle:0};
    const grow=free-CLAMP_GAP_M,every=Math.max(1,Math.ceil((AISLE_MIN_M-CLAMP_GAP_M)/grow-1e-9),Math.round((AISLE_TARGET_M-CLAMP_GAP_M)/grow));
    return {gap:CLAMP_GAP_M,every,aisle:every*grow+CLAMP_GAP_M};
  }
  function marginGaps(p,mode){
    const pct=number(p.marginPct??MARGIN_DEFAULT,'이격 여유율',0,MARGIN_MAX),tilt=number(p.tiltDeg,'경사',0,80)*Math.PI/180;
    if(!Number.isInteger(Number(p.stackRows??1)))throw new Error('단수는 정수여야 합니다.');
    const rows=number(p.stackRows??1,'단수',1,30),landscape=p.orientation==='landscape';
    const w=number(landscape?p.heightM:p.widthM,'모듈 크기',.05,20),slope=number(landscape?p.widthM:p.heightM,'모듈 크기',.05,20);
    const H=rows*slope*Math.cos(tilt),d=pct/100;
    const sun=number(p.sunAltitudeDeg??SUN_ALTITUDE_DEG,'태양고도',10,60)*Math.PI/180;
    const shade=mode!=='flush'&&tilt>0?rows*slope*Math.sin(tilt)/Math.tan(sun):0,mm=v=>Math.round(v*1000)/1000;
    const share=shade>0?d:1-Math.sqrt(1-d),x=aisleLine(w,share),y=shade>0?{gap:shade,every:0,aisle:0}:aisleLine(H,share);
    return {marginPct:pct,rowGapM:mm(y.gap),sideGapM:mm(x.gap),setbackM:0,shadeGapM:mm(shade),aisleM:mm(x.aisle),aisleEvery:x.every,rowAisleM:mm(y.aisle),rowAisleEvery:y.every};
  }
  // Share of the field the module lattice covers (modules, gaps, aisles and the shade pitch): what an area estimate
  // multiplies by before the shape loss. pf_sales_params.lattice_share is the server twin.
  function latticeShare(p){p=spec(p);const landscape=p.orientation==='landscape',w=landscape?p.heightM:p.widthM,H=Math.floor(p.stackRows)*(landscape?p.widthM:p.heightM)*Math.cos(p.tiltDeg*Math.PI/180);
    const line=(size,gap,every,aisle)=>every?every*size/(every*(size+gap)-gap+aisle):size/(size+gap);
    return line(w,p.sideGapM,p.aisleEvery||0,p.aisleM||0)*line(H,p.rowGapM,p.rowAisleEvery||0,p.rowAisleM||0);}
  function withMargin(p,mode){return spec({...p,...marginGaps(p,mode)});}
  // The margin rule's spacing in words (pf_sales_params.gap_text is the twin): '통로 78cm(모듈 3장마다) · 앞뒤 줄 간격
  // 68cm(겨울 그림자) · 모듈 사이 2cm'; short for a caption or a stat: '통로 78cm·3장마다 · 앞뒤 68cm'.
  const length=m=>m<.995?Math.round(m*100)+'cm':m.toFixed(1)+'m';
  function gapText(p,short){const parts=[];
    if(p.aisleEvery)parts.push(short?'통로 '+length(p.aisleM)+'·'+p.aisleEvery+'장마다':'통로 '+length(p.aisleM)+'(모듈 '+p.aisleEvery+'장마다)');
    if(p.rowAisleEvery)parts.push(short?'앞뒤 통로 '+length(p.rowAisleM)+'·'+p.rowAisleEvery+'줄마다':'앞뒤 통로 '+length(p.rowAisleM)+'('+p.rowAisleEvery+'줄마다)');
    // A layout saved before the aisle rule has no shadeGapM: a row gap above the module gap was the shade pitch.
    const shade=p.shadeGapM??(!p.rowAisleEvery&&p.rowGapM-(p.sideGapM||0)>.001?p.rowGapM:0);
    if(shade>0)parts.push(short?'앞뒤 '+length(p.rowGapM):'앞뒤 줄 간격 '+length(p.rowGapM)+'(겨울 그림자)');
    const side=p.sideGapM||0;if(side>0&&!(short&&p.aisleEvery))parts.push(p.aisleEvery?'모듈 사이 '+length(side):'모듈 간격 약 '+length(side));
    return parts.join(' · ')||'간격 없음';}
  function cross(a,b,c){return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
  function on(a,b,p){return Math.abs(cross(a,b,p))<EPS&&p[0]>=Math.min(a[0],b[0])-EPS&&p[0]<=Math.max(a[0],b[0])+EPS&&p[1]>=Math.min(a[1],b[1])-EPS&&p[1]<=Math.max(a[1],b[1])+EPS;}
  function ringContains(r,p){let inside=false;for(let i=0,j=r.length-1;i<r.length;j=i++){
    if(on(r[j],r[i],p))return 0;
    if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])inside=!inside;
  }return inside?1:-1;}
  function properCross(a,b,c,d){return cross(a,b,c)*cross(a,b,d)<-EPS&&cross(c,d,a)*cross(c,d,b)<-EPS;}
  function inside(rings,rect){
    if(!rect.every(p=>ringContains(rings[0],p)>=0&&rings.slice(1).every(r=>ringContains(r,p)<=0)))return false;
    for(const ring of rings){for(let j=0;j<ring.length-1;j++)for(let i=0;i<4;i++)if(properCross(rect[i],rect[(i+1)%4],ring[j],ring[j+1]))return false;}
    // A small hole completely enclosed by a module must also reject it.
    if(rings.slice(1).some(r=>r.some(p=>ringContains(rect,p)>0)))return false;
    // A notch may enter through an edge without a proper segment crossing
    // (both mouth vertices touch that edge). Corners/midpoints alone miss it.
    if(rings[0].some(p=>ringContains(rect,p)>0))return false;
    // Concave boundary vertices can touch rectangle edges; check edge midpoints too.
    return rect.every((p,i)=>{const q=rect[(i+1)%4],m=[(p[0]+q[0])/2,(p[1]+q[1])/2];return ringContains(rings[0],m)>=0&&rings.slice(1).every(r=>ringContains(r,m)<=0);});
  }
  function overlaps(a,b){
    for(const poly of [a,b])for(let i=0;i<4;i++){
      const q=poly[(i+1)%4],p=poly[i],axis=[q[1]-p[1],p[0]-q[0]],aa=a.map(v=>v[0]*axis[0]+v[1]*axis[1]),bb=b.map(v=>v[0]*axis[0]+v[1]*axis[1]);
      if(Math.max(...aa)<=Math.min(...bb)+EPS||Math.max(...bb)<=Math.min(...aa)+EPS)return false;
    }return true;
  }
  function geometry(input){const g=input?.type==='Feature'?input.geometry:input;if(!g||!['Polygon','MultiPolygon'].includes(g.type))throw new Error('Polygon 또는 MultiPolygon이 필요합니다.');
    let count=0;const parts=g.type==='Polygon'?[g.coordinates]:g.coordinates;
    if(!Array.isArray(parts)||!parts.length)throw new Error('영역이 없습니다.');
    for(const rings of parts){if(!Array.isArray(rings)||!rings.length)throw new Error('영역이 없습니다.');for(const ring of rings){
      if(!Array.isArray(ring)||ring.length<4||ring[0][0]!==ring.at(-1)[0]||ring[0][1]!==ring.at(-1)[1])throw new Error('닫힌 경계가 필요합니다.');
      for(const p of ring){number(p[0],'경도',-180,180);number(p[1],'위도',-85,85);count++;}
    }}if(count>10000)throw new Error('경계 꼭짓점은 최대 10,000개입니다.');return g;
  }
  function prepare(g,p,turf,keepouts=[]){
    g=geometry(g);if(!turf||!turf.booleanValid)throw new Error('배치 계산 라이브러리 로딩 실패');
    let f=turf.feature(g);if(!turf.booleanValid(f)||turf.kinks(f).features.length)throw new Error('교차하거나 유효하지 않은 경계입니다.');
    if(!Array.isArray(keepouts)||keepouts.length>100)throw new Error('제외 영역은 최대 100개입니다.');
    for(const k of keepouts){const hole=turf.feature(geometry(k));if(!turf.booleanValid(hole)||turf.kinks(hole).features.length)throw new Error('제외 영역 경계를 확인하세요.');f=turf.difference(turf.featureCollection([f,hole]));if(!f)return [];}
    if(p.setbackM>0){f=turf.buffer(f,-p.setbackM,{units:'meters',steps:8});if(!f?.geometry)return [];}
    return f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
  }
  function projection(rings,alignment){
    const points=rings[0].slice(0,-1),lng=points.reduce((s,p)=>s+p[0],0)/points.length,lat=points.reduce((s,p)=>s+p[1],0)/points.length;
    const sx=111320*Math.cos(lat*Math.PI/180),sy=111000;
    let angle=0,longest=0;
    if(alignment==='roof')for(let i=0;i<points.length;i++){const next=points[(i+1)%points.length],dx=(next[0]-points[i][0])*sx,dy=(next[1]-points[i][1])*sy,d=dx*dx+dy*dy;
      // Polygon winding/start vertex must not reverse a module's tilt direction.
      const a=((Math.atan2(dy,dx)+Math.PI/2)%Math.PI+Math.PI)%Math.PI-Math.PI/2;
      if(d>longest+EPS||(Math.abs(d-longest)<=EPS&&a<angle)){longest=d;angle=a;}}
    const c=Math.cos(angle),s=Math.sin(angle);
    const forward=p=>{const x=(p[0]-lng)*sx,y=(p[1]-lat)*sy;return [x*c+y*s,-x*s+y*c];};
    const inverse=p=>[(p[0]*c-p[1]*s)/sx+lng,(p[0]*s+p[1]*c)/sy+lat];
    return {rings:rings.map(r=>r.map(forward)),forward,inverse,angle};
  }
  function packRectangles(cells){
    const remaining=new Map(cells.map(c=>[c.x+','+c.y,c])),features=[];let groups=0;
    // Work on connected components so distant small islands do not inflate the
    // histogram. Every emitted array is a complete rectangle, at least 2 x 2.
    while(remaining.size){const seed=remaining.values().next().value,component=[seed];remaining.delete(seed.x+','+seed.y);
      for(let i=0;i<component.length;i++){const c=component[i];for(const [x,y] of [[c.x-1,c.y],[c.x+1,c.y],[c.x,c.y-1],[c.x,c.y+1]]){const key=x+','+y,next=remaining.get(key);if(next){component.push(next);remaining.delete(key);}}}
      if(component.length<4)continue;
      const minX=Math.min(...component.map(c=>c.x)),maxX=Math.max(...component.map(c=>c.x)),minY=Math.min(...component.map(c=>c.y)),maxY=Math.max(...component.map(c=>c.y)),width=maxX-minX+1,height=maxY-minY+1;
      if(width<2||height<2)continue;
      const grid=Array.from({length:height},()=>Array(width).fill(null));for(const c of component)grid[c.y-minY][c.x-minX]=c;
      for(;;){const heights=Array(width).fill(0);let best=null;
        for(let y=0;y<height;y++){const stack=[];for(let x=0;x<=width;x++){
          const h=x===width?0:(heights[x]=grid[y][x]?heights[x]+1:0);let start=x;
          while(stack.length&&stack.at(-1).h>h){const top=stack.pop(),w=x-top.x;start=top.x;if(top.h>=2&&w>=2&&(!best||w*top.h>best.area))best={x:top.x,y:y-top.h+1,w,h:top.h,area:w*top.h};}
          if(h&&(!stack.length||stack.at(-1).h<h))stack.push({x:start,h});
        }}
        if(!best)break;
        const id='array-'+(++groups);
        for(let row=0;row<best.h;row++)for(let col=0;col<best.w;col++){const y=best.y+row,x=best.x+col,f=grid[y][x].feature;Object.assign(f.properties,{arrayId:id,arrayRow:row,arrayColumn:col,arrayRows:best.h,arrayColumns:best.w});features.push(f);grid[y][x]=null;}
      }
    }
    return {features,groups};
  }
  // ---- User exclusion zones (설치 제외 영역) ----------------------------------------------------------------
  // A free-hand stroke becomes a small valid polygon. Few vertices keep the fill fast (a 300-vertex zone cost
  // about five times a 40-vertex one). A zone the engine or the server contract would reject is never returned.
  const ZONE_MAX=100,ZONE_VERTEX_MAX=64,PATH_VERTEX_MAX=24,ZONE_MIN_AREA_M2=.2,ZONE_TOLERANCE_M=.15,PATH_WIDTH_MIN=.3,PATH_WIDTH_MAX=5,PATH_WIDTH_DEFAULT=1;
  const ZONE_TEXT={small:'제외 영역이 너무 작습니다. 0.2㎡ 이상으로 다시 그려 주세요.',short:'선이 너무 짧습니다. 지도 위를 누른 채 끌어서 경로를 그려 주세요.',
    shape:'제외 영역 모양을 인식하지 못했습니다. 선이 겹치지 않게 다시 그려 주세요.',width:'경로 폭은 '+PATH_WIDTH_MIN+' ~ '+PATH_WIDTH_MAX+' m 범위로 입력하세요.',kind:'제외 영역 종류를 확인하세요.'};
  // Douglas-Peucker on local metres (entries are [x, y, ...]); end points are kept.
  function simplifyOpen(points,tolerance){
    if(points.length<3)return points.slice();
    const keep=new Uint8Array(points.length),stack=[[0,points.length-1]];keep[0]=keep[points.length-1]=1;
    while(stack.length){const [a,b]=stack.pop(),ax=points[a][0],ay=points[a][1],dx=points[b][0]-ax,dy=points[b][1]-ay,len=dx*dx+dy*dy;let worst=0,index=-1;
      for(let i=a+1;i<b;i++){const px=points[i][0]-ax,py=points[i][1]-ay,t=len?Math.max(0,Math.min(1,(px*dx+py*dy)/len)):0,d=Math.hypot(px-t*dx,py-t*dy);if(d>worst){worst=d;index=i;}}
      if(worst>tolerance){keep[index]=1;stack.push([a,index],[index,b]);}}
    return points.filter((_,i)=>keep[i]);
  }
  // A ring (open vertex list) is simplified as two halves between its first vertex and the vertex farthest from it.
  function simplifyRing(points,tolerance){
    if(points.length<4)return points.slice();
    let far=1,best=-1;for(let i=1;i<points.length;i++){const d=Math.hypot(points[i][0]-points[0][0],points[i][1]-points[0][1]);if(d>best){best=d;far=i;}}
    return simplifyOpen(points.slice(0,far+1),tolerance).concat(simplifyOpen(points.slice(far).concat([points[0]]),tolerance).slice(1,-1));
  }
  // Simplify to the tolerance; a very long or jittery stroke gets a coarser tolerance in small steps until it fits the bound.
  function bounded(points,tolerance,max,closed){const run=closed?simplifyRing:simplifyOpen;let out=run(points,tolerance);for(let i=0;out.length>max&&i<60;i++){tolerance*=1.25;out=run(points,tolerance);}return out.length>max?out.filter((_,i)=>i%Math.ceil(out.length/max)===0):out;}
  function zoneParts(g){return g.type==='Polygon'?[g.coordinates]:g.coordinates;}
  function zoneVertices(g){return zoneParts(g).reduce((n,rings)=>n+rings.reduce((m,r)=>m+r.length-1,0),0);}
  // The test prepare() applies to every keepout, plus the ring nesting rules the server checks and turf does not:
  // a hole lies inside its shell, holes do not contain each other and no part lies inside another part.
  function validZone(g,turf){try{
    const f=turf.feature(geometry(g));if(!turf.booleanValid(f)||turf.kinks(f).features.length)return false;
    const parts=zoneParts(g),origin=parts[0][0][0],sx=111320*Math.cos(origin[1]*Math.PI/180),polygons=parts.map(rings=>rings.map(r=>r.slice(0,-1).map(c=>[(c[0]-origin[0])*sx,(c[1]-origin[1])*111000])));
    const interior=(rings,q)=>ringContains(rings[0],q)>0&&rings.slice(1).every(h=>ringContains(h,q)<0);
    for(const rings of polygons)for(let i=1;i<rings.length;i++){
      if(!rings[i].some(q=>ringContains(rings[0],q)>0)||rings[i].some(q=>ringContains(rings[0],q)<0))return false;
      for(let j=1;j<rings.length;j++)if(j!==i&&rings[i].some(q=>ringContains(rings[j],q)>0))return false;}
    for(let a=0;a<polygons.length;a++)for(let b=0;b<polygons.length;b++)if(a!==b&&polygons[b][0].some(q=>interior(polygons[a],q)))return false;
    return true;
  }catch(_){return false;}}
  function zoneFromStroke(points,options,turf){
    const kind=options?.kind;
    if(!turf||!turf.booleanValid)throw new Error('배치 계산 라이브러리 로딩 실패');
    if(kind!=='area'&&kind!=='path'&&kind!=='polygon')throw new Error(ZONE_TEXT.kind);
    let widthM=PATH_WIDTH_DEFAULT;
    if(kind==='path'){const w=options.widthM;if(w!==undefined&&w!==null&&w!=='')widthM=typeof w==='boolean'?NaN:Number(w);if(!Number.isFinite(widthM)||widthM<PATH_WIDTH_MIN||widthM>PATH_WIDTH_MAX)throw new Error(ZONE_TEXT.width);}
    const tiny=kind==='path'?ZONE_TEXT.short:ZONE_TEXT.small;
    if(!Array.isArray(points)||points.length<2)throw new Error(tiny);
    const input=points.map(p=>[Number(Array.isArray(p)?p[0]:p?.lng),Number(Array.isArray(p)?p[1]:p?.lat)]);
    if(input.some(p=>!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>85))throw new Error(ZONE_TEXT.shape);
    const lng0=input[0][0],lat0=input[0][1],sx=111320*Math.cos(lat0*Math.PI/180),sy=111000;
    // Local metres; the third entry keeps the exact input coordinate so untouched vertices are returned as given.
    const metric=p=>[(p[0]-lng0)*sx,(p[1]-lat0)*sy,p],m=[];
    for(const p of input.map(metric)){const q=m.at(-1);if(!q||Math.hypot(p[0]-q[0],p[1]-q[1])>.01)m.push(p);}
    let feature;
    if(kind==='path'){
      let length=0;for(let i=1;i<m.length;i++)length+=Math.hypot(m[i][0]-m[i-1][0],m[i][1]-m[i-1][1]);
      if(m.length<2||length<PATH_WIDTH_MIN)throw new Error(tiny);
      feature=turf.buffer(turf.lineString(bounded(m,ZONE_TOLERANCE_M,PATH_VERTEX_MAX,false).map(p=>p[2])),widthM/2,{units:'meters',steps:4});
    }else{
      if(m.length>1&&Math.hypot(m[0][0]-m.at(-1)[0],m[0][1]-m.at(-1)[1])<=.01)m.pop();
      // Clicked vertices are kept as drawn; a free-hand outline is simplified to about 15 cm.
      const ring=kind==='polygon'&&m.length<=ZONE_VERTEX_MAX?m:bounded(m,ZONE_TOLERANCE_M,ZONE_VERTEX_MAX,true);
      if(ring.length<3)throw new Error(tiny);
      const co=ring.map(p=>p[2]);co.push(co[0]);feature=turf.polygon([co]);
    }
    if(!feature?.geometry)throw new Error(ZONE_TEXT.shape);
    // Self-crossing outline: split at the crossings, merge the pieces, then weld lobes that only touch at a point.
    const repair=g=>{
      if(validZone(g,turf))return g;
      let merged=null;
      try{const pieces=turf.unkinkPolygon(turf.feature(g)).features;merged=pieces.length>1?turf.union(turf.featureCollection(pieces)):pieces[0]||null;}catch(_){merged=null;}
      try{const welded=turf.buffer(merged||turf.feature(g),.02,{units:'meters',steps:2});if(welded?.geometry)return welded.geometry;}catch(_){/* validated by the caller */}
      return merged?.geometry||g;
    };
    // Coarser copy of the repaired outline. Holes are optional detail: one that no longer lies inside its shell, meets
    // another hole or is under 1 m2 is dropped (the zone then excludes that spot as well), and after a few passes all
    // holes are dropped so that the outline alone has to fit the vertex bound.
    const ringArea=r=>{let a=0;for(let i=0;i<r.length;i++){const u=r[i],v=r[(i+1)%r.length];a+=u[0]*v[1]-v[0]*u[1];}return Math.abs(a)/2;};
    const simplified=(g,tolerance,holes)=>{
      const polygons=[];
      for(const rings of zoneParts(g)){
        const shell=simplifyRing(rings[0].slice(0,-1).map(metric),tolerance);if(shell.length<3)continue;
        const kept=[shell];
        if(holes)for(const source of rings.slice(1)){const hole=simplifyRing(source.slice(0,-1).map(metric),tolerance);
          if(hole.length<3||ringArea(hole)<1||!hole.every(q=>ringContains(shell,q)>0)||kept.slice(1).some(other=>hole.some(q=>ringContains(other,q)>=0)||other.some(q=>ringContains(hole,q)>=0)))continue;
          kept.push(hole);}
        polygons.push(kept.map(r=>{const co=r.map(q=>q[2]);co.push(co[0]);return co;}));}
      return !polygons.length?null:polygons.length===1?{type:'Polygon',coordinates:polygons[0]}:{type:'MultiPolygon',coordinates:polygons};
    };
    const base=repair(feature.geometry);let zone=base;
    for(let tolerance=.03,pass=0;zoneVertices(zone)>ZONE_VERTEX_MAX||!validZone(zone,turf);pass++,tolerance*=1.6){
      if(pass>=14)throw new Error(ZONE_TEXT.shape);
      const small=simplified(base,tolerance,pass<4);if(!small)throw new Error(tiny);
      zone=validZone(small,turf)?small:repair(small);
    }
    // Millimetre precision keeps saved documents small; fall back to the exact outline if rounding breaks validity.
    const round=v=>Math.round(v*1e8)/1e8,rounded={type:zone.type,coordinates:zone.type==='Polygon'?zone.coordinates.map(r=>r.map(p=>[round(p[0]),round(p[1])])):zone.coordinates.map(rings=>rings.map(r=>r.map(p=>[round(p[0]),round(p[1])])))};
    if(validZone(rounded,turf))zone=rounded;
    if(!validZone(zone,turf))throw new Error(ZONE_TEXT.shape);
    if(turf.area(turf.feature(zone))<ZONE_MIN_AREA_M2)throw new Error(tiny);
    return zone;
  }
  // One manual module centred on a point, aligned like the automatic fill of the area that holds the point.
  function panelAt(g,p,point,turf){
    p=spec(p);g=geometry(g);const sources=g.type==='Polygon'?[g.coordinates]:g.coordinates,source=sources.find(c=>{const frame=projection(c,'south');return ringContains(frame.rings[0],frame.forward(point))>=0;})||sources[0];
    const pr=projection(source,p.alignment),c=pr.forward(point),w=p.orientation==='landscape'?p.heightM:p.widthM,h=(p.orientation==='landscape'?p.widthM:p.heightM)*Math.cos(p.tiltDeg*Math.PI/180);
    const co=[[c[0]-w/2,c[1]-h/2],[c[0]+w/2,c[1]-h/2],[c[0]+w/2,c[1]+h/2],[c[0]-w/2,c[1]+h/2]].map(pr.inverse);co.push(co[0]);
    return {type:'Feature',properties:{tiltDeg:p.tiltDeg,azimuthDeg:((180-pr.angle*180/Math.PI)%360+360)%360},geometry:{type:'Polygon',coordinates:[co]}};
  }
  const thousands=n=>String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g,',');
  function calculate(input,turf,progress){
    const started=typeof performance!=='undefined'?performance.now():Date.now();let panels=[],tested=0,limited='';
    const empty=(status,reason)=>({type:'FeatureCollection',features:[],status,reason,contractVersion:VERSION,engineVersion:ENGINE,inputVersion:input.inputVersion});
    try{
      const p=spec(input.panelSpec),g=geometry(input.geometry),parts=prepare(g,p,turf,input.keepouts),budget=Math.min(1000000,input.candidateBudget||350000),maxPanels=Math.min(20000,input.maxPanels||20000),rectangular=input.arrayPacking==='rectangular';
      if(!parts.length)return empty('empty','경계·설치 제외 영역을 빼면 패널을 놓을 수 있는 영역이 없습니다.');
      // Validate components before assigning usable fragments to their original roof.
      const sources=g.type==='Polygon'?[g.coordinates]:g.coordinates;
      if(sources.length>1){const fs=sources.map(c=>turf.polygon(c)),area=fs.reduce((s,f)=>s+turf.area(f),0),u=turf.union(turf.featureCollection(fs));if(u&&Math.abs(area-turf.area(u))>Math.max(.001,area*1e-8))return empty('invalid','영역끼리 겹칩니다. 경계를 수정하세요.');}
      const w=p.orientation==='landscape'?p.heightM:p.widthM,h=(p.orientation==='landscape'?p.widthM:p.heightM)*Math.cos(p.tiltDeg*Math.PI/180),rows=Math.floor(p.stackRows),blockH=rows*h,stepX=w+p.sideGapM,stepY=blockH+p.rowGapM;
      // Walk aisles: after every `ax` columns (`ay` row bands) the gap is the aisle. One period is a block plus its aisle;
      // the grid start is searched over a whole period (a quarter module apart), so aisles and edges both fit.
      const ax=p.aisleEvery||0,ay=p.rowAisleEvery||0,periodX=ax?ax*stepX-p.sideGapM+p.aisleM:stepX,periodY=ay?ay*stepY-p.rowGapM+p.rowAisleM:stepY;
      const at=(k,every,step,period)=>every?Math.floor(k/every)*period+(k%every)*step:k*step;
      for(const source of sources){
        // Keep the roof's original direction and one grid across all obstacle/aisle
        // fragments. An obstacle's edge must never become a new roof direction.
        const pr=projection(source,p.alignment),roof=turf.polygon(source),usable=parts.filter(part=>turf.booleanPointInPolygon(turf.point(part[0][0]),roof)).map(part=>part.map(r=>r.map(pr.forward)));
        if(!usable.length)continue;
        const ring=usable.flatMap(part=>part[0]),xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);let best=[],bestGroups=Infinity;
        // A quarter-module search per period; on a site too large for the candidate budget, fewer starts (at least 4 x 4).
        const cells=((maxX-minX)/stepX+2*(ax||1))*((maxY-minY)/stepY+2*(ay||1));let nx=ax?Math.min(4*ax,16):4,ny=ay?Math.min(4*ay,16):4;
        while(nx*ny*cells>budget/2&&(nx>4||ny>4)){if(nx>=ny)nx=Math.max(4,Math.ceil(nx/2));else ny=Math.max(4,Math.ceil(ny/2));}
        search:for(let i=0;i<nx;i++)for(let j=0;j<ny;j++){let candidate=[];const x0=minX-periodX+i/nx*periodX,y0=minY-periodY+j/ny*periodY;
          for(let k=0,x=x0;x+w<=maxX+EPS;x=x0+at(++k,ax,stepX,periodX)){const col=k+(ax?Math.floor(k/ax):0);for(let b=0,y=y0;y+h<=maxY+EPS;y=y0+at(++b,ay,stepY,periodY)){
            const band=b+(ay?Math.floor(b/ay):0);
            if(++tested>budget){limited='candidates';break search;}
            for(let row=0;row<rows;row++){const yy=y+row*h,rect=[[x,yy],[x+w,yy],[x+w,yy+h],[x,yy+h]];
              if(usable.some(rings=>inside(rings,rect))){const co=rect.map(pr.inverse);co.push(co[0]);candidate.push({x:col,y:band*rows+row,feature:{type:'Feature',properties:{panelIndex:0,tiltDeg:p.tiltDeg,azimuthDeg:((180-pr.angle*180/Math.PI)%360+360)%360},geometry:{type:'Polygon',coordinates:[co]}}});}
            }
            if(candidate.length+panels.length>maxPanels){limited='panels';break search;}
          }}
          const packed=rectangular?packRectangles(candidate):{features:candidate.map(c=>c.feature),groups:0};
          if(packed.features.length>best.length||(packed.features.length===best.length&&packed.groups<bestGroups)){best=packed.features;bestGroups=packed.groups;}
          if(progress)progress({tested,panels:panels.length+best.length,budget});
        }
        for(const f of best)if(f.properties.arrayId!==undefined)f.properties.arrayId='roof-'+sources.indexOf(source)+'-'+f.properties.arrayId;
        panels.push(...best);if(limited)break;
      }
      // Overlapping component polygons are invalid for a MultiPolygon (booleanValid
      // is not a full union validator). Reject a union that changes total area.
      if(parts.length>1){const fs=parts.map(c=>turf.polygon(c)),area=fs.reduce((s,f)=>s+turf.area(f),0),u=turf.union(turf.featureCollection(fs));if(u&&Math.abs(area-turf.area(u))>Math.max(.001,area*1e-8))return empty('invalid','영역끼리 겹칩니다. 경계를 수정하세요.');}
      // A limit is not "nothing fits": zero panels are returned so callers stay correct, with a reason the user can act on.
      if(limited)return {...empty('budget_exceeded',(limited==='panels'?'패널 '+thousands(maxPanels)+'장 한도를 넘는 넓은 부지입니다.':'계산 한도(위치 '+thousands(budget)+'곳 확인)에 도달해 배치를 끝내지 못했습니다.')+' 패널을 놓을 자리가 없는 것은 아닙니다. 부지를 나누어 배치하거나 이격 여유율을 높여 주세요.'),limit:limited,tested};
      panels.forEach((p,i)=>p.properties.panelIndex=i);
      return {type:'FeatureCollection',features:panels,status:panels.length?'ok':'empty',reason:panels.length?'':rectangular?'장애물·설치 제외 영역을 빼면 2행 × 2열 이상의 연속 배치 공간이 없습니다. 감지 후보와 설치 제외 영역을 확인하세요.':'경계·설치 제외 영역 안에 모듈 한 장을 놓을 자리가 없습니다. 모듈 크기와 설치 제외 영역을 확인하세요.',panelSpec:p,capacityKw:panels.length*p.powerW/1000,contractVersion:VERSION,engineVersion:ENGINE,inputVersion:input.inputVersion,tested,computeMs:(typeof performance!=='undefined'?performance.now():Date.now())-started};
    }catch(error){return empty('invalid',error.message);}
  }
  // Placed modules are checked in a north-up frame, the fill runs along the roof line. With no setback a module abuts
  // the boundary, and the change of frame moves it by float noise (about a nanometre), enough to fail the exact test.
  // Check the module drawn in by 1 mm instead; the server allows 1 cm.
  function inset(rect){const cx=(rect[0][0]+rect[2][0])/2,cy=(rect[0][1]+rect[2][1])/2;return rect.map(q=>{const dx=q[0]-cx,dy=q[1]-cy,d=Math.hypot(dx,dy);return d>.01?[q[0]-dx/d*.001,q[1]-dy/d*.001]:q;});}
  function canPlace(g,p,panel,existing,turf,keepouts=[]){try{p=spec(p);const parts=prepare(g,p,turf,keepouts),co=panel.geometry.coordinates[0].slice(0,4);
    return parts.some(r=>{const pr=projection(r,'south'),rect=co.map(pr.forward);return inside(pr.rings,inset(rect))&&!(existing||[]).some(e=>overlaps(rect,e.geometry.coordinates[0].slice(0,4).map(pr.forward)));});
  }catch(_){return false;}}
  function filterContained(g,p,panels,turf,keepouts=[]){const parts=prepare(g,spec(p),turf,keepouts).map(r=>projection(r,'south'));return panels.filter(panel=>parts.some(pr=>inside(pr.rings,inset(panel.geometry.coordinates[0].slice(0,4).map(pr.forward)))));}
  return {VERSION,ENGINE,MARGIN_DEFAULT,MARGIN_MAX,SUN_ALTITUDE_DEG,CLAMP_GAP_M,AISLE_MIN_M,AISLE_TARGET_M,ZONE_MAX,ZONE_VERTEX_MAX,ZONE_MIN_AREA_M2,PATH_WIDTH_MIN,PATH_WIDTH_MAX,PATH_WIDTH_DEFAULT,
    number,spec,marginGaps,withMargin,latticeShare,gapText,geometry,zoneFromStroke,validZone,panelAt,calculate,canPlace,filterContained,inside,overlaps};
});
