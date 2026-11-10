/* Magnify the map beyond the tile limit without changing saved coordinates.
   The input surface and vector canvas share the same forward/inverse projection. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory;else root.PFDetailZoom=factory(root);})(typeof window!=='undefined'?window:this,function(env){'use strict';
  let factor=1,surface=null,drag=null,stroke=null;
  const el=()=>env.document.getElementById('kMap');
  function screen(point,inverse=false){const e=el(),scale=inverse?1/factor:factor;return {x:e.clientWidth/2+(point.x-e.clientWidth/2)*scale,y:e.clientHeight/2+(point.y-e.clientHeight/2)*scale};}
  function projection(map){const p=map.getProjection();return {containerPointFromCoords:ll=>screen(p.containerPointFromCoords(ll)),coordsFromContainerPoint:point=>{const v=screen(point,true);return p.coordsFromContainerPoint(new env.kakao.maps.Point(v.x,v.y));}};}
  function point(event){const r=surface.getBoundingClientRect();return {x:event.clientX-r.left,y:event.clientY-r.top};}
  function coords(event){return projection(env.km).coordsFromContainerPoint(point(event));}
  // While a stroke tool is armed the surface also covers the 1x map and a drag draws instead of panning.
  // Panning (surface drag above 1x, the map's own drag at 1x) returns as soon as the tool is released.
  function sync(){if(!surface)return;surface.hidden=factor===1&&!stroke;surface.style.cursor=stroke?'crosshair':'grab';surface.setAttribute('aria-label',stroke?'지도 위를 누른 채 끌어서 설치 제외 영역 그리기':'확대 지도 · 드래그로 이동, 클릭으로 그리기');env.km?.setDraggable?.(factor===1&&!stroke);env.km?.setZoomable?.(factor===1);}
  function mount(){if(surface)return;surface=env.document.createElement('div');surface.id='pfDetailInput';surface.setAttribute('aria-label','확대 지도 · 드래그로 이동, 클릭으로 그리기');surface.style.cssText='position:absolute;inset:0;z-index:6;touch-action:none;cursor:grab';el().parentElement.appendChild(surface);const attribution=env.document.createElement('small');attribution.textContent='지도 © Kakao · 국토지리정보원';attribution.style.cssText='position:absolute;right:4px;bottom:2px;background:#ffffffc9;color:#253539;font:10px sans-serif;pointer-events:none';surface.appendChild(attribution);
    // Pointer events cover mouse, pen and touch; only the primary pointer draws or pans.
    surface.addEventListener('pointerdown',e=>{if(!e.isPrimary||e.button!==0)return;e.preventDefault();
      if(stroke){if(stroke.pointer!==null)return;stroke.pointer=e.pointerId;try{surface.setPointerCapture(e.pointerId);}catch(_){/* the stroke still works inside the surface */}stroke.handlers.start?.(coords(e));return;}
      const p=point(e);drag={id:e.pointerId,start:p,last:p,moved:false};surface.setPointerCapture(e.pointerId);surface.style.cursor='grabbing';});
    surface.addEventListener('pointermove',e=>{
      if(stroke){if(stroke.pointer===e.pointerId)stroke.handlers.move?.(coords(e));return;}
      if(!drag||drag.id!==e.pointerId)return;const p=point(e);if(Math.hypot(p.x-drag.start.x,p.y-drag.start.y)>4)drag.moved=true;if(drag.moved){const map=env.km,pr=map.getProjection(),c=pr.containerPointFromCoords(map.getCenter());map.setCenter(pr.coordsFromContainerPoint(new env.kakao.maps.Point(c.x-(p.x-drag.last.x)/factor,c.y-(p.y-drag.last.y)/factor)));}drag.last=p;});
    surface.addEventListener('pointerup',e=>{
      if(stroke){if(stroke.pointer!==e.pointerId)return;const active=stroke;active.pointer=null;if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);active.handlers.end?.(coords(e));return;}
      if(!drag||drag.id!==e.pointerId)return;const click=!drag.moved;drag=null;surface.style.cursor='grab';if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);if(click)env.onClick({latLng:projection(env.km).coordsFromContainerPoint(point(e))});});
    surface.addEventListener('pointercancel',e=>{
      if(stroke){if(stroke.pointer!==null&&(!e||e.pointerId===undefined||e.pointerId===stroke.pointer)){stroke.pointer=null;stroke.handlers.cancel?.();}return;}
      drag=null;surface.style.cursor='grab';});
    // The projection must not change under a stroke that is being drawn.
    surface.addEventListener('wheel',e=>{e.preventDefault();if(stroke&&stroke.pointer!==null)return;env.pgZoom(Math.max(1,Math.min(16,env.pgZoomLv*(e.deltaY<0?2:.5))));},{passive:false});
  }
  function set(value){factor=Math.max(1,Number(value)||1);mount();el().style.transform=factor>1?'scale('+factor+')':'';el().style.transformOrigin='50% 50%';sync();env.dispatchEvent(new env.CustomEvent('pf-detail-zoom'));}
  // Stroke capture: handlers {start, move, end, cancel} receive map coordinates at any zoom, for mouse and touch.
  function capture(handlers){mount();drag=null;stroke={handlers:handlers||{},pointer:null};sync();}
  function release(){if(!stroke)return;const pointer=stroke.pointer;stroke=null;if(pointer!==null){try{if(surface.hasPointerCapture(pointer))surface.releasePointerCapture(pointer);}catch(_){/* the pointer is already gone */}}sync();}
  return {set,get:()=>factor,screen,projection,capture,release,capturing:()=>!!stroke};
});
