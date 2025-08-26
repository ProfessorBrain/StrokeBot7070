/* StrokeBot.me — Acute Stroke Simulator (single-file JSX)
   Version: v0.6 (initial release)
   Notes in this build:
   - Header/project name updated to "StrokeBot.me — Acute Stroke Simulator v0.6"
   - Fixed case stem grammar: avoids "with for ..." (now "with deficits of ..." or "with acute neurologic symptoms")
   - Action feedback clarifies "Non-disabling symptoms" as the reason CTA/CTP/MRI/EVT are inappropriate
   - Footer "version 0.6" link opens a Version modal (like the citations modal)
*/

/* global React, ReactDOM */
const { useEffect, useMemo, useRef, useState } = React;

/* =========================
 * Utils
 * ========================= */
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const rand = (arr)=>arr[Math.floor(Math.random()*arr.length)];
const randInt=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const nowIso = ()=>new Date().toISOString().slice(0,19).replace("T"," ");
const fmt = (n)=>n.toString().padStart(2,"0");

/* Simple score/penalty helpers */
const pushToast=(toastsRef,type,title,body)=>{
  const id=Math.random().toString(36).slice(2,9);
  toastsRef.current=[...toastsRef.current,{id,type,title,body}];
};
const SymptomBank = [
  "aphasia and right-sided weakness",
  "isolated facial droop",
  "left homonymous hemianopia",
  "ataxia and dysarthria",
  "left arm drift and neglect",
  "vertigo with gait instability",
  "numbness in right arm and face",
  "right arm weakness",
  "word-finding difficulty",
  "double vision"
];

/* =========================
 * Mock data / case generation
 * ========================= */
function genCase(){
  const age = randInt(35,88);
  const sex = rand(["female","male"]);
  const symptomHint = rand(SymptomBank);
  const lkwHour = randInt(0,6);
  const isWakeup = Math.random()<0.2;
  const userClass = rand(["major","minor","non"]); // quick proxy for disabling vs non-disabling
  const sbp = randInt(140,200);
  const dbp = randInt(70,110);

  // Build grammatically correct stem:
  // Prefer: "with deficits of <hint>" or "with acute neurologic symptoms" if no hint.
  const symptomPhrase = symptomHint ? "deficits of " + symptomHint : "acute neurologic symptoms";
  const stem = `EMS brings a ${age}-year-old ${sex} with ${symptomPhrase}.`;

  return {
    id: Math.random().toString(36).slice(2,9),
    stem,
    symptomHint,
    userClass, // "non" is non-disabling here
    lkwHour,
    isWakeup,
    sbp,
    dbp,
    glucose: randInt(60,180),
    actions: {
      nct:0, cta:0, ctp:0, mri:0, tnK:0, evt:0, admitFloor:0, admitICU:0,
      asa:0, d50:0, lab:0, intubated:0
    },
    dx: rand(["ischemic","hemorrhage","mimic"]),
    vessel: rand(["none","ICA","M1","prox M2","dist M2","M3","M4","P1","A1","basilar"]),
    time: nowIso()
  };
}

/* =========================
 * UI Bits
 * ========================= */
const HButton = ({onClick, children, className})=>(
  <button onClick={onClick} className={"px-3 py-2 rounded border border-slate-700 hover:bg-slate-800 " + (className||"")}>
    {children}
  </button>
);

const Badge=({children, tone="slate"})=>(
  <span className={`inline-block rounded px-2 py-0.5 text-xs border border-${tone}-600 text-${tone}-200`}>
    {children}
  </span>
);

/* =========================
 * Modals (Citations & Version)
 * ========================= */
const CitationsModal = ({open,onX})=>{
  if(!open) return null;
  return (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onX}/>
      <div className="relative z-[121] w-[min(720px,94vw)] rounded-lg border border-slate-700 bg-slate-900/95 p-4 shadow-2xl">
        <button onClick={onX} className="absolute right-2 top-2 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800">×</button>
        <h3 className="text-base font-semibold pr-8">citations</h3>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-200 space-y-1">
          <li>AHA/ASA acute ischemic stroke guidelines</li>
          <li>Institutional hyperacute imaging pathways</li>
          <li>Trials on tenecteplase vs alteplase</li>
        </ul>
      </div>
    </div>
  );
};

