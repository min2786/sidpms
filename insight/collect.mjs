// GitHub Actions에서 매일 실행: 인사이트(키워드 순위·유튜브 지표)를 공식 API로 조회해 Supabase `insight` 문서의 hist에 기록합니다.
// 필요한 환경변수(GitHub Secrets): SUPABASE_URL, SUPABASE_SERVICE_KEY, NAVER_CLIENT_ID, NAVER_CLIENT_SECRET, YOUTUBE_API_KEY, GSC_SA_JSON, GSC_SITE
import {createSign} from "node:crypto";
const E=process.env,U=E.SUPABASE_URL,SK=E.SUPABASE_SERVICE_KEY;
if(!U||!SK){console.error("SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다.");process.exit(1)}
const H={apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"application/json"};
const kst=new Date(Date.now()+9*3600e3),iso=d=>d.toISOString().slice(0,10),today=iso(kst);
const addDays=(s,n)=>iso(new Date(new Date(s+"T00:00:00Z").getTime()+n*864e5));
const norm=s=>String(s||"").toLowerCase().replace(/<\/?b>/g,"").replace(/&[a-z]+;/g," ");
const digits=s=>String(s||"").replace(/\D/g,"");
const host=u=>String(u||"").toLowerCase().replace(/^https?:\/\//,"").replace(/^www\./,"").replace(/\/.*$/,"");

// 검색 결과 항목이 내가 등록한 사이트/회사/전화/태그와 일치하는지
function matches(kw,it){ // it: {url,text}
  const t=norm(it.text),u=norm(it.url);
  if(kw.site){const h=host(kw.site);if(h&&(host(u).endsWith(h)||u.includes(h)))return"site"}
  if(kw.co&&t.includes(norm(kw.co)))return"company";
  if(kw.tel&&digits(kw.tel).length>=7&&digits(it.text).includes(digits(kw.tel)))return"phone";
  if(kw.tag&&t.includes(norm(kw.tag).replace(/^#/,"")))return"tag";
  return null;
}
const get=async(url,opt={})=>{const r=await fetch(url,opt);if(!r.ok)throw new Error(`${r.status} ${(await r.text()).slice(0,120)}`);return r.json()};
async function rest(path,opt={}){const r=await fetch(`${U}/rest/v1/pms_docs${path}`,{...opt,headers:{...H,...(opt.headers||{})}});if(!r.ok)throw new Error("supabase "+r.status);return opt.method&&opt.method!=="GET"?null:r.json()}
const upHist=(hist,rec)=>[...(hist||[]).filter(h=>h.d!==rec.d),rec].sort((a,b)=>a.d.localeCompare(b.d));

// ── 네이버 검색 API (웹문서/블로그): 최대 300건 안에서 순위 계산
async function naverRank(kw,kind){
  if(!E.NAVER_CLIENT_ID||!E.NAVER_CLIENT_SECRET)throw new Error("NAVER_CLIENT_ID/SECRET 없음");
  let n=0;
  for(const start of [1,101,201]){
    const j=await get(`https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(kw.kw)}&display=100&start=${start}`,{headers:{"X-Naver-Client-Id":E.NAVER_CLIENT_ID,"X-Naver-Client-Secret":E.NAVER_CLIENT_SECRET}});
    for(const it of j.items||[]){n++;const by=matches(kw,{url:it.link||it.bloggerlink,text:`${it.title} ${it.description} ${it.bloggername||""} ${it.link}`});if(by)return{rank:n,url:it.link,by}}
    if((j.items||[]).length<100)break;
  }
  return{rank:null};
}
// ── 유튜브 검색 (영상 검색 결과 최대 100건)
async function youtubeRank(kw){
  if(!E.YOUTUBE_API_KEY)throw new Error("YOUTUBE_API_KEY 없음");
  let n=0,token="";
  for(let i=0;i<2;i++){
    const j=await get(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=50&q=${encodeURIComponent(kw.kw)}&regionCode=KR&relevanceLanguage=ko&key=${E.YOUTUBE_API_KEY}${token?"&pageToken="+token:""}`);
    for(const it of j.items||[]){n++;const url="https://www.youtube.com/watch?v="+it.id.videoId,s=it.snippet||{};const by=matches(kw,{url,text:`${s.title} ${s.description} ${s.channelTitle}`});if(by)return{rank:n,url,by}}
    token=j.nextPageToken;if(!token)break;
  }
  return{rank:null};
}
// ── 구글: Search Console API (서비스 계정). 내 사이트의 해당 키워드 평균 순위, 약 3일 지연
const b64u=b=>Buffer.from(b).toString("base64url");
async function gscToken(){
  const sa=JSON.parse(E.GSC_SA_JSON),now=Math.floor(Date.now()/1000),head=b64u(JSON.stringify({alg:"RS256",typ:"JWT"})),
    body=b64u(JSON.stringify({iss:sa.client_email,scope:"https://www.googleapis.com/auth/webmasters.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600}));
  const sig=createSign("RSA-SHA256").update(head+"."+body).sign(sa.private_key,"base64url");
  const j=await get("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:`grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${head}.${body}.${sig}`});
  return j.access_token;
}
let gt=null;
async function googleRank(kw){
  if(!E.GSC_SA_JSON||!E.GSC_SITE)throw new Error("GSC_SA_JSON/GSC_SITE 없음");
  gt=gt||await gscToken();const day=addDays(today,-3);
  const j=await get(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(E.GSC_SITE.split(",")[0].trim())}/searchAnalytics/query`,{method:"POST",headers:{Authorization:"Bearer "+gt,"Content-Type":"application/json"},body:JSON.stringify({startDate:day,endDate:day,dimensions:["query"],dimensionFilterGroups:[{filters:[{dimension:"query",operator:"equals",expression:kw.kw.toLowerCase()}]}],rowLimit:1})});
  const r=(j.rows||[])[0];return{d:day,rank:r?Math.round(r.position*10)/10:null,clicks:r?r.clicks:null,impressions:r?r.impressions:null};
}
// ── 유튜브 게시물 조회수·좋아요
async function youtubeStats(posts){
  const id=u=>{const m=String(u||"").match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);return m&&m[1]};
  const map={};posts.forEach(p=>{const v=id(p.data.url);if(v)(map[v]=map[v]||[]).push(p)});
  const ids=Object.keys(map);if(!ids.length)return;if(!E.YOUTUBE_API_KEY)throw new Error("YOUTUBE_API_KEY 없음");
  for(let i=0;i<ids.length;i+=50){
    const j=await get(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids.slice(i,i+50).join(",")}&key=${E.YOUTUBE_API_KEY}`);
    for(const v of j.items||[])for(const p of map[v.id])p.rec={d:today,views:+v.statistics.viewCount||0,likes:+v.statistics.likeCount||0,src:"auto"};
  }
}

const rows=await rest("?col=eq.insight&select=id,data");
const kws=rows.filter(r=>r.data&&r.data.t==="kw"),posts=rows.filter(r=>r.data&&r.data.t==="post");
let ok=0,fail=0;
for(const r of kws){
  const k=r.data;
  try{
    let res;
    if(k.eng==="naver_web")res=await naverRank(k,"webkr");
    else if(k.eng==="naver_blog")res=await naverRank(k,"blog");
    else if(k.eng==="youtube")res=await youtubeRank(k);
    else if(k.eng==="google")res=await googleRank(k);
    else continue;
    r.rec={d:res.d||today,rank:res.rank,page:res.rank?Math.ceil(res.rank/10):null,url:res.url||"",by:res.by||"",src:"auto",...(res.clicks!=null?{clicks:res.clicks,impressions:res.impressions}:{})};
  }catch(e){console.error("키워드 실패",k.kw,e.message);r.err=e.message;fail++}
}
try{await youtubeStats(posts)}catch(e){console.error("유튜브 지표 실패",e.message);fail++}
for(const r of [...kws,...posts]){
  if(!r.rec)continue;
  // 수동 입력값이 있는 날짜는 덮어쓰지 않음
  if((r.data.hist||[]).some(h=>h.d===r.rec.d&&h.src==="manual"))continue;
  const data={...r.data,hist:upHist(r.data.hist,r.rec),updatedAt:Date.now()};
  await rest("?on_conflict=col,id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({col:"insight",id:r.id,data,updated_at:new Date().toISOString()})});ok++;
}
console.log(`기록 ${ok}건, 실패 ${fail}건`);
