/* No application caching or request interception on the desktop site. */
'use strict';
self.SOLBI_NOTIFICATION_TARGET='/explore.html?solbiNotifications=1';
self.SOLBI_NOTIFICATION_ICON='/solbi-icon-192.png';
importScripts('/assets/pathfinder/solbi-push-handler.js');
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{if(event.data?.type==='SOLBI_APPLY_UPDATE')self.skipWaiting();});

