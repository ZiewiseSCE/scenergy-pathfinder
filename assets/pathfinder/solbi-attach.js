/* An address list attached to a Solbi chat message (xlsx, csv, txt): shared by the phone page and the PC panel.
   The file is uploaded once (POST /api/llm/address-file, pf_solbi_address_file); the server keeps its addresses for
   30 minutes and the next chat message carries only {addressFile:{id}} in its context, which the server turns into the
   analysis card of every address. Nothing of the file is read here beyond its name and size. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PFSolbiAttach=api;})(typeof self!=='undefined'?self:this,function(){
  'use strict';
  const PATH='/api/llm/address-file',MAX_BYTES=3*1024*1024,TYPES=['xlsx','xlsm','csv','tsv','txt'];
  const ACCEPT='.xlsx,.xlsm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain';
  // The Solbi Android app opens a file picker from 1.0.5 (WebChromeClient.onShowFileChooser); older apps have none.
  const APP_PICKER=[1,0,5];
  const DEFAULT_MESSAGE='첨부한 주소 목록을 분석해줘';
  const TEXT={
    type:'엑셀(.xlsx), CSV 또는 텍스트(.txt) 파일만 읽을 수 있습니다. 예전 엑셀(.xls)·한글·PDF는 .xlsx나 .csv로 저장해서 올려 주세요.',
    size:'파일이 너무 큽니다. 3MB 이하의 주소 목록 파일을 올려 주세요.',
    read:'파일을 읽지 못했습니다. 다시 선택해 주세요.',
    server:'파일을 올리지 못했습니다. 잠시 후 다시 시도해 주세요.',
    app:'이 버전의 솔비 앱에서는 파일을 첨부할 수 없습니다. 앱을 1.0.5 이상으로 업데이트하거나 브라우저에서 솔비를 열어 주세요.',
    busy:'파일을 읽고 있습니다…',
    hint:'주소 목록 파일 첨부 (엑셀·CSV·텍스트)'};
  function extension(name){const m=/\.([A-Za-z0-9]{1,6})$/.exec(String(name||''));return m?m[1].toLowerCase():'';}
  // A file this page can send: Error(Korean reason) otherwise. A name without an extension is left to the server.
  function check(file){
    if(!file||typeof file.size!=='number')throw new Error(TEXT.read);
    const kind=extension(file.name);
    if(kind&&!TYPES.includes(kind))throw new Error(TEXT.type);
    if(file.size>MAX_BYTES)throw new Error(TEXT.size);
    if(!file.size)throw new Error(TEXT.read);
    return file;
  }
  function base64(buffer){
    const bytes=new Uint8Array(buffer);let text='';
    for(let i=0;i<bytes.length;i+=0x8000)text+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
    return btoa(text);
  }
  // send(path, body) is the page's own authenticated JSON POST (it throws an Error with the server's message on a refusal).
  async function upload(file,send){
    check(file);
    let data;try{data=base64(await file.arrayBuffer());}catch(_){throw new Error(TEXT.read);}
    const reply=await send(PATH,{name:String(file.name||'첨부 파일').slice(-120),data});
    const info=reply&&reply.file;
    if(!reply||reply.ok!==true||!info||!/^af_[0-9a-f]{32}$/.test(String(info.id||''))||!(info.count>0))
      throw new Error(typeof reply?.message==='string'&&/[가-힣]/.test(reply.message)?reply.message:TEXT.server);
    return info;
  }
  function shortName(name){name=String(name||'첨부 파일');return name.length>28?name.slice(0,14)+'…'+name.slice(-11):name;}
  function label(info){return '📎 '+shortName(info?.name)+' · 주소 '+Number(info?.count||0)+'곳';}
  // The request context of the message that goes with a kept list, or null.
  function context(info){return info&&/^af_[0-9a-f]{32}$/.test(String(info.id||''))&&!info.tooMany?{addressFile:{id:info.id}}:null;}
  function appVersion(ua){const m=/\bSolbiAndroid\/(\d+)\.(\d+)\.(\d+)\b/.exec(ua||'');return m?[+m[1],+m[2],+m[3]]:null;}
  // false only inside a Solbi Android app older than 1.0.5 (a browser, the iPhone home-screen app and newer apps can pick).
  function canPick(ua){const v=appVersion(ua);if(!v)return true;for(let i=0;i<3;i++)if(v[i]!==APP_PICKER[i])return v[i]>APP_PICKER[i];return true;}
  // The first file of a drop or a paste, or null.
  function fileOf(event){const list=event?.dataTransfer?.files||event?.clipboardData?.files;return list&&list.length?list[0]:null;}
  function carriesFiles(event){const types=event?.dataTransfer?.types;return !!types&&Array.prototype.indexOf.call(types,'Files')>=0;}
  // Opens the system file picker; resolves with the chosen File or null.
  function pick(doc){
    doc=doc||document;
    return new Promise(resolve=>{
      const input=doc.createElement('input');input.type='file';input.accept=ACCEPT;input.hidden=true;
      let done=false;const finish=file=>{if(done)return;done=true;input.remove();resolve(file||null);};
      input.addEventListener('change',()=>finish(input.files&&input.files[0]));
      input.addEventListener('cancel',()=>finish(null));
      doc.body.append(input);input.click();
    });
  }
  return {PATH,MAX_BYTES,TYPES,ACCEPT,DEFAULT_MESSAGE,TEXT,check,base64,upload,label,shortName,context,canPick,fileOf,carriesFiles,pick};
});
