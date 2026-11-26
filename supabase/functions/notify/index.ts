// Supabase Edge Function: pms_docs 변경 시(Database Webhook) 호출되어 웹푸시를 즉시 발송합니다.
import webpush from "npm:web-push@3.6.7";
import {diffProject} from "./diff.js";

const env=(k:string)=>Deno.env.get(k)||"";
const URL_=env("SUPABASE_URL"),KEY=env("SUPABASE_SERVICE_ROLE_KEY");
webpush.setVapidDetails(env("VAPID_SUBJECT")||"mailto:admin@example.com",env("VAPID_PUBLIC"),env("VAPID_PRIVATE"));
const H={apikey:KEY,Authorization:"Bearer "+KEY,"Content-Type":"application/json"};

Deno.serve(async req=>{
  if(!env("WEBHOOK_SECRET")||req.headers.get("x-webhook-secret")!==env("WEBHOOK_SECRET"))return new Response("forbidden",{status:403});
  let p:any;try{p=await req.json()}catch{return new Response("bad request",{status:400})}
  const rec=p.record;
  if(p.table!=="pms_docs"||!rec||rec.col!=="projects")return new Response("skip");
  const items=diffProject(p.old_record&&p.old_record.data,rec.data,p.type==="INSERT");
  if(!items.length)return new Response("no change");
  const r=await fetch(`${URL_}/rest/v1/pms_docs?col=eq.push&select=id,data`,{headers:H});
  const subs=r.ok?await r.json():[];
  const by=rec.data&&rec.data.by;
  let sent=0,gone=0;
  await Promise.all(subs.map(async(s:any)=>{
    const d=s.data||{};if(!d.sub)return;
    if(by&&d.dev===by)return;                       // 변경한 본인 기기는 제외
    const pf=d.prefs||{};
    const mine=items.filter(i=>pf[i.k]!==false);   // 기본값: 모두 켜짐
    if(!mine.length)return;
    const one=mine.length===1;
    const payload=JSON.stringify({
      title:one?mine[0].title:`${rec.data.name||"프로젝트"} · 변경 ${mine.length}건`,
      body:one?mine[0].body:mine.slice(0,4).map(i=>"• "+i.body).join("\n"),
      url:"./#projects",tag:"sid-"+rec.id});
    try{await webpush.sendNotification(d.sub,payload);sent++}
    catch(e:any){if(e.statusCode===404||e.statusCode===410){gone++;await fetch(`${URL_}/rest/v1/pms_docs?col=eq.push&id=eq.${encodeURIComponent(s.id)}`,{method:"DELETE",headers:H})}}
  }));
  return new Response(JSON.stringify({items:items.length,sent,gone}),{headers:{"Content-Type":"application/json"}});
});
