// GitHub Actions에서 매일 실행: 오늘 일정/마감 임박 항목을 모아 구독된 기기로 웹푸시 발송.
import webpush from "web-push";
const {SUPABASE_URL:U,SUPABASE_SERVICE_KEY:K,VAPID_PUBLIC:PUB,VAPID_PRIVATE:PRV}=process.env;
const SUBJ=process.env.VAPID_SUBJECT||"mailto:admin@example.com",SITE=process.env.SITE_URL||"https://min2786.github.io/sidpms/";
if(!U||!K||!PUB||!PRV){console.error("환경변수(SUPABASE_URL/SUPABASE_SERVICE_KEY/VAPID_PUBLIC/VAPID_PRIVATE)가 필요합니다.");process.exit(1)}
webpush.setVapidDetails(SUBJ,PUB,PRV);
const H={apikey:K,Authorization:"Bearer "+K};
const get=async c=>{const r=await fetch(`${U}/rest/v1/pms_docs?col=eq.${c}&select=id,data`,{headers:H});if(!r.ok)throw new Error(c+" "+r.status);return r.json()};
const kst=new Date(Date.now()+9*3600e3),iso=d=>d.toISOString().slice(0,10);
const today=iso(kst),dd=n=>iso(new Date(kst.getTime()+n*864e5));
const [projects,plans,subs]=await Promise.all([get("projects"),get("plans"),get("push")]);
const lines=[];
for(const {data:p} of projects){
  if(!p||p.type==="maintenance")continue;
  for(const e of p.events||[])if(e.day===today)lines.push(`📌 ${p.name}: ${e.t}`);
  if(p.end&&(p.progress||0)<100){const n=Math.round((new Date(p.end)-new Date(today))/864e5);
    if(n===0)lines.push(`⏰ ${p.name} 오늘 마감`);else if(n>0&&n<=3)lines.push(`⏰ ${p.name} 마감 D-${n}`);else if(n<0&&n>=-1)lines.push(`❗ ${p.name} 마감 지남`)}
}
for(const {data:x} of plans)if(x&&x.start&&x.end&&x.start<=today&&today<=x.end)lines.push(`🗓 ${x.title}`);
console.log("항목",lines.length,"구독",subs.length);
if(!lines.length||!subs.length)process.exit(0);
const payload=JSON.stringify({title:`SID 오늘 알림 (${lines.length}건)`,body:lines.slice(0,6).join("\n")+(lines.length>6?`\n외 ${lines.length-6}건`:""),url:"./#projects",tag:"sid-"+today});
let ok=0,gone=0;
for(const {id,data:s} of subs){
  if(!s||!s.sub)continue;
  try{await webpush.sendNotification(s.sub,payload);ok++}
  catch(e){if(e.statusCode===404||e.statusCode===410){gone++;await fetch(`${U}/rest/v1/pms_docs?col=eq.push&id=eq.${encodeURIComponent(id)}`,{method:"DELETE",headers:H})}else console.error("실패",e.statusCode||e.message)}
}
console.log("성공",ok,"만료삭제",gone);
