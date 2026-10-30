/* Explicit, server-reviewed regional scans. Opening the guide never starts work. */
(function(){'use strict';
 const $=id=>document.getElementById(id),dialog=$('scanWizardDialog');if(!dialog)return;
 const base='/api/llm/scan-wizard',panels=['swStepRegion','swStepScope','swStepDelivery','swStepReview'];
 let options=null,step=0,highestStep=0,regionRevision=0,epoch=0,busy=false,started=false,timer=null,draft=null,review=null,submissionKey=null,requestedView='new';
 const awake=()=>window.PFSolbiWake?.isAwake()===true;
 const needsAppUpdate=()=>{const version=/SolbiAndroid\/(\d+)\.(\d+)\.(\d+)/.exec(navigator.userAgent);return !!version&&(Number(version[1])<1||Number(version[1])===1&&Number(version[2])===0&&Number(version[3])<1);};
 const mode=()=>dialog.querySelector('input[name="swMode"]:checked')?.value||options?.defaults?.mode||'roof';
 const finite=value=>typeof value==='number'&&Number.isFinite(value);
 const format=value=>finite(value)?value.toLocaleString('ko-KR'):'확인 중';
 const timestamp=value=>{if(!value)return '시각 미확인';const date=new Date(typeof value==='number'&&value<1e12?value*1000:value);return Number.isNaN(date.getTime())?'시각 미확인':date.toLocaleString('ko-KR');};
 const errorMessages={review_expired:'확인 내용의 유효 시간이 지났습니다. 설정을 다시 확인해 주세요.',review_mismatch:'설정이 달라졌습니다. 실행 전 내용을 다시 확인해 주세요.',mail_not_configured:'메일 서버를 사용할 수 없습니다. 이메일을 비우고 파일 다운로드로 진행할 수 있습니다.',request_limit:'진행 중인 스캔이 많습니다. 기존 작업이 끝난 뒤 다시 접수해 주세요.',idempotency_conflict:'이미 접수된 요청과 설정이 다릅니다. 내 진행·결과에서 먼저 확인해 주세요.',license_required:'이 기기에 등록된 라이선스를 확인해 주세요.',authentication_required:'로그인 상태를 다시 확인해 주세요.'};
 const validationMessages={official_emd_required:'읍·면·동까지 선택해 주세요.',region_parent_mismatch:'시·도부터 행정구역을 다시 선택해 주세요.',region_not_in_official_choices:'공식 목록에서 행정구역을 다시 선택해 주세요.',invalid_numeric_setting:'면적·경사와 조회 상한의 숫자를 확인해 주세요.',invalid_range:'조회할 최대 필지 수를 확인해 주세요.',invalid_grid_lookup:'한전 필지 조회 상한을 다시 선택해 주세요.',invalid_recipients:'수신 이메일을 확인해 주세요.',full_stage_required:'정밀 분석 조건을 다시 확인해 주세요.'};
 function error(error){if(!awake())return;$('swError').textContent=errorMessages[error?.code]||error?.message||'요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';$('swError').scrollIntoView({block:'nearest'});}
 async function api(path,init={}){
  if(!awake())throw Error('AI 비서 시작 상태를 확인해 주세요.');
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),60000);
  try{
   const response=await fetch(base+path,{credentials:'include',cache:'no-store',...init,signal:controller.signal,headers:{'Content-Type':'application/json',...(init.headers||{})}});
   const data=await response.json().catch(()=>({}));
   if(data.intent==='wake_required'||data.error==='wake_required'||data.awake===false){window.PFSolbiWake.recheck();throw Error('AI 비서 시작 상태를 확인해 주세요.');}
   if(!awake())throw Error('AI 비서 시작 상태를 확인해 주세요.');
   if(!response.ok||!data.ok){const text=validationMessages[data.message]||errorMessages[data.error]||(typeof data.message==='string'&&/[가-힣]/.test(data.message)?data.message:'요청 조건과 연결 상태를 확인해 주세요.'),problem=Error(text);problem.code=data.error;throw problem;}
   return data;
  }catch(problem){if(problem.name==='AbortError')throw Error('연결이 지연되고 있습니다. 접수한 작업은 내 진행·결과에서 먼저 확인해 주세요.');if(problem instanceof TypeError)throw Error('연결을 확인한 뒤 다시 시도해 주세요.');throw problem;}
  finally{clearTimeout(timeout);}
 }
 function setBusy(value){busy=value;for(const id of ['swRegionNext','swScopeNext','swReviewButton','swConfirm'])$(id).disabled=value;}
 function invalidateReview(){draft=null;review=null;submissionKey=null;highestStep=Math.min(highestStep,2);dialog.querySelector('[data-sw-step="3"]').disabled=true;}
 function showStep(index){
  if(!awake())return;step=index;highestStep=Math.max(highestStep,index);$('swSetup').hidden=false;$('swResults').hidden=true;$('swNewView').setAttribute('aria-pressed','true');$('swJobsView').setAttribute('aria-pressed','false');
  requestedView='new';
  panels.forEach((id,i)=>{$(id).hidden=i!==index;});
  dialog.querySelectorAll('[data-sw-step]').forEach(button=>{const n=Number(button.dataset.swStep);button.disabled=n>highestStep||n===3&&!review;button.setAttribute('aria-current',n===index?'step':'false');});
  $('swError').textContent='';$('swBody').scrollTop=0;
 }
 function showJobs(){if(!awake())return;requestedView='jobs';$('swSetup').hidden=true;$('swResults').hidden=false;$('swNewView').setAttribute('aria-pressed','false');$('swJobsView').setAttribute('aria-pressed','true');$('swError').textContent='';$('swBody').scrollTop=0;refresh().catch(error);}
 function fillSelect(id,items,placeholder){const select=$(id);select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=placeholder;select.append(empty);for(const item of items){const option=document.createElement('option');option.value=item.code;option.textContent=item.name;select.append(option);}select.disabled=!items.length;}
 function selectionLabel(id){return $(id).selectedOptions[0]?.value?$(id).selectedOptions[0].textContent:'';}
 function regionSummary(){const text=['swSido','swSigungu','swEmd'].map(selectionLabel).filter(Boolean).join(' ');$('swRegionSummary').textContent=text;$('swRegionSummary').hidden=!text;}
 function sourceNote(source){if(!source)return;const name=typeof source.name==='string'?source.name:'공식 행정구역 자료';$('swRegionSource').textContent=name+' · 조회 '+timestamp(source.observedAt);}
 async function children(level,parentCode,target,placeholder){
  const version=++regionRevision,currentEpoch=epoch;
  fillSelect(target,[], '목록을 불러오고 있습니다…');
  regionSummary();
  try{const data=await api('/options?level='+level+'&parentCode='+encodeURIComponent(parentCode));if(version!==regionRevision||currentEpoch!==epoch)return;fillSelect(target,data.items||[],placeholder);sourceNote(data.source);if(!(data.items||[]).length)error(Error('이 지역의 하위 행정구역 자료를 확인하지 못했습니다. 다른 지역을 선택하거나 잠시 후 다시 시도해 주세요.'));}
  catch(problem){if(version===regionRevision&&currentEpoch===epoch){fillSelect(target,[],'목록을 불러오지 못했습니다');error(problem);}}
 }
 function modeInfo(){return options?.modes?.find(item=>item.value===mode());}
 function applyMode(useDefaults=false){
  const selected=mode(),defaults=options?.defaultsByMode?.[selected]?.settings||options?.defaultsByMode?.[selected];
  if(useDefaults&&defaults){if(finite(defaults.minAreaM2))$('swMinArea').value=defaults.minAreaM2;if(finite(defaults.maxSlopeDeg))$('swMaxSlope').value=defaults.maxSlopeDeg;}
  const roof=selected==='roof';$('swMaxSlope').disabled=roof;$('swSlopeField').hidden=roof;
  $('swModeNote').textContent=(modeInfo()?.label||'분석 대상')+' · '+(modeInfo()?.checkCount||'관련')+'개 확인 항목을 검토합니다.';
  $('swSlopeNote').textContent=roof?'지붕의 실제 경사는 현장 확인이 필요합니다. 토지 경사 필터로 지붕 경사를 확정하지 않습니다.':'토지 경사 자료의 조회 결과를 이 기준과 비교합니다. 조회가 안 된 필지는 사유를 미확인으로 남깁니다.';
 }
 function updateRangeChoices(){for(const button of $('swRangeChoices').children)button.setAttribute('aria-pressed',Number(button.dataset.value)===Number($('swMaxParcels').value)?'true':'false');}
 async function load(){
  if(options)return;const currentEpoch=epoch;$('swLoading').hidden=false;setBusy(true);
  try{
   const data=await api('/options');if(currentEpoch!==epoch)return;
   if(!Array.isArray(data.items)||!data.items.length||!Array.isArray(data.modes)||!data.defaults)throw Error('행정구역과 기본 조건을 확인하지 못했습니다. 잠시 후 다시 열어 주세요.');
   options=data;fillSelect('swSido',data.items,'시·도를 선택하세요');sourceNote(data.source);
   $('swModes').replaceChildren();for(const item of data.modes){const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name='swMode';input.value=item.value;input.checked=item.value===data.defaults.mode;input.addEventListener('change',()=>{invalidateReview();applyMode(true);});label.append(input,document.createTextNode(item.label));$('swModes').append(label);}
   $('swMaxParcels').max=String(data.maxParcels);$('swMaxParcels').value=data.defaults.range.maxParcels;$('swRangeChoices').replaceChildren();
   for(const amount of data.rangeChoices||[]){if(!Number.isInteger(amount)||amount<1||amount>data.maxParcels)continue;const button=document.createElement('button');button.type='button';button.dataset.value=amount;button.textContent=amount.toLocaleString('ko-KR')+'필지';button.onclick=()=>{$('swMaxParcels').value=amount;invalidateReview();updateRangeChoices();};$('swRangeChoices').append(button);}
   $('swMinArea').value=data.defaults.settings.minAreaM2;$('swMaxSlope').value=data.defaults.settings.maxSlopeDeg;
   const grid=data.gridLookup,gridChoices=(grid?.choices||[]).filter(value=>Number.isInteger(value)&&value>=0);$('swGridField').hidden=!gridChoices.length;$('swGridLookup').replaceChildren();
   for(const amount of gridChoices){const option=document.createElement('option');option.value=amount;option.textContent=amount?'최대 '+amount.toLocaleString('ko-KR')+'필지':'조회 안 함';option.selected=amount===grid.default;$('swGridLookup').append(option);}
   $('swAreaBasis').textContent=data.areaBasis||'필지 도형 면적(㎡) 기준이며 실제 지붕 면적이나 설치 가능 면적은 별도 확인합니다.';
   if(!data.mailConfigured){$('swRecipients').disabled=true;$('swRecipients').value='';$('swTestEmail').disabled=true;$('swMailNote').textContent='메일 서버를 사용할 수 없어 엑셀 다운로드만 제공합니다.';}
   applyMode();updateRangeChoices();
  }finally{$('swLoading').hidden=true;setBusy(false);}
 }
 function valid(ids){for(const id of ids)if(!$(id).reportValidity())return false;return true;}
 function regionValid(){if(!valid(['swSido','swSigungu','swEmd']))return false;return !!$('swSido').value&&!!$('swSigungu').value&&!!$('swEmd').value;}
 function scopeValid(){return valid(['swMaxParcels','swMinArea',...(mode()==='land'?['swMaxSlope']:[])])&&Number.isInteger(Number($('swMaxParcels').value));}
 function recipients(){const all=$('swRecipients').value.split(',').map(value=>value.trim()).filter(Boolean),unique=[...new Map(all.map(value=>[value.toLowerCase(),value])).values()];if(unique.length>(options?.maxRecipients||2))throw Error('수신 이메일은 최대 '+(options?.maxRecipients||2)+'개까지 입력해 주세요.');return unique;}
 // Always explicit: the server treats a missing gridLookup as no per-parcel lookups, so a hidden field sends 0.
 function requestBody(){const lookups=$('swGridField').hidden?0:Number($('swGridLookup').value);return {region:{sidoCode:$('swSido').value,sigunguCode:$('swSigungu').value,emdCode:$('swEmd').value},mode:mode(),range:{maxParcels:Number($('swMaxParcels').value)},settings:{minAreaM2:Number($('swMinArea').value),maxSlopeDeg:Number($('swMaxSlope').value),scanStage:'full',gridLookup:{maxParcels:lookups}},recipients:recipients(),testEmail:$('swTestEmail').checked};}
 function summaryLine(label,value){const term=document.createElement('dt'),description=document.createElement('dd');term.textContent=label;description.textContent=value;$('swReviewSummary').append(term,description);}
 async function reviewRequest(){
  if(busy||!awake())return;if(!regionValid()){showStep(0);return;}if(!scopeValid()){showStep(1);return;}if(!$('swRecipients').disabled&&!$('swRecipients').reportValidity())return;
  setBusy(true);$('swError').textContent='';const currentEpoch=epoch;
  try{
   const body=requestBody(),data=await api('/review',{method:'POST',body:JSON.stringify(body)});if(currentEpoch!==epoch)return;
   if(!data.review?.region?.fullName||!data.reviewToken)throw Error('실행 범위를 확인하지 못했습니다. 지역과 조건을 다시 선택해 주세요.');
   draft=body;review=data.review;submissionKey=crypto.randomUUID();review.token=data.reviewToken;
   $('swReviewSummary').replaceChildren();summaryLine('행정구역',review.region.fullName);summaryLine('분석 대상',options.modes.find(item=>item.value===review.mode)?.label||review.mode);summaryLine('조회 상한','최대 '+format(review.range.maxParcels)+'필지');summaryLine('최소 면적',format(review.settings.minAreaM2)+'㎡ · 필지 도형 기준');
   if(review.mode==='land')summaryLine('토지 경사',format(review.settings.maxSlopeDeg)+'° 이하');summaryLine('분석 단계','정밀 분석');
   if(review.settings?.gridLookup)summaryLine('한전 필지 조회',typeof review.gridNote==='string'?review.gridNote:(review.settings.gridLookup.maxParcels?'최대 '+format(review.settings.gridLookup.maxParcels)+'필지':'조회 안 함'));summaryLine('받을 이메일',review.recipients.length?review.recipients.join(', '):'발송 없이 엑셀 다운로드');if(review.testEmail)summaryLine('메일 제목','[테스트] 표시');
   $('swReviewChecks').replaceChildren();const lead=document.createElement('strong');lead.textContent='확인 항목 '+review.checkCount+'개';$('swReviewChecks').append(lead);const list=document.createElement('ul');for(const check of review.checks||[]){const row=document.createElement('li');row.textContent=typeof check==='string'?check:check.label||check.title||'';list.append(row);}$('swReviewChecks').append(list);
   $('swReviewArea').textContent=review.areaBasis||options.areaBasis||$('swAreaBasis').textContent;$('swReviewCoverage').textContent=review.coverageNote||'원천 자료와 조회 상한에 따라 일부 후보만 검토될 수 있습니다. 실제 수집 범위와 미확인 사유를 결과에서 확인해 주세요.';
   $('swConfirm').textContent=review.recipients.length?'분석하고 엑셀 이메일 보내기':'분석하고 엑셀 만들기';showStep(3);
  }catch(problem){error(problem);}finally{setBusy(false);}
 }
 async function confirmRequest(){
  if(busy||!draft||!review||!awake())return;setBusy(true);$('swError').textContent='';const currentEpoch=epoch;
  try{const data=await api('/requests',{method:'POST',headers:{'Idempotency-Key':submissionKey},body:JSON.stringify({...draft,reviewToken:review.token,confirmed:true})});if(currentEpoch!==epoch)return;if(!data.request?.id)throw Error('접수 결과를 확인하지 못했습니다. 내 진행·결과를 먼저 확인해 주세요.');$('swNotice').textContent='접수됐습니다. 화면을 닫아도 서버에서 계속 진행합니다.';draft=null;review=null;submissionKey=null;highestStep=2;showJobs();}
  catch(problem){if(problem.code==='idempotency_conflict'&&currentEpoch===epoch){invalidateReview();showJobs();error(problem);return;}error(problem);refresh().catch(()=>{});}finally{setBusy(false);}
 }
 function button(parent,label,action){const node=document.createElement('button');node.type='button';node.textContent=label;node.onclick=async()=>{node.disabled=true;try{await action();}catch(problem){error(problem);}finally{node.disabled=false;}};parent.append(node);return node;}
 const statusLabels={queued:'접수·대기 중',running:'진행 중',completed:'엑셀 생성 완료',partial:'완료 · 일부 확인 필요',cancelled:'중단됨',expired:'파일 보관 기간 종료',error:'확인이 필요한 작업'};
 const stageLabels={collecting:'후보 필지 수집',analyzing:'필지별 분석',grid_lookup:'한전 필지 조회',exporting:'엑셀·메일 준비',completed:'완료'};
 function renderRequest(item){
  const card=document.createElement('article');card.className='sw-request';card.dataset.requestId=item.id;
  const title=document.createElement('h4');title.textContent=(item.region?.fullName||'선택 지역')+' · '+(item.mode==='roof'?'지붕':'토지');card.append(title);
  const status=document.createElement('p');status.className='sw-status';status.textContent=(statusLabels[item.status]||'상태 확인 중')+(item.stage&&item.stage!=='completed'?' · '+(stageLabels[item.stage]||'상태 확인 중'):'');card.append(status);
  const grid=item.stage==='grid_lookup',gridSetting=item.settings?.gridLookup,progress=document.createElement('progress');progress.setAttribute('aria-label',grid?'한전 필지 조회 진행률':'필지별 분석 진행률');
  if(grid){if(finite(item.gridTotal)&&item.gridTotal>0){progress.max=item.gridTotal;progress.value=finite(item.gridDone)?item.gridDone:0;}}else if(finite(item.total)&&item.total>0){progress.max=item.total;progress.value=finite(item.completed)?item.completed:0;}card.append(progress);
  const counts=document.createElement('p');counts.textContent=(grid?'한전 필지 조회 '+(finite(item.gridTotal)?format(finite(item.gridDone)?item.gridDone:0)+' / '+format(item.gridTotal)+'필지':'대상 확인 중')+' · ':'')+'분석 '+format(item.completed)+' / '+format(item.total)+'필지 · 미확인·오류 '+format(item.errors)+'건';card.append(counts);
  // gridCap is the frozen plan cap (set once the KEPCO phase starts): a lower server ceiling is named as the Excel and mail name it.
  const requested=gridSetting?.maxParcels,applied=finite(item.gridCap)?item.gridCap:null,gridScope=!requested?'안 함':applied===null||applied>=requested?'최대 '+format(requested)+'필지':applied===0?'요청 '+format(requested)+'필지 · 서버 조회 한도로 조회 안 함':'요청 '+format(requested)+'필지 · 적용 '+format(applied)+'필지';
  const scope=document.createElement('p');scope.textContent='조회 상한 '+format(item.range?.maxParcels)+'필지'+(gridSetting?' · 한전 필지 조회 '+gridScope:'')+' · 접수 '+timestamp(item.createdAt);card.append(scope);
  if(item.message&&!['completed','partial'].includes(item.status)){const note=document.createElement('p');note.className='sw-caveat';note.textContent=item.message;card.append(note);}
  const coverage=item.coverage||{},coverageText=[];
  if(finite(coverage.sourceTotal))coverageText.push('원천 응답 전체 '+format(coverage.sourceTotal)+'건');else coverageText.push('원천 전체 건수 미확인');
  if(finite(coverage.receivedCount))coverageText.push('수집 '+format(coverage.receivedCount)+'건');if(finite(coverage.selectedCount))coverageText.push('선택 '+format(coverage.selectedCount)+'필지');
  if(finite(coverage.excludedCount))coverageText.push('조건 제외 '+format(coverage.excludedCount)+'건');if(finite(coverage.invalidCount))coverageText.push('자료 형식 미확인 '+format(coverage.invalidCount)+'건');
  const source=document.createElement('p');source.textContent=coverageText.join(' · ');card.append(source);
  if(coverage.capReached||coverage.status==='partial'||coverage.status==='unconfirmed'||coverage.reason){const note=document.createElement('p');note.className='sw-caveat';note.textContent=(coverage.capReached?'조회 상한에 도달해 일부 후보만 검토했습니다. ':'')+(coverage.reason||'실제 수집 범위와 미확인 항목을 엑셀에서 확인해 주세요.');card.append(note);}
  if(coverage.source||coverage.observedAt){const sourceTime=document.createElement('p');sourceTime.textContent=(typeof coverage.source==='string'?coverage.source:coverage.source?.name||'공공 원천')+' · '+timestamp(coverage.observedAt);card.append(sourceTime);}
  const recipientsText=document.createElement('p');recipientsText.textContent=item.recipients?.length?'받을 이메일: '+item.recipients.join(', '):'메일 발송 없이 엑셀 다운로드';card.append(recipientsText);
  if(item.mail?.message){const mail=document.createElement('p');mail.textContent=item.mail.message;card.append(mail);}
  for(const delivery of item.mail?.deliveries||[]){const mail=document.createElement('p');mail.textContent=delivery.recipient+' · '+({pending:'메일 발송 대기',sending:'메일 전송 중',accepted:'메일 서버 접수',unknown:'메일 접수 확인 필요 · 자동 재발송 안 함',error:'메일 서버 미접수 · 다시 보내기 가능',not_configured:'메일 서버 설정 필요',skipped:'선택 후보 없음 · 메일 미발송'}[delivery.status]||'메일 상태 확인 중');card.append(mail);}
  const actions=document.createElement('div');actions.className='sw-request-actions';card.append(actions);
  if(item.downloadUrl){if(needsAppUpdate()){
   const installUrl='https://pathfinder-api.ziewise.com/m/install',update=document.createElement('p');update.textContent='엑셀 파일 저장을 이용하려면 앱을 업데이트해 주세요. Chrome 또는 Samsung Internet에서 아래 링크를 열어 새 APK를 설치하세요.';card.append(update);
   const link=document.createElement('input');link.type='url';link.readOnly=true;link.value=installUrl;link.setAttribute('aria-label','업데이트 설치 링크');card.append(link);
   button(actions,'설치 링크 복사',async()=>{try{await navigator.clipboard.writeText(installUrl);update.textContent='설치 링크를 복사했습니다. Chrome 또는 Samsung Internet에서 열어 업데이트해 주세요.';}catch(_){link.focus();link.select();update.textContent='아래 링크를 복사해 Chrome 또는 Samsung Internet에서 열어 업데이트해 주세요.';}});
  }else button(actions,'엑셀 다운로드',()=>download(item));}
  if(item.status==='queued'||item.status==='running')button(actions,'남은 작업 중단',async()=>{if(!confirm('남은 스캔을 중단할까요? 이미 완료된 결과는 보존됩니다.'))return;await api('/requests/'+encodeURIComponent(item.id)+'/cancel',{method:'POST',body:'{}'});await refresh();});
  if(item.needsResume)button(actions,'이어 실행',async()=>{await api('/requests/'+encodeURIComponent(item.id)+'/resume',{method:'POST',body:'{}'});await refresh();});
  if(item.mailRetry)button(actions,'접수되지 않은 메일 다시 보내기',async()=>{await api('/requests/'+encodeURIComponent(item.id)+'/resume',{method:'POST',body:'{}'});await refresh();});
  return card;
 }
 async function refresh(){
  clearTimeout(timer);if(!awake())return;const currentEpoch=epoch,data=await api('/requests');if(currentEpoch!==epoch||!awake())return;
  const items=Array.isArray(data.items)?data.items:[];$('swRequests').replaceChildren(...items.map(renderRequest));if(!items.length)$('swRequests').textContent='접수한 지역 스캔이 없습니다. 새 스캔 설정에서 조건을 확인해 주세요.';
  const active=items.filter(item=>['queued','running'].includes(item.status)).length,mailing=items.some(item=>['queued','running'].includes(item.jobStatus));window.dispatchEvent(new CustomEvent('solbi:scan-progress',{detail:{active,total:items.length}}));if(active||mailing)timer=setTimeout(()=>refresh().catch(error),8000);
 }
 async function download(item){
  if(!awake())return;const target=new URL(item.downloadUrl,location.href),expected=base+'/requests/'+item.id+'/download.xlsx';
  if(!/^[a-f0-9]{32}$/.test(item.id)||target.origin!==location.origin||target.pathname!==expected||target.search||target.hash)throw Error('엑셀 파일 주소를 확인하지 못했습니다. 목록을 새로고침해 주세요.');
  if(/SolbiAndroid\//.test(navigator.userAgent)){location.assign(target.href);return;}
  const response=await fetch(target,{credentials:'include',cache:'no-store'});if(!response.ok||(response.headers.get('Content-Type')||'').includes('application/json')){const data=await response.json().catch(()=>({}));if(data.intent==='wake_required')window.PFSolbiWake.recheck();throw Error(data.message||'엑셀 파일을 가져오지 못했습니다.');}
  if(!awake())return;const blob=await response.blob(),disposition=response.headers.get('Content-Disposition')||'',utf=/filename\*=UTF-8''([^;]+)/i.exec(disposition),plain=/filename="?([^";]+)/i.exec(disposition);let name=plain?.[1]||'solbi-region-scan.xlsx';try{if(utf)name=decodeURIComponent(utf[1]);}catch(_){}
  const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name.replace(/[\\/\r\n]/g,'_');document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
 }
 async function open({view='new',draft:hint=null}={}){if(!awake())return false;requestedView=view;if(!dialog.open)dialog.showModal();$('swError').textContent='';if(view==='jobs'){showJobs();return true;}try{await load();if(!awake())return false;
  if(hint&&typeof hint==='object'){
   invalidateReview();step=0;highestStep=0;$('swSido').value='';fillSelect('swSigungu',[],'시·도를 먼저 선택하세요');fillSelect('swEmd',[],'시·군·구를 먼저 선택하세요');regionSummary();
   const input=[...dialog.querySelectorAll('input[name="swMode"]')].find(node=>node.value===hint.mode);if(input){input.checked=true;applyMode(true);}
   if(Number.isInteger(hint.limit)&&hint.limit>=1&&hint.limit<=options.maxParcels){$('swMaxParcels').value=hint.limit;updateRangeChoices();}
   let note=$('swConversationHint');if(!note){note=document.createElement('p');note.id='swConversationHint';note.className='sw-note';$('swRegionTitle').after(note);}note.textContent=typeof hint.region==='string'?'대화에서 입력한 지역: '+hint.region.slice(0,120)+' · 아래 공식 목록에서 다시 확인해 주세요.':'';
  }
  if(requestedView==='jobs')showJobs();else showStep(step);return true;}catch(problem){error(problem);return false;}}
 function maybeHandle(message){return awake()&&typeof message==='string'&&message.length<=4000&&!/(설치비|시공비|공사비|대출|금리|상환|가격|요금|비용|얼마)/.test(message)&&/(전수\s*(?:스캔|조사)|지역\s*스캔)/.test(message);}
 function createGuideCard(action={}){const jobs=action.view==='jobs',card=document.createElement('div');card.className='solbi-scan-guide';const text=document.createElement('p');text.textContent=jobs?'접수한 지역 스캔의 진행 상황과 엑셀 결과를 확인할 수 있습니다.':'지역과 조회 상한, 분석 조건, 받을 이메일을 순서대로 확인해요. 마지막에 실행을 눌러야 스캔이 시작됩니다.';card.append(text);button(card,jobs?'전수스캔 진행·결과':'지역·범위 설정하기',()=>open({view:jobs?'jobs':'new',draft:action.draft}));return card;}
 $('swSido').onchange=()=>{invalidateReview();highestStep=0;fillSelect('swEmd',[],'시·군·구를 먼저 선택하세요');regionSummary();if($('swSido').value)children('sigungu',$('swSido').value,'swSigungu','시·군·구를 선택하세요');else{++regionRevision;fillSelect('swSigungu',[],'시·도를 먼저 선택하세요');}};
 $('swSigungu').onchange=()=>{invalidateReview();highestStep=0;regionSummary();if($('swSigungu').value)children('emd',$('swSigungu').value,'swEmd','읍·면·동을 선택하세요');else{++regionRevision;fillSelect('swEmd',[],'시·군·구를 먼저 선택하세요');}};
 $('swEmd').onchange=()=>{invalidateReview();regionSummary();};
 for(const id of ['swMaxParcels','swMinArea','swMaxSlope','swGridLookup','swRecipients','swTestEmail'])$(id).addEventListener('input',()=>{invalidateReview();if(id==='swMaxParcels')updateRangeChoices();});
 $('swForm').onsubmit=event=>event.preventDefault();$('swClose').onclick=()=>dialog.close();$('swNewView').onclick=()=>open({view:'new'});$('swJobsView').onclick=showJobs;
 $('swRegionNext').onclick=()=>{if(regionValid())showStep(1);};$('swScopeNext').onclick=()=>{if(scopeValid())showStep(2);};$('swReviewButton').onclick=reviewRequest;$('swReviewBack').onclick=()=>showStep(2);$('swConfirm').onclick=confirmRequest;$('swRefresh').onclick=()=>refresh().catch(error);
 dialog.querySelectorAll('[data-sw-back]').forEach(button=>{button.onclick=()=>showStep(Number(button.dataset.swBack));});dialog.querySelectorAll('[data-sw-step]').forEach(button=>{button.onclick=()=>{const next=Number(button.dataset.swStep);if(next<=highestStep&&(next!==3||review))showStep(next);};});
 window.addEventListener('solbi:locked',()=>{++epoch;++regionRevision;clearTimeout(timer);if(dialog.open)dialog.close();$('swRequests').replaceChildren();$('swRecipients').value='';$('swError').textContent='';invalidateReview();setBusy(false);});
 window.addEventListener('solbi:awake',()=>{if(started)refresh().catch(error);});window.addEventListener('load',async()=>{if(!window.PFSolbiWake)return;await window.PFSolbiWake.ready;started=true;refresh().catch(error);});
 window.PFSolbiScanWizard={open,maybeHandle,createGuideCard,refresh};
})();