/* =========================
 * Version (version history modal)
 * ========================= */
const VERSION_NOTES = `v0.6 — initial release`;

const VersionModal = ({ open, onX }) => {
  if (!open) return null;
  const items = VERSION_NOTES.trim().split(/\n+/).filter(Boolean);
  return (
    <div className="fixed inset-0 z-[130] grid place-items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onX} />
      <div className="relative z-[131] w-[min(640px,92vw)] rounded-lg border border-slate-700 bg-slate-900/95 p-4 shadow-2xl">
        <button onClick={onX} className="absolute right-2 top-2 rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-800">×</button>
        <h3 className="text-base font-semibold pr-8">version history</h3>
        <ul className="mt-2 list-disc pl-5 text-sm text-slate-200">
          {items.map((it, i)=>(<li key={i}>{it}</li>))}
        </ul>
      </div>
    </div>
  );
};

/* =========================
 * Notifications
 * ========================= */
const Toasts = ({toastsRef,setTick})=>{
  const [,force]=useState(0);
  useEffect(()=>{
    const i=setInterval(()=>{
      if(toastsRef.current.length>0) force(x=>x+1);
    },800);
    return ()=>clearInterval(i);
  },[]);
  const clear=(id)=>{toastsRef.current=toastsRef.current.filter(t=>t.id!==id); setTick(x=>x+1);};
  return (
    <div className="fixed bottom-4 right-4 z-[140] space-y-2 w-[min(380px,92vw)]">
      {toastsRef.current.map(t=>(
        <div key={t.id} className={`rounded border p-3 text-sm shadow bg-slate-900/90 border-slate-700`}>
          <div className="flex items-start gap-2">
            <strong className="block text-slate-100">{t.title}</strong>
            <button onClick={()=>clear(t.id)} className="ml-auto text-slate-400 hover:text-slate-200">×</button>
          </div>
          {t.body && <div className="mt-1 text-slate-300">{t.body}</div>}
        </div>
      ))}
    </div>
  );
};

/* =========================
 * App
 * ========================= */
