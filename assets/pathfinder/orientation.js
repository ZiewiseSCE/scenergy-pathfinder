/* Relative annual direction estimate. No weather fetch and no obstruction claim.
   Cooper declination + Haurwitz clear-sky GHI + isotropic sky/ground projection.
   Assumptions: diffuse fraction .30, ground reflectance .20; monthly midpoints,
   half-hour solar-time samples. Compare due south at the SAME tilt/location.
   References: pvlib docs, solarposition.declination_cooper69, clearsky.haurwitz,
   irradiance.isotropic. This ratio is a planning assumption, not a yield forecast. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PFOrientation=api;})(typeof self!=='undefined'?self:this,function(){'use strict';
  const MODEL='south-relative-1',rad=Math.PI/180,cache=new Map();
  const finite=(v,d)=>v!==null&&v!==''&&Number.isFinite(Number(v))?Number(v):d;
  const azimuth=v=>((finite(v,180)%360)+360)%360;
  const deviation=v=>Math.abs(((azimuth(v)-180+540)%360)-180);
  function ratio(latitude,az,tilt){
    const lat=Math.max(-65,Math.min(65,finite(latitude,36))),a=azimuth(az),t=Math.max(0,Math.min(90,finite(tilt,15)));
    if(t===0||deviation(a)<1e-9)return 1;
    const key=[lat.toFixed(2),a.toFixed(2),t.toFixed(2)].join(':');if(cache.has(key))return cache.get(key);
    const p=lat*rad,b=t*rad,g=a*rad,sky=(1+Math.cos(b))/2,ground=(1-Math.cos(b))/2;
    let actual=0,south=0,day=0;
    for(const days of [31,28,31,30,31,30,31,31,30,31,30,31]){
      const delta=23.45*rad*Math.sin(2*Math.PI*(284+day+days/2)/365);day+=days;
      for(let hour=.25;hour<24;hour+=.5){
        const h=(hour-12)*15*rad,east=-Math.cos(delta)*Math.sin(h),north=Math.cos(p)*Math.sin(delta)-Math.sin(p)*Math.cos(delta)*Math.cos(h),up=Math.sin(p)*Math.sin(delta)+Math.cos(p)*Math.cos(delta)*Math.cos(h);
        if(up<=0)continue;
        const ghi=1098*up*Math.exp(-.059/up),dni=.70*ghi/up,diffuse=.30*ghi*sky+.20*ghi*ground;
        const poa=angle=>dni*Math.max(0,Math.sin(b)*(east*Math.sin(angle)+north*Math.cos(angle))+Math.cos(b)*up)+diffuse;
        actual+=poa(g)*days;south+=poa(Math.PI)*days;
      }
    }
    const result=south>0?Math.max(0,Math.min(1,actual/south)):1;
    if(cache.size>2000)cache.clear();cache.set(key,result);return result;
  }
  function summarize(panels,{latitude=36,tiltDeg=15,azimuthDeg=180,powerW=640}={}){
    const groups=new Map(),items=panels?.length?panels:[{properties:{azimuthDeg,tiltDeg,powerW}}];
    for(const panel of items){const p=panel.properties||{},az=azimuth(p.azimuthDeg??azimuthDeg),tilt=Math.max(0,Math.min(90,finite(p.tiltDeg,tiltDeg))),power=Math.max(1,finite(p.powerW,powerW));
      const key=az.toFixed(2)+':'+tilt.toFixed(2);let row=groups.get(key);if(!row){row={azimuthDeg:az,tiltDeg:tilt,deviationDeg:deviation(az),factor:ratio(latitude,az,tilt),count:0,dcW:0};groups.set(key,row);}row.count++;row.dcW+=power;
    }
    const rows=[...groups.values()].sort((a,b)=>a.azimuthDeg-b.azimuthDeg),weight=rows.reduce((n,r)=>n+r.dcW,0),factor=rows.reduce((n,r)=>n+r.dcW*r.factor,0)/weight;
    return {model:MODEL,reference:'south-same-tilt',source:panels?.length?'layout-panels':'assumed-direction',latitude:finite(latitude,36),factor,lossPct:(1-factor)*100,meanDeviationDeg:rows.reduce((n,r)=>n+r.dcW*r.deviationDeg,0)/weight,minDeviationDeg:Math.min(...rows.map(r=>r.deviationDeg)),maxDeviationDeg:Math.max(...rows.map(r=>r.deviationDeg)),panelCount:panels?.length||0,groupCount:rows.length,groups:rows.slice(0,100)};
  }
  return {MODEL,azimuth,deviation,ratio,summarize};
});
