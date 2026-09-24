const fs=require('node:fs'),vm=require('node:vm');
let n=0;
for(const file of ['solar_pathfinder.html','index.html','roof-layout.html','explore.html']){
const html=fs.readFileSync(file,'utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){if(!match[1].trim())continue;new vm.Script(match[1],{filename:file+':inline-'+(++n)});}
}
for(const file of fs.readdirSync('assets/pathfinder').filter(f=>f.endsWith('.js')))new vm.Script(fs.readFileSync('assets/pathfinder/'+file,'utf8'),{filename:file});
new vm.Script(fs.readFileSync('ai_assistant.js','utf8'),{filename:'ai_assistant.js'});
console.log('PASS '+n+' inline scripts and bundled JavaScript syntax');

const crypto=require('node:crypto'),manifest=JSON.parse(fs.readFileSync('assets/pathfinder/manifest.json','utf8'));
for(const [file,expected] of Object.entries(manifest.files)){const actual=crypto.createHash('sha256').update(fs.readFileSync('assets/pathfinder/'+file)).digest('hex');if(actual!==expected)throw new Error('Asset hash mismatch: '+file);}
console.log('PASS shared asset hashes '+manifest.bundleSha256);
