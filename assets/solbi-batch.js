/* Address list -> PDF: the sales conditions (지붕/토지, 모듈, 인버터, 이격 여유율) and the recipient are explicit;
   state and artifacts belong to the signed-in owner. Solbi's chat hands addresses and settings over through open().
   The chat also uses this script's own download and status code for a batch it started (pf_solbi_analysis_options):
   PFSolbiBatch.watch(id, onDone) follows one batch until it ends, PFSolbiBatch.resultCard(batch) is the "N곳 분석이
   끝났습니다" message with the ZIP and the per-address PDFs, PFSolbiBatch.download(url, name) saves one file. */
(function(){'use strict';
 const $=id=>document.getElementById(id);let options=null,timer=null,submissionKey=null,draft=null,busy=false;
 const dialog=$('batchDialog');
 // Used until /options answers, and with a backend that does not send `groups` yet (it is published after this page).
 const MODES=[{value:'roof',label:'지붕'},{value:'land',label:'토지'}],MARGINS=[5,10,15,20].map(n=>({value:n,label:n+'%'}));
 const MARGIN_MAX=40,MARGIN_ERROR='이격 여유율은 0~40% 범위로 입력하세요.';
 const chosen={mode:'roof',marginPct:10};
 function error(e){$('batchError').textContent=e instanceof TypeError?'연결할 수 없습니다. 인터넷 연결 후 다시 시도하세요.':e?.message||String(e);}
 // Refusals in words the screen shows (phone and PC), never a raw server code (batch_not_found, file_expired, …); the
 // server's own Korean message is kept. File downloads on the phone say the same (PFSolbiFiles.message, solbi-install.js).
 const ERRORS={batch_not_found:'작업을 찾을 수 없습니다.',file_not_found:'작업을 찾을 수 없습니다.',batch_not_running:'이미 끝났거나 중단된 작업입니다. 목록을 새로 고쳐 확인하세요.',file_expired:'보관 기간(30일)이 지나 파일을 받을 수 없습니다.',file_not_ready:'파일이 아직 준비되지 않았습니다. 분석이 끝난 뒤 다시 받으세요.',files_not_ready:'아직 완료된 보고서가 없습니다.',idempotency_conflict:'이미 접수된 요청과 내용이 다릅니다. 진행 목록에서 먼저 확인하세요.',idempotency_key_required:'요청을 다시 보내 주세요.',authentication_required:'로그인 상태를 다시 확인해 주세요.',license_required:'로그인 상태를 다시 확인해 주세요.'};
 function message(data){const code=String(data?.error||'');
  if(Object.prototype.hasOwnProperty.call(ERRORS,code))return ERRORS[code];
  return typeof data?.message==='string'&&/[가-힣]/.test(data.message)?data.message:'요청을 처리하지 못했습니다. 잠시 후 다시 시도하세요.';}
 async function api(path,init={}){
  const r=await fetch(path,{credentials:'include',...init,headers:{'Content-Type':'application/json',...(init.headers||{})}});
  const data=await r.json().catch(()=>({}));if(!r.ok||!data.ok)throw Object.assign(Error(message(data)),{status:r.status,code:String(data?.error||'')});return data;
 }
 const group=key=>(Array.isArray(options?.groups)?options.groups:[]).find(g=>g&&g.key===key);
 const mailReady=()=>options?(options.mailReady??options.mailConfigured)!==false:true;
 function option(parent,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;parent.append(o);return o;}
 // One pressed chip per group; aria-pressed carries the state for screen readers and the style.
 function chips(host,items,current,pick){
  host.replaceChildren(...items.map(item=>{const b=document.createElement('button');b.type='button';b.className='batch-chip';b.textContent=item.label;
   b.dataset.value=String(item.value);b.setAttribute('aria-pressed',String(item.value===current));b.onclick=()=>pick(item.value);return b;}));
 }
 // What the user (or the chat) chose already: server defaults that arrive later do not overwrite it.
 const touched=new Set(),wanted={};
 function drawMode(){chips($('batchMode'),group('mode')?.options||MODES,chosen.mode,value=>{chosen.mode=value;touched.add('mode');drawMode();});}
 const margins=()=>group('marginPct')?.options||MARGINS;
 function drawMargin(){chips($('batchMargin'),margins(),chosen.marginPct,value=>{chosen.marginPct=value;touched.add('marginPct');$('batchMarginCustom').value='';drawMargin();});}
 // The typed number wins over the chips; emptied again, a value no chip shows goes back to the default instead of staying hidden.
 function customMargin(){const raw=$('batchMarginCustom').value.trim();
  if(raw){const n=Number(raw);chosen.marginPct=Number.isFinite(n)?n:NaN;touched.add('marginPct');}
  else if(!margins().some(o=>o.value===chosen.marginPct))chosen.marginPct=group('marginPct')?.value??10;
  drawMargin();}
 function setMargin(value){const n=Number(value);if(value===null||value===''||!Number.isFinite(n))return;chosen.marginPct=n;touched.add('marginPct');
  $('batchMarginCustom').value=margins().some(o=>o.value===n)?'':String(n);drawMargin();}
 function select(id,value){const el=$(id);if(value===null||value===undefined)return;if([...el.options].some(o=>o.value===String(value)))el.value=String(value);}
 // Featured equipment first; every catalog item stays selectable.
 function fill(id,g,fallback,preferred){
  const el=$(id);el.replaceChildren();
  if(!g){for(const [value,label] of fallback)option(el,value,label);select(id,preferred);return;}
  const text=o=>o.label+(o.detail?' · '+o.detail:''),featured=g.options.filter(o=>o.featured),rest=g.options.filter(o=>!o.featured);
  if(featured.length&&rest.length)for(const [label,list] of [['주요 장비',featured],['전체 장비',rest]]){const box=document.createElement('optgroup');box.label=label;for(const o of list)option(box,o.value,text(o));el.append(box);}
  else for(const o of g.options)option(el,o.value,text(o));
  select(id,g.value);
 }
 async function load(){
  if(options)return;options=await api('/api/batches/options');
  const catalog=options.catalog||{modules:[],inverters:[]};
  if(!touched.has('mode'))chosen.mode=group('mode')?.value||'roof';
  if(!touched.has('marginPct'))chosen.marginPct=group('marginPct')?.value??10;
  drawMode();drawMargin();
  fill('batchModule',group('moduleId'),catalog.modules.map(m=>[m.id,`${m.brand} · ${m.model} · ${m.powerW}W · ${m.heightM}×${m.widthM}m`]),1);
  fill('batchInverter',group('inverterId'),catalog.inverters.map(i=>[i.id,`${i.brand} · ${i.model} · ${i.capacityKw}kW`]),2);
  select('batchModule',wanted.moduleId);select('batchInverter',wanted.inverterId);
  if(options.marginHelp)$('batchMarginHelp').textContent=options.marginHelp;
  if(catalog.version)$('batchCatalogNote').textContent='장비 목록 기준: '+catalog.version+'. 선택한 모듈의 출력과 외형 규격을 배치 계산에 적용합니다.';
  if(!mailReady())$('batchMailNote').textContent='메일 서버 설정이 아직 없습니다. 이메일을 비우면 PDF·HTML을 다운로드할 수 있습니다.';
  else if(options.lastEmail&&!$('batchEmail').value){$('batchEmail').value=options.lastEmail;
   $('batchMailNote').textContent='지난번에 받은 주소를 넣어 두었습니다. 메일이 필요 없으면 지우세요. 쉼표로 구분해 최대 2개까지 입력할 수 있고, 분석 완료 후 각 수신자에게 같은 PDF를 개별 발송합니다.';}
 }
 // `preset` is the retired key: a backend published before this page still reads the mode from it.
 function settings(){return {mode:chosen.mode,moduleId:Number($('batchModule').value),inverterId:Number($('batchInverter').value),marginPct:chosen.marginPct,preset:chosen.mode==='land'?'land_standard':'roof_standard'};}
 // Chat (or a caller) hands over what it already knows: {addresses: [..] | 'a\nb', settings: {mode, moduleId, inverterId, marginPct}, recipient}.
 function prefill(given){
  const list=Array.isArray(given.addresses)?given.addresses.join('\n'):typeof given.addresses==='string'?given.addresses:'';
  if(list)$('batchAddresses').value=list;
  const s=given.settings&&typeof given.settings==='object'?given.settings:null;
  if(s){if(s.mode==='roof'||s.mode==='land'){chosen.mode=s.mode;touched.add('mode');drawMode();}
   // kept as well: the equipment lists may still be loading
   wanted.moduleId=s.moduleId??wanted.moduleId;wanted.inverterId=s.inverterId??wanted.inverterId;
   select('batchModule',s.moduleId);select('batchInverter',s.inverterId);setMargin(s.marginPct??null);}
  const mail=[given.recipient,given.email,s?.email].find(x=>typeof x==='string'&&x.trim());
  if(mail&&mailReady())$('batchEmail').value=mail.trim();
  if(list||s||mail){draft=null;$('batchEdit').hidden=false;$('batchReview').hidden=true;}
 }
 async function open(value){if(!window.PFSolbiWake?.isAwake())return;if(!dialog.open)dialog.showModal();$('batchError').textContent='';
  const given=typeof value==='string'?(value?{addresses:value}:null):value&&typeof value==='object'?value:null;
  // What the chat handed over is kept even when the conditions cannot be loaded right now.
  try{await load();}catch(e){error(e);}
  if(given)prefill(given);
  try{await refresh();if(given?.view==='jobs')$('batchJobs').scrollIntoView({block:'start'});}catch(e){error(e);}}
 function review(event){event.preventDefault();$('batchError').textContent='';
  const all=$('batchAddresses').value.split(/\r?\n/).map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean),addresses=[...new Set(all)];
  if(!addresses.length||addresses.length>100){error(Error(addresses.length?`중복을 제외한 주소가 ${addresses.length}곳입니다. 한 번에 최대 100곳까지 분석하니 목록을 나누어 입력하세요.`:'주소를 한 줄에 하나씩 입력하세요.'));return;}
  if(!options){error(Error('분석 조건을 아직 불러오지 못했습니다. 화면을 닫았다가 다시 열어 주세요.'));return;}
  customMargin();
  if(!Number.isFinite(chosen.marginPct)||chosen.marginPct<0||chosen.marginPct>MARGIN_MAX){error(Error(MARGIN_ERROR));return;}
  // the first spelling of a repeated address is kept, as the server keeps it
  const recipients=$('batchEmail').value.split(',').map(x=>x.trim()).filter(Boolean),uniqueRecipients=recipients.filter((x,i)=>recipients.findIndex(y=>y.toLowerCase()===x.toLowerCase())===i);
  if(uniqueRecipients.length>2){error(Error('수신 이메일은 최대 2개까지 입력하세요.'));return;}
  draft={addresses:all,settings:settings(),recipient:uniqueRecipients.join(', '),testEmail:$('batchTestEmail').checked};submissionKey=crypto.randomUUID();
  const picked=id=>{const el=$(id),o=[...el.options].find(x=>x.value===el.value);return o?o.textContent:'';};
  $('batchPreview').textContent=`${addresses.length}곳 분석${all.length>addresses.length?' · 중복 '+(all.length-addresses.length)+'줄 제외':''}\n설치 유형: ${chosen.mode==='land'?'토지':'지붕(평지붕)'}\n모듈: ${picked('batchModule')}\n인버터: ${picked('batchInverter')}\n이격 여유율: ${chosen.marginPct}% · 경계까지 채워 배치`+'\n\n'+(draft.recipient?'PDF를 받을 이메일: '+draft.recipient:'메일 발송 없이 파일 다운로드');
  $('batchAddressPreview').replaceChildren(...addresses.map(a=>{const li=document.createElement('li');li.textContent=a;return li;}));
  if(draft.recipient&&draft.testEmail)$('batchPreview').textContent+='\n메일 제목에 [테스트] 표시';
  $('batchSubmit').textContent=draft.recipient?'분석 후 '+uniqueRecipients.length+'명에게 PDF 발송':'분석하고 PDF 만들기';$('batchEdit').hidden=true;$('batchReview').hidden=false;$('batchReview').scrollIntoView({block:'start'});
 }
 async function submit(){if(busy||!draft)return;busy=true;$('batchSubmit').disabled=true;$('batchError').textContent='';try{
  await api('/api/batches',{method:'POST',headers:{'Idempotency-Key':submissionKey},body:JSON.stringify(draft)});
  $('batchReview').hidden=true;$('batchEdit').hidden=false;$('batchAddresses').value='';draft=null;await refresh();$('batchJobs').scrollIntoView({block:'start'});
 }catch(e){error(e);}finally{busy=false;$('batchSubmit').disabled=false;}}
 async function download(url,name){
  return window.PFSolbiFiles.download(url,name);
 }
 // One watcher per batch while the page is open: every 10 s until the batch ends (completed, cancelled, gone) or the
 // limit passes. Nothing is asked while the assistant is locked. onDone(batch) gets the final public batch.
 const watchers=new Map();
 function watch(id,onDone,{intervalMs=10000,limitMs=6*3600*1000}={}){
  id=String(id||'');if(!/^[a-f0-9]{32}$/.test(id)||typeof onDone!=='function')return ()=>{};
  if(watchers.has(id))return watchers.get(id);
  const began=Date.now();let handle=null,stopped=false;
  const stop=()=>{stopped=true;clearTimeout(handle);watchers.delete(id);};
  const tick=async()=>{
   if(stopped)return;
   if(Date.now()-began>limitMs){stop();return;}
   try{
    if(window.PFSolbiWake?.isAwake()){
     const batch=(await api('/api/batches/'+id)).batch;
     if(stopped)return;
     if(batch&&(batch.status==='completed'||batch.status==='cancelled'||batch.expired)){stop();try{onDone(batch);}catch(_){/* the page's own message */}return;}
    }
   }catch(e){if(e&&(e.status===404||e.status===401||e.status===403)){stop();return;}/* a dropped poll: the server keeps the state */}
   handle=setTimeout(tick,intervalMs);
  };
  watchers.set(id,stop);handle=setTimeout(tick,Math.min(intervalMs,3000));
  return stop;
 }
 // Files are plain links where the page is served by the API itself (/m: the app's download policy, Safari and the
 // home-screen app save them; a blob: URL cannot be saved in a WebView). On another origin (the PC panel) they are
 // buttons that fetch with the panel's auth and save the Blob (PFSolbiFiles.download).
 function apiIsHere(){const base=window.SOLAR_API_BASE||window.BACKEND_URL;if(!base)return true;try{return new URL(base,location.href).origin===location.origin;}catch(_){return false;}}
 function resultStyle(){
  if(document.getElementById('batch-result-style'))return;
  const style=document.createElement('style');style.id='batch-result-style';
  style.textContent='.batch-result{display:block;margin:6px 0 0;padding:10px 12px;border:1px solid rgba(14,107,112,.28);border-radius:12px;background:rgba(255,255,255,.9);color:#1f2a2e;font-size:14px;line-height:1.5;white-space:normal;word-break:keep-all;overflow-wrap:anywhere}'+
   '.batch-result *{box-sizing:border-box}.batch-result p{margin:0 0 6px}.batch-result-title{font-weight:700;color:#0a5054}.batch-result-note{color:#4a5a5f;font-size:.92em}'+
   '.batch-result-files{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}'+
   '.batch-result-file,.batch-result-open{display:inline-flex;align-items:center;min-height:40px;max-width:100%;padding:8px 12px;border:1px solid rgba(14,107,112,.4);border-radius:10px;background:#fff;color:#0a5054;font:inherit;font-weight:600;text-decoration:none;cursor:pointer;text-align:left}'+
   '.batch-result-zip{background:#0e6b70;border-color:#0b5a5e;color:#fff}.batch-result-file[disabled]{opacity:.55;cursor:default}'+
   '.batch-result-file:focus-visible,.batch-result-open:focus-visible{outline:3px solid #f2a900;outline-offset:2px}'+
   '.batch-result-status{color:#a3262a;font-size:.92em}.batch-result-status:empty{display:none}'+
   '@media (pointer:coarse),(max-width:560px){.batch-result{font-size:16px}.batch-result-file,.batch-result-open{min-height:44px}}';
  (document.head||document.documentElement)?.append(style);
 }
 function fileControl(label,url,name,links,status,extra){
  if(links){const a=document.createElement('a');a.className='batch-result-file'+(extra?' '+extra:'');a.href=url;a.setAttribute('download','');a.textContent=label;return a;}
  const b=document.createElement('button');b.type='button';b.className='batch-result-file'+(extra?' '+extra:'');b.textContent=label;
  b.onclick=async()=>{if(b.disabled)return;b.disabled=true;status.textContent='';try{await download(url,name);}catch(e){status.textContent=e instanceof TypeError?'연결할 수 없습니다. 인터넷 연결 후 다시 시도하세요.':e?.message||'파일을 가져오지 못했습니다. 잠시 후 다시 시도하세요.';}finally{b.disabled=false;}};
  return b;
 }
 // The chat message of a finished batch: "N곳 분석이 끝났습니다", the ZIP, up to `limit` per-address PDFs, the progress dialog.
 function resultCard(batch,{links=apiIsHere(),limit=10}={}){
  resultStyle();
  const box=document.createElement('div');box.className='batch-result';box.dataset.batchId=batch.id;
  const items=Array.isArray(batch.items)?batch.items:[],done=batch.completed??items.length,total=batch.total??items.length;
  const title=document.createElement('p');title.className='batch-result-title';
  title.textContent=batch.status==='completed'?total+'곳 분석이 끝났습니다.':'분석을 중단했습니다. '+done+'/'+total+'곳의 보고서가 있습니다.';box.append(title);
  if(batch.recipient){const mail=document.createElement('p');mail.className='batch-result-note';mail.textContent=batch.recipient+' · '+(batch.mail?.message||'메일 발송 상태는 “진행·결과 보기”에서 확인하세요.');box.append(mail);}
  const status=document.createElement('p');status.className='batch-result-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  if(batch.expired){const gone=document.createElement('p');gone.className='batch-result-note';gone.textContent='파일 보관 기간(30일)이 지났습니다.';box.append(gone);}
  else if(done){
   const files=document.createElement('div');files.className='batch-result-files';
   files.append(fileControl('PDF 묶음(ZIP) 받기','/api/batches/'+batch.id+'/download','solbi-reports-'+String(batch.id).slice(0,8)+'.zip',links,status,'batch-result-zip'));
   items.slice(0,limit).forEach((item,index)=>{
    files.append(fileControl((index+1)+'. '+String(item.address||'주소 '+(index+1))+' PDF','/api/batches/'+batch.id+'/files/'+index+'.pdf',String(index+1).padStart(3,'0')+'-'+String(item.address||'report').replace(/[\\/:*?"<>|\r\n]/g,'_').slice(0,60)+'.pdf',links,status));
   });
   box.append(files);
   if(items.length>limit){const more=document.createElement('p');more.className='batch-result-note';more.textContent='나머지 '+(items.length-limit)+'곳의 PDF는 “진행·결과 보기”에서 받을 수 있습니다.';box.append(more);}
  }
  const view=document.createElement('button');view.type='button';view.className='batch-result-open';view.textContent='진행·결과 보기';view.onclick=()=>open({view:'jobs'});
  box.append(view,status);
  return box;
 }
 function button(parent,label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){error(e);}finally{b.disabled=false;}};parent.append(b);}
 // A batch stored before the 이격 여유율 rule has a preset label and no marginPct: it prints as it was made.
 function conditions(s){s=s||{};return [s.marginPct!==undefined&&s.marginPct!==null?(s.mode==='land'?'토지':'지붕')+' · 이격 여유율 '+s.marginPct+'%':s.label,
  s.module?'모듈 '+s.module.powerW+'W':'',s.inverter?'인버터 '+s.inverter.capacityKw+'kW':''].filter(Boolean).join(' · ');}
 function render(batch){
  const card=document.createElement('article');card.className='batch-card';card.dataset.batchId=batch.id;const title=document.createElement('h3');title.textContent=new Date(batch.createdAt*1000).toLocaleString('ko-KR')+' · '+batch.total+'곳';card.append(title);
  const status=document.createElement('p');status.className='batch-status';status.textContent=({running:'분석 중',completed:'보고서 생성 완료',cancelled:'중단됨'}[batch.status]||batch.status)+` · ${batch.completed}/${batch.total}`;card.append(status);
  const progress=document.createElement('progress');progress.max=batch.total;progress.value=batch.completed;progress.setAttribute('aria-label','보고서 생성 진행률');card.append(progress);
  const equipment=document.createElement('p');equipment.className='batch-note';equipment.textContent=conditions(batch.settings);card.append(equipment);
  if(batch.recipient){const mail=document.createElement('p');mail.className='batch-note';mail.textContent=batch.recipient+' · '+(batch.mail?.message||'분석 완료 후 메일 발송');card.append(mail);
   const parts=batch.mail?.parts||[],many=parts.some(part=>part.partIndex>1);
   for(const part of parts){const row=document.createElement('p');row.className='batch-note';row.textContent=(part.recipient||'')+(many?' · '+part.partIndex+'번째 묶음':'')+' · '+({pending:'메일 발송 대기',sending:'메일 전송 중',accepted:'메일 서버 접수',unknown:'메일 접수 미확인 — 추가 상세 확인 권장 · 자동 재전송 안 함',error:'메일 서버 미접수 · 다시 보내기 가능',not_configured:'메일 서버 설정 필요'}[part.status]||'메일 상태 확인 중');card.append(row);}
   for(const skip of batch.mail?.skipped||[]){const row=document.createElement('p');row.className='batch-note';row.textContent=(skip.index+1)+'번 '+skip.address+' · 메일 첨부 한도(8MB)를 넘어 메일에 넣지 않았습니다. 아래에서 내려받으세요.';card.append(row);}}
  const tools=document.createElement('div');tools.className='batch-tools';card.append(tools);
  if(batch.completed&&!batch.expired)button(tools,'PDF·HTML 묶음 다운로드',()=>download('/api/batches/'+batch.id+'/download'));
  if(batch.needsResume)button(tools,'남은 주소 이어서 실행',async()=>{await api('/api/batches/'+batch.id+'/resume',{method:'POST',body:'{}'});await refresh();});
  if(batch.mailRetry)button(tools,'접수되지 않은 메일 다시 보내기',async()=>{await api('/api/batches/'+batch.id+'/resume',{method:'POST',body:'{}'});await refresh();});
  if(batch.status==='running')button(tools,'남은 분석 중단',async()=>{await api('/api/batches/'+batch.id+'/cancel',{method:'POST',body:'{}'});await refresh();});
  if(batch.expired){const p=document.createElement('p');p.textContent='파일 보관 기간(30일)이 지났습니다.';card.append(p);}
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='주소별 결과 '+batch.completed+'건';details.append(summary);card.append(details);
  batch.items.forEach((item,index)=>{
   const row=document.createElement('div');row.className='batch-item';const name=document.createElement('strong');name.textContent=(index+1)+'. '+item.address;row.append(name);
   const basis=item.status==='partial_review'?'일부 지붕만 분석':item.method==='area'?'배치 전 면적 추정':'가정 배치';
   const note=document.createElement('p');note.textContent=item.capacityKw!=null?item.capacityKw.toFixed(2)+'kW DC'+(item.panelCount?' · 모듈 '+item.panelCount.toLocaleString('ko-KR')+'장':'')+' ('+basis+') · '+(item.shadowStatus==='computed_model'?'공공자료 음영 모델 계산 완료':'음영 미확인'):('미확인: '+item.reason);row.append(note);
   if(!batch.expired){const links=document.createElement('div');links.className='batch-tools';for(const ext of ['pdf','html'])button(links,ext.toUpperCase(),()=>download(`/api/batches/${batch.id}/files/${index}.${ext}`));button(links,'PDF 공유',()=>window.PFSolbiFiles.share(`/api/batches/${batch.id}/files/${index}.pdf`));row.append(links);}details.append(row);
  });return card;
 }
 async function refresh(){
  if(!window.PFSolbiWake?.isAwake())return;
  clearTimeout(timer);const data=await api('/api/batches');const expanded=new Set([...$('batchJobs').querySelectorAll('[data-batch-id]')].filter(x=>x.querySelector('details[open]')).map(x=>x.dataset.batchId));
  if(!window.PFSolbiWake?.isAwake())return;
  $('batchJobs').replaceChildren(...data.items.map(render));for(const card of $('batchJobs').children)if(expanded.has(card.dataset.batchId))card.querySelector('details').open=true;
  if(!data.items.length)$('batchJobs').textContent='주소 목록을 입력하면 이곳에서 진행 상황과 파일을 확인할 수 있습니다.';
  const active=data.items.filter(x=>x.status==='running'&&!x.needsResume).length;
  if($('batchOpen'))$('batchOpen').textContent=active?'주소 PDF · 진행 '+active+'건':'주소 목록 → PDF';
  if(active||data.items.some(x=>['queued','running'].includes(x.mailJobStatus)))timer=setTimeout(()=>refresh().catch(error),8000);
 }
 drawMode();drawMargin();
 $('batchMarginCustom').addEventListener('input',customMargin);
 $('batchClose').onclick=()=>dialog.close();$('batchForm').onsubmit=review;
 $('batchBack').onclick=()=>{$('batchEdit').hidden=false;$('batchReview').hidden=true;};$('batchSubmit').onclick=submit;
 // Several address lines pasted into the chat box stay in the chat: Solbi answers them with its own conditions card.
 window.PFSolbiBatch={open,refresh,download,watch,resultCard};$('batchOpen')?.addEventListener('click',()=>open());
 let started=false;
 window.addEventListener('solbi:awake',()=>{if(started)refresh().catch(error);});
 window.addEventListener('solbi:locked',()=>{clearTimeout(timer);});
 window.addEventListener('load',async()=>{try{await window.PFSolbiContext?.ready;await window.PFSolbiWake.ready;started=true;await refresh();}catch(_){/* Sign-in UI owns authentication errors. */}});
})();
