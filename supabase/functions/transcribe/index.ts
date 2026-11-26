// Supabase Edge Function: 회의 녹음(pms-audio 버킷)을 Gemini로 듣고 요약·결정사항·받아쓰기를 meetings 문서에 채웁니다.
// 배포 시 "Verify JWT"는 켜 둡니다(로그인한 사용자만 호출). 필요한 Secret: GEMINI_API_KEY (선택: GEMINI_MODEL)
const env=k=>Deno.env.get(k)||"";
const U=env("SUPABASE_URL"),SK=env("SUPABASE_SERVICE_ROLE_KEY"),GK=env("GEMINI_API_KEY"),MODEL=env("GEMINI_MODEL")||"gemini-2.5-flash";
const G="https://generativelanguage.googleapis.com";
const H={apikey:SK,Authorization:"Bearer "+SK,"Content-Type":"application/json"};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const CORS={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type, x-client-info","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(o,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...CORS,"Content-Type":"application/json"}});

function role(req){try{const t=(req.headers.get("authorization")||"").replace(/^Bearer\s+/i,"").split(".")[1];return JSON.parse(atob(t.replace(/-/g,"+").replace(/_/g,"/"))).role}catch{return ""}}
async function getDoc(id){const r=await fetch(`${U}/rest/v1/pms_docs?col=eq.meetings&id=eq.${encodeURIComponent(id)}&select=data`,{headers:H});const a=r.ok?await r.json():[];return a[0]?a[0].data:null}
async function patch(id,f){ // 문서가 그 사이 삭제됐다면 되살리지 않음
  const cur=await getDoc(id);if(!cur)return false;
  await fetch(`${U}/rest/v1/pms_docs?on_conflict=col,id`,{method:"POST",headers:{...H,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({col:"meetings",id,data:{...cur,...f,updatedAt:Date.now()},updated_at:new Date().toISOString()})});return true}

async function gjson(path,body,tries=3){
  for(let i=0;i<tries;i++){
    const r=await fetch(`${G}${path}`,{method:"POST",headers:{"x-goog-api-key":GK,"Content-Type":"application/json"},body:JSON.stringify(body)});
    if(r.ok)return r.json();
    const t=await r.text();
    if((r.status===429||r.status===503)&&i<tries-1){await sleep(20000*(i+1));continue}
    throw new Error(r.status===429?"Gemini 무료 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.":`Gemini 오류 ${r.status}: ${t.slice(0,160)}`);
  }
}
async function gupload(bytes,mime,name){
  const st=await fetch(`${G}/upload/v1beta/files`,{method:"POST",headers:{"x-goog-api-key":GK,"X-Goog-Upload-Protocol":"resumable","X-Goog-Upload-Command":"start","X-Goog-Upload-Header-Content-Length":String(bytes.byteLength),"X-Goog-Upload-Header-Content-Type":mime,"Content-Type":"application/json"},body:JSON.stringify({file:{display_name:name}})});
  const url=st.headers.get("x-goog-upload-url");if(!st.ok||!url)throw new Error("Gemini 파일 업로드를 시작하지 못했습니다("+st.status+")");
  const fin=await fetch(url,{method:"POST",headers:{"Content-Length":String(bytes.byteLength),"X-Goog-Upload-Offset":"0","X-Goog-Upload-Command":"upload, finalize"},body:bytes});
  if(!fin.ok)throw new Error("Gemini 파일 업로드 실패("+fin.status+")");
  let f=(await fin.json()).file;
  for(let i=0;i<40&&f.state&&f.state!=="ACTIVE";i++){
    if(f.state==="FAILED")throw new Error("Gemini가 오디오를 처리하지 못했습니다.");
    await sleep(3000);const r=await fetch(`${G}/v1beta/${f.name}`,{headers:{"x-goog-api-key":GK}});f=await r.json();
  }
  return f;
}
const gen=(file,prompt,cfg)=>gjson(`/v1beta/models/${MODEL}:generateContent`,{contents:[{parts:[{fileData:{mimeType:file.mimeType,fileUri:file.uri}},{text:prompt}]}],generationConfig:{temperature:0.2,...cfg}});
const text=r=>((r.candidates||[])[0]?.content?.parts||[]).map(p=>p.text||"").join("");

const P1=`당신은 회사 주간 전체회의의 서기입니다. 첨부된 회의 녹음을 끝까지 듣고 한국어로 정리하세요.
- title: 회의 핵심 주제 20자 이내
- attendees: 음성에서 이름이 확인되는 참석자(쉼표 구분). 불확실하면 빈 문자열
- summary: 안건별 요약. 안건 제목 한 줄 뒤에 "- " 불릿으로 핵심 논의를 적기. 간결하게
- decisions: 결정사항과 액션 아이템. 한 줄에 하나, "- [담당자] 할 일 (기한)" 형식. 담당자나 기한이 들리지 않으면 생략하고 추측하지 말 것
들리지 않거나 불확실한 내용은 지어내지 마세요.`;
const SCHEMA={type:"OBJECT",properties:{title:{type:"STRING"},attendees:{type:"STRING"},summary:{type:"STRING"},decisions:{type:"STRING"}},required:["title","summary","decisions"]};
const P2=`첨부된 회의 녹음을 한국어로 처음부터 끝까지 받아쓰세요. 화자가 바뀌면 줄을 바꾸고 "화자1:", "화자2:"처럼 구분하며, 대략 1~2분마다 [mm:ss] 시간 표시를 넣으세요. 요약하지 말고, 들리지 않는 부분은 [불명확]으로 표시하세요.`;

async function work(id,d){
  try{
    const dl=await fetch(`${U}/storage/v1/object/pms-audio/${d.audio}`,{headers:{apikey:SK,Authorization:"Bearer "+SK}});
    if(!dl.ok)throw new Error("저장된 녹음 파일을 찾지 못했습니다.");
    const bytes=new Uint8Array(await dl.arrayBuffer()),mime=(d.mime||dl.headers.get("content-type")||"audio/mp4").split(";")[0];
    const file=await gupload(bytes,mime,id);
    const r1=await gen(file,P1,{responseMimeType:"application/json",responseSchema:SCHEMA,maxOutputTokens:8192});
    let o;try{o=JSON.parse(text(r1))}catch{throw new Error("요약 결과를 해석하지 못했습니다. 다시 시도해 주세요.")}
    const cur=await getDoc(id);if(!cur)return;
    await patch(id,{st:"done",err:"",trSt:"processing",notes:o.summary||"",acts:o.decisions||"",title:cur.title||o.title||"",att:cur.att||o.attendees||"",audio:"",aiAt:Date.now()});
    await fetch(`${U}/storage/v1/object/pms-audio/${d.audio}`,{method:"DELETE",headers:{apikey:SK,Authorization:"Bearer "+SK}}).catch(()=>{});
    try{ // 받아쓰기는 오래 걸려서 별도로 (실패해도 요약은 유지)
      const r2=await gen(file,P2,{maxOutputTokens:65536});
      await patch(id,{tr:text(r2).slice(0,200000),trSt:"done"});
    }catch(e){await patch(id,{trSt:"fail"})}
    fetch(`${G}/v1beta/${file.name}`,{method:"DELETE",headers:{"x-goog-api-key":GK}}).catch(()=>{});
  }catch(e){await patch(id,{st:"error",err:String(e&&e.message||e).slice(0,200)})}
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:CORS});
  if(role(req)!=="authenticated")return json({error:"forbidden"},403);
  if(!GK)return json({error:"GEMINI_API_KEY 가 설정되지 않았습니다."},500);
  let b;try{b=await req.json()}catch{return json({error:"bad request"},400)}
  const id=String(b.id||""),d=id&&await getDoc(id);
  if(!d||!d.audio)return json({error:"처리할 녹음이 없습니다."},404);
  if(d.st==="processing"&&Date.now()-(d.updatedAt||0)<10*60e3&&!b.force&&d.started)return json({ok:true,already:true});
  await patch(id,{st:"processing",err:"",started:Date.now()});
  const p=work(id,d);
  if(typeof EdgeRuntime!=="undefined"&&EdgeRuntime.waitUntil)EdgeRuntime.waitUntil(p);
  return json({ok:true},202);
});
