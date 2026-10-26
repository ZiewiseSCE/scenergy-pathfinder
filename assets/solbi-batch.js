/* Explicit settings and recipient; state and artifacts belong to the signed-in owner. */
(function(){'use strict';
 const $=id=>document.getElementById(id);let options=null,timer=null,submissionKey=null,draft=null,busy=false;
 const labels={tiltDeg:'가정 경사 (°)',edgeM:'외곽 여유 (m)',obstacleM:'장애물 여유 (m)',walkwayM:'통로 폭 (m)',blockM:'통로 구획 (m)',rowGapM:'행 간격 (m)',sideGapM:'옆 간격 (m)',dcAcRatio:'목표 DC/AC 비율'};
 const ranges={tiltDeg:[0,60,.5],edgeM:[.3,10,.1],obstacleM:[0,10,.1],walkwayM:[.6,5,.1],blockM:[6,30,1],rowGapM:[0,10,.1],sideGapM:[0,3,.1],dcAcRatio:[.8,1.5,.05]};
 const dialog=$('batchDialog'),fields=$('batchFields');
 for(const [key,label] of Object.entries(labels)){
  const wrap=document.createElement('label');wrap.textContent=label;
  const input=document.createElement('input');input.id='batch-'+key;input.type='number';[input.min,input.max,input.step]=ranges[key];input.required=true;wrap.append(input);fields.append(wrap);
 }
 function error(e){$('batchError').textContent=e?.message||String(e);}
 async function api(path,init={}){
  const r=await fetch(path,{credentials:'include',...init,headers:{'Content-Type':'application/json',...(init.headers||{})}});
  const data=await r.json();if(!r.ok||!data.ok)throw Error(data.message||data.error||'요청을 처리하지 못했습니다.');return data;
 }
 function preset(){const p=options.presets[$('batchPreset').value];for(const key of Object.keys(labels))$('batch-'+key).value=p[key];$('batchModule').value=p.moduleId;$('batchInverter').value=p.inverterId;$('batchAlignment').value=p.alignment;
  for(const key of ['obstacleM','walkwayM','blockM'])$('batch-'+key).parentElement.hidden=p.mode!=='roof';
 }
 function option(select,value,label){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
 async function load(){
  if(options)return;options=await api('/api/batches/options');
  for(const [key,p] of Object.entries(options.presets))option($('batchPreset'),key,p.label);
  $('batchPreset').value='roof_standard';
  for(const m of options.catalog.modules)option($('batchModule'),m.id,`${m.brand} · ${m.model} · ${m.powerW}W · ${m.widthM}×${m.heightM}m`);
  for(const i of options.catalog.inverters)option($('batchInverter'),i.id,`${i.brand} · ${i.model} · ${i.capacityKw}kW`);
  $('batchCatalogNote').textContent='장비 목록 기준: '+options.catalog.version+'. 선택한 모듈의 출력과 외형 규격을 배치 계산에 적용합니다.';
  if(!options.mailConfigured)$('batchMailNote').textContent='메일 서버 설정이 아직 없습니다. 이메일을 비우면 PDF·HTML을 다운로드할 수 있습니다.';
  preset();
 }
 function settings(){const s={preset:$('batchPreset').value,moduleId:$('batchModule').value,inverterId:$('batchInverter').value,alignment:$('batchAlignment').value};for(const key of Object.keys(labels))s[key]=Number($('batch-'+key).value);return s;}
 async function open(value){if(!window.PFSolbiWake?.isAwake())return;if(!dialog.open)dialog.showModal();$('batchError').textContent='';try{await load();if(value){$('batchAddresses').value=value;$('batchEdit').hidden=false;$('batchReview').hidden=true;}await refresh();}catch(e){error(e);}}
 function review(event){event.preventDefault();$('batchError').textContent='';
  const all=$('batchAddresses').value.split(/\r?\n/).map(x=>x.trim().replace(/\s+/g,' ')).filter(Boolean),addresses=[...new Set(all)];
  if(!addresses.length||addresses.length>100){error(Error('중복을 제외한 주소를 1~100곳 입력하세요.'));return;}
  const recipients=$('batchEmail').value.split(',').map(x=>x.trim()).filter(Boolean),uniqueRecipients=[...new Map(recipients.map(x=>[x.toLowerCase(),x])).values()];
  if(uniqueRecipients.length>2){error(Error('수신 이메일은 최대 2개까지 입력하세요.'));return;}
  draft={addresses:all,settings:settings(),recipient:uniqueRecipients.join(', '),testEmail:$('batchTestEmail').checked};submissionKey=crypto.randomUUID();
  const s=draft.settings,p=options.presets[s.preset],m=options.catalog.modules.find(x=>x.id==s.moduleId),i=options.catalog.inverters.find(x=>x.id==s.inverterId);
  $('batchPreview').textContent=`${addresses.length}곳 분석${all.length>addresses.length?' · 중복 '+(all.length-addresses.length)+'줄 제외':''}\n${p.label}\n모듈 ${m.brand} ${m.model} · ${m.powerW}W\n인버터 ${i.brand} ${i.model} · ${i.capacityKw}kW\n경사 ${s.tiltDeg}° / ${s.alignment==='roof'?'지붕 외곽 정렬':'남향'} / 목표 DC/AC ${s.dcAcRatio}\n외곽 ${s.edgeM}m / 행 ${s.rowGapM}m / 옆 ${s.sideGapM}m`+(p.mode==='roof'?`\n장애물 ${s.obstacleM}m / 통로 ${s.walkwayM}m / 구획 ${s.blockM}m`:'')+'\n\n'+(draft.recipient?'PDF를 받을 이메일: '+draft.recipient:'메일 발송 없이 파일 다운로드');
  $('batchAddressPreview').replaceChildren(...addresses.map(a=>{const li=document.createElement('li');li.textContent=a;return li;}));
  if(draft.recipient&&draft.testEmail)$('batchPreview').textContent+='\n메일 제목에 [테스트] 표시';
  $('batchSubmit').textContent=draft.recipient?'분석 후 '+uniqueRecipients.length+'명에게 PDF 발송':'분석하고 PDF 만들기';$('batchEdit').hidden=true;$('batchReview').hidden=false;$('batchReview').scrollIntoView({block:'start'});
 }
 async function submit(){if(busy||!draft)return;busy=true;$('batchSubmit').disabled=true;$('batchError').textContent='';try{
  await api('/api/batches',{method:'POST',headers:{'Idempotency-Key':submissionKey},body:JSON.stringify(draft)});
  $('batchReview').hidden=true;$('batchEdit').hidden=false;$('batchAddresses').value='';draft=null;await refresh();$('batchJobs').scrollIntoView({block:'start'});
 }catch(e){error(e);}finally{busy=false;$('batchSubmit').disabled=false;}}
 async function download(url){
  return window.PFSolbiFiles.download(url);
 }
 function button(parent,label,action){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await action();}catch(e){error(e);}finally{b.disabled=false;}};parent.append(b);}
 function render(batch){
  const card=document.createElement('article');card.className='batch-card';card.dataset.batchId=batch.id;const title=document.createElement('h3');title.textContent=new Date(batch.createdAt*1000).toLocaleString('ko-KR')+' · '+batch.total+'곳';card.append(title);
  const status=document.createElement('p');status.className='batch-status';status.textContent=({running:'분석 중',completed:'보고서 생성 완료',cancelled:'중단됨'}[batch.status]||batch.status)+` · ${batch.completed}/${batch.total}`;card.append(status);
  const progress=document.createElement('progress');progress.max=batch.total;progress.value=batch.completed;progress.setAttribute('aria-label','보고서 생성 진행률');card.append(progress);
  const equipment=document.createElement('p');equipment.className='batch-note';equipment.textContent=batch.settings.label+' · 모듈 '+batch.settings.module.powerW+'W · 인버터 '+batch.settings.inverter.capacityKw+'kW';card.append(equipment);
  if(batch.recipient){const mail=document.createElement('p');mail.className='batch-note';mail.textContent=batch.recipient+' · '+(batch.mail?.message||'분석 완료 후 메일 발송');card.append(mail);
   const parts=batch.mail?.parts||[],many=parts.some(part=>part.partIndex>1);
   for(const part of parts){const row=document.createElement('p');row.className='batch-note';row.textContent=(part.recipient||'')+(many?' · '+part.partIndex+'번째 묶음':'')+' · '+({pending:'메일 발송 대기',sending:'메일 전송 중',accepted:'메일 서버 접수',unknown:'메일 접수 확인 필요 · 자동 재전송 안 함',error:'메일 서버 미접수 · 다시 보내기 가능',not_configured:'메일 서버 설정 필요'}[part.status]||'메일 상태 확인 중');card.append(row);}}
  const tools=document.createElement('div');tools.className='batch-tools';card.append(tools);
  if(batch.completed&&!batch.expired)button(tools,'PDF·HTML 묶음 다운로드',()=>download('/api/batches/'+batch.id+'/download'));
  if(batch.needsResume)button(tools,'남은 주소 이어서 실행',async()=>{await api('/api/batches/'+batch.id+'/resume',{method:'POST',body:'{}'});await refresh();});
  if(batch.mailRetry)button(tools,'접수되지 않은 메일 다시 보내기',async()=>{await api('/api/batches/'+batch.id+'/resume',{method:'POST',body:'{}'});await refresh();});
  if(batch.status==='running')button(tools,'남은 분석 중단',async()=>{await api('/api/batches/'+batch.id+'/cancel',{method:'POST',body:'{}'});await refresh();});
  if(batch.expired){const p=document.createElement('p');p.textContent='파일 보관 기간(30일)이 지났습니다.';card.append(p);}
  const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='주소별 결과 '+batch.completed+'건';details.append(summary);card.append(details);
  batch.items.forEach((item,index)=>{
   const row=document.createElement('div');row.className='batch-item';const name=document.createElement('strong');name.textContent=(index+1)+'. '+item.address;row.append(name);
   const note=document.createElement('p');note.textContent=item.capacityKw!=null?item.capacityKw.toFixed(2)+'kW DC ('+(item.status==='partial_review'?'일부 지붕만 분석':'가정 배치')+') · '+(item.shadowStatus==='computed_model'?'공공자료 음영 모델 계산 완료':'음영 미확인'):('미확인: '+item.reason);row.append(note);
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
 $('batchPreset').onchange=preset;$('batchClose').onclick=()=>dialog.close();$('batchForm').onsubmit=review;
 $('batchBack').onclick=()=>{$('batchEdit').hidden=false;$('batchReview').hidden=true;};$('batchSubmit').onclick=submit;
 window.PFSolbiBatch={open,refresh};$('batchOpen')?.addEventListener('click',()=>open());
 $('msgInput')?.addEventListener('paste',event=>{if(!window.PFSolbiWake?.isAwake())return;const value=event.clipboardData?.getData('text')||'',lines=value.split(/\r?\n/).filter(x=>x.trim());if(lines.length>=2&&lines.every(x=>/(로|길|동|리|읍|면)\s*(산\s*)?\d/.test(x))){event.preventDefault();open(value);}});
 let started=false;
 window.addEventListener('solbi:awake',()=>{if(started)refresh().catch(error);});
 window.addEventListener('solbi:locked',()=>{clearTimeout(timer);});
 window.addEventListener('load',async()=>{try{await window.PFSolbiContext?.ready;await window.PFSolbiWake.ready;started=true;await refresh();}catch(_){/* Sign-in UI owns authentication errors. */}});
})();
