// SID 알림용 서비스워커: 푸시 수신/표시와 알림 클릭 시 앱 열기만 담당합니다 (오프라인 캐시 없음).
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>e.waitUntil(self.clients.claim()));
self.addEventListener("push",e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(_){d={body:e.data&&e.data.text()}}
  e.waitUntil(self.registration.showNotification(d.title||"SID",{body:d.body||"",icon:"icon-192.png",badge:"icon-192.png",tag:d.tag||"sid",data:{url:d.url||"./"}}));
});
self.addEventListener("notificationclick",e=>{
  e.notification.close();
  const u=new URL((e.notification.data&&e.notification.data.url)||"./",self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(l=>{for(const c of l){if(c.url.startsWith(self.registration.scope)&&"focus"in c){c.navigate(u);return c.focus()}}return self.clients.openWindow(u)}));
});
