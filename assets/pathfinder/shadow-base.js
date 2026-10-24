(function(root){
// Shared legacy base; overridden by shadow-runtime.js. Synced from the operating UI.
var SunCalc={_dayOfYear:function(d){var s=new Date(d.getFullYear(),0,0);return Math.floor((d-s)/864e5)},getPosition:function(lat,lng,date,hour){var doy=this._dayOfYear(date),B=(360/365)*(doy-81)*Math.PI/180,decl=23.45*Math.sin((360/365*(doy-81))*Math.PI/180),EoT=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B),LSTM=135,TC=4*(lng-LSTM)+EoT,solarTime=hour+TC/60,HRA=15*(solarTime-12),latR=lat*Math.PI/180,declR=decl*Math.PI/180,hraR=HRA*Math.PI/180,sinE=Math.sin(latR)*Math.sin(declR)+Math.cos(latR)*Math.cos(declR)*Math.cos(hraR);sinE=Math.max(-1,Math.min(1,sinE));var elev=Math.asin(sinE)*180/Math.PI,cosA=(Math.sin(declR)-Math.sin(latR)*sinE)/(Math.cos(latR)*Math.cos(elev*Math.PI/180)+1e-12);cosA=Math.max(-1,Math.min(1,cosA));var az=Math.acos(cosA)*180/Math.PI;if(HRA>0)az=360-az;return{elevation:elev,azimuth:az}},getSunTimes:function(lat,lng,date){var doy=this._dayOfYear(date),decl=23.45*Math.sin((360/365*(doy-81))*Math.PI/180),latR=lat*Math.PI/180,declR=decl*Math.PI/180,cosHA=-Math.tan(latR)*Math.tan(declR);cosHA=Math.max(-1,Math.min(1,cosHA));var HA=Math.acos(cosHA)*180/Math.PI,B=(360/365)*(doy-81)*Math.PI/180,EoT=9.87*Math.sin(2*B)-7.53*Math.cos(B)-1.5*Math.sin(B),LSTM=135,TC=4*(lng-LSTM)+EoT;return{sunrise:Math.max(4,12-HA/15-TC/60),sunset:Math.min(21,12+HA/15-TC/60)}},SEASONS:{spring:{label:"춘분 (3/20)",month:2,day:20},summer:{label:"하지 (6/21)",month:5,day:21},fall:{label:"추분 (9/23)",month:8,day:23},winter:{label:"동지 (12/22)",month:11,day:22}},getSeasonDate:function(k,y){var s=this.SEASONS[k];return new Date(y||2025,s.month,s.day)}};

var OSMFetcher={_cache:{},
_servers:["https://overpass-api.de/api/interpreter","https://overpass.kumi.systems/api/interpreter","https://overpass.private.coffee/api/interpreter"],
_fetchJsonWithTimeout:function(url,timeoutMs,options){
options=options||{};
var controller=(typeof AbortController!=="undefined")?new AbortController():null;
var timer=null;
var fetchOpts=Object.assign({},options);
if(controller){fetchOpts.signal=controller.signal;timer=setTimeout(function(){try{controller.abort();}catch(_e){}},timeoutMs||6000);}
return fetch(url,fetchOpts).then(function(r){
if(!r.ok)throw new Error("HTTP "+r.status);return r.json();
}).finally(function(){if(timer)clearTimeout(timer);});
},
clearAround:function(lat,lng,radius){
var radii=Array.isArray(radius)?radius:[radius];
for(var i=0;i<radii.length;i++){
var r=radii[i],base=lat.toFixed(5)+","+lng.toFixed(5)+","+r;
delete this._cache[base];delete this._cache["terrain_"+base];delete this._cache["elev_"+base];
}
},
_fetchWithFallback:function(query){
var servers=this._servers;var idx=0;
function tryNext(){
if(idx>=servers.length)return Promise.reject(new Error("All Overpass servers failed"));
var url=servers[idx]+"?data="+encodeURIComponent(query);
idx++;
return OSMFetcher._fetchJsonWithTimeout(url,6500).catch(function(e){console.warn("[OSM] Server "+(idx-1)+" skip");return tryNext();});
}
return tryNext();
},
fetch:function(lat,lng,radius){var key=lat.toFixed(5)+","+lng.toFixed(5)+","+radius;if(this._cache[key])return Promise.resolve(this._cache[key]);var query='[out:json][timeout:3];(way["building"](around:'+radius+','+lat+','+lng+');node["natural"="tree"](around:'+radius+','+lat+','+lng+'););out body;>;out skel qt;';var self=this;return this._fetchWithFallback(query).then(function(data){var nodes={},buildings=[],trees=[];(data.elements||[]).forEach(function(el){if(el.type==="node")nodes[el.id]={lat:el.lat,lng:el.lon}});(data.elements||[]).forEach(function(el){if(el.type==="node"&&el.tags&&el.tags.natural==="tree"){trees.push({type:"tree",lat:el.lat,lng:el.lon,height:parseFloat(el.tags.height||el.tags["est_height"]||"10")||10});return}if(el.type==="way"&&el.tags){var coords=(el.nodes||[]).map(function(nid){return nodes[nid]}).filter(Boolean);if(coords.length<3)return;if(el.tags.building){var h=parseFloat(el.tags.height||el.tags["building:height"]||"0");if(!h){var levels=parseInt(el.tags["building:levels"]||"0",10);if(levels)h=levels*3;else{var bt=(el.tags.building||"").toLowerCase();if(bt==="apartments"||bt==="commercial"||bt==="office")h=15;else if(bt==="industrial"||bt==="warehouse")h=10;else h=8}}buildings.push({type:"building",coords:coords,height:h,tags:el.tags})}else if(el.tags.landuse==="forest"||el.tags.natural==="wood"){trees.push({type:"forest",coords:coords,height:12})}}});var result={buildings:buildings,trees:trees,_sourceStatus:"complete"};self._cache[key]=result;return result}).catch(function(e){console.warn("[shadow] OSM fetch failed:",e);return{buildings:[],trees:[],_failed:true,error:e&&e.message?e.message:String(e)}})},/* ── 확장: 도로, 주차장, 운동장, 수계 등 지형 피처 로드 ── */
fetchTerrain:function(lat,lng,radius){
var key="terrain_"+lat.toFixed(5)+","+lng.toFixed(5)+","+radius;
if(this._cache[key])return Promise.resolve(this._cache[key]);
var query='[out:json][timeout:8];(way["highway"](around:'+radius+','+lat+','+lng+');way["leisure"="pitch"](around:'+radius+','+lat+','+lng+');way["leisure"="park"](around:'+radius+','+lat+','+lng+');way["leisure"="sports_centre"](around:'+radius+','+lat+','+lng+');way["amenity"="parking"](around:'+radius+','+lat+','+lng+');way["landuse"="residential"](around:'+radius+','+lat+','+lng+');way["landuse"="commercial"](around:'+radius+','+lat+','+lng+');way["landuse"="industrial"](around:'+radius+','+lat+','+lng+');way["natural"="water"](around:'+radius+','+lat+','+lng+');way["waterway"](around:'+radius+','+lat+','+lng+');way["man_made"="bridge"](around:'+radius+','+lat+','+lng+'););out body;>;out skel qt;';
var self=this;
return this._fetchWithFallback(query).then(function(data){
var nodes={},roads=[],areas=[];
(data.elements||[]).forEach(function(el){if(el.type==="node")nodes[el.id]={lat:el.lat,lng:el.lon}});
(data.elements||[]).forEach(function(el){
if(el.type!=="way"||!el.tags)return;
var coords=(el.nodes||[]).map(function(nid){return nodes[nid]}).filter(Boolean);
if(coords.length<2)return;
if(el.tags.highway){
var hw=el.tags.highway;
var w=hw==="motorway"?8:hw==="primary"?6:hw==="secondary"?5:hw==="tertiary"?4:hw==="residential"?3.5:hw==="service"?3:hw==="footway"||hw==="path"?1.5:hw==="track"?2.5:3;
roads.push({coords:coords,width:w,type:hw,name:el.tags.name||""});
}else if(el.tags.leisure==="pitch"||el.tags.leisure==="park"||el.tags.leisure==="sports_centre"){
areas.push({coords:coords,type:"sports",subtype:el.tags.sport||el.tags.leisure,name:el.tags.name||""});
}else if(el.tags.amenity==="parking"){
areas.push({coords:coords,type:"parking",name:el.tags.name||""});
}else if(el.tags.landuse){
areas.push({coords:coords,type:"landuse",subtype:el.tags.landuse,name:el.tags.name||""});
}else if(el.tags.natural==="water"||el.tags.waterway){
areas.push({coords:coords,type:"water",name:el.tags.name||""});
}
});
var result={roads:roads,areas:areas};
self._cache[key]=result;
console.log("[OSM] 지형 피처 로딩: 도로 "+roads.length+"개, 영역 "+areas.length+"개");
return result;
}).catch(function(e){console.warn("[OSM] terrain fetch failed:",e);return{roads:[],areas:[],_failed:true,error:e&&e.message?e.message:String(e)}});
},
/* ── 고도 데이터 fetch (Open Elevation API) ── */
fetchElevation:function(lat,lng,radius){
var key="elev_"+lat.toFixed(5)+","+lng.toFixed(5)+","+radius;
if(this._cache[key])return Promise.resolve(this._cache[key]);
var gridSize=15;// 15x15 grid
var mPerDegLat=110540,mPerDegLng=111320*Math.cos(lat*Math.PI/180);
var dLat=radius/mPerDegLat,dLng=radius/mPerDegLng;
var locations=[];
for(var iy=0;iy<gridSize;iy++){
for(var ix=0;ix<gridSize;ix++){
var pLat=lat-dLat+(2*dLat*iy/(gridSize-1));
var pLng=lng-dLng+(2*dLng*ix/(gridSize-1));
locations.push({latitude:pLat,longitude:pLng});
}}
var self=this;
return this._fetchJsonWithTimeout("https://api.open-elevation.com/api/v1/lookup",8000,{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({locations:locations})
}).then(function(data){
if(!data.results||data.results.length!==gridSize*gridSize)throw new Error("bad response");
var grid=[];
var centerElev=data.results[Math.floor(gridSize*gridSize/2)].elevation;
for(var iy=0;iy<gridSize;iy++){
var row=[];
for(var ix=0;ix<gridSize;ix++){
row.push(data.results[iy*gridSize+ix].elevation-centerElev);
}
grid.push(row);
}
var result={grid:grid,gridSize:gridSize,radius:radius,centerElev:centerElev};
self._cache[key]=result;
console.log("[OSM] 고도 데이터 로딩 완료: center="+centerElev+"m, grid="+gridSize+"x"+gridSize);
return result;
}).catch(function(e){
console.warn("[OSM] elevation fetch failed, using procedural:",e.message||e);
/* 프로시저럴 폴백: 경사 + 노이즈 (보이는 경사 적용) */
var grid=[];
var seed=lat*1000+lng*100;
function pseudoNoise(x,y){var n=Math.sin(x*127.1+y*311.7+seed)*43758.5453;return n-Math.floor(n);}
function smoothNoise(x,y){var c=pseudoNoise(x,y),s=pseudoNoise(x-1,y)+pseudoNoise(x+1,y)+pseudoNoise(x,y-1)+pseudoNoise(x,y+1);return c*0.5+s*0.125;}
function interpNoise(x,y){var ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;
fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy);
var v00=smoothNoise(ix,iy),v10=smoothNoise(ix+1,iy),v01=smoothNoise(ix,iy+1),v11=smoothNoise(ix+1,iy+1);
return v00*(1-fx)*(1-fy)+v10*fx*(1-fy)+v01*(1-fx)*fy+v11*fx*fy;}
function fbm(x,y){return interpNoise(x,y)*0.5+interpNoise(x*2,y*2)*0.25+interpNoise(x*4,y*4)*0.125;}
/* 시드 기반 경사 방향 (서/동/남/북 중 무작위) */
var slopeAngle=(pseudoNoise(seed,seed*2)*2-1)*Math.PI;
var slopeMag=4+pseudoNoise(seed*3,seed)*4;/* 4~8m 경사 */
var sdx=Math.cos(slopeAngle),sdy=Math.sin(slopeAngle);
for(var iy=0;iy<gridSize;iy++){
var row=[];
for(var ix=0;ix<gridSize;ix++){
var nx=(ix/(gridSize-1))*2-1,ny=(iy/(gridSize-1))*2-1;/* -1~+1 */
var dist=Math.sqrt(nx*nx+ny*ny);
/* 기본 경사: 한 방향으로 일정한 기울기 */
var slopeH=(nx*sdx+ny*sdy)*slopeMag;
/* 노이즈 기복 추가 */
var noiseH=fbm(nx*3+5,ny*3+5)*6-3;
var h=slopeH+noiseH;
/* 가장자리 언덕 (300m 밖부터 가파름) */
if(dist>0.7)h+=Math.pow((dist-0.7)*3.3,1.4)*5;
row.push(h);
}
grid.push(row);
}
var result={grid:grid,gridSize:gridSize,radius:radius,centerElev:0,procedural:true};
self._cache[key]=result;
console.log("[OSM] 프로시저럴 지형 생성: 경사 "+slopeMag.toFixed(1)+"m");
return result;
});
}};

