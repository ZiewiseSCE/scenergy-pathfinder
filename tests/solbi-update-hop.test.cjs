const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// solbi-update.html: the browser page the update dialog of Solbi APK 1.0.0~1.0.2 opens (those apps cannot save an APK).
const html=fs.readFileSync('solbi-update.html','utf8');
const INSTALL='https://pathfinder-api.ziewise.com/m/install#android';
assert.match(html,/<meta name="robots" content="noindex" \/>/);
assert.doesNotMatch(html,/<script[^>]+src=/,'no external script');
const hrefs=[...html.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
assert.deepEqual(hrefs,['solbi-icon-192.png',INSTALL,INSTALL],'without JavaScript: the install guide only');
assert.doesNotMatch(html,/(?<![A-Za-z0-9_])LIC(?![A-Za-z0-9_])|라이[선센]스/,'phone page: no key wording');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
assert.equal(script.length,1);

const CHROME='Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36';
function open(search,userAgent=CHROME,session={}){
  const el=id=>({id,textContent:'',href:INSTALL,hidden:id==='solbiUpdateGuide'});
  const elements={solbiUpdateTitle:el('solbiUpdateTitle'),solbiUpdateStatus:el('solbiUpdateStatus'),solbiUpdateApk:el('solbiUpdateApk'),solbiUpdateGuide:el('solbiUpdateGuide')};
  const replaced=[];
  vm.runInNewContext(script[0],{location:{search,replace:url=>replaced.push(url)},navigator:{userAgent},
    sessionStorage:{getItem:k=>session[k]??null,setItem:(k,v)=>{session[k]=String(v);}},document:{getElementById:id=>elements[id]||null}});
  return {replaced,elements,session};
}
const APK='https://pathfinder-api.ziewise.com/static/downloads/solbi-mobile-1.0.4.apk';
const first=open('?v=1.0.4');
assert.deepEqual(first.replaced,[APK],'Android browser: the APK download starts at once');
assert.equal(first.elements.solbiUpdateApk.href,APK);assert.equal(first.elements.solbiUpdateApk.textContent,'APK 받기 (1.0.4)');
assert.equal(first.elements.solbiUpdateTitle.textContent,'솔비 1.0.4 업데이트');assert.equal(first.elements.solbiUpdateGuide.hidden,false);
assert.match(first.elements.solbiUpdateStatus.textContent,/받고 있습니다/);
assert.deepEqual(open('?v=1.0.4',CHROME,first.session).replaced,[],'once per tab: a reload does not download again');
assert.deepEqual(open('?v=1.0.5',CHROME,first.session).replaced,[APK.replace('1.0.4','1.0.5')],'a newer version downloads');
const samsung=open('?v=1.0.4','Mozilla/5.0 (Linux; Android 13; SM-A536N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36');
assert.deepEqual(samsung.replaced,[APK]);
const blocked=open('?v=1.0.4',CHROME,{get solbiUpdateStarted(){throw Error('denied');}});
assert.deepEqual(blocked.replaced,[APK],'storage refused: still downloads');
for(const [name,ua] of [['iPhone','Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'],
  ['desktop','Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36'],
  ['the Solbi app itself',CHROME.replace('Chrome/129.0','Chrome/129.0 wv')+' SolbiAndroid/1.0.2']]){
  const page=open('?v=1.0.4',ua);
  assert.deepEqual(page.replaced,[],name+': no automatic download');assert.equal(page.elements.solbiUpdateApk.href,APK,name+': the button still names the APK');
  assert.match(page.elements.solbiUpdateStatus.textContent,/Android 휴대폰/);
}
for(const search of ['','?v=','?v=1.0','?v=1.0.4.5','?v=1.0.4&x=1','?x=1&v=1.0.4','?v=1.0.4/../../evil','?v=12345.0.0','?v=1.0.4%2F','?v=a.b.c','?v=1.0.4#x']){
  const page=open(search);
  assert.deepEqual(page.replaced,[],'refused: '+search);assert.equal(page.elements.solbiUpdateApk.href,INSTALL,'refused: '+search);
  assert.equal(page.elements.solbiUpdateGuide.hidden,true);
}
console.log('PASS solbi-update.html opens only the published APK on an Android browser');
