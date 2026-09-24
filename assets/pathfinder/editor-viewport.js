/* Keep the last settled view across SDK and DOM resize notifications. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.PFEditorViewport=factory(root);
})(typeof window!=='undefined'?window:this,function(environment){
  'use strict';
  function observe(map,element,draw){
    const event=environment.kakao.maps.event,Observer=environment.ResizeObserver;
    const size=()=>[element.clientWidth,element.clientHeight];
    let [width,height]=size(),center=map.getCenter(),resizing=false;
    const remember=()=>{
      const [w,h]=size();
      // Kakao automatically relayouts on window.resize, before ResizeObserver.
      // Its resulting center_changed must not replace the pre-resize center.
      if(!resizing&&w===width&&h===height&&w&&h)center=map.getCenter();
    };
    event.addListener(map,'center_changed',remember);
    const observer=new Observer(()=>{
      const [w,h]=size();
      if(!w||!h)return;
      if(w!==width||h!==height){
        resizing=true;
        try{
          map.relayout();
          map.setCenter(center);
          [width,height]=[w,h];
        }finally{resizing=false;}
      }
      draw();
    });
    observer.observe(element);
    return ()=>{observer.disconnect();event.removeListener(map,'center_changed',remember);};
  }
  return {observe};
});
