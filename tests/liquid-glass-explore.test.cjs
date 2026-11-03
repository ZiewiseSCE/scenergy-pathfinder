const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
// Liquid glass on the energy map (assets/pathfinder/family-glass.css, audit liquid-glass-20261103 SPEC 3.3): the shared
// file is mirrored and linked last, every map-floating surface and map button carries its glass class, no blurred
// surface sits inside another one (backdrop-root rule), and the login page gets the glass buttons too.
const read=p=>fs.readFileSync(p,'utf8');
const manifest=JSON.parse(read('assets/pathfinder/manifest.json'));
assert.equal(manifest.files['family-glass.css'],crypto.createHash('sha256').update(fs.readFileSync('assets/pathfinder/family-glass.css')).digest('hex'),'family-glass.css is the mirrored backend file');

// 1) family-glass.css is the last stylesheet on the energy map, the login page and the editor loader (roof-layout.html
// then writes the backend editor page, which links it last as well; its /static/pathfinder/ links are rewritten here).
for(const page of ['explore.html','index.html','roof-layout.html']){
  const sheets=[...read(page).matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map(m=>m[0]);
  assert.match(sheets.at(-1),/href="assets\/pathfinder\/family-glass\.css\?v=[0-9a-f]{16}"/,page+': '+sheets.at(-1));
}
assert.match(read('roof-layout.html'),/html\.replaceAll\('\/static\/pathfinder\/','\/assets\/pathfinder\/'\)/,'editor links resolve to the mirrored assets');

// 2) Markup anchors on the energy map and their classes.
const html=read('explore.html'),body=html.slice(html.indexOf('<body'));
const tagOf=needle=>{const i=body.indexOf(needle);assert.ok(i>=0,needle);const s=body.lastIndexOf('<',i);return body.slice(s,body.indexOf('>',i)+1);};
const classes=tag=>(/class="([^"]*)"/.exec(tag)||[,''])[1].split(/\s+/).filter(Boolean);
const has=(needle,want)=>{const tag=tagOf(needle),got=classes(tag);for(const c of want.split(' '))assert.ok(got.includes(c),needle+' needs '+c+': '+tag.slice(0,200));return tag;};
has('class="map-badge map-status','pf-glass pf-glass--dark pf-glass--chip');
has('id="toggleList"','pf-glass-btn pf-glass-btn--float');
has('id="showSelected"','pf-glass-btn pf-glass-btn--float');
has('class="map-view-options','pf-glass pf-glass--chip');
assert.match(body,/<p id="cadastralHint"[^>]*><span class="pf-glass pf-glass--dark pf-glass--chip">/);
has('class="map-tools','pf-glass');
has('class="legend','pf-glass pf-glass--strong');
has('id="measureStatus"','pf-glass pf-glass--dark pf-glass--strong pf-glass--chip');
has('id="detail"','pf-glass pf-glass--strong');
has('<dialog id="panel"','pf-glass pf-glass--modal');
assert.match(has('id="closePanel"','pf-glass-btn pf-glass-btn--icon'),/aria-label="닫기"/);
has('id="toast"','pf-glass pf-glass--dark pf-glass--strong pf-glass--chip');
has('class="result-title','pf-glass pf-glass--strong pf-glass--flush');
assert.match(body,/<footer class="pf-glass pf-glass--strong pf-glass--flush-top"><button data-panel="sources">/);
has('class="workspace-switch','pf-glass-btn pf-glass-btn--primary');
// Data marks keep their own colours: the legend swatches and state chips never become glass.
assert.doesNotMatch(body,/class="[^"]*(legend-pin|legend-dot|pf-state)[^"]*pf-glass/);

// 3) One blur layer between the text and the map: no blurred glass element inside another blurred one. Blurred =
// .pf-glass (not --modal/--flat), .pf-glass-btn--float, .pf-glass-btn--dark.
const blurs=c=>(c.includes('pf-glass')&&!c.includes('pf-glass--modal')&&!c.includes('pf-glass--flat'))||c.includes('pf-glass-btn--float')||c.includes('pf-glass-btn--dark');
const voids=new Set(['area','base','br','col','embed','hr','img','input','link','meta','source','track','wbr']);
const stack=[];let blurredOpen=0,checked=0;
for(const m of body.replace(/<script[\s\S]*?<\/script>/g,'').replace(/<svg[\s\S]*?<\/svg>/g,'').matchAll(/<(\/?)([a-z][\w-]*)\b([^>]*)>/gi)){
  const [,close,name,rest]=m,tag=name.toLowerCase();
  if(close){while(stack.length){const top=stack.pop();if(top.blur)blurredOpen--;if(top.tag===tag)break;}continue;}
  if(voids.has(tag)||rest.endsWith('/'))continue;
  const blur=blurs(classes('<x'+rest+'>'));
  if(blur){checked++;assert.equal(blurredOpen,0,'nested blurred glass: <'+tag+rest.slice(0,120)+'>');blurredOpen++;}
  stack.push({tag,blur});
}
assert.ok(checked>=11,'blurred surfaces checked: '+checked);
console.log(`PASS energy map liquid glass: family-glass.css mirrored and linked last (map + login), ${checked} blurred surfaces classed with no nesting, dialog/toast/legend/detail/list bars by class.`);
