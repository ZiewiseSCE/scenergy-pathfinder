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
    orientation:p.orientation==='landscape'?'landscape':'portrait',alignment:p.alignment==='roof'?'roof':'south'};}
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
    const points=rings[0],lng=points.reduce((s,p)=>s+p[0],0)/points.length,lat=points.reduce((s,p)=>s+p[1],0)/points.length;
    const sx=111320*Math.cos(lat*Math.PI/180),sy=111000;
    let angle=0,longest=0;
    if(alignment==='roof')for(let i=0;i<points.length-1;i++){const dx=(points[i+1][0]-points[i][0])*sx,dy=(points[i+1][1]-points[i][1])*sy,d=dx*dx+dy*dy;if(d>longest){longest=d;angle=Math.atan2(dy,dx);}}
    const c=Math.cos(angle),s=Math.sin(angle);
    const forward=p=>{const x=(p[0]-lng)*sx,y=(p[1]-lat)*sy;return [x*c+y*s,-x*s+y*c];};
    const inverse=p=>[(p[0]*c-p[1]*s)/sx+lng,(p[0]*s+p[1]*c)/sy+lat];
    return {rings:rings.map(r=>r.map(forward)),forward,inverse,angle};
  }
  function calculate(input,turf,progress){
    const started=typeof performance!=='undefined'?performance.now():Date.now();let panels=[],tested=0,limited=false;
    const empty=(status,reason)=>({type:'FeatureCollection',features:[],status,reason,contractVersion:VERSION,engineVersion:ENGINE,inputVersion:input.inputVersion});
    try{
      const p=spec(input.panelSpec),parts=prepare(input.geometry,p,turf,input.keepouts),budget=Math.min(1000000,input.candidateBudget||350000),maxPanels=Math.min(20000,input.maxPanels||20000);
      if(!parts.length)return empty('empty','이격거리를 적용하면 사용 가능한 영역이 없습니다.');
      const w=p.orientation==='landscape'?p.heightM:p.widthM,h=(p.orientation==='landscape'?p.widthM:p.heightM)*Math.cos(p.tiltDeg*Math.PI/180),rows=Math.floor(p.stackRows),blockH=rows*h,stepX=w+p.sideGapM,stepY=blockH+p.rowGapM;
      const offsets=[0,.25,.5,.75];
      for(const part of parts){const pr=projection(part,p.alignment),ring=pr.rings[0];
        const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);let best=[];
        search:for(const ox of offsets)for(const oy of offsets){let candidate=[];
          for(let x=minX-stepX+ox*stepX;x+w<=maxX+EPS;x+=stepX)for(let y=minY-stepY+oy*stepY;y+h<=maxY+EPS;y+=stepY){
            if(++tested>budget){limited=true;break search;}
            for(let row=0;row<rows;row++){const yy=y+row*h,rect=[[x,yy],[x+w,yy],[x+w,yy+h],[x,yy+h]];
              if(inside(pr.rings,rect)){const co=rect.map(pr.inverse);co.push(co[0]);candidate.push({type:'Feature',properties:{panelIndex:0,azimuthDeg:((180-pr.angle*180/Math.PI)%360+360)%360},geometry:{type:'Polygon',coordinates:[co]}});}
            }
            if(candidate.length+panels.length>maxPanels){limited=true;break search;}
          }
          if(candidate.length>best.length)best=candidate;
          if(progress)progress({tested,panels:panels.length+best.length,budget});
        }
        panels.push(...best);if(limited)break;
      }
      // Overlapping component polygons are invalid for a MultiPolygon (booleanValid
      // is not a full union validator). Reject a union that changes total area.
      if(parts.length>1){const fs=parts.map(c=>turf.polygon(c)),area=fs.reduce((s,f)=>s+turf.area(f),0),u=turf.union(turf.featureCollection(fs));if(u&&Math.abs(area-turf.area(u))>Math.max(.001,area*1e-8))return empty('invalid','영역끼리 겹칩니다. 경계를 수정하세요.');}
      if(limited)return {...empty('budget_exceeded','계산 한도에 도달했습니다. 영역을 나누어 다시 배치하세요.'),tested};
      panels.forEach((p,i)=>p.properties.panelIndex=i);
      return {type:'FeatureCollection',features:panels,status:panels.length?'ok':'empty',reason:panels.length?'':'조건을 만족하는 패널을 배치할 수 없습니다.',panelSpec:p,capacityKw:panels.length*p.powerW/1000,contractVersion:VERSION,engineVersion:ENGINE,inputVersion:input.inputVersion,tested,computeMs:(typeof performance!=='undefined'?performance.now():Date.now())-started};
    }catch(error){return empty('invalid',error.message);}
  }
  function canPlace(g,p,panel,existing,turf,keepouts=[]){try{p=spec(p);const parts=prepare(g,p,turf,keepouts),co=panel.geometry.coordinates[0].slice(0,4);
    return parts.some(r=>{const pr=projection(r,'south'),rect=co.map(pr.forward);return inside(pr.rings,rect)&&!(existing||[]).some(e=>overlaps(rect,e.geometry.coordinates[0].slice(0,4).map(pr.forward)));});
  }catch(_){return false;}}
  function filterContained(g,p,panels,turf,keepouts=[]){const parts=prepare(g,spec(p),turf,keepouts).map(r=>projection(r,'south'));return panels.filter(panel=>parts.some(pr=>inside(pr.rings,panel.geometry.coordinates[0].slice(0,4).map(pr.forward))));}
  return {VERSION,ENGINE,number,spec,geometry,calculate,canPlace,filterContained,inside,overlaps};
});
