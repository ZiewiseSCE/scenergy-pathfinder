/* Compatibility transport: authenticated first-party requests and durable 202 jobs. */
(function(){'use strict';
  const native=window.fetch.bind(window);
  function credential(){try{const value=sessionStorage.getItem('spf_token');return value?.startsWith('LIC-')?value:'';}catch(_){return '';}}
  function backend(){try{return new URL(window.BACKEND_URL|| (typeof BACKEND_URL!=='undefined'?BACKEND_URL:location.origin),location.href).origin;}catch(_){return location.origin;}}
  function headers(initial){const h=new Headers(initial||{}),key=credential();if(key&&!h.has('Authorization')&&!h.has('X-License-Key'))h.set('X-License-Key',key);return h;}
  function sleep(ms,signal){return new Promise((resolve,reject)=>{if(signal?.aborted)return reject(signal.reason);const abort=()=>{clearTimeout(timer);reject(signal.reason||new DOMException('취소','AbortError'));};const timer=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});}
  async function download(url){const target=new URL(url,backend());if(target.origin!==backend())throw new Error('다운로드 서버 주소가 다릅니다.');const response=await window.fetch(target,{headers:headers(),credentials:'include'});if(!response.ok)throw new Error('다운로드 실패 ('+response.status+')');const blob=await response.blob(),object=URL.createObjectURL(blob),link=document.createElement('a');link.href=object;const disposition=response.headers.get('Content-Disposition')||'',utf=/filename\*=UTF-8''([^;]+)/i.exec(disposition),plain=/filename="?([^";]+)/i.exec(disposition);let name=utf?decodeURIComponent(utf[1]):plain?.[1];link.download=(name||'pathfinder-'+Date.now()+(blob.type.includes('zip')?'.zip':blob.type.includes('csv')?'.csv':'.json')).replace(/[\\/\r\n]/g,'_');link.click();setTimeout(()=>URL.revokeObjectURL(object),60000);}
  window.PFHTTP={credential,headers,native,download};
  window.fetch=async function(input,init={}){
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url,location.href);
    if(url.origin!==backend()||!url.pathname.startsWith('/api/'))return native(input,init);
    const requestHeaders=headers(init.headers||(input instanceof Request?input.headers:undefined));
    if(window.PFDataMode)requestHeaders.set('X-PF-Data-Mode',window.PFDataMode.get());
    const req=new Request(input,{...init,headers:requestHeaders,credentials:'include'});
    let response=await native(req);
    if(response.status!==202)return response;
    let queued;try{queued=await response.clone().json();}catch(_){return response;}
    if(!queued.job_id||!queued.pollUrl)return response;
    if(url.pathname==='/api/llm/job/start')return response;
    if(url.pathname==='/api/scan/start')return new Response(JSON.stringify({...queued,scan_id:'scan_'+queued.job_id,status:'pending',message:'작업이 저장되었습니다. 대기 후 시작합니다.'}),{status:202,headers:{'Content-Type':'application/json'}});
    const poll=new URL(queued.pollUrl,url.origin);if(poll.origin!==url.origin)throw new Error('잘못된 작업 조회 주소');
    const begin=Date.now();let delay=1000;
    try{
      while(Date.now()-begin<20*60*1000){await sleep(delay,req.signal);delay=Math.min(4000,delay*1.2);
        response=await native(poll,{headers:headers(req.headers),signal:req.signal,credentials:'include'});
        if(!response.ok)throw new Error('작업 상태 조회 실패 ('+response.status+')');
        const job=await response.json();window.dispatchEvent(new CustomEvent('pf-job-progress',{detail:{jobId:queued.job_id,status:job.status,path:url.pathname}}));
        if(job.status==='done'||job.status==='error'){
          const result=job.result;if(result?.text!==undefined)return new Response(result.text,{status:result.httpStatus||200,headers:{'Content-Type':result.mime||'text/plain'}});if(result?.binary)return new Response(Uint8Array.from(atob(result.binary),c=>c.charCodeAt(0)),{status:result.httpStatus||200,headers:{'Content-Type':result.mime||'application/octet-stream'}});return new Response(JSON.stringify(result?.data||{ok:false,error:job.error||'job_failed'}),{status:result?.httpStatus||(job.status==='done'?200:502),headers:{'Content-Type':'application/json'}});
        }
        if(job.status==='cancelled')throw new DOMException('작업 취소','AbortError');
      }
      throw new Error('작업이 계속 진행 중입니다. 작업 ID: '+queued.job_id);
    }catch(error){if(req.signal.aborted)native(new URL('/api/jobs/'+queued.job_id+'/cancel',url.origin),{method:'POST',headers:headers()}).catch(()=>{});throw error;}
  };
})();
