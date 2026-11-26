// 프로젝트 문서의 이전/이후를 비교해 "새로 생긴 것"만 알림 항목으로 만듭니다. (순수 함수, 테스트 가능)
const cut=(t,n=60)=>{t=String(t||"").replace(/\s+/g," ").trim();return t.length>n?t.slice(0,n-1)+"…":t};
export function diffProject(oldD,newD,isInsert){
  const out=[]; // {k: np|up|vr|ev|st, title, body}
  if(!newD)return out;
  const nm=newD.name||"프로젝트",mt=newD.type==="maintenance";
  if(isInsert||!oldD){out.push({k:"np",title:"새 프로젝트",body:`${nm}${mt?" (유지관리)":""}`});return out}
  const ids=a=>new Set((a||[]).map(x=>x.id)),oldU=new Map((oldD.updates||[]).map(x=>[x.id,x]));
  for(const u of newD.updates||[]){
    const o=oldU.get(u.id);
    if(!o)out.push({k:"up",title:`${nm} · ${u.status==="긴급"?"🚨 긴급 업데이트":"새 업데이트"}`,body:cut(u.text)});
    else if(o.status!==u.status)out.push({k:"st",title:`${nm} · 상태 변경`,body:`${cut(u.text,40)}: ${o.status||"-"} → ${u.status||"-"}`});
  }
  const ov=ids(oldD.versions);
  for(const v of newD.versions||[])if(!ov.has(v.id))out.push({k:"vr",title:`${nm} · 새 버전 ${v.ver||""}`,body:cut(v.t)});
  const oe=ids(oldD.events);
  for(const e of newD.events||[])if(!oe.has(e.id))out.push({k:"ev",title:`${nm} · 새 일정 (${e.day||""})`,body:cut(e.t)});
  if(oldD.mstate&&newD.mstate&&oldD.mstate!==newD.mstate)out.push({k:"st",title:`${nm} · 프로젝트 상태`,body:`${oldD.mstate} → ${newD.mstate}`});
  return out;
}
