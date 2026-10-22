/* Magnify the map beyond the tile limit without changing saved coordinates.
   The input surface and vector canvas share the same forward/inverse projection. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.PFDetailZoom=factory(root);})(typeof window!=='undefined'?window:this,function(env){'use strict';
  let factor=1,surface=null,drag=null;
  const el=()=>env.document.getElementById('kMap');
  function screen(point,inverse=false){const e=el(),scale=inverse?1/factor:factor;return {x:e.clientWidth/2+(point.x-e.clientWidth/2)*scale,y:e.clientHeight/2+(point.y-e.clientHeight/2)*scale};}
  function projection(map){const p=map.getProjection();return {containerPointFromCoords:ll=>screen(p.containerPointFromCoords(ll)),coordsFromContainerPoint:point=>{const v=screen(point,true);return p.coordsFromContainerPoint(new env.kakao.maps.Point(v.x,v.y));}};}
  function point(event){const r=surface.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
  function mount(){if(surface)return;surface=env.document.createElement('div');surface.id='pfDetailInput';surface.setAttribute('aria-label','확대 지도 · 드래그로 이동, 클릭으로 그리기');surface.style.cssText='position:absolute;inset:0;z-index:6;touch-action:none;cursor:grab';el().parentElement.appendChild(surface);const attribution=env.document.createElement('small');attribution.textContent='지도 © Kakao · 국토지리정보원';attribution.style.cssText='position:absolute;right:4px;bottom:2px;background:#ffffffc9;color:#253539;font:10px sans-serif;pointer-events:none';surface.appendChild(attribution);
    surface.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;e.preventDefault();const p=point(e);drag={id:e.pointerId,start:p,last:p,moved:false};surface.setPointerCapture(e.pointerId);surface.style.cursor='grabbing';});
    surface.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const p=point(e);if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>4)drag.moved=true;if(drag.moved){const map=env.km,pr=map.getProjection(),c=pr.containerPointFromCoords(map.getCenter());map.setCenter(pr.coordsFromContainerPoint(new env.kakao.maps.Point(c.x-(p.x-drag.last.x)/factor,c.y-(p.y-drag.last.y)/factor)));}drag.last=p;});
    surface.addEventListener('pointerup',e=>{if(!drag||drag.id!==e.pointerId)return;const click=!drag.moved;drag=null;surface.style.cursor='grab';if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);if(click)env.onClick({latLng:projection(env.km).coordsFromContainerPoint(point(e))});});
    surface.addEventListener('pointercancel',()=>{drag=null;surface.style.cursor='grab';});
    surface.addEventListener('wheel',e=>{e.preventDefault();env.pgZoom(Math.max(1,Math.min(16,env.pgZoomLv*(e.deltaY<0?2:.5))));},{passive:false});
  }
  function set(value){factor=Math.max(1,Number(value)||1);mount();el().style.transform=factor>1?'scale('+factor+')':'';el().style.transformOrigin='50% 50%';surface.hidden=factor===1;env.km?.setDraggable(factor===1);env.km?.setZoomable(factor===1);env.dispatchEvent(new env.CustomEvent('pf-detail-zoom'));}
  return {set,get:()=>factor,screen,projection};
});
