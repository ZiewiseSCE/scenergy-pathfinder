/* Explicit mode in the design studio; map exploration is the fast landing page. */
(function(){'use strict';
  let value=new URLSearchParams(location.search).get('dataMode')==='live'?'live':'stored';
  window.PFDataMode={get:()=>value,set:v=>{value=v==='live'?'live':'stored';render();}};
  let box;
  function render(){if(!box)return;box.querySelector('select').value=value;box.querySelector('small').textContent=value==='stored'?'동일 조건의 저장 결과 우선 · 새 분석은 실시간 모드를 선택하세요.':'선택 현장의 원천 자료를 조회합니다.';}
  window.addEventListener('DOMContentLoaded',()=>{
    box=document.createElement('div');box.id='pfDataModeBar';box.style.cssText='position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:2999;background:#102e28;color:#fff;padding:8px 12px;border-radius:9px;box-shadow:0 2px 12px #0004;font:11px sans-serif;max-width:95vw;display:flex;gap:10px;align-items:center';
    box.innerHTML='<a href="explore.html" style="color:#89e5bf;white-space:nowrap">← 에너지 지도</a><label style="white-space:nowrap">자료 <select aria-label="상세 설계 조회 방식" style="color:#132f23;border-radius:4px;padding:4px"><option value="stored">저장 결과</option><option value="live">실시간 조회</option></select></label><small></small>';
    box.querySelector('select').onchange=e=>{window.PFDataMode.set(e.target.value);if(value==='live'&&typeof window.showToast==='function')window.showToast('실시간 모드입니다. 현장 분석 버튼으로 조회하세요.');};document.body.appendChild(box);render();
    const q=new URLSearchParams(location.search),lat=Number(q.get('siteLat')),lng=Number(q.get('siteLng'));
    if(q.has('siteLat')&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=32&&lat<=39&&lng>=124&&lng<=132){
      let tries=0;const timer=setInterval(async()=>{if(++tries>60){clearInterval(timer);return;}if(!window.map?.setView)return;clearInterval(timer);window.map.setView([lat,lng],17);const input=document.getElementById('addrInput');if(input)input.value=q.get('siteAddress')||'';if(q.get('tool')==='scan'&&window.switchTab)window.switchTab('scan');
        const id=q.get('siteId');if(!id)return;
        try{const r=await fetch(window.BACKEND_URL+'/api/explore/site/'+encodeURIComponent(id));if(!r.ok)return;const saved=await r.json(),data=saved.data?.data;if(data&&window.PFLoadStoredAnalysis)window.PFLoadStoredAnalysis(data,{lat,lng,address:q.get('siteAddress'),observedAt:saved.observedAt});}catch(_){}
      },250);
    }else if(q.get('tool')==='scan')setTimeout(()=>window.switchTab?.('scan'),800);
  });
})();