function App(){
  const [data,setData]=useState(()=>genCase());
  const [log,setLog]=useState([]);
  const [score,setScore]=useState(0);
  const [showCitations, setShowCitations] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const toastsRef = useRef([]);
  const [tick,setTick]=useState(0);

  const s=data;

  const addLog=(level,msg)=>{
    setLog(L=>[{time:nowIso(),level,msg},...L].slice(0,200));
  };
  const push=(title,body,type="info")=>{
    pushToast(toastsRef,type,title,body);
    setTick(x=>x+1);
  };
  const reward=(n,title,body)=>{
    setScore(v=>v+n);
    push(title,body||`+${n} points`,"good");
  };
  const penalize=(n,title,body)=>{
    setScore(v=>v-n);
    push(title,body||`-${n} points`,"warn");
  };

  const reset=()=>{
    setData(genCase());
    setLog([]);
    setScore(0);
    push("New case started", "Fresh patient loaded.");
  };

  const doAction=(actionKey)=>{
    const s = data;
    const push = (t,b,ty="info")=>pushToast(toastsRef,ty,t,b);
    const addLog = (lvl,txt)=>setLog(L=>[{time:nowIso(),level:lvl,msg:txt},...L].slice(0,200));
    const setS = (ns)=>setData({...ns});
    const penalize=(n,title,body)=>{ setScore(v=>v-n); push(title,body,"warn"); };
    const reward=(n,title,body)=>{ setScore(v=>v+n); push(title,body,"good"); };

    const nonDisabling = s.userClass === "non";

    switch(actionKey){
      case "nct":
        if (s.actions.nct){ push("Noncontrast CT already done","Recorded.","warn"); }
        else {
          s.actions.nct=1;
          reward(5,"Noncontrast CT ordered","Head CT without contrast obtained promptly.");
          addLog("info","Ordered noncontrast head CT.");
        }
        break;

      case "cta":
        if (nonDisabling) { penalize(4,"Non-disabling symptoms","CTA is not indicated for non-disabling symptoms."); break; }
        if (s.actions.cta){ push("CTA already done","Recorded.","warn"); }
        else {
          s.actions.cta=1;
          if (s.dx==="hemorrhage"||s.dx==="mimic"){
            penalize(3,"Limited utility","CTA has limited value in hemorrhage or mimics.");
          } else {
            reward(4,"CTA ordered","CTA head/neck ordered to assess for LVO.");
          }
          addLog("info","Ordered CTA.");
        }
        break;

      case "ctp": {
        if (nonDisabling) { penalize(4,"Non-disabling symptoms","CT perfusion is not indicated for non-disabling symptoms."); break; }
        if (s.actions.ctp){ push("CTP already done","Recorded.","warn"); }
        else {
          s.actions.ctp=1;
          if (s.isWakeup && s.dx==="ischemic"){
            reward(3,"CT perfusion ordered","Selected patients may benefit from perfusion imaging.");
          } else {
            penalize(3,"Questionable utility","CT perfusion utility is limited in this scenario.");
          }
          addLog("info","Ordered CT perfusion.");
        }
        break;
      }

      case "mri":
        if (s.actions.mri){ push("MRI already done","Recorded.","warn"); }
        else {
          s.actions.mri=1;
          if (s.isWakeup){
            reward(3,"Hyperacute MRI","DWI/FLAIR mismatch helpful in wake-up stroke.");
          } else {
            if (nonDisabling) { penalize(4,"Non-disabling symptoms","Hyperacute MRI is not indicated for non-disabling symptoms."); }
            else { penalize(4,"MRI not available","Hyperacute MRI is reserved for wake-up/unknown per rules."); }
          }
          addLog("info","Ordered hyperacute MRI.");
        }
        break;

      case "tnk":
        if (s.actions.tnK){ push("Already administered","Thrombolysis already recorded.","warn"); }
        else {
          s.actions.tnK=1;
          if (s.dx==="ischemic" && s.userClass!=="non"){
            reward(10,"Tenecteplase given","Appropriate thrombolysis for disabling deficits within window.");
          } else {
            penalize(8,"Inappropriate thrombolysis","Either non-disabling symptoms or not ischemic.");
          }
          addLog("good","Administered tenecteplase.");
        }
        break;

      case "evt":
        if (nonDisabling) { penalize(20,"Non-disabling symptoms","EVT is not indicated for non-disabling symptoms."); break; }
        if (s.actions.evt){ push("Already performed","EVT already recorded.","warn"); }
        else {
          s.actions.evt=1;
          if (["ICA","M1","prox M2","basilar"].includes(s.vessel) && s.dx==="ischemic"){
            reward(15,"Endovascular therapy","Proceed to the angiography suite for thrombectomy.");
          } else {
            penalize(10,"No clear LVO target","EVT not indicated.");
          }
          addLog("good","EVT performed/logged.");
        }
        break;

      case "asa":
        if (s.actions.asa){ push("Already given","Antiplatelet already recorded.","warn"); }
        else {
          s.actions.asa=1;
          if (s.dx==="ischemic"){
            reward(3,"Aspirin given","Antiplatelet therapy started.");
          } else {
            penalize(5,"Avoid in hemorrhage","Aspirin inappropriate in hemorrhage.");
          }
          addLog("info","Administered aspirin.");
        }
        break;

      case "lab":
        if (s.actions.lab){ push("Labs already ordered","Recorded.","warn"); }
        else {
          s.actions.lab=1;
          reward(1,"Stroke labs ordered","CBC, BMP, PT/INR, PTT, trop, type/screen as per pathway.");
          addLog("info","Ordered labs.");
        }
        break;

      case "d50":
        if (s.actions.d50){ push("Already given","D50 already recorded.","warn"); }
        else {
          s.actions.d50=1;
          const before = s.glucose;
          if (before<90){ s.glucose=randInt(90,130); push("D50 given",`Glucose improved from ${before} mg/dL → ${s.glucose} mg/dL. Hypoglycemia corrected.`,`good`); }
          else { push("D50 given","No hypoglycemia noted. Recorded for training.","warn"); }
          addLog("info","Administered D50.");
        }
        break;

      case "intubate":
        if (s.actions.intubated){ push("Already intubated","Airway already secured.","warn"); }
        else {
          s.actions.intubated=1;
          reward(2,"Airway secured","Indicated for airway protection.");
          addLog("good","Intubated for airway protection.");
        }
        break;

      case "admitFloor":
        if (s.actions.admitFloor || s.actions.admitICU){ push("Disposition already chosen","Recorded.","warn"); }
        else {
          s.actions.admitFloor=1;
          // Disposition rules (kept per prior logic):
          // NeuroICU only if: TNK given, EVT performed, ICH/SAH/SDH, or basilar occlusion.
          // ICA or M1: no penalty for floor vs ICU.
          const {tnK,evt}=s.actions;
          const hemorrhagic = s.dx==="hemorrhage";
          const needsICUAlways = s.vessel==="basilar";
          const bigLVO = ["ICA","M1"].includes(s.vessel);
          const shouldICU = tnK || evt || hemorrhagic || needsICUAlways;

          if (needsICUAlways){
            penalize(4,"Basilar occlusion","Basilar occlusion should go to NeuroICU.");
          } else if (hemorrhagic){
            penalize(4,"Hemorrhagic stroke","Hemorrhage should go to NeuroICU.");
          } else if (tnK || evt){
            penalize(4,"Post-reperfusion care","Thrombolysis/EVT should go to NeuroICU.");
          } else {
            // Floor acceptable. ICA/M1 are neutral; others expect floor.
            reward(2,"Admit to stroke unit","Appropriate for current scenario.");
          }
          addLog("info","Disposition: stroke unit (floor).");
        }
        break;

      case "admitICU":
        if (s.actions.admitFloor || s.actions.admitICU){ push("Disposition already chosen","Recorded.","warn"); }
        else {
          s.actions.admitICU=1;
          const {tnK,evt}=s.actions;
          const hemorrhagic = s.dx==="hemorrhage";
          const needsICUAlways = s.vessel==="basilar";
          const bigLVO = ["ICA","M1"].includes(s.vessel);
          const shouldICU = tnK || evt || hemorrhagic || needsICUAlways;

          if (shouldICU){
            reward(3,"Admit NeuroICU","Meets criteria (reperfusion therapy, hemorrhage, or basilar).");
          } else if (bigLVO){
            // No penalty either way for ICA/M1 (neutral)
            push("Neutral choice","ICA/M1 permitted without penalty.");
          } else {
            penalize(3,"Over-triage","This patient belongs in the stroke unit (floor).");
          }
          addLog("info","Disposition: NeuroICU.");
        }
        break;

      default:
        push("Unhandled action",String(actionKey),"warn");
    }
    setData({...s});
    setTick(x=>x+1);
  };

  return (
    <div className="min-h-screen text-slate-100 bg-slate-950">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <header className="flex items-center justify-between gap-2 mb-4">
          <h1 className="text-lg font-bold">🤖🧠 StrokeBot.me — Acute Stroke Simulator v0.6</h1>
          <div className="flex items-center gap-2">
            <HButton onClick={reset}>new case</HButton>
            <Badge>score: {score}</Badge>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Left column: Case + Log */}
          <div className="flex flex-col gap-4">
            <section className="rounded border border-slate-800 bg-slate-900/50 p-3">
              <h2 className="font-semibold mb-2">case</h2>
              <p className="text-slate-200 leading-relaxed">{s.stem}</p>
              <div className="mt-2 text-sm text-slate-400 flex flex-wrap gap-2">
                <Badge tone="emerald">LKW: {s.lkwHour}h {s.isWakeup?"(wakeup)":"(known onset)"}</Badge>
                <Badge tone="cyan">SBP/DBP: {s.sbp}/{s.dbp}</Badge>
                <Badge tone="violet">glucose: {s.glucose} mg/dL</Badge>
                <Badge tone="amber">class: {s.userClass=== "non" ? "non-disabling" : s.userClass}</Badge>
                <Badge tone="pink">dx: {s.dx}</Badge>
                <Badge tone="indigo">vessel: {s.vessel}</Badge>
              </div>
            </section>

            <section className="rounded border border-slate-800 bg-slate-900/50 p-3 flex-1 min-h-[200px]">
              <h2 className="font-semibold mb-2">log</h2>
              <div className="space-y-1 max-h-[320px] overflow-auto pr-1">
                {log.length===0 && <div className="text-sm text-slate-500">actions will appear here…</div>}
                {log.map((L,i)=>(
                  <div key={i} className="text-sm">
                    <span className="text-slate-500">{L.time} — </span>
                    <span>{L.msg}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Right column: Actions */}
          <section className="rounded border border-slate-800 bg-slate-900/50 p-3 md:row-span-2">
            <h2 className="font-semibold mb-3">actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <HButton onClick={()=>doAction("nct")}>noncontrast CT</HButton>
              <HButton onClick={()=>doAction("cta")}>CTA</HButton>
              <HButton onClick={()=>doAction("ctp")}>CT perfusion</HButton>

              {/* Hyperacute MRI: smaller and centered-ish with different arrangement */}
              <div className="col-span-2 md:col-span-1 flex justify-center">
                <button onClick={()=>doAction("mri")} className="px-2 py-1.5 rounded border border-slate-700 hover:bg-slate-800 text-sm">
                  hyperacute MRI
                </button>
              </div>

              {/* Intervention buttons colored differently */}
              <button onClick={()=>doAction("tnk")} className="px-3 py-2 rounded border border-emerald-700 hover:bg-emerald-900/30">
                TNK (thrombolysis)
              </button>
              <button onClick={()=>doAction("evt")} className="px-3 py-2 rounded border border-fuchsia-700 hover:bg-fuchsia-900/30">
                EVT (thrombectomy)
              </button>

              {/* Antiplatelet & airway */}
              <HButton onClick={()=>doAction("asa")}>aspirin</HButton>
              <HButton onClick={()=>doAction("lab")}>stroke labs</HButton>
              <HButton onClick={()=>doAction("d50")}>D50</HButton>
              <HButton onClick={()=>doAction("intubate")}>intubate</HButton>

              {/* Admit buttons colored differently & naming tweak */}
              <button onClick={()=>doAction("admitFloor")} className="px-3 py-2 rounded border border-sky-700 hover:bg-sky-900/30">
                admit to stroke unit
              </button>
              <button onClick={()=>doAction("admitICU")} className="px-3 py-2 rounded border border-rose-700 hover:bg-rose-900/30">
                admit to NeuroICU
              </button>
            </div>
          </section>
        </div>

        <footer className="mt-6 flex items-center gap-2 text-sm text-slate-400">
          <button onClick={()=>setShowCitations(true)} className="underline hover:text-slate-300">citations</button>
          <span>•</span>
          <button onClick={()=>setShowVersion(true)} className="underline hover:text-slate-300">version 0.6</button>
          <span className="ml-auto">© {new Date().getFullYear()} StrokeBot.me</span>
        </footer>
      </div>

      <CitationsModal open={showCitations} onX={()=>setShowCitations(false)} />
      <VersionModal open={showVersion} onX={()=>setShowVersion(false)} />
      <Toasts toastsRef={toastsRef} setTick={setTick}/>
    </div>
  );
}

/* =========================
 * Mount
 * ========================= */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
