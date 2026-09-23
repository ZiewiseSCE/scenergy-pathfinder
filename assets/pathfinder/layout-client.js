(function(root){'use strict';
  const assetVersion=new URL(document.currentScript.src).searchParams.get('v');
  class LayoutClient{
    constructor(url){this.url=new URL(url,location.href);if(assetVersion)this.url.searchParams.set('v',assetVersion);this.version=0;this.worker=null;this.reject=null;}
    cancel(){this.version++;if(this.worker){this.worker.terminate();this.worker=null;}if(this.reject){this.reject(new DOMException('새 입력으로 계산 취소','AbortError'));this.reject=null;}}
    calculate(input,onProgress){this.cancel();const version=this.version;return new Promise((resolve,reject)=>{
      this.reject=reject;const worker=this.worker=new Worker(this.url);
      worker.onerror=e=>{if(version!==this.version)return;this.cancel();reject(new Error(e.message||'계산 Worker 시작 실패'));};
      worker.onmessage=e=>{if(version!==this.version||e.data.inputVersion!==version)return;if(e.data.type==='progress'){onProgress?.(e.data.progress);return;}this.reject=null;worker.terminate();this.worker=null;resolve(e.data.result);};
      worker.postMessage({...input,inputVersion:version});
    });}
  }
  root.PFLayoutClient=LayoutClient;
})(window);
