/* Stable browser registration: never derive the secret from OS/browser versions. */
(function(){'use strict';
  const storageKey='pf_device_secret_v1',api='https://pathfinder-api.ziewise.com';
  function secret(){
    try{
      let value=localStorage.getItem(storageKey);
      if(!/^[a-f0-9]{64}$/.test(value||'')){
        const bytes=crypto.getRandomValues(new Uint8Array(32));
        value=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
        localStorage.setItem(storageKey,value);
      }
      if(localStorage.getItem(storageKey)!==value)throw new Error('storage_unavailable');
      return value;
    }catch(_){throw new Error('기기 등록정보를 저장할 수 없습니다. 일반 브라우저에서 사이트 데이터 저장을 허용한 뒤 로그인하세요.');}
  }
  function label(){
    const ua=navigator.userAgent||'';
    const system=/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'iPad':/Android/.test(ua)?'Android':/iPhone/.test(ua)?'iPhone':/Windows/.test(ua)?'Windows':/Mac/.test(ua)?'Mac':'기기';
    const browser=/Edg\//.test(ua)?'Edge':/CriOS|Chrome/.test(ua)?'Chrome':/Firefox|FxiOS/.test(ua)?'Firefox':/Safari/.test(ua)?'Safari':'브라우저';
    return system+' · '+browser;
  }
  function errorMessage(data,status){
    const code=data?.error||data?.msg;
    if(code==='device_already_registered')return '이미 다른 브라우저에 등록된 LIC입니다. 최초 등록한 브라우저를 사용하거나 관리자에게 기기 리셋을 요청하세요. 같은 PC의 Edge와 Chrome도 별도 등록입니다.';
    if(code==='device_registration_required'||code==='device_not_registered')return '이 브라우저의 등록을 확인할 수 없습니다. 최초 등록한 브라우저에서 로그인하세요. 데이터 삭제·기기 교체 후에는 관리자 리셋이 필요합니다.';
    return status===429?'시도가 많습니다. 15분 후 다시 시도하세요.':'키가 올바르지 않거나 만료·해지되었습니다. 발급 관리자에게 확인하세요.';
  }
  const native=window.fetch.bind(window);
  window.fetch=function(input,init={}){
    const target=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
    if((target.origin!==api&&target.origin!==location.origin)||!target.pathname.startsWith('/api/'))return native(input,init);
    const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
    if(!headers.has('X-PF-Device'))headers.set('X-PF-Device',secret());
    return native(input,{...init,headers});
  };
  window.PFDevice={secret,label,errorMessage};
})();