var ShadowEngine={_meterToDeg:function(lat){return{lng:1/(111320*Math.cos(lat*Math.PI/180)),lat:1/110540}},projectPoint:function(ptLat,ptLng,height,sun){if(sun.elevation<=0)return null;var shadowLen=Math.min(height/Math.tan(sun.elevation*Math.PI/180),300),shadowAz=(sun.azimuth+180)%360,azR=shadowAz*Math.PI/180,m2d=this._meterToDeg(ptLat);return{lat:ptLat+shadowLen*Math.cos(azR)*m2d.lat,lng:ptLng+shadowLen*Math.sin(azR)*m2d.lng}},buildingShadow:function(footprint,height,sun){if(sun.elevation<=1)return null;var projected=[],self=this;footprint.forEach(function(pt){var sp=self.projectPoint(pt.lat,pt.lng,height,sun);if(sp)projected.push(sp)});if(projected.length<3)return null;var allPoints=footprint.map(function(p){return[p.lng,p.lat]}).concat(projected.map(function(p){return[p.lng,p.lat]}));try{var fc=turf.featureCollection(allPoints.map(function(p){return turf.point(p)}));var hull=turf.convex(fc);if(hull)return turf.getCoords(hull)[0];throw new Error('건물 그림자 계산 실패')}catch(e){throw e}return null},treeShadow:function(lat,lng,height,cr,sun){if(sun.elevation<=1)return null;var tip=this.projectPoint(lat,lng,height,sun);if(!tip)return null;var m2d=this._meterToDeg(lat),r=cr||3,pts=[];for(var i=0;i<12;i++){var a=i*30*Math.PI/180;pts.push([tip.lng+r*Math.cos(a)*m2d.lng,tip.lat+r*Math.sin(a)*m2d.lat])}pts.push(pts[0]);return pts},calcShadingRatio:function(panelsFC,shadowPolygons){
if(!panelsFC?.features?.length||!Array.isArray(shadowPolygons))throw new Error('음영 계산 입력 미확인');
var total=panelsFC.features.reduce(function(sum,f){return sum+turf.area(f)},0);
if(!Number.isFinite(total)||total<=0)throw new Error('패널 면적 미확인');
if(!shadowPolygons.length)return 0;
var polygons=shadowPolygons.map(function(coords){return turf.polygon([coords])});
var combine=function(name,a,b){try{return turf[name](turf.featureCollection([a,b]))}catch(e){return turf[name](a,b)}};
var union=polygons[0];for(var i=1;i<polygons.length;i++){union=combine('union',union,polygons[i]);if(!union)throw new Error('그림자 교차 계산 실패');}
var shaded=panelsFC.features.reduce(function(sum,panel){var intersection=combine('intersect',panel,union);return sum+(intersection?turf.area(intersection):0)},0);
if(!Number.isFinite(shaded))throw new Error('음영 계산 결과 미확인');return Math.min(1,Math.max(0,shaded/total));
},_buildAllShadows:function(lat,lng,osmData,sun){var shadows=[],self=this;if(osmData.buildings)osmData.buildings.forEach(function(b){var s=self.buildingShadow(b.coords,b.height,sun);if(s)shadows.push(s)});if(osmData.trees)osmData.trees.forEach(function(t){if(t.type==="tree"){var s=self.treeShadow(t.lat,t.lng,t.height,3,sun);if(s)shadows.push(s)}else if(t.type==="forest"&&t.coords){var s=self.buildingShadow(t.coords,t.height,sun);if(s)shadows.push(s)}});return shadows},calcDailyShading:function(lat,lng,date,panelsFC,osmData){var times=SunCalc.getSunTimes(lat,lng,date),results=[],self=this;for(var h=Math.ceil(times.sunrise);h<=Math.floor(times.sunset);h+=0.5){var sun=SunCalc.getPosition(lat,lng,date,h);if(sun.elevation<=0)continue;var shadows=self._buildAllShadows(lat,lng,osmData,sun),ratio=self.calcShadingRatio(panelsFC,shadows);results.push({hour:h,elevation:sun.elevation,azimuth:sun.azimuth,shadingRatio:ratio,effectiveSun:1-ratio})}return results},calcSeasonalEfficiency:function(lat,lng,panelsFC,osmData){var year=new Date().getFullYear(),seasons={};["spring","summer","fall","winter"].forEach(function(sk){var date=SunCalc.getSeasonDate(sk,year),daily=ShadowEngine.calcDailyShading(lat,lng,date,panelsFC,osmData),totalH=0,effH=0;daily.forEach(function(d){totalH+=0.5;effH+=0.5*d.effectiveSun});seasons[sk]={label:SunCalc.SEASONS[sk].label,totalSunHours:totalH,effectiveSunHours:Math.round(effH*100)/100,avgShadingPct:totalH>0?Math.round((1-effH/totalH)*1000)/10:0,hourly:daily}});return seasons}};


root.PFShadowBase={SunCalc:SunCalc,OSMFetcher:OSMFetcher,ShadowEngine:ShadowEngine};
})(typeof window!=="undefined"?window:globalThis);
