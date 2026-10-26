/* Explicit mode in the design studio; map exploration is the fast landing page. */
(function(){'use strict';
  let value=new URLSearchParams(location.search).get('dataMode')==='stored'?'stored':'live';
  window.PFDataMode={get:()=>value,set:v=>{value=v==='live'?'live':'stored';render();}};
  let box;
  function dock(){if(!box)return;const modal=document.getElementById('settingsOverlay'),body=modal?.querySelector('.glass-scroll');const open=modal&&!modal.classList.contains('hidden')&&body;const target=open?body:document.body;if(box.parentElement!==target)target.appendChild(box);box.classList.toggle('pf-data-docked',!!open);}
  function render(){if(!box)return;box.querySelector('select').value=value;box.querySelector('[data-mode-help]').textContent=value==='stored'?'저장 결과를 불러옵니다. 자료가 없거나 오래됐으면 실시간 조회를 선택한 뒤 현장 분석을 누르세요.':'현장을 선택하거나 현장 분석을 누르면 한전·체크사항을 조회합니다. 완료 결과는 계산·저장·보고서에 자동 반영됩니다.';}
  window.addEventListener('DOMContentLoaded',()=>{
    box=document.createElement('div');box.id='pfDataModeBar';box.style.cssText='position:fixed;bottom:8px;left:50%;transform:translateX(-50%);z-index:2999;background:#102e28;color:#fff;padding:8px 12px;border-radius:9px;box-shadow:0 2px 12px #0004;font:12px sans-serif;width:max-content;max-width:calc(100vw - 24px);box-sizing:border-box;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center';
    box.innerHTML='<label style="white-space:nowrap">자료 <select aria-label="상세 설계 조회 방식" style="color:#132f23;border-radius:4px;padding:4px"><option value="stored">저장 결과</option><option value="live">실시간 조회</option></select></label><small data-mode-help style="font:inherit;order:1;flex:1 1 210px;max-width:430px;line-height:1.5"></small><small data-job-status role="status" aria-live="polite" style="font:inherit;flex-basis:100%;order:2"></small>';
    box.querySelector('select').onchange=e=>{window.PFDataMode.set(e.target.value);if(value==='live'&&typeof window.showToast==='function')window.showToast('실시간 모드입니다. 현장 분석 버튼으로 조회하세요.');};
    const analyze=document.createElement('button');analyze.type='button';analyze.setAttribute('data-action-tone','primary');analyze.textContent='현장 분석';analyze.style.cssText='padding:6px 9px;background:#d1fae5;color:#134e4a;border-radius:4px;white-space:nowrap';
    analyze.onclick=async()=>{const c=window.currentAnalysisData||{};if(!c.address||!Number.isFinite(Number(c.lat))||!Number.isFinite(Number(c.lng))){window.showToast?.('주소 또는 지도에서 현장을 먼저 선택하세요.');return;}window.PFDataMode.set('live');analyze.disabled=true;try{await window.fetchAIData?.(Number(c.lat),Number(c.lng),c.address);}finally{analyze.disabled=false;}};box.append(analyze);
    // A job belongs to the site on screen when its first progress event arrives. A site switch (PFRoofPlanner.clear
    // emits pf-site-cleared; a replaced currentAnalysisData object) retires every known job, so an earlier site's
    // long KEPCO/check job can no longer overwrite the new site's status. Solbi chat jobs have their own UI.
    const jobs=new Map();let view=0,viewData=window.currentAnalysisData;
    const siteChanged=()=>{view++;viewData=window.currentAnalysisData;box.querySelector('[data-job-status]').textContent='';};
    window.addEventListener('pf-site-cleared',siteChanged);
    window.addEventListener('pf-job-progress',e=>{const d=e.detail||{};if(!d.jobId||String(d.path||'').startsWith('/api/llm/'))return;if(window.currentAnalysisData!==viewData)siteChanged();if(!jobs.has(d.jobId)){jobs.set(d.jobId,view);while(jobs.size>100)jobs.delete(jobs.keys().next().value);}if(jobs.get(d.jobId)!==view)return;
      const states={queued:'대기 중',running:'원천 자료 확인 중',done:'조회 작업 완료 · 항목별 결과와 미확인 사유를 확인하세요.',error:'조회 실패',cancelled:'조회 취소'};box.querySelector('[data-job-status]').textContent=states[d.status]||'작업 상태 확인 중';});
    document.body.appendChild(box);render();dock();const modal=document.getElementById('settingsOverlay');if(modal)new MutationObserver(dock).observe(modal,{attributes:true,attributeFilter:['class']});
    const q=new URLSearchParams(location.search),lat=Number(q.get('siteLat')),lng=Number(q.get('siteLng'));
    if(q.has('siteLat')&&Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=32&&lat<=39&&lng>=124&&lng<=132){
      let tries=0;const timer=setInterval(async()=>{if(++tries>60){clearInterval(timer);return;}if(!window.map?.setView)return;clearInterval(timer);window.map.setView([lat,lng],17);const input=document.getElementById('addrInput');if(input)input.value=q.get('siteAddress')||'';if(q.get('tool')==='scan'&&window.switchTab)window.switchTab('scan');
        window.PFSelectMapLocation?.({lat,lng,address:q.get('siteAddress')||''});
        box.querySelector('[data-job-status]').textContent='선택 위치를 가져왔습니다. 지도에서 부지·건물을 선택하고 현장 분석을 눌러 주세요.';
        const pnu=q.get('sitePnu');if(/^\d{19}$/.test(pnu||'')){
          box.querySelector('[data-job-status]').textContent='저장 필지 경계를 불러오는 중…';
          try{const r=await fetch((window.BACKEND_URL||location.origin)+'/api/explore/parcel/'+encodeURIComponent(pnu));if(!r.ok)throw new Error('토지 자료 조회 '+r.status);const saved=await r.json();if(!window.PFLoadParcel)throw new Error('설계 화면을 새로고침해 주세요.');await window.PFLoadParcel(saved.item);box.querySelector('[data-job-status]').textContent='실제 필지 경계 적용 · 한전·AI는 현장 분석을 선택하세요.';if(q.get('tool')==='scan')window.switchTab?.('scan');return;}catch(error){box.querySelector('[data-job-status]').textContent='저장 필지 연결 실패: '+error.message;window.showToast?.('저장 필지를 불러오지 못했습니다: '+error.message);return;}
        }
        const id=q.get('siteId');if(!id)return;
        try{const r=await fetch(window.BACKEND_URL+'/api/explore/site/'+encodeURIComponent(id));if(!r.ok)return;const saved=await r.json(),data=saved.data?.data;if(data&&window.PFLoadStoredAnalysis)window.PFLoadStoredAnalysis(data,{lat,lng,address:saved.data.address||q.get('siteAddress'),mode:saved.data.mode||'roof',observedAt:saved.observedAt});}catch(_){}
      },250);
    }else if(q.get('tool')==='scan')setTimeout(()=>window.switchTab?.('scan'),800);
  });
})();
