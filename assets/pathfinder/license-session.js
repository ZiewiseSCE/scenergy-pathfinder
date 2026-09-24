/* A license identifies the workspace; a browser/device ID never does. */
(function(){'use strict';
  const api='https://pathfinder-api.ziewise.com';
  const legacy=['spf_token','sp_license','license_key','licenseKey','lic_key','sce_license','pathfinder_license','solar_license','scenergy_license','spf_fp','sp_key_bound','pf_account_session','solbi_token'];
  for(const key of legacy){try{localStorage.removeItem(key);}catch(_){}}
  function login(){location.replace('./index.html?next='+encodeURIComponent(location.pathname+location.search));}
  async function logout(){const key=sessionStorage.getItem('spf_token');sessionStorage.removeItem('spf_token');try{await fetch(api+'/api/auth/logout',{method:'POST',headers:key?{'X-License-Key':key}:{},credentials:'include'});}finally{login();}}
  const ready=(async()=>{
    const key=sessionStorage.getItem('spf_token');if(!key){login();return false;}
    try{
      const r=await fetch(api+'/api/license/check',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:key})});
      if(r.status===401||r.status===403){sessionStorage.removeItem('spf_token');login();return false;}
      if(!r.ok)throw new Error('라이선스 확인 서버 응답 지연');
      return true;
    }catch(_){window.addEventListener('DOMContentLoaded',()=>{const n=document.createElement('p');n.setAttribute('role','status');n.textContent='서버 연결이 지연됩니다. 라이선스가 필요한 작업은 연결 복구 후 다시 시도하세요.';n.style.cssText='position:fixed;bottom:8px;left:8px;right:8px;z-index:99999;padding:12px;background:#fff1cc;color:#3c2800';document.body.append(n);},{once:true});return false;}
  })();
  window.PFLicenseSession={ready,logout};
  window.addEventListener('DOMContentLoaded',()=>{
    const host=document.querySelector('[data-license-controls]');
    if(!host)return;
    const account=document.createElement('details');account.className='license-account';
    const summary=document.createElement('summary');summary.textContent='계정';summary.setAttribute('aria-label','계정 메뉴');
    const panel=document.createElement('div');panel.className='license-account-panel';
    const label=document.createElement('p');label.textContent='LIC로 로그인 중';
    const button=document.createElement('button');button.type='button';button.textContent='로그아웃';button.title='현재 LIC 인증 종료';button.onclick=logout;
    panel.append(label,button);account.append(summary,panel);host.append(account);
    document.addEventListener('click',e=>{if(!account.contains(e.target))account.open=false;});
    account.addEventListener('keydown',e=>{if(e.key==='Escape'){account.open=false;summary.focus();}});
  },{once:true});
})();
