"use client";
import { useState, useEffect, useRef, useCallback } from "react";

const C = {
  bg:"#1a1510",bg2:"#120f0a",bg3:"#231e14",bg4:"#1e1a10",
  border:"#2e2618",border2:"#3e3220",border3:"#4a3c28",
  text:"#d6c9a8",text2:"#a89878",text3:"#8a7a50",
  muted:"#5a4c30",muted2:"#4a3c28",muted3:"#6a5c40",
  gold:"#c9a060",
};

const DEFAULT_NERO = {
  name:"네로", title:"정략혼 남편 · 가마쿠라 시대",
  tags:["#무뚝뚝","#게으름","#잠버릇최악","#둔한매력"],
  world:"가마쿠라 막부가 무가 정권을 시작하며 천황의 실질적 권위는 바닥에 떨어졌고, 끊임없는 난으로 세상은 혼란 그 자체다. 검의 파공음, 비명, 광기만이 남은 시대. 낭만 따위는 먼지만큼의 가치도 없는 세상에서 네로와 호은은 흔한 정략혼으로 부부가 되었다.",
  personality:"항상 피곤해 보이는 표정. 낮이 훌쩍 지나서야 뒤척거리며 일어나고, 잠버릇이 심해 호은을 침대에서 굴러떨어트린 적이 한두 번이 아니다. 남편으로서 최악이지만 의도적으로 나쁜 사람은 아니다.",
  speech:'"...그리하오." "귀찮소." "왜 또 그리 쳐다보는 것이오."',
  examples:[
    {situation:"호은이 아침 인사를 할 때", response:"*한쪽 눈만 겨우 뜨며* ...시끄럽소. 아직 이른 것이오."},
    {situation:"호은이 화를 낼 때", response:"*귀찮다는 듯 한숨을 쉬며* ...그래서. 원하는 게 뭐요."},
  ],
  stats:[
    {name:"다정함",value:1},{name:"게으름",value:5},
    {name:"잠버릇",value:5},{name:"숨겨진 의식",value:3},
  ],
};

const DEFAULT_HOEON = {
  name:"호은", title:"정략혼 아내 · 가마쿠라 시대",
  tags:["#내성적","#조심스러움","#은근한강단"],
  personality:"말수가 적고 조용한 편이지만 속으로는 할 말이 많다. 낯선 결혼 생활에 조심스럽게 적응 중이며, 네로의 무뚝뚝함에 당황하면서도 묘하게 신경이 쓰인다.",
  stats:[
    {name:"담대함",value:2},{name:"애교",value:3},
    {name:"인내심",value:4},{name:"설레임",value:3},
  ],
};

const FIRST_PROMPT = "[장면: 아침이 한참 지난 늦은 오전. 네로가 침대에서 뒤척이다 막 눈을 뜨고 있다. 잠버릇 탓에 호은이 침대 끄트머리로 밀려난 상태. 네로의 행동묘사와 첫 대사로만 시작해줘. 호은 반응은 쓰지 마.]";

// ── storage ──────────────────────────────────────────────
async function sg(key){
  try{
    if(typeof window==="undefined") return null;
    const v=localStorage.getItem(key);
    return v?JSON.parse(v):null;
  }catch{return null;}
}
async function ss(key,val){
  try{
    if(typeof window==="undefined") return;
    localStorage.setItem(key,JSON.stringify(val));
  }catch{}
}

// ── API ──────────────────────────────────────────────────
async function callClaude(system, messages){
  const res=await fetch("/api/chat",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({system,messages}),
  });
  const data=await res.json();
  if(data.error) throw new Error(data.error);
  return data.text;
}

// ── 시스템 프롬프트 ──────────────────────────────────────
function buildSystem(nero, hoeon, bookmarks, note){
  const stars = (v) => "★".repeat(v)+"☆".repeat(5-v);
  const neroStats = nero.stats?.length
    ? "\n\n["+nero.name+" 스탯 — 반드시 이 수치대로 행동할 것]\n"
      +nero.stats.map(s=>`• ${s.name}: ${stars(s.value)} (${s.value}/5)`).join("\n")
    : "";
  const exText = nero.examples?.length
    ? "\n\n[행동 예시]\n"+nero.examples.map(e=>`• ${e.situation}\n  → ${e.response}`).join("\n")
    : "";
  const hoeonText = `\n\n[상대방 '${hoeon.name}' 정보]\n성격: ${hoeon.personality}\n스탯: ${hoeon.stats.map(s=>`${s.name} ${stars(s.value)}`).join(", ")}`;
  const bmText = bookmarks?.length
    ? "\n\n[절대 잊지 말 것 - 중요 사건]\n"+bookmarks.map((b,i)=>`${i+1}. ${b.summary}`).join("\n")
    : "";
  const noteText = note?.trim() ? "\n\n[유저 메모]\n"+note : "";

  return `너는 일본 가마쿠라 시대를 배경으로 한 로맨스 판타지 소설 속 캐릭터 '${nero.name}'이야.

[세계관]
${nero.world}

[${nero.name} 성격]
${nero.personality}

[말투]
${nero.speech}
가마쿠라 시대풍 격식체("...하오","그리하오","귀찮소")를 간간이 섞어 씀.
짧고 툭툭 던지는 말투. 2~4문장.
행동묘사는 *별표 사이에* 써서 소설 느낌 살리기.${neroStats}${exText}${hoeonText}${bmText}${noteText}`;
}

