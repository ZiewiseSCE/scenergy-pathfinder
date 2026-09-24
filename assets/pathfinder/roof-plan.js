(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PFRoofPlan=api;})(typeof self!=='undefined'?self:this,function(){'use strict';
  const VERSION='roof-plan-1';
  function settings(value={}){const out={};for(const [key,min,max,fallback] of [['edgeM',.3,10,1],['obstacleM',0,10,.5],['walkwayM',.6,5,1],['blockM',6,30,12],['sunAltitudeDeg',10,60,30],['verifiedSlopeDeg',0,60,0]]){const n=Number(value[key]??fallback);if(!Number.isFinite(n)||n<min||n>max)throw new Error('지붕 검토 설정을 확인하세요: '+key);out[key]=n;}return out;}
  function projection(g){const ring=(g.type==='MultiPolygon'?g.coordinates[0]:g.coordinates)[0],lng=ring[0][0],lat=ring[0][1],sx=111320*Math.cos(lat*Math.PI/180),sy=111000;let angle=0,longest=0;for(let i=1;i<ring.length;i++){const dx=(ring[i][0]-ring[i-1][0])*sx,dy=(ring[i][1]-ring[i-1][1])*sy,l=dx*dx+dy*dy;if(l>longest){longest=l;angle=Math.atan2(dy,dx);}}const c=Math.cos(angle),s=Math.sin(angle);return {forward:p=>{const x=(p[0]-lng)*sx,y=(p[1]-lat)*sy;return [x*c+y*s,-x*s+y*c];},inverse:p=>[(p[0]*c-p[1]*s)/sx+lng,(p[0]*s+p[1]*c)/sy+lat]};}
  function union(features,turf){return !features.length?null:features.length===1?features[0]:turf.union(turf.featureCollection(features));}
  function prepare(geometry,assessment,options,turf){
    const p=settings(options),roof=turf.feature(geometry),gross=turf.area(roof);
    if(!assessment||assessment.status!=='review_required')return {version:VERSION,status:'assessment_required',reason:assessment?.message||'지붕 영상을 먼저 검토하세요.',keepouts:[],zones:[],settings:p,grossAreaM2:gross,usableAreaM2:null};
    const inner=turf.buffer(roof,-p.edgeM,{units:'meters',steps:4});
    if(!inner)return {version:VERSION,status:'empty',keepouts:[geometry],zones:[],settings:p,grossAreaM2:gross,usableAreaM2:0};
    const edge=turf.difference(turf.featureCollection([roof,inner])),objects=[],walkways=[];
    for(const item of assessment.obstacles||[]){if(item.enabled===false)continue;let height=item.heightM===null||item.heightM===''||item.heightM===undefined?0:Number(item.heightM);if(!Number.isFinite(height)||height<0||height>30)throw new Error('장애물 높이는 0~30m 범위로 입력하세요.');const margin=p.obstacleM+height/Math.tan(p.sunAltitudeDeg*Math.PI/180);let f=turf.feature(item.geometry);if(margin)f=turf.buffer(f,margin,{units:'meters',steps:4});if(f)objects.push(f);}
    const parts=geometry.type==='MultiPolygon'?geometry.coordinates:[geometry.coordinates];
    for(const part of parts){const pr=projection({type:'Polygon',coordinates:part}),xy=part[0].map(pr.forward),xs=xy.map(p=>p[0]),ys=xy.map(p=>p[1]),a=Math.min(...xs),b=Math.max(...xs),c=Math.min(...ys),d=Math.max(...ys);
      const add=(x0,y0,x1,y1)=>{const ring=[[x0,y0],[x1,y0],[x1,y1],[x0,y1],[x0,y0]].map(pr.inverse);walkways.push(turf.polygon([ring]));};
      // Continuous access bands, aligned to each component rather than a north-up bbox.
      if(b-a>p.blockM)for(let x=(a+b)/2; x<b; x+=p.blockM)add(x-p.walkwayM/2,c-1,x+p.walkwayM/2,d+1);
      if(b-a>p.blockM)for(let x=(a+b)/2-p.blockM; x>a; x-=p.blockM)add(x-p.walkwayM/2,c-1,x+p.walkwayM/2,d+1);
      if(d-c>p.blockM)for(let y=(c+d)/2; y<d; y+=p.blockM)add(a-1,y-p.walkwayM/2,b+1,y+p.walkwayM/2);
      if(d-c>p.blockM)for(let y=(c+d)/2-p.blockM; y>c; y-=p.blockM)add(a-1,y-p.walkwayM/2,b+1,y+p.walkwayM/2);
    }
    const obstacles=union(objects,turf),access=union(walkways,turf),all=union([edge,obstacles,access].filter(Boolean),turf);
    const clipped=all?turf.intersect(turf.featureCollection([all,roof])):null;
    let usable=clipped?turf.difference(turf.featureCollection([roof,clipped])):roof;
    const pieces=usable?(usable.geometry.type==='MultiPolygon'?usable.geometry.coordinates:[usable.geometry.coordinates]):[];
    const zones=pieces.map((coordinates,i)=>({id:'roof-zone-'+(i+1),geometry:{type:'Polygon',coordinates},areaM2:turf.area(turf.polygon(coordinates)),heightM:null,slopeDeg:p.verifiedSlopeDeg||null}));
    return {version:VERSION,status:usable?'review_required':'empty',settings:p,keepouts:clipped?[clipped.geometry]:[],zones,
      grossAreaM2:gross,usableAreaM2:usable?turf.area(usable):0,obstacleCount:(assessment.obstacles||[]).filter(o=>o.enabled!==false).length,
      obstacleGeometry:obstacles?.geometry,walkwayGeometry:access?.geometry,edgeGeometry:edge?.geometry,
      panelOverrides:{setbackM:0,tiltDeg:p.verifiedSlopeDeg},geometryKey:JSON.stringify(geometry)};
  }
  function serializable(state){if(!state)return null;const {preview,...assessment}=state.assessment||{};return {version:VERSION,geometryKey:state.geometryKey,assessment,settings:state.settings,customKeepouts:state.customKeepouts||[],reviewedAt:state.reviewedAt||null};}
  return {VERSION,settings,prepare,serializable};
});
