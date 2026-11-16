/* An address list attached to a Solbi chat message: the shared client module (static/pathfinder/solbi-attach.js) and its
   wiring in the phone page and the PC panel. The server side is tests/test_pf_solbi_address_file.py. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),shared=fs.existsSync(path.join(root,'static/pathfinder/solbi-attach.js'))?'static/pathfinder':'assets/pathfinder';
const attach=require(path.join(root,shared,'solbi-attach.js'));
const file=(name,size,bytes)=>({name,size,arrayBuffer:async()=>bytes||new Uint8Array(size).buffer});
const ID='af_'+'0123456789abcdef'.repeat(2);

(async()=>{
  // 1) Which files go up: spreadsheets and text up to 3 MB; anything else is refused in words before any request.
  assert.equal(attach.PATH,'/api/llm/address-file');assert.equal(attach.MAX_BYTES,3*1024*1024);
  for(const name of ['목록.xlsx','A.XLSX','a.xlsm','a.csv','a.tsv','주소.txt','확장자없음'])assert.equal(attach.check(file(name,10)).name,name);
  for(const name of ['a.xls','a.hwp','a.pdf','a.png','a.docx','a.zip'])assert.throws(()=>attach.check(file(name,10)),/엑셀\(\.xlsx\), CSV 또는 텍스트\(\.txt\) 파일만/,name);
  assert.throws(()=>attach.check(file('a.xlsx',attach.MAX_BYTES+1)),/3MB 이하/);
  assert.throws(()=>attach.check(file('a.xlsx',0)),/읽지 못했습니다/);assert.throws(()=>attach.check(null),/읽지 못했습니다/);
  for(const kind of ['.xlsx','.csv','.txt'])assert.ok(attach.ACCEPT.split(',').includes(kind),kind);

  // 2) upload(): the file as base64 JSON through the page's own POST; the kept list's summary comes back.
  const bytes=Uint8Array.from({length:70000},(_,i)=>i%251),sent=[];
  const info={id:ID,name:'경기도 북부.xlsx',count:69,tooMany:false,message:'‘경기도 북부.xlsx’에서 주소 69곳을 읽었습니다.'};
  const got=await attach.upload(file('경기도 북부.xlsx',bytes.length,bytes.buffer),async(p,body)=>{sent.push([p,body]);return {ok:true,file:info};});
  assert.equal(got,info);assert.equal(sent.length,1);assert.equal(sent[0][0],'/api/llm/address-file');
  assert.deepEqual(Object.keys(sent[0][1]),['name','data']);assert.equal(sent[0][1].name,'경기도 북부.xlsx');
  assert.deepEqual([...Buffer.from(sent[0][1].data,'base64')],[...bytes],'the bytes arrive unchanged');
  assert.equal(attach.base64(new Uint8Array([104,105]).buffer),'aGk=');
  // a refusal: the server's Korean reason, or the page's own words; a sleeping assistant's reply (ok without a file) is no upload
  const refused=async reply=>{try{await attach.upload(file('a.xlsx',5),async()=>reply);}catch(error){return error.message;}return 'accepted';};
  assert.equal(await refused({ok:false,error:'file_empty',message:'파일에서 주소를 찾지 못했습니다.'}),'파일에서 주소를 찾지 못했습니다.');
  assert.equal(await refused({ok:true,awake:false,intent:'wake_required'}),attach.TEXT.server);
  assert.equal(await refused({ok:true,file:{id:'x',count:3}}),attach.TEXT.server);assert.equal(await refused({ok:true,file:{id:ID,count:0}}),attach.TEXT.server);
  assert.equal(await refused(null),attach.TEXT.server);assert.equal(await refused({ok:false,message:'internal error'}),attach.TEXT.server,'a raw server word is never shown');
  let calls=0;await assert.rejects(attach.upload(file('a.pdf',5),async()=>{calls++;}),/파일만 읽을 수 있습니다/);assert.equal(calls,0,'a refused type is never sent');
  await assert.rejects(attach.upload(file('a.xlsx',5),async()=>{throw new Error('파일이 너무 큽니다.');}),/파일이 너무 큽니다/,'the page POST\'s own error passes through');
  await assert.rejects(attach.upload({name:'a.csv',size:5,arrayBuffer:async()=>{throw new Error('gone');}},async()=>({})),/다시 선택해 주세요/);

  // 3) What the page shows and sends with the next message.
  assert.equal(attach.label(info),'📎 경기도 북부.xlsx · 주소 69곳');
  assert.equal(attach.label({name:'1.경기도 북부_1000㎡ 이상(10월 작업현황_72개사).xlsx',count:69}),'📎 1.경기도 북부_1000㎡…_72개사).xlsx · 주소 69곳');
  assert.deepEqual(attach.context(info),{addressFile:{id:ID}});
  assert.equal(attach.context({...info,tooMany:true}),null,'a list above the batch limit is not attached');
  assert.equal(attach.context({id:'ao_'+'0'.repeat(32),count:2}),null);assert.equal(attach.context(null),null);
  assert.equal(attach.DEFAULT_MESSAGE,'첨부한 주소 목록을 분석해줘');

  // 4) The Solbi Android app opens a file picker from 1.0.5; browsers and the home-screen app always can.
  const web='Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36';
  for(const [ua,can] of [[web,true],['',true],[web+' SolbiAndroid/1.0.4',false],[web+' SolbiAndroid/1.0.0',false],[web+' SolbiAndroid/1.0.5',true],[web+' SolbiAndroid/1.1.0',true],[web+' SolbiAndroid/2.0.0',true],[web+' SolbiAndroid/x',true]])
    assert.equal(attach.canPick(ua),can,ua);
  assert.match(attach.TEXT.app,/1\.0\.5 이상으로 업데이트/);

  // 5) Drops and pastes.
  const dropped=file('a.csv',3);
  assert.equal(attach.fileOf({dataTransfer:{files:[dropped]}}),dropped);assert.equal(attach.fileOf({clipboardData:{files:[dropped]}}),dropped);
  assert.equal(attach.fileOf({dataTransfer:{files:[]}}),null);assert.equal(attach.fileOf({}),null);
  assert.equal(attach.carriesFiles({dataTransfer:{types:['text/plain','Files']}}),true);assert.equal(attach.carriesFiles({dataTransfer:{types:['text/plain']}}),false);assert.equal(attach.carriesFiles({}),false);
  // pick(): a hidden file input with the accepted types; the chosen file or null on cancel
  for(const chosen of [dropped,null]){
    const made=[],doc={createElement:tag=>{const el={tag,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},remove(){this.removed=true;},click(){this.clicked=true;}};made.push(el);return el;},body:{append(el){el.attached=true;}}};
    const wait=attach.pick(doc),input=made[0];
    assert.deepEqual([input.tag,input.type,input.accept,input.hidden,input.attached,input.clicked],['input','file',attach.ACCEPT,true,true,true]);
    if(chosen){input.files=[chosen];input.listeners.change();}else input.listeners.cancel();
    assert.equal(await wait,chosen);assert.equal(input.removed,true);
  }

  // 6) Wiring. The phone page (server template) and the PC panel both attach, send the list's id once and show the file.
  const panelFile=['static/ai_assistant.js','ai_assistant.js'].map(p=>path.join(root,p)).find(p=>fs.existsSync(p)),panel=fs.readFileSync(panelFile,'utf8');
  assert.match(panel,/id="aiast-attach" title="주소 목록 파일 첨부 \(엑셀·CSV·텍스트\)"/);assert.match(panel,/id="aiast-attachment" hidden role="status"/);
  assert.match(panel,/replace\("check-wording\.js", "solbi-attach\.js"\)/,'loaded beside the other shared scripts');
  assert.match(panel,/const attachment=state\.awake&&!choice&&window\.PFSolbiAttach\?state\.attachment\|\|null:null;/,'never with a card\'s own submit');
  assert.match(panel,/conversationContext\(choice\|\|\(attachment\?PFSolbiAttach\.context\(attachment\):null\)\)/);
  assert.match(panel,/if\(attachment&&state\.attachment===attachment\)clearAttachment\(\);/,'used once');
  assert.match(panel,/window\.addEventListener\("solbi:locked",clearAttachment\)/);
  assert.match(panel,/#aiast-text\[hidden\]~#aiast-attach\{display:none\}/,'hidden while the assistant is locked');
  const pageFile=path.join(root,'templates/solbi_mobile.html');
  if(fs.existsSync(pageFile)){
    const page=fs.readFileSync(pageFile,'utf8');
    assert.match(page,/<button class="icon-btn bg-slate-800 text-xl" id="attachBtn" data-wake-tool hidden onclick="pickAttachment\(\)"/,'shown only while awake');
    assert.match(page,/<script src="\/static\/pathfinder\/solbi-attach\.js\?v=[0-9a-f]{16}"><\/script>/);
    assert.match(page,/const attachment=wakeAwake&&!choice&&typeof attachedList==='object'\?attachedList:null;/);
    assert.match(page,/choice\|\|\(attachment\?PFSolbiAttach\.context\(attachment\):null\)/);
    assert.match(page,/if\(attachment&&attachedList===attachment\)clearAttachment\(\);/);
    assert.match(page,/if\(!PFSolbiAttach\.canPick\(navigator\.userAgent\)\)\{appendSystem\(PFSolbiAttach\.TEXT\.app\);return;\}/);
    assert.match(page,/el\('chips'\)\.hidden = true;clearAttachment\(\);/,'a locked assistant drops the attached list');
    // phone pages show no licence wording
    for(const text of Object.values(attach.TEXT))assert.doesNotMatch(text,/(?<![A-Za-z0-9_])LIC(?![A-Za-z0-9_])|라이[선센]스/);
  }
  console.log('PASS Solbi attach: accepted files, base64 upload and refusals, label and context, app picker from 1.0.5, drop/paste/pick, phone and PC wiring.');
})().catch(error=>{console.error(error);process.exit(1);});
