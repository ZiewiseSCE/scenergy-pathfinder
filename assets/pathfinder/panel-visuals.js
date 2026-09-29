/* Presentation only: never alter saved module coordinates, count or capacity. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PFPanelVisuals=api;
})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const textures=new Map();
  const point=p=>Array.isArray(p)?p:[p.x,p.y];
  const distance=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);
  function basis(ring){
    if(!ring||ring.length<4)return null;
    let p=ring.slice(0,4).map(point);
    if(p.some(a=>!a.every(Number.isFinite)))return null;
    // Texture cells always follow the physical long side, including rotated arrays.
    if(distance(p[0],p[1])>distance(p[0],p[3]))p=[p[1],p[2],p[3],p[0]];
    const w=distance(p[0],p[1]),h=distance(p[0],p[3]);
    if(w<.05||h<.05)return null;
    return {p,w,h};
  }
  function texture(detail){
    if(textures.has(detail))return textures.get(detail);
    if(typeof document==='undefined')return null;
    const canvas=document.createElement('canvas');canvas.width=144;canvas.height=288;
    const c=canvas.getContext('2d');
    c.fillStyle='#8c989f';c.fillRect(0,0,144,288);
    const glass=c.createLinearGradient(0,288,144,0);
    glass.addColorStop(0,'#101c26');glass.addColorStop(.55,'#1d303f');glass.addColorStop(1,'#344956');
    c.fillStyle=glass;c.fillRect(2,2,140,284);
    if(detail){
      c.strokeStyle='rgba(154,177,192,.28)';c.lineWidth=.6;
      c.beginPath();
      for(let x=1;x<6;x++){c.moveTo(3+x*23,3);c.lineTo(3+x*23,285);}
      for(let y=1;y<12;y++){c.moveTo(3,3+y*23.5);c.lineTo(141,3+y*23.5);}
      c.stroke();
      c.fillStyle='#101a22';c.fillRect(3,142,138,4);
    }
    c.strokeStyle='rgba(235,242,246,.65)';c.lineWidth=.8;
    c.beginPath();c.moveTo(1,287);c.lineTo(1,1);c.lineTo(143,1);c.stroke();
    textures.set(detail,canvas);return canvas;
  }
  function drawPanel(ctx,ring){
    const b=basis(ring);if(!b)return;
    const {p,w,h}=b;
    ctx.save();
    ctx.beginPath();p.forEach((a,i)=>i?ctx.lineTo(...a):ctx.moveTo(...a));ctx.closePath();
    // Solid, quiet silhouettes at overview zoom; no subpixel grid shimmer.
    if(Math.min(w,h)<3){ctx.fillStyle='#203440';ctx.fill();ctx.restore();return;}
    ctx.clip();
    const t=texture(Math.min(w,h)>=14);
    if(t){
      ctx.transform((p[1][0]-p[0][0])/144,(p[1][1]-p[0][1])/144,
        (p[3][0]-p[0][0])/288,(p[3][1]-p[0][1])/288,p[0][0],p[0][1]);
      ctx.drawImage(t,0,0);
    }else{ctx.fillStyle='#203440';ctx.fill();}
    ctx.restore();
  }
  function intersects(a,b,gap=4){return a.x<b.x+b.w+gap&&a.x+a.w+gap>b.x&&a.y<b.y+b.h+gap&&a.y+a.h+gap>b.y;}
  function inside(p,ring){
    let hit=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const a=ring[i],b=ring[j];
      if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;
    }return hit;
  }
  function boxHitsPolygon(box,ring){
    const corners=[[box.x,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h],[box.x,box.y+box.h]];
    if(corners.some(p=>inside(p,ring)))return true;
    if(ring.some(p=>p[0]>=box.x&&p[0]<=box.x+box.w&&p[1]>=box.y&&p[1]<=box.y+box.h))return true;
    // Segment/box intersection also catches thin concave pieces through a label.
    for(let i=0;i<ring.length;i++){
      const a=ring[i],b=ring[(i+1)%ring.length];let lo=0,hi=1;
      for(let axis=0;axis<2;axis++){
        const min=axis?box.y:box.x,max=min+(axis?box.h:box.w),d=b[axis]-a[axis];
        if(Math.abs(d)<1e-9){if(a[axis]<min||a[axis]>max){hi=-1;break;}}
        else{const u=(min-a[axis])/d,v=(max-a[axis])/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));}
      }
      if(lo<=hi)return true;
    }return false;
  }
  function placeLabels(edges,width,height,measure,obstacles=[],polygons=[]){
    const placed=[],occupied=obstacles.slice(),margin=10;
    const ranked=edges.map((e,index)=>({...e,index,length:distance(e.a,e.b)})).sort((a,b)=>b.length-a.length||a.index-b.index);
    for(const e of ranked){
      if(e.length<18||placed.length>=80)continue;
      const mid=[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2];
      if(mid[0]<0||mid[0]>width||mid[1]<0||mid[1]>height)continue;
      const w=Math.ceil(measure(e.text))+18,h=26,nx=-(e.b[1]-e.a[1])/e.length,ny=(e.b[0]-e.a[0])/e.length;
      let chosen=null;
      // Candidates stay beside their own edge. Omit crowded labels, never shrink text.
      for(const offset of [24,42,64,90]){
        for(const side of [1,-1]){
          const box={x:mid[0]+nx*offset*side-w/2,y:mid[1]+ny*offset*side-h/2,w,h};
          if(box.x<margin||box.y<margin||box.x+w>width-margin||box.y+h>height-margin)continue;
          if(occupied.some(o=>intersects(box,o))||polygons.some(r=>boxHitsPolygon(box,r)))continue;
          chosen={...box,text:e.text,id:e.id,anchor:mid};break;
        }if(chosen)break;
      }
      if(chosen){placed.push(chosen);occupied.push(chosen);}
    }
    return {placed,hidden:edges.length-placed.length};
  }
  function drawLabels(ctx,result){
    ctx.save();ctx.font='600 12px system-ui, sans-serif';ctx.textBaseline='middle';ctx.textAlign='center';
    // Leaders first, opaque cards second: lines cannot cross any text.
    ctx.strokeStyle='rgba(230,236,237,.8)';ctx.lineWidth=1;
    for(const b of result.placed){ctx.beginPath();ctx.moveTo(...b.anchor);ctx.lineTo(b.x+b.w/2,b.y+b.h/2);ctx.stroke();}
    for(const b of result.placed){
      ctx.fillStyle='#f8fafc';ctx.fillRect(b.x,b.y,b.w,b.h);
      ctx.strokeStyle='#9baeb6';ctx.strokeRect(b.x+.5,b.y+.5,b.w-1,b.h-1);
      ctx.fillStyle='#183444';ctx.fillText(b.text,b.x+b.w/2,b.y+b.h/2);
    }ctx.restore();
  }
  function leafletRenderer(L){
    const Renderer=L.Canvas.extend({_updatePoly:function(layer,closed){
      if(!this._drawing)return;
      if(closed&&layer.options.pfModule&&layer._parts?.length&&layer._rings?.[0]?.length>=4){drawPanel(this._ctx,layer._rings[0]);return;}
      L.Canvas.prototype._updatePoly.call(this,layer,closed);
    }});
    return new Renderer({padding:.3});
  }
  function reportImage(canvas,maxChars=420000){
    // The report payload caps embedded images. Preserve detail until resizing is needed.
    let image=canvas.toDataURL('image/jpeg',.9),current=canvas;
    if(image.length<=maxChars)return image;
    for(let i=0;i<16;i++){
      image=current.toDataURL('image/jpeg',.76);
      if(image.length<=maxChars)return image;
      const next=canvas.ownerDocument.createElement('canvas');
      next.width=Math.max(1,Math.round(current.width*.8));next.height=Math.max(1,Math.round(current.height*.8));
      const ctx=next.getContext('2d');ctx.drawImage(current,0,0,next.width,next.height);current=next;
    }
    throw new Error('리포트 이미지 크기를 줄이지 못했습니다. 지도를 축소한 뒤 다시 캡처하세요.');
  }
  return {drawPanel,basis,placeLabels,drawLabels,intersects,boxHitsPolygon,leafletRenderer,reportImage};
});