// ── 별점 ─────────────────────────────────────────────────
function StarRating({value, onChange, readonly=false}){
  return (
    <div style={{display:"flex",gap:2}}>
      {[1,2,3,4,5].map(i=>(
        <span key={i} onClick={()=>!readonly&&onChange(i)}
          style={{fontSize:14,cursor:readonly?"default":"pointer",color:i<=value?C.gold:C.border3,userSelect:"none"}}>★</span>
      ))}
    </div>
  );
}

// ── 스탯 에디터 ──────────────────────────────────────────
function StatsEditor({stats, onChange}){
  const setName=(i,v)=>{const s=[...stats];s[i]={...s[i],name:v};onChange(s);};
  const setVal=(i,v)=>{const s=[...stats];s[i]={...s[i],value:v};onChange(s);};
  const add=()=>onChange([...stats,{name:"새 스탯",value:3}]);
  const del=(i)=>onChange(stats.filter((_,j)=>j!==i));
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {stats.map((s,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:C.bg4,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px"}}>
          <input value={s.name} onChange={e=>setName(i,e.target.value)}
            style={{flex:1,background:"none",border:"none",color:C.text,fontSize:12,fontFamily:"inherit",outline:"none",minWidth:0}}/>
          <StarRating value={s.value} onChange={v=>setVal(i,v)}/>
          <button onClick={()=>del(i)} style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer",padding:"0 2px"}}>✕</button>
        </div>
      ))}
      <button onClick={add} style={{background:C.border2,border:`1px solid ${C.border2}`,borderRadius:8,color:C.text3,fontSize:11,padding:"6px",fontFamily:"inherit",cursor:"pointer"}}>+ 스탯 추가</button>
    </div>
  );
}

