const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const requests=[];
const window={BACKEND_URL:'https://backend.test',PFDataMode:{get:()=> 'stored'},
  fetch:async request=>{requests.push(request);return new Response('{}',{status:200});}};
vm.runInNewContext(fs.readFileSync('assets/pathfinder/http-client.js','utf8'),{window,location:{origin:'https://front.test',href:'https://front.test/'},
  sessionStorage:{getItem:()=>null},URL,Headers,Request,Response});
(async()=>{
  await window.fetch('https://backend.test/api/checks/analyze',{method:'POST',headers:{'X-PF-Data-Mode':'live'}});
  assert.equal(requests[0].headers.get('X-PF-Data-Mode'),'live','A report-requested live lookup must not be downgraded by stored UI mode');
  await window.fetch('https://backend.test/api/checks/analyze',{method:'POST'});
  assert.equal(requests[1].headers.get('X-PF-Data-Mode'),'stored');
  console.log('PASS per-request live mode override and explicit stored mode transport');
})().catch(e=>{console.error(e);process.exitCode=1;});
