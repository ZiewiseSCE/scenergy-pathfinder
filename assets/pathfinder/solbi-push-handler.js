/* Generic notifications only: no answer, address, credential or private input. */
'use strict';
const SOLBI_NOTICE_TITLE='솔비',SOLBI_NOTICE_BODY='새 결과가 준비됐습니다. 앱에서 확인하세요.';
const noticeTarget=()=>self.SOLBI_NOTIFICATION_TARGET||'/m?solbiNotifications=1';
const noticeId=value=>typeof value==='string'&&/^[A-Za-z0-9:_-]{1,140}$/.test(value);
function noticeDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('solbi-notifications-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function noticeRead(key){const db=await noticeDB();try{return await new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
async function noticeWrite(key,value){const db=await noticeDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function noticeSeen(ids){const db=await noticeDB();try{await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite'),table=tx.objectStore('state'),read=table.get('delivery');read.onsuccess=()=>{const value=read.result||{seen:[],pending:{}};value.seen=[...new Set([...value.seen,...ids.filter(noticeId)])].slice(-160);for(const id of ids)delete value.pending[id];table.put(value,'delivery');};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
async function noticeClaim(id){const db=await noticeDB();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite'),table=tx.objectStore('state'),read=table.get('delivery');let duplicate=false;read.onsuccess=()=>{const value=read.result||{seen:[],pending:{}};for(const key of Object.keys(value.pending))if(value.pending[key]<Date.now()-90000)delete value.pending[key];duplicate=value.seen.includes(id)||!!value.pending[id];value.pending[id]=Date.now();table.put(value,'delivery');};tx.oncomplete=()=>resolve(duplicate);tx.onerror=()=>reject(tx.error);});}finally{db.close();}}
self.addEventListener('message',event=>{
 if(event.data?.type==='SOLBI_NOTIFICATIONS_STATE')event.waitUntil(noticeWrite('enabled',event.data.enabled===true).then(()=>event.ports?.[0]?.postMessage({ok:true})));
 if(event.data?.type==='SOLBI_NOTIFICATION_SEEN')event.waitUntil(noticeSeen(event.data.ids||[]));
});
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let payload;try{payload=event.data?.json();}catch(_){return;}
 const id=payload?.eventId||payload?.id;if(!noticeId(id))return;
 // Explicit local opt-out takes priority; missing/evicted storage must not turn
 // a still-valid subscription into a silent push that WebKit would revoke.
 try{if(await noticeRead('enabled')===false)return;}catch(_){}
 let duplicate=false;try{duplicate=await noticeClaim(id);}catch(_){duplicate=true;}
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const visible=windows.filter(client=>client.visibilityState==='visible'&&client.focused);
 const data={id,title:SOLBI_NOTICE_TITLE,body:SOLBI_NOTICE_BODY,url:noticeTarget(),type:'result'};
 for(const client of visible)client.postMessage({type:'SOLBI_NOTIFICATION',event:{...data,push:true}});
 // WebKit requires a native notification for every accepted push, even when a
 // visible client also renders its badge. Repeated IDs replace a silent tag.
 await self.registration.showNotification(SOLBI_NOTICE_TITLE,{body:SOLBI_NOTICE_BODY,tag:'solbi-'+id,renotify:false,silent:duplicate||visible.length>0,data:{id,url:noticeTarget()},icon:self.SOLBI_NOTIFICATION_ICON||'/static/solbi-icon-192.png'});
 try{await noticeSeen([id]);}catch(_){}
})()));
// The browser rotated/expired the push subscription. Re-subscribe with the same
// server key; registration needs the page's licence headers, so open windows (or
// the next mount) re-register it through the authenticated subscribe route.
self.addEventListener('pushsubscriptionchange',event=>event.waitUntil((async()=>{
 try{if(await noticeRead('enabled')===false)return;}catch(_){}
 const key=event.oldSubscription?.options?.applicationServerKey;
 try{if(!event.newSubscription&&key&&!(await self.registration.pushManager.getSubscription()))await self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});}catch(_){}
 for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true}))client.postMessage({type:'SOLBI_PUSH_SUBSCRIPTION_CHANGED'});
})()));
self.addEventListener('notificationclick',event=>{
 event.notification.close();event.waitUntil((async()=>{
  const target=new URL(noticeTarget(),self.location.origin);if(noticeId(event.notification.data?.id))target.searchParams.set('solbiNotice',event.notification.data.id);
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(client=>{try{const u=new URL(client.url);return u.origin===target.origin&&(self.SOLBI_NOTIFICATION_TARGET?['/explore.html','/solar_pathfinder.html'].includes(u.pathname):u.pathname==='/m');}catch(_){return false;}});
  if(existing){await existing.focus();existing.postMessage({type:'SOLBI_NOTIFICATION_OPEN',id:event.notification.data?.id});return;}
  await self.clients.openWindow(target.href);
 })());
});