// ── 편집 모달 (공통) ─────────────────────────────────────
function EditModal({title, children, onClose}){
  return (
    <div style={{position:"absolute",inset:0,background:"rgba(10,8,6,0.9)",zIndex:200,overflowY:"auto",padding:16}}>
      <div style={{background:C.bg,border:`1px solid ${C.border2}`,borderRadius:14,padding:20,width:"100%",maxWidth:400,margin:"0 auto",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{fontSize:14,fontWeight:600,color:C.gold,letterSpacing:1}}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ── 네로 편집 ────────────────────────────────────────────
function NeroEditModal({profile, onSave, onClose}){
  const [form,setForm]=useState({...profile,tags:profile.tags.join(", ")});
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const setEx=(i,k)=>e=>{const ex=[...form.examples];ex[i]={...ex[i],[k]:e.target.value};setForm(f=>({...f,examples:ex}));};
  const fi={background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",width:"100%",resize:"vertical"};
  return (
    <EditModal title="네로 프로필 수정" onClose={onClose}>
      {[["이름","name"],["직책/설정","title"],["태그 (쉼표 구분)","tags"]].map(([l,k])=>(
        <div key={k}><div style={{fontSize:11,color:C.muted3,marginBottom:4}}>{l}</div>
          <input style={fi} type="text" value={form[k]} onChange={set(k)}/></div>
      ))}
      {[["세계관","world",3],["성격","personality",3],["말투 예시","speech",2]].map(([l,k,r])=>(
        <div key={k}><div style={{fontSize:11,color:C.muted3,marginBottom:4}}>{l}</div>
          <textarea style={fi} rows={r} value={form[k]} onChange={set(k)}/></div>
      ))}
      <div>
        <div style={{fontSize:11,color:C.muted3,marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span>행동 예시</span>
          <button onClick={()=>setForm(f=>({...f,examples:[...f.examples,{situation:"",response:""}]}))}
            style={{background:C.border2,border:"none",borderRadius:6,color:C.text3,fontSize:11,padding:"3px 10px",cursor:"pointer",fontFamily:"inherit"}}>+ 추가</button>
        </div>
        {form.examples.map((ex,i)=>(
          <div key={i} style={{background:C.bg4,border:`1px solid ${C.border}`,borderRadius:8,padding:10,marginBottom:8,display:"flex",flexDirection:"column",gap:6}}>
            <div style={{display:"flex",justifyContent:"space-between"}}>
              <span style={{fontSize:10,color:C.muted3}}>예시 {i+1}</span>
              <button onClick={()=>setForm(f=>({...f,examples:f.examples.filter((_,j)=>j!==i)}))}
                style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer"}}>✕</button>
            </div>
            <input style={{...fi,fontSize:12}} placeholder="상황" value={ex.situation} onChange={setEx(i,"situation")}/>
            <textarea style={{...fi,fontSize:12,resize:"none"}} rows={2} placeholder="반응" value={ex.response} onChange={setEx(i,"response")}/>
          </div>
        ))}
      </div>
      <div><div style={{fontSize:11,color:C.muted3,marginBottom:8}}>스탯 (이름 수정 + 별 클릭으로 조절)</div>
        <StatsEditor stats={form.stats} onChange={s=>setForm(f=>({...f,stats:s}))}/></div>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={onClose} style={{flex:1,padding:10,borderRadius:8,border:"none",background:C.border,color:C.text3,fontFamily:"inherit",cursor:"pointer",fontSize:13}}>취소</button>
        <button onClick={()=>onSave({...form,tags:form.tags.split(",").map(t=>t.trim()).filter(Boolean)})}
          style={{flex:1,padding:10,borderRadius:8,border:"none",background:C.muted2,color:C.text,fontFamily:"inherit",cursor:"pointer",fontSize:13}}>저장</button>
      </div>
    </EditModal>
  );
}

// ── 호은 편집 ────────────────────────────────────────────
function HoeonEditModal({profile, onSave, onClose}){
  const [form,setForm]=useState({...profile,tags:profile.tags.join(", ")});
  const set=k=>e=>setForm(f=>({...f,[k]:e.target.value}));
  const fi={background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"9px 12px",fontSize:13,fontFamily:"inherit",outline:"none",width:"100%",resize:"vertical"};
  return (
    <EditModal title="호은 프로필 수정" onClose={onClose}>
      {[["이름","name"],["직책/설정","title"],["태그 (쉼표 구분)","tags"]].map(([l,k])=>(
        <div key={k}><div style={{fontSize:11,color:C.muted3,marginBottom:4}}>{l}</div>
          <input style={fi} type="text" value={form[k]} onChange={set(k)}/></div>
      ))}
      <div><div style={{fontSize:11,color:C.muted3,marginBottom:4}}>성격/설정</div>
        <textarea style={fi} rows={3} value={form.personality} onChange={set("personality")}/></div>
      <div><div style={{fontSize:11,color:C.muted3,marginBottom:8}}>스탯</div>
        <StatsEditor stats={form.stats} onChange={s=>setForm(f=>({...f,stats:s}))}/></div>
      <div style={{display:"flex",gap:8,marginTop:4}}>
        <button onClick={onClose} style={{flex:1,padding:10,borderRadius:8,border:"none",background:C.border,color:C.text3,fontFamily:"inherit",cursor:"pointer",fontSize:13}}>취소</button>
        <button onClick={()=>onSave({...form,tags:form.tags.split(",").map(t=>t.trim()).filter(Boolean)})}
          style={{flex:1,padding:10,borderRadius:8,border:"none",background:C.muted2,color:C.text,fontFamily:"inherit",cursor:"pointer",fontSize:13}}>저장</button>
      </div>
    </EditModal>
  );
}

// ── 프로필 뷰 ────────────────────────────────────────────
function ProfileView({profile, avatar, onEdit, onPhotoChange, showExamples=false}){
  const sec={fontSize:10,color:C.muted,letterSpacing:2,marginBottom:8};
  const card={background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"13px 15px",fontSize:13,lineHeight:1.8,color:C.text2};
  const fileRef=useRef(null);

  // 크롭 state
  const [cropSrc,setCropSrc]=useState(null);
  const [scale,setScale]=useState(1);
  const [pos,setPos]=useState({x:0,y:0});
  const [drag,setDrag]=useState(null);
  const [natSize,setNatSize]=useState({w:1,h:1});
  const CSIZE=220;

  const openCrop=e=>{
    const file=e.target.files[0]; if(!file) return;
    fileRef.current.value="";
    const reader=new FileReader();
    reader.onload=ev=>{
      const img=new Image();
      img.onload=()=>{
        const nw=img.naturalWidth, nh=img.naturalHeight;
        setNatSize({w:nw,h:nh});
        // 전신샷 포함: 이미지 전체가 원 안에 들어오는 크기로 시작
        const initScale=Math.min(CSIZE/nw, CSIZE/nh);
        setScale(initScale);
        setPos({x:0,y:0});
        setCropSrc(ev.target.result);
      };
      img.src=ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const applyCrop=()=>{
    // transform 방식 역산:
    // 화면에서 이미지는 center(110,110) 기준으로 translate(pos.x, pos.y) scale(scale) 적용됨
    // canvas에 동일하게 재현
    const canvas=document.createElement("canvas");
    canvas.width=CSIZE; canvas.height=CSIZE;
    const ctx=canvas.getContext("2d");
    ctx.beginPath(); ctx.arc(CSIZE/2,CSIZE/2,CSIZE/2,0,Math.PI*2); ctx.clip();
    const dispW=natSize.w*scale, dispH=natSize.h*scale;
    // transform 중심(CSIZE/2, CSIZE/2) 기준 + pos offset
    const imgX=CSIZE/2 - dispW/2 + pos.x;
    const imgY=CSIZE/2 - dispH/2 + pos.y;
    const img=new Image();
    img.onload=()=>{
      ctx.drawImage(img, imgX, imgY, dispW, dispH);
      onPhotoChange(canvas.toDataURL("image/jpeg",0.85));
      setCropSrc(null);
    };
    img.src=cropSrc;
  };

  const startDrag=(cx,cy)=>setDrag({sx:cx,sy:cy,ox:pos.x,oy:pos.y});
  const moveDrag=(cx,cy)=>{ if(!drag) return; setPos({x:drag.ox+(cx-drag.sx),y:drag.oy+(cy-drag.sy)}); };
  const endDrag=()=>setDrag(null);

  return (
    <div style={{flex:1,overflowY:"auto",padding:"20px 18px",display:"flex",flexDirection:"column",gap:16}}>
      {/* 크롭 모달 */}
      {cropSrc&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.92)",zIndex:500,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:14}}>
          <div style={{fontSize:12,color:C.text3}}>드래그로 위치 조정 · 슬라이더로 확대/축소</div>
          {/* 원 바깥 어둡게 보이는 컨테이너 */}
          <div style={{position:"relative",flexShrink:0,touchAction:"none"}}
            onMouseDown={e=>{e.preventDefault();startDrag(e.clientX,e.clientY);}}
            onMouseMove={e=>moveDrag(e.clientX,e.clientY)}
            onMouseUp={endDrag} onMouseLeave={endDrag}
            onTouchStart={e=>{e.preventDefault();const t=e.touches[0];startDrag(t.clientX,t.clientY);}}
            onTouchMove={e=>{e.preventDefault();const t=e.touches[0];moveDrag(t.clientX,t.clientY);}}
            onTouchEnd={endDrag}
          >
            {/* 전체 이미지 보이는 배경 (어둡게) */}
            <div style={{width:CSIZE,height:CSIZE,overflow:"hidden",position:"relative",background:"#111",cursor:drag?"grabbing":"grab"}}>
              <img src={cropSrc} draggable={false} alt="" style={{
                position:"absolute",
                left:"50%", top:"50%",
                transform:`translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`,
                transformOrigin:"center center",
                userSelect:"none", pointerEvents:"none",
                maxWidth:"none",
                opacity:0.35,
              }}/>
            </div>
            {/* 원형 클립 위에 올라가는 레이어 */}
            <div style={{position:"absolute",inset:0,borderRadius:"50%",overflow:"hidden",border:`2px solid ${C.gold}`,pointerEvents:"none"}}>
              <img src={cropSrc} draggable={false} alt="" style={{
                position:"absolute",
                left:"50%", top:"50%",
                transform:`translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${scale})`,
                transformOrigin:"center center",
                userSelect:"none", pointerEvents:"none",
                maxWidth:"none",
              }}/>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,width:CSIZE}}>
            <span style={{fontSize:11,color:C.muted3,flexShrink:0}}>축소</span>
            <input type="range"
              min={Math.min(CSIZE/natSize.w, CSIZE/natSize.h)*0.3}
              max={Math.max(CSIZE/natSize.w, CSIZE/natSize.h)*5}
              step="0.001"
              value={scale} onChange={e=>setScale(parseFloat(e.target.value))} style={{flex:1}}/>
            <span style={{fontSize:11,color:C.muted3,flexShrink:0}}>확대</span>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>setCropSrc(null)} style={{padding:"9px 22px",borderRadius:8,border:"none",background:C.border,color:C.text3,fontFamily:"inherit",fontSize:13,cursor:"pointer"}}>취소</button>
            <button onClick={applyCrop} style={{padding:"9px 22px",borderRadius:8,border:"none",background:C.muted2,color:C.text,fontFamily:"inherit",fontSize:13,cursor:"pointer"}}>적용</button>
          </div>
        </div>
      )}

      <div style={{display:"flex",alignItems:"center",gap:16,paddingBottom:16,borderBottom:`1px solid ${C.border}`}}>
        <div onClick={()=>fileRef.current.click()} style={{width:68,height:68,borderRadius:"50%",background:"#2a2018",border:`2px solid ${C.border3}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,flexShrink:0,cursor:"pointer",overflow:"hidden",position:"relative"}}>
          {profile.photo
            ? <img src={profile.photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt="profile"/>
            : <span>{avatar}</span>}
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)",display:"flex",alignItems:"center",justifyContent:"center",opacity:0,transition:"opacity 0.15s"}}
            onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0}>
            <span style={{fontSize:18,color:"#fff"}}>📷</span>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" onChange={openCrop} style={{display:"none"}}/>
        <div style={{flex:1}}>
          <div style={{fontSize:20,fontWeight:600,letterSpacing:2}}>{profile.name}</div>
          <div style={{fontSize:11,color:C.text3,letterSpacing:1,marginTop:3}}>{profile.title}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
            {profile.tags.map(t=><span key={t} style={{fontSize:10,padding:"3px 9px",borderRadius:20,background:C.border,color:C.text3,border:`1px solid ${C.border2}`}}>{t}</span>)}
          </div>
        </div>
        <button onClick={onEdit} style={{background:C.border,border:`1px solid ${C.border2}`,borderRadius:8,color:C.text3,padding:"6px 12px",fontSize:11,fontFamily:"inherit",cursor:"pointer"}}>✎ 수정</button>
      </div>

      <div><div style={sec}>스탯</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {profile.stats.map((s,i)=>(
            <div key={i} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 13px"}}>
              <div style={{fontSize:10,color:C.muted,marginBottom:6}}>{s.name}</div>
              <StarRating value={s.value} readonly/>
            </div>
          ))}
        </div>
      </div>
      {profile.world&&<div><div style={sec}>세계관</div><div style={card}>{profile.world}</div></div>}
      <div><div style={sec}>성격</div><div style={card}>{profile.personality}</div></div>
      {profile.speech&&(
        <div><div style={sec}>말투</div>
          <div style={{borderLeft:`2px solid ${C.border3}`,padding:"10px 14px",fontSize:13,color:C.muted3,fontStyle:"italic",lineHeight:1.7}}>{profile.speech}</div>
        </div>
      )}
      {showExamples&&profile.examples?.length>0&&(
        <div><div style={sec}>행동 예시</div>
          {profile.examples.map((ex,i)=>(
            <div key={i} style={{background:C.bg3,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 14px",marginBottom:8}}>
              <div style={{fontSize:11,color:C.muted3,marginBottom:6}}>📌 {ex.situation}</div>
              <div style={{fontSize:13,color:C.text2,lineHeight:1.7,fontStyle:"italic"}}>"{ex.response}"</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 채팅 ─────────────────────────────────────────────────
function ChatView({neroRef, hoeonRef, bookmarksRef, noteRef, onBookmarksChange, onNoteChange, nero, hoeon}){
  const [msgs,setMsgs]=useState([]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(true);
  const [showNote,setShowNote]=useState(false);
  const [showBM,setShowBM]=useState(false);
  const histRef=useRef([]); // ← hist를 ref로 관리해서 리렌더로 날아가지 않게
  const bottomRef=useRef(null);
  const taRef=useRef(null);
  const didInit=useRef(false);

  useEffect(()=>{
    bottomRef.current?.scrollIntoView({behavior:"smooth"});
  },[msgs]);

  // 최초 1회만 로드
  useEffect(()=>{
    if(didInit.current) return;
    didInit.current=true;
    (async()=>{
      const [sm,sh]=await Promise.all([sg("nero_msgs"),sg("nero_hist")]);
      if(sm?.length&&sh?.length){
        setMsgs(sm);
        histRef.current=sh;
        setBusy(false);
      } else {
        try{
          const system=buildSystem(neroRef.current,hoeonRef.current,bookmarksRef.current,noteRef.current);
          const reply=await callClaude(system,[{role:"user",content:FIRST_PROMPT}]);
          const m=[{type:"ai",text:reply,id:1}];
          const h=[{role:"user",content:FIRST_PROMPT},{role:"assistant",content:reply}];
          setMsgs(m);
          histRef.current=h;
          await ss("nero_msgs",m);
          await ss("nero_hist",h);
        }catch(e){
          setMsgs([{type:"ai",text:"오류: "+e.message,id:1}]);
        }
        setBusy(false);
      }
    })();
  },[]);

  const send=useCallback(async()=>{
    const text=input.trim();
    if(busy||!text) return;
    setInput("");
    if(taRef.current) taRef.current.style.height="38px";

    // !요약
    if(text==="!요약"){
      setBusy(true);
      const tid=Date.now();
      setMsgs(m=>[...m,{type:"t",text:"서사를 정리하고 있소...",id:tid}]);
      try{
        const system=buildSystem(neroRef.current,hoeonRef.current,bookmarksRef.current,noteRef.current);
        const summary=await callClaude(system,[...histRef.current,{role:"user",content:"지금까지 두 사람 사이에 있었던 일을 3~5줄로 요약해줘. 소설 서술자 시점으로."}]);
        setMsgs(m=>{
          const next=m.map(msg=>msg.id===tid?{type:"summary",text:summary,id:tid}:msg);
          ss("nero_msgs",next);
          return next;
        });
      }catch(e){
        setMsgs(m=>m.map(msg=>msg.id===tid?{...msg,type:"ai",text:"오류: "+e.message}:msg));
      }
      setBusy(false);
      return;
    }

    const uid=Date.now();
    const tid=uid+1;
    const newHist=[...histRef.current,{role:"user",content:text}];
    histRef.current=newHist;
    setMsgs(m=>[...m,{type:"u",text,id:uid},{type:"t",text:"...",id:tid}]);
    setBusy(true);

    try{
      const system=buildSystem(neroRef.current,hoeonRef.current,bookmarksRef.current,noteRef.current);
      const reply=await callClaude(system,newHist);
      const rid=Date.now();
      const finalHist=[...newHist,{role:"assistant",content:reply}];
      histRef.current=finalHist;
      setMsgs(m=>{
        const next=m.map(msg=>msg.id===tid?{type:"ai",text:reply,id:rid}:msg);
        ss("nero_msgs",next);
        return next;
      });
      await ss("nero_hist",finalHist);
    }catch(e){
      setMsgs(m=>m.map(msg=>msg.id===tid?{...msg,type:"ai",text:"오류: "+e.message}:msg));
    }
    setBusy(false);
  },[busy,input]);

  const addBookmark=useCallback(async(msg)=>{
    setBusy(true);
    try{
      const summary=await callClaude("로맨스 판타지 소설 장면이야. 이 장면에서 감정적으로 가장 중요한 순간을 20자 이내로 요약해줘. 인물의 행동이나 감정 변화 위주로. 예: 네로가 호은 손목을 잡다 / 네로가 처음으로 이름을 부르다. 요약문만 출력해.",[{role:"user",content:msg.text}]);
      const newBM=[...bookmarksRef.current,{summary:summary.trim(),time:new Date().toLocaleDateString("ko-KR")}];
      onBookmarksChange(newBM);
      await ss("nero_bm",newBM);
    }catch(e){alert("북마크 실패: "+e.message);}
    setBusy(false);
  },[]);

  const delBM=async(i)=>{
    const n=bookmarksRef.current.filter((_,j)=>j!==i);
    onBookmarksChange(n);
    await ss("nero_bm",n);
  };

  const editBM=async(i,newSummary)=>{
    const n=bookmarksRef.current.map((bm,j)=>j===i?{...bm,summary:newSummary}:bm);
    onBookmarksChange(n);
    await ss("nero_bm",n);
  };

  const saveNote=async(v)=>{
    onNoteChange(v);
    await ss("nero_note",v);
  };

  const clearChat=async()=>{
    if(!confirm("대화를 초기화할까요?")) return;
    setBusy(true);
    setMsgs([]);
    histRef.current=[];
    await ss("nero_msgs",[]);
    await ss("nero_hist",[]);
    try{
      const system=buildSystem(neroRef.current,hoeonRef.current,bookmarksRef.current,noteRef.current);
      const reply=await callClaude(system,[{role:"user",content:FIRST_PROMPT}]);
      const m=[{type:"ai",text:reply,id:Date.now()}];
      const h=[{role:"user",content:FIRST_PROMPT},{role:"assistant",content:reply}];
      setMsgs(m);
      histRef.current=h;
      await ss("nero_msgs",m);
      await ss("nero_hist",h);
    }catch(e){setMsgs([{type:"ai",text:"오류: "+e.message,id:1}]);}
    setBusy(false);
  };

  const bms=bookmarksRef.current;
  const note=noteRef.current;

  return (
    <>
      {/* 툴바 */}
      <div style={{display:"flex",gap:6,padding:"8px 14px",background:C.bg2,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <button onClick={()=>{setShowNote(v=>!v);setShowBM(false);}}
          style={{background:showNote?C.muted2:C.border,border:`1px solid ${C.border2}`,borderRadius:8,color:showNote?C.gold:C.text3,fontSize:11,padding:"5px 10px",fontFamily:"inherit",cursor:"pointer"}}>
          📝 메모{note.trim()?" ●":""}
        </button>
        <button onClick={()=>{setShowBM(v=>!v);setShowNote(false);}}
          style={{background:showBM?C.muted2:C.border,border:`1px solid ${C.border2}`,borderRadius:8,color:showBM?C.gold:C.text3,fontSize:11,padding:"5px 10px",fontFamily:"inherit",cursor:"pointer"}}>
          🔖 북마크{bms.length>0?` (${bms.length})`:""}
        </button>
        <button onClick={clearChat} style={{background:"none",border:"none",color:C.muted,fontSize:11,padding:"5px 8px",fontFamily:"inherit",cursor:"pointer",marginLeft:"auto"}}>↺ 초기화</button>
      </div>

      {/* 메모 패널 */}
      {showNote&&(
        <div style={{background:C.bg4,borderBottom:`1px solid ${C.border}`,padding:"12px 14px",flexShrink:0}}>
          <div style={{fontSize:10,color:C.muted3,letterSpacing:1,marginBottom:6}}>유저 메모 — AI가 항상 참고해요</div>
          <textarea value={note} onChange={e=>saveNote(e.target.value)} rows={3}
            placeholder={"예: 호은은 말수가 적다\n예: 두 사람은 아직 서먹한 사이다"}
            style={{width:"100%",background:C.bg3,border:`1px solid ${C.border2}`,borderRadius:8,color:C.text,padding:"8px 11px",fontSize:12,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.6}}/>
        </div>
      )}

      {/* 북마크 패널 */}
      {showBM&&(
        <div style={{background:C.bg4,borderBottom:`1px solid ${C.border}`,padding:"12px 14px",flexShrink:0,maxHeight:150,overflowY:"auto"}}>
          <div style={{fontSize:10,color:C.muted3,letterSpacing:1,marginBottom:8}}>북마크된 사건 — AI가 항상 기억해요</div>
          {bms.length===0
            ? <div style={{fontSize:12,color:C.muted,fontStyle:"italic"}}>대화에서 🔖 버튼을 눌러 사건을 저장하세요.</div>
            : bms.map((bm,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,background:C.bg3,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 10px"}}>
                <div style={{flex:1}}>
                  <input
                    defaultValue={bm.summary}
                    onBlur={e=>editBM(i,e.target.value)}
                    style={{width:"100%",background:"none",border:"none",color:C.text2,fontSize:12,fontFamily:"inherit",outline:"none"}}
                  />
                  <div style={{fontSize:10,color:C.muted,marginTop:2}}>{bm.time}</div>
                </div>
                <button onClick={()=>delBM(i)} style={{background:"none",border:"none",color:C.muted,fontSize:12,cursor:"pointer"}}>✕</button>
              </div>
            ))
          }
        </div>
      )}

      {/* 메시지 */}
      <div style={{flex:1,overflowY:"auto",padding:"18px 16px",display:"flex",flexDirection:"column",gap:12}}>
        <div style={{textAlign:"center",fontSize:11,color:C.muted2,letterSpacing:1}}>— 가마쿠라 막부 치하, 어느 오전 —</div>
        {msgs.map((msg)=>{
          if(msg.type==="summary") return (
            <div key={msg.id} style={{background:C.bg3,border:`1px solid ${C.border3}`,borderRadius:10,padding:"12px 14px",fontSize:12,color:C.text2,lineHeight:1.8,fontStyle:"italic",textAlign:"center"}}>
              📜 {msg.text}
            </div>
          );
          return (
            <div key={msg.id} style={{display:"flex",gap:8,alignItems:"flex-end",flexDirection:msg.type==="u"?"row-reverse":"row"}}>
              <div style={{width:30,height:30,borderRadius:"50%",background:"#2a2018",border:`1px solid ${C.border2}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,overflow:"hidden",flexShrink:0}}>
                {msg.type==="u"
                  ? (hoeon?.photo ? <img src={hoeon.photo} style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/> : "花")
                  : (nero?.photo  ? <img src={nero.photo}  style={{width:"100%",height:"100%",objectFit:"cover"}} alt=""/> : "刀")
                }
              </div>
              <div style={{maxWidth:"72%",display:"flex",flexDirection:"column",alignItems:msg.type==="u"?"flex-end":"flex-start",gap:3}}>
                <div style={{
                  padding:"10px 14px",fontSize:13.5,lineHeight:1.75,whiteSpace:"pre-wrap",wordBreak:"break-word",
                  borderRadius:msg.type==="u"?"14px 14px 4px 14px":"14px 14px 14px 4px",
                  background:msg.type==="u"?C.border:msg.type==="t"?C.bg4:C.bg3,
                  border:msg.type==="u"?"none":`1px solid ${msg.type==="t"?"#252015":C.border}`,
                  color:msg.type==="t"?C.muted2:C.text,
                  fontStyle:msg.type==="t"?"italic":"normal",
                }}>{msg.text}</div>
                {msg.type==="ai"&&(
                  <button onClick={()=>addBookmark(msg)} disabled={busy}
                    style={{background:"none",border:"none",color:C.muted,fontSize:10,cursor:"pointer",padding:"0 2px",fontFamily:"inherit"}}>
                    🔖 북마크
                  </button>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef}/>
      </div>

      {/* 입력 */}
      <div style={{padding:"10px 12px",background:C.bg2,borderTop:`1px solid ${C.border}`,display:"flex",gap:8,alignItems:"flex-end",flexShrink:0}}>
        <textarea ref={taRef} value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}
          onInput={e=>{e.target.style.height="auto";e.target.style.height=Math.min(e.target.scrollHeight,100)+"px";}}
          placeholder="호은으로서 말을 건네세요... (!요약)" rows={1}
          style={{flex:1,background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,color:C.text,padding:"9px 12px",fontSize:13,fontFamily:"inherit",resize:"none",minHeight:38,maxHeight:100,lineHeight:1.6,outline:"none"}}/>
        <button onClick={send} disabled={busy}
          style={{width:38,height:38,borderRadius:"50%",border:"none",background:busy?"#2a2018":C.muted2,color:busy?C.border2:C.text,cursor:busy?"not-allowed":"pointer",fontSize:14,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          ➤
        </button>
      </div>
    </>
  );
}

// ── 메인 ─────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]=useState("chat");
  const [nero,setNero]=useState(null);
  const [hoeon,setHoeon]=useState(null);
  const [bookmarks,setBookmarks]=useState([]);
  const [note,setNote]=useState("");
  const [editingNero,setEditingNero]=useState(false);
  const [editingHoeon,setEditingHoeon]=useState(false);

  // ref로도 유지 → ChatView에서 최신값 항상 참조
  const neroRef=useRef(null);
  const hoeonRef=useRef(null);
  const bookmarksRef=useRef([]);
  const noteRef=useRef("");

  useEffect(()=>{
    (async()=>{
      const [sn,sh,sbm,sno]=await Promise.all([sg("nero_profile"),sg("hoeon_profile"),sg("nero_bm"),sg("nero_note")]);
      const n=sn||DEFAULT_NERO, h=sh||DEFAULT_HOEON, bm=sbm||[], no=sno||"";
      neroRef.current=n; hoeonRef.current=h; bookmarksRef.current=bm; noteRef.current=no;
      setNero(n); setHoeon(h); setBookmarks(bm); setNote(no);
    })();
  },[]);

  const saveNero=async p=>{
    neroRef.current=p; setNero(p);
    await ss("nero_profile",p); setEditingNero(false);
  };
  const saveHoeon=async p=>{
    hoeonRef.current=p; setHoeon(p);
    await ss("hoeon_profile",p); setEditingHoeon(false);
  };
  const handleBMChange=bm=>{ bookmarksRef.current=bm; setBookmarks(bm); };
  const handleNoteChange=n=>{ noteRef.current=n; setNote(n); };
  const handleNeroPhoto=async photo=>{
    const p={...neroRef.current,photo};
    neroRef.current=p; setNero(p); await ss("nero_profile",p);
  };
  const handleHoeonPhoto=async photo=>{
    const p={...hoeonRef.current,photo};
    hoeonRef.current=p; setHoeon(p); await ss("hoeon_profile",p);
  };

  if(!nero||!hoeon) return (
    <div style={{background:C.bg,height:720,display:"flex",alignItems:"center",justifyContent:"center",color:C.muted,fontFamily:"sans-serif",borderRadius:12}}>
      불러오는 중...
    </div>
  );

  return (
    <div style={{background:C.bg,color:C.text,display:"flex",flexDirection:"column",height:720,borderRadius:12,overflow:"hidden",fontFamily:"'Noto Sans KR',sans-serif",position:"relative"}}>
      {/* 탭 */}
      <div style={{display:"flex",background:C.bg2,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        {[["chat","대화"],["nero","네로"],["hoeon","호은"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)} style={{flex:1,padding:"12px 0",fontSize:12,fontFamily:"inherit",background:"none",border:"none",letterSpacing:1,cursor:"pointer",borderBottom:`2px solid ${tab===id?C.gold:"transparent"}`,color:tab===id?C.gold:C.muted}}>
            {label}
          </button>
        ))}
      </div>

      {/* ChatView는 항상 마운트 유지 — display로 숨김 처리 */}
      <div style={{display:tab==="chat"?"flex":"none",flexDirection:"column",flex:1,overflow:"hidden"}}>
        <ChatView
          neroRef={neroRef} hoeonRef={hoeonRef}
          bookmarksRef={bookmarksRef} noteRef={noteRef}
          onBookmarksChange={handleBMChange} onNoteChange={handleNoteChange}
          nero={nero} hoeon={hoeon}
        />
      </div>
      {tab==="nero"&&<ProfileView profile={nero} avatar="刀" onEdit={()=>setEditingNero(true)} onPhotoChange={handleNeroPhoto} showExamples/>}
      {tab==="hoeon"&&<ProfileView profile={hoeon} avatar="花" onEdit={()=>setEditingHoeon(true)} onPhotoChange={handleHoeonPhoto}/>}

      {editingNero&&<NeroEditModal profile={nero} onSave={saveNero} onClose={()=>setEditingNero(false)}/>}
      {editingHoeon&&<HoeonEditModal profile={hoeon} onSave={saveHoeon} onClose={()=>setEditingHoeon(false)}/>}
    </div>
  );
}
