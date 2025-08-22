
/* StrokeBot Simulator 7070 — merged JSX (v0.51+++++)
   Changes:
   - Context lines now reflect NIHSS-consistent symptoms (no mismatched narratives).
   - "Reveal Score" now reveals grade/score on the button itself; one-way (irreversible).
   - Block cancelling code stroke if NIHSS > 5.
   - New presentation datum: "On blood thinners" {yes 7%, unknown 5%, else no}; yes/unknown is a TNK contraindication.
   - Kept prior rules: airway-first, D50 fix hypoglycemia, nicardipine penalties, PCC requirements, etc.
*/

/* global React, ReactDOM */
const { useRef, useState } = React;

/* =========================
 * Utilities
 * ========================= */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
const uid = () => {
  try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return Math.random().toString(36).slice(2) + Date.now();
};
const minutesToHours = (m) => m / 60;
const clamp = (x, n = 100) => Math.max(0, Math.min(n, x));

/* =========================
 * Clinical constants + helpers
 * ========================= */
const EVT_SITES = ["ICA", "MCA - M1", "MCA - proximal M2", "MCA - distal M2", "Basilar artery"];
const NON_EVT_SITES = ["ACA - A1", "ACA - A2", "PCA - P1", "PCA - P2", "MCA - M3", "MCA - M4"];

const isNonAcute = (s) => (s.onsetType === "unknown" ? 1 : minutesToHours(s.minutesSinceLKAW) > 24);
const gradeLetter = (score) =>
  score === 100 ? "S" :
  score >= 97 ? "A+" :
  score >= 90 ? "A" :
  score >= 87 ? "B+" :
  score >= 80 ? "B" :
  score >= 77 ? "C+" :
  score >= 70 ? "C" :
  score >= 67 ? "D+" :
  score >= 60 ? "D" : "F";

const randomBaselineMrs = () => {
  const r = Math.random() * 100;
  return r < 63 ? 0 : r < 78 ? 1 : r < 88 ? 2 : r < 93 ? 3 : r < 98 ? 4 : 5;
};

const pickOcclusion = () => {
  const table = [
    ["ICA", 20], ["MCA - M1", 30], ["MCA - proximal M2", 15], ["MCA - distal M2", 10],
    ["MCA - M3", 5], ["MCA - M4", 5], ["PCA - P1", 5], ["ACA - A1", 5], ["Basilar artery", 5],
  ];
  let r = Math.random() * 100, acc = 0;
  for (const [site, weight] of table) { acc += weight; if (r < acc) return site; }
  return "Basilar artery";
};

const contraindicationLabels = (s) =>
  [
    (s.bloodThinners && s.bloodThinners !== "no") && "On blood thinners",
    s.doac && "DOAC <=48h",
    s.recentGISurgery && "GI surgery 7d",
    s.recentStroke30d && "Prior stroke 30d",
    s.glucose < 60 && `Hypoglycemia (${s.glucose})`,
  ].filter(Boolean);

/* =========================
 * Toasts
 * ========================= */
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);
  return {
    toasts,
    push: (title, msg, type = "info", ms = 3200) => {
      const id = ++counterRef.current;
      setToasts((v) => [...v, { id, title, msg, type }]);
      setTimeout(() => setToasts((v) => v.filter((x) => x.id !== id)), ms);
    },
  };
}
const Toasts = ({ items }) => (
  <div className="fixed top-3 right-3 z-[100] space-y-2">
    {items.map((t) => {
      const stripe = ({good:"border-l-8 border-l-emerald-500",bad:"border-l-8 border-l-rose-500",warn:"border-l-8 border-l-amber-500"})[t.type] || "border-l-8 border-l-sky-400";
      return (
        <div key={t.id} className={"min-w-[260px] max-w-[360px] rounded-xl border px-3 py-2 shadow-2xl backdrop-blur-sm bg-slate-900/85 border-slate-700 text-slate-100 " + stripe}>
          <div className="font-bold">{t.title}</div>
          <div className="text-sm text-slate-300">{t.msg}</div>
        </div>
      );
    })}
  </div>
);

/* =========================
 * Small UI atoms
 * ========================= */
const Tag = ({ kind, children }) => {
  const cls = kind==="good" ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
            : kind==="bad" ? "bg-rose-950/60 text-rose-300 border-rose-800"
            : "bg-sky-950/60 text-sky-200 border-sky-800";
  return <span className={"inline-block rounded-md border px-2 py-0.5 text-xs " + cls}>{children}</span>;
};
const InfoChip = ({ label, value }) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-sm text-slate-200">
    <span className="font-semibold text-slate-300">{label}:</span><span>{value}</span>
  </div>
);
const BUTTON = {
  base: "rounded-xl px-4 py-3 font-semibold disabled:opacity-60 border",
  neutral: "border-slate-700 bg-slate-900/70 text-slate-100 hover:bg-slate-800/70",
  green: "border-emerald-700 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-900/60",
  blue: "border-sky-700 bg-sky-900/40 text-sky-200 hover:bg-sky-900/60",
  danger: "border-rose-700 bg-rose-900/40 text-rose-200 hover:bg-rose-900/60",
  alignLeft: "text-left",
  alignCenter: "text-center",
};
const PANEL = "rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl";
const BLOCK = "rounded-xl border border-slate-800 bg-slate-950/70";

/* =========================
 * Exam logic
 * ========================= */
function calcASPECTS(onsetType, minutesSinceLKAW, site, type) {
  if (type === "Mimic") return { score: 10 };
  if (type !== "Ischemic") return { score: null };
  if (site === "Basilar artery" || (site && site.includes("PCA"))) return { score: 10 };
  const isAnterior = site ? site.includes("MCA") || site === "ICA" : 1;
  const hours = onsetType === "known" ? minutesToHours(minutesSinceLKAW) : onsetType === "wake-up" ? randInt(6, 12) : randInt(6, 18);
  let score = 10 - Math.floor(hours / 3);
  if (isAnterior) {
    if (site === "MCA - M1" || site === "ICA") score--;
    if (site === "MCA - proximal M2") score--;
  }
  score += choice([0,0,0,1,-1]);
  return { score: clamp(score, 10) };
}

function calcNIHSS({ type, affectedSide, dominantSide, site, mimicBias = null }) {
  const cap = (n,h)=>Math.max(0,Math.min(n,h)), cap4=(n)=>cap(n,4);
  let loc=0,facial=0,gaze=0,visual=0,armL=0,armR=0,legL=0,legR=0,language=0,dysarthria=0,ataxia=0,sensory=0,neglect=0;
  if (type === "Mimic") {
    loc = Math.random()<0.15 ? 1 : 0;
    sensory = choice([0,1]); dysarthria = choice([0,1]); if (mimicBias!=="non" && Math.random()<0.25) facial=1;
  } else if (type === "ICH" || type === "SAH") {
    facial = cap(randInt(0,2),3); gaze = cap(randInt(0,2),2); visual = cap(randInt(0,2),3); dysarthria = cap(randInt(0,2),2);
    if (affectedSide==="left"){ armL=cap4(randInt(1,3)); legL=cap4(randInt(1,3)); } else { armR=cap4(randInt(1,3)); legR=cap4(randInt(1,3)); }
    language = affectedSide === (dominantSide==="right"?"left":"right") ? cap(randInt(0,2),3) : 0;
  } else if (type === "SDH") {
    loc = Math.random()<0.35 ? 1 : 0;
    facial = cap(randInt(0,2),3); gaze = cap(randInt(0,1),1); visual = cap(randInt(0,1),2);
    if (affectedSide==="left"){ armL=cap4(randInt(1,3)); legL=cap4(randInt(1,3)); armR=cap4(randInt(0,1)); legR=cap4(randInt(0,1)); }
    else { armR=cap4(randInt(1,3)); legR=cap4(randInt(1,3)); armL=cap4(randInt(0,1)); legL=cap4(randInt(0,1)); }
    language = affectedSide === (dominantSide==="right"?"left":"right") ? cap(randInt(0,1),2) : 0;
    dysarthria = cap(randInt(0,2),2); ataxia = cap(randInt(0,1),1); sensory = cap(randInt(0,2),2);
  } else {
    const severe = ["ICA","MCA - M1","Basilar artery"].includes(site);
    loc = severe ? (Math.random()<0.35 ? choice([1,2]) : 0) : (Math.random()<0.1 ? 1 : 0);
    const moderate = site === "MCA - proximal M2" || site === "MCA - distal M2";
    const mild = NON_EVT_SITES.includes(site) || !site;
    facial = cap(randInt(0, severe?2:moderate?2:1),3);
    gaze = cap(randInt(0, severe?2:1),2);
    visual = cap(randInt(0, severe?2:1),3);
    if (affectedSide==="left"){
      armL=cap4(randInt(severe?2:moderate?1:0, severe?4:moderate?3:2));
      legL=cap4(randInt(severe?2:moderate?1:0, severe?4:moderate?3:2));
    } else {
      armR=cap4(randInt(severe?2:moderate?1:0, severe?4:moderate?3:2));
      legR=cap4(randInt(severe?2:moderate?1:0, severe?4:moderate?3:2));
    }
    language = affectedSide === (dominantSide==="right"?"left":"right") ? cap(randInt(mild?0:1, severe?3:2),3) : 0;
    dysarthria = cap(randInt(0, (moderate||severe)?2:1),2);
    ataxia = cap(randInt(0, (moderate||severe)?2:1),2);
    sensory = cap(randInt(0,2),2);
  }
  if (site==="Basilar artery" || (site&&site.includes("PCA"))) language = 0;
  if (affectedSide==="left" && (armL>0||legL>0) && language>0) { if (Math.random()>=0.02) language = 0; }
  
  // Neglect likelihood: right hemisphere involvement (affectedSide === "left") increases probability;
  // also associated with gaze/visual field deficits.
  const neglectBase = (affectedSide==="left" ? 0.5 : 0.2) + (gaze>0 || visual>0 ? 0.2 : 0);
  if (Math.random() < Math.min(0.8, Math.max(0, neglectBase))) {
    neglect = choice([1,1,2]); // bias toward mild neglect
  }

  const total = loc+facial+gaze+visual+armL+armR+legL+legR+language+dysarthria+ataxia+sensory+neglect;
  return { loc, facial, gaze, visual, armL, armR, legL, legR, language, dysarthria, ataxia, sensory, neglect, total };
}

const isDisablingDeficit = (d, dominantSide) => {
  const leftWeak = d.armL>0 || d.legL>0, rightWeak = d.armR>0 || d.legR>0;
  const unilateral = (leftWeak && !rightWeak) || (rightWeak && !leftWeak);
  const dominantUE = dominantSide==="right" ? d.armR>0 : d.armL>0;
  const anyLeg = d.legL>0 || d.legR>0;
  return unilateral || dominantUE || anyLeg || d.language>0 || d.dysarthria>=2 || d.ataxia>0 || d.gaze>0 || d.visual>0 || d.facial>=2 || d.neglect>0 || d.loc>=1;
};

/* =========================
 * TNK scenario eligibility (ignores current BP & glucose so users can correct those)
 * ========================= */
function tnkScenarioEligible(s) {
  if (s.type !== "Ischemic") return false;
  const disabling = isDisablingDeficit(s.nihssDetail, s.dominantSide);
  if (!disabling) return false;
  // absolute-ish in our sim, including general blood thinners (yes or unknown)
  if (s.bloodThinners && s.bloodThinners !== "no") return false;
  if (s.doac || s.recentGISurgery || s.recentStroke30d) return false;
  const knownOK = s.onsetType === "known" && minutesToHours(s.minutesSinceLKAW) <= 4.5;
  const wuOK = (s.onsetType === "wake-up" || s.onsetType === "unknown") && !s.ctaOcclusion && s.mriMismatch === true;
  return knownOK || wuOK;
}

/* =========================
 * Disposition rules + helpers
 * ========================= */
const isNeutralICU = (s) =>
  s?.type === "Ischemic" &&
  (s?.ctaOcclusion === "ICA" || s?.ctaOcclusion === "MCA - M1");

const shouldGoToNeuroICU = (s) => {
  if (!s) return false;
  if (s.actions?.intubated) return true; // airway => ICU
  if (s.actions?.tnk || s.actions?.evt) return true;
  if (s.type === "ICH" || s.type === "SAH" || s.type === "SDH") return true;
  if (s.ctaOcclusion === "Basilar artery") return true;
  return false;
};

const isAdmitAppropriate = (state, admitTo) => {
  if (isNeutralICU(state)) return true;
  const needsICU = shouldGoToNeuroICU(state);
  return (needsICU && admitTo === "nicu") || (!needsICU && admitTo === "floor");
};

const getRecommendedDisposition = (s) => {
  if (isNeutralICU(s)) return { rec: "either", reason: "ICA/M1 occlusion — either NeuroICU or Floor acceptable" };
  if (shouldGoToNeuroICU(s)) {
    const reason =
      s.actions?.intubated ? "airway secured (intubated)"
      : s.actions?.tnk ? "TNK given"
      : s.actions?.evt ? "EVT performed"
      : s.type === "ICH" ? "intracerebral hemorrhage"
      : s.type === "SAH" ? "subarachnoid hemorrhage"
      : s.type === "SDH" ? "subdural hemorrhage"
      : s.ctaOcclusion === "Basilar artery" ? "basilar occlusion"
      : "ICU criteria";
    return { rec: "nicu", reason };
  }
  return { rec: "floor", reason: "no ICU criteria present" };
};

/* =========================
 * Context builders that agree with NIHSS
 * ========================= */
function buildSymptomFromNIHSS(d, affectedSide) {
  const parts = [];
  const side = affectedSide;
  if ((side==="left"?d.armL:d.armR)>0 || (side==="left"?d.legL:d.legR)>0) parts.push(side + "-sided weakness");
  if (d.language>0) parts.push("word-finding difficulty");
  if (d.dysarthria>0) parts.push("slurred speech");
  if (d.facial>0) parts.push(side + " facial droop");
  if (d.gaze>0) parts.push("gaze deviation");
  if (d.visual>0) parts.push("visual field deficit");
  if (d.ataxia>0) parts.push("incoordination");
  if (d.sensory>0) parts.push("numbness");
  if (d.loc>0) parts.push("decreased responsiveness");
  if (d.neglect>0) parts.push("inattention/neglect");
  return parts;
}

const EMS_CONTEXT_TEMPLATES = {
  neutral: [
    "found collapsed on the kitchen floor by a spouse",
    "found on the bathroom floor by a roommate; last seen normal at bedtime",
    "neighbors requested a wellness check; patient found on the couch minimally responsive",
    "on a morning walk; passerby found the patient on the sidewalk",
    "found sitting in a car in the driveway, confused"
  ],
  weakness: [
    "bystanders noted sudden unilateral weakness at a grocery store",
    "family reported one-sided weakness during breakfast at home"
  ],
  aphasia: [
    "family noticed sudden difficulty speaking at home",
    "at work; coworkers noticed word-finding difficulty during a meeting"
  ],
  dysarthria: [
    "bystanders noticed sudden slurred speech at a café",
    "spouse reported abrupt slurred speech while watching TV"
  ],
  facial: [
    "at church when congregants saw a facial droop and called EMS",
    "neighbor noticed a new facial droop and called 911"
  ],
  gaze: [
    "EMS observed a new gaze deviation during transport"
  ],
  visual: [
    "patient was bumping into objects on one side per bystanders"
  ],
  ataxia: [
    "on a walk; witnesses saw sudden unsteady gait"
  ]
  ,
  loc: [
    "bystanders described decreased responsiveness before EMS arrival",
    "family reported the patient was difficult to arouse"
  ],
  neglect: [
    "family noticed the patient ignored one side when asked to raise both arms"
  ]
};

const INPT_CONTEXT_TEMPLATES = {
  neutral: [
    "as an ED boarder awaiting a bed",
    "on the oncology ward during morning rounds with abrupt confusion",
    "on telemetry unit during routine vitals check"
  ],
  weakness: [
    "nurses noted new unilateral weakness on the rehab unit",
    "on the cardiac stepdown unit; staff noticed unilateral weakness"
  ],
  aphasia: [
    "on the surgical floor (post‑op day 1) when the nurse noted new aphasia"
  ],
  dysarthria: [
    "staff noted sudden dysarthria on the medical ward"
  ],
  gaze: [
    "in radiology waiting area, developed a new gaze deviation"
  ],
  ataxia: [
    "therapists on the rehab unit observed acute incoordination"
  ],
  visual: [
    "team noticed new visual neglect during neuro checks"
  ],
  facial: [
    "nurse observed a new facial droop during meds pass"
  ]
};

function pickContextLine(activator, d) {
  const has = {
    weakness: (d.armL>0||d.armR>0||d.legL>0||d.legR>0),
    aphasia: d.language>0,
    dysarthria: d.dysarthria>0,
    gaze: d.gaze>0,
    visual: d.visual>0,
    ataxia: d.ataxia>0,
    facial: d.facial>0,
    loc: d.loc>0,
    neglect: d.neglect>0,
  };
  const pool = activator==="EMS" ? EMS_CONTEXT_TEMPLATES : INPT_CONTEXT_TEMPLATES;
  const eligible = [];
  for (const key of Object.keys(has)) if (has[key] && pool[key]) eligible.push(...pool[key]);
  const base = (pool.neutral || []);
  const candidates = eligible.length ? eligible : base;
  return choice(candidates);
}

/* =========================
 * Case generator
 * ========================= */
function generateCase(mode="learning"){
  const age = randInt(38,92), sex = choice(["male","female"]);
  let onsetType="known", minutesSinceLKAW=randInt(10,270), type="Ischemic", baselineMrs=randomBaselineMrs(), ctaOcclusion=null;
  let dominantSide = Math.random()<0.9 ? "right" : "left", affectedSide=choice(["left","right"]);
  let doac=false, recentGISurgery=Math.random()<0.05, recentStroke30d=Math.random()<0.06, glucose=Math.random()<0.08?randInt(40,59):randInt(60,280);
  let perfMismatch=false, ischemicVolume=0;
  let activator = Math.random()<0.75 ? "EMS" : "Inpatient staff";

  if (mode==="learning"){
    const r=Math.random(); baselineMrs=randomBaselineMrs(); doac=recentGISurgery=recentStroke30d=false; glucose=randInt(80,180);
    if (r<0.15){ type="ICH"; minutesSinceLKAW=randInt(30,1440); }
    else if (r<0.17){ type="SAH"; minutesSinceLKAW=randInt(30,1440); }
    else if (r<0.20){ type="SDH"; minutesSinceLKAW=randInt(30,1440); }
    else { type="Ischemic"; const hasLVO=Math.random()<0.66;
      if (hasLVO){ ctaOcclusion=pickOcclusion(); minutesSinceLKAW=ctaOcclusion==="MCA - distal M2"?randInt(361,1200):randInt(30,1200); perfMismatch=Math.random()<0.5; ischemicVolume=randInt(30,160); }
      else { onsetType=choice(["known","wake-up","unknown"]); minutesSinceLKAW=onsetType==="known"?randInt(60,540):randInt(240,960); ischemicVolume=randInt(10,80); }
    }
  } else {
    const r=Math.random();
    if (r<0.7){ type="Mimic"; onsetType=choice(["known","wake-up","unknown"]); minutesSinceLKAW=onsetType==="known"?randInt(30,600):onsetType==="wake-up"?randInt(360,1440):randInt(120,1440); }
    else if (r<0.73){ type="SAH"; minutesSinceLKAW=randInt(30,1440); }
    else if (r<0.88){ type="Ischemic"; ctaOcclusion=pickOcclusion(); minutesSinceLKAW=ctaOcclusion==="MCA - distal M2"?randInt(361,1200):randInt(30,1200); perfMismatch=Math.random()<0.5; ischemicVolume=randInt(30,160); }
    else if (r<0.93){ type="Ischemic"; minutesSinceLKAW=randInt(10,270); /* doac tied to bloodThinners later */ recentGISurgery=Math.random()<0.03; recentStroke30d=Math.random()<0.03; glucose=randInt(70,220); }
    else { if (Math.random()<0.6) type="ICH"; else { type="Ischemic"; ctaOcclusion=Math.random()<0.86?pickOcclusion():null; }
      onsetType=choice(["known","wake-up","unknown"]); minutesSinceLKAW=onsetType==="known"?randInt(60,1440):randInt(240,1440);
      if (ctaOcclusion==="MCA - distal M2"){ onsetType="known"; if (minutesSinceLKAW<=360) minutesSinceLKAW=randInt(361,1200); }
    }
  }

  const requiresIntubation = Math.random() < (1/30);

  let mimicBias=null; if (type==="Mimic" && Math.random()<0.7) mimicBias="non";
  let nihssDetail = calcNIHSS({type,affectedSide,dominantSide,site:ctaOcclusion,mimicBias});
  if (type==="Mimic" && mimicBias==="non" && isDisablingDeficit(nihssDetail,dominantSide)) {
    nihssDetail = calcNIHSS({type,affectedSide,dominantSide,site:ctaOcclusion,mimicBias:"non"});
  }
  if (type==="Ischemic" && ischemicVolume===0){ perfMismatch=Math.random() < (ctaOcclusion?0.55:0.3); ischemicVolume=randInt(20, ctaOcclusion?180:90); }
  let ctpTmax6=0, ctpRcbf30=0;
  if (type==="Ischemic"){ ctpTmax6=ischemicVolume; const ratio = perfMismatch?choice([1.8,2.1,2.4,2.8,3.0]):choice([1.0,1.2,1.3,1.4,1.5]); ctpRcbf30=Math.max(1, Math.round(ctpTmax6/ratio)); }

  // Vitals
  let sbp = type==="ICH"?randInt(180,230):randInt(100,185);
  let dbp = type==="ICH"?randInt(95,130):randInt(55, sbp<140?99:110);
  let spo2 = requiresIntubation ? randInt(82, 89) : randInt(92, 100);
  let hr = requiresIntubation ? randInt(105, 128) : randInt(56, 118);

  // Blood thinners history (yes 7%, unknown 5%, else no)
  const rBT = Math.random()*100;
  let bloodThinners = rBT < 7 ? "yes" : rBT < 12 ? "unknown" : "no";

  
  // Reconcile DOAC with blood thinners: DOAC info should only be known when blood thinners is confirmed "yes".
  if (bloodThinners === "yes") {
    // ~35% of "on blood thinners" are DOACs with recent ingestion (<48h)
    doac = Math.random() < 0.35;
  } else {
    // If not confirmed on blood thinners (no/unknown), we should not have a definite DOAC ingestion fact
    doac = false;
  }
// Narrative construction
  const d = nihssDetail;
  const symptomParts = buildSymptomFromNIHSS(d, affectedSide);
  const symptomHint = symptomParts.slice(0,2).join(" and ");
  const extra = symptomHint ? " for deficits of " + symptomHint : "";

  const lka = onsetType==="known" ? (Math.round(minutesToHours(minutesSinceLKAW)*10)/10 + " hours ago")
             : onsetType==="wake-up" ? "wake-up stroke (unknown exact time)" : "unknown";

  const contextLine = (function(){
    const line = pickContextLine(activator, d);
    return activator==="EMS"
      ? `\nContext: Patient ${line}.`
      : `\nContext: Patient ${line}. Primary team requests immediate neurology evaluation.`;
  })();

  const notes=[];
if (doac) notes.push("recent DOAC ingestion within 48h");
  if (recentGISurgery) notes.push("GI surgery within the past week");
  if (recentStroke30d) notes.push("prior stroke within the last month");
  if (glucose<60) notes.push("fingerstick glucose " + glucose + " mg/dL");

  const extraEMS = notes.length ? "\n" + activator + " adds: " + notes.join("; ") + "." : "";
  const mrs5 = baselineMrs===5 ? "\n" + activator + " reports the patient has severe baseline disability (mRS 5)." : "";
  const respLine = requiresIntubation ? "\nOn arrival, the patient is in obvious respiratory distress with hypoxia and poor airway protection." : "";

  const contextBrief = pickContextLine(activator, d);
  const respShort = requiresIntubation ? " Patient appears in respiratory distress." : "";
  const stem = `${activator} brings a ${age}-year-old ${sex} with${extra || " acute neurologic symptoms"}. Last known well: ${lka}. Vitals: BP ${sbp}/${dbp}, HR ${hr}, SpO2 ${spo2}%. Found/observed: ${contextBrief}. Blood thinners: ${bloodThinners.toUpperCase()}.` +
               `${notes.length ? " Notables: " + notes.join("; ") + "." : ""}` +
               `${respShort} You are at bedside with the team.`;

  return {
    mode, age, sex, onsetType, minutesSinceLKAW, baselineMrs, type, ctaOcclusion, dominantSide, affectedSide,
    nihssDetail, doac, glucose, recentGISurgery, recentStroke30d, perfMismatch, ischemicVolume, ctpTmax6, ctpRcbf30,
    aspects: null, mriMismatch: Math.random()<0.55,
    actions: { examine:false, ctNonCon:false, cta:false, ctp:false, mri:false, tnk:false, evt:false, admitted:null, cancel:false, nicardipine:false, d50:false, intubated:false, pcc:false },
    userClass: null, score: 100, finished: false, stem, sbp, dbp, spo2, hr, requiresIntubation, activator, bloodThinners,
  };
}


/* =========================
 * Medication/airway indication helpers
 * ========================= */
function nicardipineIndication(s){
  // Hemorrhage with SBP >=140: yes
  if (s.type==="ICH" || s.type==="SAH" || s.type==="SDH"){
    if (s.sbp >= 140) return {ok:true, reason:"Hemorrhage with SBP ≥140 before NeuroICU"};
    return {ok:false, reason:"Hemorrhage but SBP <140"};
  }
  // Ischemic: only when BP is above TNK thresholds AND a TNK path exists
  if (s.type==="Ischemic"){
    if ((s.sbp>185 || s.dbp>110) && tnkScenarioEligible(s)) return {ok:true, reason:"Pre-TNK BP control (SBP>185 or DBP>110)"};
    return {ok:false, reason:"No TNK path or BP not above threshold"};
  }
  return {ok:false, reason:"Not indicated"};
}
/* =========================
 * Actions panel
 * ========================= */
function ActionsPanel({ onAction, disabled, disabledMap, hideSubs }) {
  const ACTIONS = {
    examine: ["Examine", "NIHSS, glucose"],
    ctNonCon: ["CT Head (Non-con)", "Rule out hemorrhage + ASPECTS"],
    cta: ["CTA Head & Neck", "Identify occlusion & site"],
    ctp: ["CT Perfusion", ">6h only; distal M2 guidance"],
    mri: ["Hyperacute MRI (DWI/FLAIR)", "Wake-up/Unknown if no LVO"],
    other: ["Other actions", "BP / Glucose / Airway / PCC"],
    tnk: ["Administer TNK", "Known <=4.5h or MRI mismatch"],
    evt: ["Endovascular Thrombectomy", "For LVOs"],
    floor: ["Admit to Stroke Unit", ""],
    nicu: ["Admit to NeuroICU", ""],
    cancel: ["Cancel Code Stroke", ""],
  };

  const kindClass = (key) => (
    key==="tnk" || key==="evt" ? BUTTON.green :
    key==="floor" || key==="nicu" ? BUTTON.blue :
    key==="cancel" ? BUTTON.danger : BUTTON.neutral
  );

  const alignClass = (key) => (key==="cancel" ? BUTTON.alignCenter : BUTTON.alignLeft);

  const renderButton = (key) => {
    const [title, subtitle] = ACTIONS[key];
    return (
      <button
        key={key}
        onClick={()=>onAction(key)}
        disabled={disabled || !!disabledMap[key]}
        className={[BUTTON.base, kindClass(key), alignClass(key)].join(" ")}
      >
        <div>{title}</div>
        {!hideSubs && subtitle && <div className="text-xs font-normal text-slate-400">{subtitle}</div>}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {renderButton("examine")}
      {renderButton("ctNonCon")}
      {renderButton("cta")}
      {renderButton("ctp")}
      {renderButton("mri")}
      {renderButton("other")}
      <div className="col-span-2 my-1 border-t border-slate-700" />
      {renderButton("tnk")}
      {renderButton("evt")}
      <div className="col-span-2 my-1 border-t border-slate-700" />
      {renderButton("floor")}
      {renderButton("nicu")}
      <div className="col-span-2 flex justify-center">{renderButton("cancel")}</div>
    </div>
  );
}

/* =========================
 * Snapshot
 * ========================= */
function CaseSnapshot({ s }) {
  const fmtMins = (m)=>{ const h=Math.floor(m/60), mm=m%60; return h?`${h}h ${mm}m`:`${mm}m`; };
  const onset = s.onsetType==="known" ? `${fmtMins(s.minutesSinceLKAW)} since LKAW` : s.onsetType==="wake-up" ? "Wake-up stroke (unknown exact time)" : "Unknown LKAW";
  const cx=[];
  if (s.bloodThinners && s.bloodThinners!=="no") cx.push("On blood thinners");
  if (s.doac) cx.push("DOAC <=48h");
  if (s.recentGISurgery) cx.push("GI surgery 7d");
  if (s.recentStroke30d) cx.push("Prior stroke 30d");
  if (s.glucose<60) cx.push(`Hypoglycemia (${s.glucose})`);
  const perf = s.type==="Ischemic" ? `TMax>6s ${s.ctpTmax6}cc; rCBF<30% ${s.ctpRcbf30}cc (ratio ${(s.ctpTmax6/Math.max(1,s.ctpRcbf30)).toFixed(1)})` : "n/a";

  const items = [
    ["Age / Sex", `${s.age} / ${s.sex}`],
    ["Onset", onset],
    ["Baseline mRS", s.baselineMrs],
    ["Current BP", `${s.sbp}/${s.dbp}`],
    ["SpO2", `${s.spo2}%`],
    ["On blood thinners", s.bloodThinners.toUpperCase()],
    ["Activator", s.activator],
    ...(cx.length ? [["Contraindications", cx.join(", ")]] : []),
    ...(s.actions.examine ? [["NIHSS total", s.nihssDetail.total], ["Glucose", `${s.glucose} mg/dL`]] : []),
    ...(s.actions.ctNonCon ? [["CT Head", (s.type==="Ischemic"||s.type==="Mimic") ? `No hemorrhage${s.aspects!==null?`, ASPECTS ${s.aspects}`:""}` : s.type + " on CT"]] : []),
    ...(s.actions.cta ? [["CTA", s.type==="Ischemic" ? (s.ctaOcclusion || "No occlusion") : "n/a"]] : []),
    ...(s.actions.ctp ? [["CT Perfusion", perf]] : []),
    ...(s.actions.mri ? [["Hyperacute MRI", s.mriMismatch ? "DWI/FLAIR mismatch" : "No mismatch"]] : []),
    ...(s.actions.tnk ? [["TNK", "Given"]] : []),
    ...(s.actions.evt ? [["EVT", "Performed"]] : []),
    ...(s.actions.nicardipine ? [["BP Rx", "Nicardipine"]] : []),
    ...(s.actions.pcc ? [["Reversal", "PCC given"]] : []),
    ...(s.actions.d50 ? [["Dextrose", "D50 given"]] : []),
    ...(s.actions.intubated ? [["Airway", "Intubated"]] : []),
    ...(s.actions.cancel || s.actions.admitted ? [["Disposition", s.actions.cancel ? "Code cancelled" : s.actions.admitted==="nicu" ? "NeuroICU" : "Floor"]] : []),
  ];
  return <div className="mt-2 flex flex-wrap gap-2">{items.map(([k,v])=><InfoChip key={k} label={k} value={String(v)} />)}</div>;
}

/* =========================
 * Citations (unchanged text)
 * ========================= */
const CITATIONS_TEXT = `Goyal, M., Ospel, J. M., Ganesh, A., Dowlatshahi, D., Volders, D., Möhlenbruch, M. A., Jumaa, M. A., Nimjee, S. M., Booth, T. C., Buck, B. H., Kennedy, J., Shankar, J. J., Dorn, F., Zhang, L., Hametner, C., Nardai, S., Zafar, A., Diprose, W., Vatanpour, S., … Hill, M. D. (2025). Endovascular treatment of stroke due to medium-vessel occlusion. New England Journal of Medicine, 392(14), 1385–1395. https://doi.org/10.1056/nejmoa2411668
Interim analysis of the discount randomized controlled trial. (n.d.). https://professional.heart.org/en/-/media/PHD-Files/Meetings/ISC/2025/sci-news/DISCOUNT-Data-Summary-Slide--ISC-2025.pptx?sc_lang=en
Mokin, M., Jovin, T. G., Sheth, S. A., Nguyen, T. N., Asif, K. S., Hassan, A. E., Jadhav, A. P., Kenmuir, C., Liebeskind, D. S., Mansour, O., Nogueira, R. G., Novakovic, R., Ortega‐Gutierrez, S., Yoo, A. J., Guerrero, W. R., & Malik, A. M. (2025). Endovascular therapy in patients with acute ischemic stroke with large infarct: A guideline from the Society of Vascular and interventional neurology. Stroke: Vascular and Interventional Neurology, 5(2). https://doi.org/10.1161/svin.124.001581
Powers, W. J., Rabinstein, A. A., Ackerson, T., Adeoye, O. M., Bambakidis, N. C., Becker, K., Biller, J., Brown, M., Demaerschalk, B. M., Hoh, B., Jauch, E. C., Kidwell, C. S., Leslie-Mazwi, T. M., Ovbiagele, B., Scott, P. A., Sheth, K. N., Southerland, A. M., Summers, D. V., & Tirschwell, D. L. (2019). Guidelines for the early management of patients with acute ischemic stroke: 2019 update to the 2018 guidelines for the early management of acute ischemic stroke: A guideline for healthcare professionals from the American Heart Association/American Stroke Association. Stroke, 50(12). https://doi.org/10.1161/str.0000000000000211
Psychogios, M., Brehm, A., Ribo, M., Rizzo, F., Strbian, D., Räty, S., Arenillas, J. F., Martínez-Galdámez, M., Hajdu, S. D., Michel, P., Gralla, J., Piechowiak, E. I., Kaiser, D. P. O., Puetz, V., Van den Bergh, F., De Raedt, S., Bellante, F., Dusart, A., Hellstern, V., … Fischer, U. (2025). Endovascular treatment for stroke due to occlusion of medium or distal vessels. New England Journal of Medicine, 392(14), 1374–1384. https://doi.org/10.1056/nejmoa2408954
Thomalla, G., Simonsen, C. Z., Boutitie, F., Andersen, G., Berthezene, Y., Cheng, B., Cheripelli, B., Cho, T.-H., Fazekas, F., Fiehler, J., Ford, I., Galinovic, I., Gellissen, S., Golsari, A., Gregori, J., Günther, M., Guibernau, J., Häusler, K. G., Hennerici, M., … Gerloff, C. (2018). MRI-guided thrombolysis for stroke with unknown time of onset. New England Journal of Medicine, 379(7), 611–622. https://doi.org/10.1056/nejmoa1804355`;

const URL_RE = /(https?:\/\/[^\s)\]]+)/g;
function renderWithLinks(str) {
  const parts = [];
  let last = 0;
  str.replace(URL_RE, (m, url, idx) => {
    if (idx > last) parts.push(str.slice(last, idx));
    parts.push(
      <a key={url + idx} href={url} target="_blank" rel="noreferrer" className="underline hover:text-sky-300 break-all">
        {url}
      </a>
    );
    last = idx + m.length;
    return m;
  });
  if (last < str.length) parts.push(str.slice(last));
  return parts;
}

const CitationsModal = ({ open, onX }) => {
  if (!open) return null;
  const items = CITATIONS_TEXT.trim().split(/\n+/).filter(Boolean);
  return (
    <div className="fixed inset-0 z-[130] grid place-items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onX} />
      <div className="relative w-[min(96vw,780px)] max-h-[85vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <button onClick={onX} className="absolute right-2 top-2 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300">
          Close
        </button>
        <h3 className="text-base font-semibold pr-8">citations</h3>
        <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-relaxed text-slate-300 select-text">
          {items.map((entry, i) => (
            <li key={i} className="break-words">{renderWithLinks(entry)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* =========================
 * Modals
 * ========================= */
const SimpleModal=({open,title,onX,children,widthClass="w-[min(96vw,520px)]"})=> open?(
  <div className="fixed inset-0 z-[125] grid place-items-center">
    <div className="absolute inset-0 bg-black/60" onClick={onX} />
    <div className={"relative "+widthClass+" rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl"}>
      <div className="flex items-center justify-between">
        <div className="text-base font-semibold">{title}</div>
        <button onClick={onX} className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300">Close</button>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  </div>
):null;

function NIHSSSummary({ detail, onChoose }) {
  if (!detail) return null;
  const rows = [
    ["LOC", detail.loc],
    ["Facial",detail.facial],["Gaze/Eyes",detail.gaze],["Visual fields",detail.visual],
    ["Left arm",detail.armL],["Right arm",detail.armR],["Left leg",detail.legL],["Right leg",detail.legR],
    ["Language",detail.language],["Dysarthria",detail.dysarthria],["Ataxia",detail.ataxia],["Sensory",detail.sensory],
    ["Inattention (neglect)", detail.neglect]
  ];
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-sm font-semibold">Neurologic exam summary (NIHSS)</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-3">
        {rows.map(([k,v])=>(
          <div key={k} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-1">
            <span>{k}</span><span className="font-mono">{v}</span>
          </div>
        ))}
        <div className="col-span-2 sm:col-span-3 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1">
          <span>Total NIHSS</span><span className="font-mono font-bold">{detail.total}</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={()=>onChoose("non")} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold hover:bg-slate-800">Non-disabling</button>
        <button onClick={()=>onChoose("disabling")} className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-900/60">Disabling</button>
      </div>
    </div>
  );
}

const ConfirmDialog = ({ open, title, message, ok = "Confirm", cancel = "Cancel", onOK, onX }) =>
  open ? (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onX} />
      <div className="relative w-[min(96vw,480px)] rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="text-base font-semibold">{title}</div>
        <div className="mt-2 text-sm text-slate-300 whitespace-pre-wrap">{message}</div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onX} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm">
            {cancel}
          </button>
          <button
            onClick={onOK}
            className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm font-semibold text-emerald-200"
          >
            {ok}
          </button>
        </div>
      </div>
    </div>
  ) : null;

const OtherActionsDialog = ({ open, onX, onPick, s }) =>
  open ? (
    <div className="fixed inset-0 z-[120] grid place-items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onX} />
      <div className="relative w-[min(96vw,460px)] rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="text-base font-semibold">Other actions</div>
        <div className="mt-2 text-sm text-slate-300">Quick interventions:</div>
        <div className="mt-3 grid grid-cols-1 gap-2">
          <button onClick={()=>onPick("nicardipine")} disabled={!!s.actions.nicardipine} className={"rounded-lg border px-3 py-2 text-left font-semibold " + (s.actions.nicardipine?"border-slate-700 bg-slate-800/60 opacity-60":"border-sky-700 bg-sky-900/40 text-sky-200 hover:bg-sky-900/60")}>
            Administer nicardipine
          </button>
          <button onClick={()=>onPick("d50")} disabled={!!s.actions.d50} className={"rounded-lg border px-3 py-2 text-left font-semibold " + (s.actions.d50?"border-slate-700 bg-slate-800/60 opacity-60":"border-sky-700 bg-sky-900/40 text-sky-200 hover:bg-sky-900/60")}>
            Administer D50
          </button>
          <button onClick={()=>onPick("intubate")} disabled={!!s.actions.intubated} className={"rounded-lg border px-3 py-2 text-left font-semibold " + (s.actions.intubated?"border-slate-700 bg-slate-800/60 opacity-60":"border-sky-700 bg-sky-900/40 text-sky-200 hover:bg-sky-900/60")}>
            Intubate patient
          </button>
          <button onClick={()=>onPick("pcc")} disabled={!!s.actions.pcc} className={"rounded-lg border px-3 py-2 text-left font-semibold " + (s.actions.pcc?"border-slate-700 bg-slate-800/60 opacity-60":"border-sky-700 bg-sky-900/40 text-sky-200 hover:bg-sky-900/60")}>
            Administer PCC
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onX} className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm">Close</button>
        </div>
      </div>
    </div>
  ) : null;

/* =========================
 * App
 * ========================= */
function App(){
  const { toasts, push } = useToasts();
  const [mode, setMode] = useState("learning");
  const [data, setData] = useState(()=>generateCase(mode));
  const [log, setLog] = useState([]);
  const [revealScore, setRevealScore] = useState(false);
  const [pendingAdmit, setPendingAdmit] = useState(null);
  const [pendingMode, setPendingMode] = useState(null);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [showCitations, setShowCitations] = useState(false);
  const [showOther, setShowOther] = useState(false);
  const [showExam, setShowExam] = useState(false);

  const addLog = (kind,text)=>setLog((l)=>[{id:uid(),kind,text,t:Date.now()},...l]);

  const reset = ()=>{
    const c=generateCase(mode); setData(c); setLog([]); setRevealScore(false); setPendingAdmit(null); setShowExam(false);
    push("New case ready","Mode: "+mode+". Start with an exam, then image appropriately.");
  };
  const askMode = (n)=>{ if(n!==mode) setPendingMode(n); };
  const applyMode = (n)=>{ setMode(n); const c=generateCase(n); setData(c); setLog([]); setRevealScore(false); setPendingAdmit(null); setShowExam(false); push("Mode switched","Now in "+n+" mode. New case generated."); };

  const commitAdmit = (admitTo) => {
    if (data.finished) { push("Case finished", "Start a new case to continue.", "warn"); return; }
    const s = { ...data, actions: { ...data.actions } };

    // Intubated patients MUST go to NeuroICU
    if (s.actions.intubated && admitTo !== "nicu") {
      push("ICU required","Intubated patients require NeuroICU. Choose NeuroICU to proceed.", "warn", 5600);
      addLog("bad","Attempted floor admit for an intubated patient.");
      return;
    }

    // Hemorrhage BP & PCC requirement
    if (admitTo === "nicu" && (s.type==="ICH"||s.type==="SAH"||s.type==="SDH")) {
      if (s.sbp >= 140 && !s.actions.nicardipine) {
        push("Start nicardipine first","Hemorrhage with SBP ≥140: administer nicardipine via Other actions before NeuroICU admit.", "warn", 5200);
        addLog("bad","Attempted ICU admit without BP management (hemorrhage).");
        return;
      }
      if (s.doac && !s.actions.pcc) {
        push("Reverse DOAC first","Hemorrhage with recent DOAC: administer PCC via Other actions before NeuroICU admit.", "warn", 5600);
        addLog("bad","Attempted ICU admit without DOAC reversal (PCC).");
        return;
      }
    }

    s.actions.admitted = admitTo;
    const { rec, reason } = getRecommendedDisposition(s);
    const ok = isAdmitAppropriate(s, admitTo);
    const label = admitTo === "nicu" ? "NeuroICU" : "Floor";

    if (rec === "either") {
      addLog("info", "ICA/M1 occlusion — either NeuroICU or Floor acceptable.");
      push("Disposition recorded", `${label} chosen (no penalty for ICA/M1).`, "info", 4200);
    } else {
      s.score = clamp(s.score + (ok ? 4 : -10));
      addLog(ok ? "good" : "bad", ok ? `${label} appropriate.` : `${label} suboptimal for condition.`);
      push("Disposition selected", `${label} chosen. Case will be graded.`, ok ? "good" : "warn", 4200);
      if (!ok) {
        const recLabel = rec === "nicu" ? "NeuroICU" : "Floor";
        push("Recommended disposition", `Recommend ${recLabel} (${reason}).`, "warn", 5200);
      }
    }
    finishCase(s);
  };

  const commitCancel = ()=>{
    if (data.finished){ push("Case finished","Start a new case to continue.","warn"); setPendingCancel(false); return; }
    // Hard stop: don't allow cancellation if NIHSS > 5
    if (data.nihssDetail && data.nihssDetail.total > 5) {
      push("Cannot cancel","NIHSS > 5 — code stroke must remain active.", "warn", 5600);
      addLog("bad","Attempted cancellation with NIHSS > 5.");
      setPendingCancel(false);
      return;
    }
    const s={...data, actions:{...data.actions, cancel:true}};
    const disabling = isDisablingDeficit(s.nihssDetail, s.dominantSide);
    const ok = isNonAcute(s) || (s.userClass!==null ? s.userClass==="non" : !disabling) || s.type==="Mimic";
    s.finished=true;
    if (ok){ s.score=clamp(s.score+8); push("Code stroke cancelled","Cancelled for "+[isNonAcute(s)&&">24h", s.userClass==="non"&&"non-disabling", s.type==="Mimic"&&"non-neurologic"].filter(Boolean).join(", ")+".","good"); addLog("good","Cancelled appropriately."); }
    else { s.score=clamp(s.score-16); push("Cancelled prematurely","Patient remains acute, disabling, and neurologic - continue evaluation/treatment.","bad"); addLog("bad","Cancelled prematurely."); }
    setData(s); setPendingCancel(false);
  };

  const pickOther = (k)=>{
    if (data.finished){ push("Case finished","Start a new case to continue.","warn"); setShowOther(false); return; }
    const s={...data, actions:{...data.actions}};
    const penalize=(d,t,m)=>{ s.score=clamp(s.score-d); push(t,m,"bad"); addLog("bad",m); };
    const reward=(d,t,m)=>{ s.score=clamp(s.score+d); push(t,m,"good"); addLog("good",m); };

    if (k==="nicardipine"){
      if (s.actions.nicardipine){ push("Already given","Nicardipine already recorded.","warn"); }
      else {
        if (s.type==="Ischemic" && !tnkScenarioEligible(s)) {
          penalize(6,"BP lowering not indicated","Ischemic stroke without TNK path — avoid routine nicardipine unless otherwise required.");
        }
        s.actions.nicardipine=1;
        const dropSBP=randInt(15,35), dropDBP=randInt(5,15);
        s.sbp=Math.max(110, s.sbp-dropSBP);
        s.dbp=Math.max(60, s.dbp-dropDBP);
        push("Nicardipine started",`BP improved to ${s.sbp}/${s.dbp}.`,"good");
        addLog("good","Administered nicardipine.");
      }
    } else if (k==="d50"){
      if (s.actions.d50){ push("Already given","D50 already recorded.","warn"); }
      else {
        s.actions.d50=1;
        const before = s.glucose;
        if (before<90){ s.glucose=randInt(90,130); push("D50 given",`Glucose now ${s.glucose} mg/dL. Hypoglycemia corrected.`,`good`); }
        else { push("D50 given","No hypoglycemia noted. Recorded for training.","warn"); }
        addLog("info","Administered D50.");
      }
    } else if (k==="intubate"){
      if (s.actions.intubated){ push("Already intubated","Airway already secured.","warn"); }
      else {
        s.actions.intubated=1;
        s.spo2=Math.max(s.spo2, 96);
        s.hr=Math.max(70, s.hr-15);
        if (s.requiresIntubation) {
          push("Patient intubated","Airway secured. Oxygenation improved.","info");
          addLog("good","Intubated patient with appropriate indication.");
          s.score = Math.min(100, s.score + 4);
        } else {
          push("Intubation not indicated","No respiratory distress/instability documented.","warn");
          addLog("bad","Inappropriate intubation.");
          s.score = Math.max(0, s.score - 8);
        }
      }
    } else if (k==="pcc") {
      if (s.actions.pcc){ push("Already given","PCC already recorded.","warn"); }
      else {
        s.actions.pcc=1;
        if (s.type==="ICH"||s.type==="SAH"||s.type==="SDH") {
          push("PCC administered","Reversal started for suspected DOAC effect.","good");
          addLog("good","Administered PCC.");
        } else {
          penalize(4,"Reversal not indicated","PCC use generally reserved for hemorrhage with anticoagulant effect.");
        }
      }
    }
    setData(s); setShowOther(false);
  };

  const doAction = (actionKey)=>{
    if (data.finished){ push("Case finished","Start a new case to continue.","warn"); return; }

    if (data.requiresIntubation && !data.actions.intubated && (["examine","ctNonCon","cta","ctp","mri"].includes(actionKey))) {
      push("Airway first","Patient in respiratory distress: intubate via Other actions before exam or imaging.","warn", 5600);
      addLog("bad","Attempted action before securing airway.");
      return;
    }

    const s={...data, actions:{...data.actions}};
    const penalize=(d,t,m)=>{ s.score=clamp(s.score-d); push(t,m,"bad"); addLog("bad",m); };
    const reward=(d,t,m)=>{ s.score=clamp(s.score+d); push(t,m,"good"); addLog("good",m); };

    switch(actionKey){
      case "examine":
        if (s.actions.examine){ penalize(2,"Already examined","Repeated action."); break; }
        s.actions.examine=1; reward(3,"Exam complete",`NIHSS ${s.nihssDetail.total}, glucose ${s.glucose} mg/dL. Please classify as disabling or non-disabling.`);
        setShowExam(true);
        break;
      case "ctNonCon":
        if (s.actions.ctNonCon){ penalize(2,"CT repeated","Duplicate non-contrast CT."); break; }
        if (!s.actions.examine) penalize(3,"Premature imaging","Rapid exam first helps triage and consent.");
        s.actions.ctNonCon=1;
        if (s.type==="ICH"||s.type==="SAH"||s.type==="SDH"){ reward(4,"CT done",`${s.type} detected. TNK and EVT are contraindicated.`); push("Recommended","Admit to NeuroICU and manage accordingly.","info",2600); }
        else { const aspects=calcASPECTS(s.onsetType,s.minutesSinceLKAW,s.ctaOcclusion,s.type); s.aspects=aspects.score; reward(4,"CT done","No hemorrhage identified. ASPECTS "+(aspects.score!=null?aspects.score:"n/a")+"." ); }
        break;
      case "cta":
        if (s.actions.cta){ penalize(2,"CTA repeated","Duplicate CTA."); break; }
        if (!s.actions.ctNonCon) penalize(5,"Out of sequence","Perform non-contrast CT before CTA.");
        s.actions.cta=1;
        if (s.type!=="Ischemic"){ penalize(4,"CTA low yield","Primary hemorrhage or mimic - CTA rarely helpful."); }
        else if (s.ctaOcclusion){ reward(6,"CTA result","Occlusion: "+s.ctaOcclusion+"."); const h=minutesToHours(s.minutesSinceLKAW); if (h>6 && s.ctaOcclusion==="MCA - distal M2") push("Consider CTP",">6h LKAW and distal M2 - obtain CTP to guide EVT (large territory or favorable ratio).","info",4600); }
        else { reward(4,"CTA result","No proximal occlusion identified."); }
        break;
      case "ctp": {
        const h=minutesToHours(s.minutesSinceLKAW);
        if (h<6){ penalize(6,"Too early for CTP","CT perfusion should not be obtained prior to 6 hours from LKAW."); break; }
        if (s.actions.ctp){ penalize(2,"CTP repeated","Duplicate perfusion imaging."); break; }
        if (!s.actions.ctNonCon) penalize(4,"Out of sequence","Perform non-contrast CT first.");
        s.actions.ctp=1;
        if (s.type!=="Ischemic"){ penalize(4,"CTP not indicated","Perfusion imaging does not apply to hemorrhage or mimic."); }
        else if (s.ctaOcclusion==="MCA - distal M2"){
          const ok = s.ischemicVolume>100 || s.perfMismatch;
          if (ok){ reward(6,"CTP favorable",`TMax>6s ${s.ctpTmax6}cc; rCBF<30% ${s.ctpRcbf30}cc (ratio ${(s.ctpTmax6/Math.max(1,s.ctpRcbf30)).toFixed(1)}). Supports EVT for distal M2.`); }
          else { addLog("info",`CTP unfavorable: TMax>6s ${s.ctpTmax6}cc; rCBF<30% ${s.ctpRcbf30}cc (ratio ${(s.ctpTmax6/Math.max(1,s.ctpRcbf30)).toFixed(1)}).`); push("CTP result","Not favorable for distal M2 intervention.","warn",4000); }
        } else {
          addLog("info",`CTP recorded: TMax>6s ${s.ctpTmax6}cc; rCBF<30% ${s.ctpRcbf30}cc (ratio ${(s.ctpTmax6/Math.max(1,s.ctpRcbf30)).toFixed(1)}).`);
        }
        break;
      }
      case "mri":
        if (s.actions.mri){ penalize(2,"MRI repeated","Duplicate MRI."); break; }
        if (!(s && s.type==="Ischemic" && s.actions.ctNonCon && s.actions.cta && s.userClass==="disabling" &&
              ((s.onsetType==="wake-up" && (!s.ctaOcclusion ||
                 (s.ctaOcclusion==="MCA - distal M2" ? !(minutesToHours(s.minutesSinceLKAW)<=6 || !s.actions.ctp || s.ischemicVolume>100 || s.perfMismatch)
                                                     : !EVT_SITES.includes(s.ctaOcclusion))))
               || (s.onsetType==="unknown" && !s.ctaOcclusion)))) {
          penalize(4,"MRI not available","Hyperacute MRI is reserved for wake-up/unknown per rules."); break;
        }
        s.actions.mri=1;
        if (s.mriMismatch){ addLog("good","MRI: DWI/FLAIR mismatch present."); push("MRI result","Mismatch present - consider TNK if otherwise eligible.","good",4800); }
        else { addLog("info","MRI: No DWI/FLAIR mismatch."); push("MRI result","No mismatch - TNK not indicated.","warn",4800); }
        break;
      case "other":
        setShowOther(true); break;
      case "tnk": {
        if (s.userClass === "non") { push("TNK not indicated","Non-disabling symptoms: TNK should not be given.", "warn", 5200); addLog("bad","Attempted TNK for non-disabling symptoms."); break; }
        if (s.glucose < 60) { push("Correct hypoglycemia first","Glucose <60 mg/dL: give D50 via Other actions, then reassess TNK.", "warn", 5600); addLog("bad","Attempted TNK with hypoglycemia."); break; }
        if ((s.sbp>185 || s.dbp>110) && !s.actions.nicardipine) { push("Lower BP first","SBP >185 or DBP >110: start nicardipine via Other actions before TNK.", "warn", 5600); addLog("bad","Attempted TNK with uncontrolled BP."); break; }

        if (s.actions.tnk){ penalize(3,"TNK already given","Duplicate thrombolysis is unsafe."); break; }
        if (!s.actions.ctNonCon) penalize(8,"Unsafe sequence","Rule out hemorrhage on non-contrast CT before thrombolysis.");
        if (s.type!=="Ischemic"){ penalize(40,"Contraindicated","Hemorrhage or mimic present. Do not administer TNK."); break; }
        if (!s.userClass){ penalize(5,"Classify first","Classify deficits as Disabling vs Non-disabling before TNK."); break; }

        // Include blood thinners as a hard contraindication (yes/unknown)
        const hasBloodThinnersContra = s.bloodThinners && s.bloodThinners !== "no";

        const withinWindow = (s.onsetType==="known" && minutesToHours(s.minutesSinceLKAW)<=4.5) ||
                             ((s.onsetType==="wake-up" || s.onsetType==="unknown") && s.actions.mri && !s.ctaOcclusion && s.mriMismatch);

        const tnkOK = s.userClass==="disabling" && !hasBloodThinnersContra && !s.doac && !s.recentGISurgery && !s.recentStroke30d &&
                      s.glucose>=60 && s.actions.ctNonCon && withinWindow &&
                      (s.sbp<=185 && s.dbp<=110);

        if (!tnkOK){
          const list=contraindicationLabels(s);
          if (list.length){ penalize(18,"Contraindicated","Contraindication present: "+list.join(", ")+"."); break; }
          penalize(18,"TNK not indicated","Known <=4.5h or wake-up/unknown + MRI mismatch required, and BP must be on target."); break;
        }
        s.actions.tnk=1; reward(10,"TNK administered","Appropriate selection."); break;
      }
      case "evt":
        if (s.actions.evt){ penalize(3,"EVT already performed","Duplicate EVT not possible."); break; }
        if (!s.actions.ctNonCon) penalize(8,"Unsafe sequence","Perform non-contrast CT first.");
        if (!s.actions.cta) penalize(6,"Missing CTA","Identify occlusion and site on CTA before EVT.");
        if (s.type!=="Ischemic"){ penalize(40,"Contraindicated","Hemorrhage or mimic - EVT not indicated."); break; }
        if (s.baselineMrs===5){ penalize(15,"Not indicated (mRS 5)","Baseline mRS 5 - no thrombectomy indicated."); break; }
        if (!s.ctaOcclusion){ penalize(18,"No target","No occlusion identified on CTA."); break; }
        { const h2=minutesToHours(s.minutesSinceLKAW);
          if (s.ctaOcclusion==="MCA - distal M2" && h2>6 && (!s.actions.ctp || !(s.ischemicVolume>100 || s.perfMismatch))){ penalize(16,"Insufficient criteria","Distal M2 >6h requires favorable CTP (large territory or favorable ratio). "); break; }
          const evtOK = s.type==="Ischemic" && s.ctaOcclusion && s.baselineMrs!==5 &&
            ((s.ctaOcclusion==="MCA - distal M2" && h2>6 && s.actions.ctp && (s.ischemicVolume>100 || s.perfMismatch)) ||
             (EVT_SITES.includes(s.ctaOcclusion) && h2<=24));
          if (!evtOK){ penalize(16,"Site/time not appropriate","EVT not indicated for "+s.ctaOcclusion+" at this time."); break; }
        }
        s.actions.evt=1; reward(12,"EVT performed","Appropriate candidate treated."); break;
      case "floor":
      case "nicu":
        if (s.actions.admitted){ penalize(2,"Disposition chosen","Duplicate disposition."); break; }
        setPendingAdmit(actionKey); return;
      case "cancel":
        if (s.actions.cancel){ penalize(2,"Already cancelled","Code already cancelled."); break; }
        setPendingCancel(true); return;
      default: break;
    }
    setData(s);
  };

  const finishCase = (incoming)=>{
    if (!incoming && data.finished){ push("Already graded","Start a new case to continue.","warn"); return; }
    const s = incoming?{...incoming}:{...data};
    const required = new Set(["examine","ctNonCon"]);
    if (s.type==="Ischemic"){ if (s.ctaOcclusion) required.add("cta"); }
    else if (s.type==="ICH"||s.type==="SAH"||s.type==="SDH") required.add("nicu");
    if (!s.actions.admitted && !s.actions.cancel) required.add("disposition");
    const missed=[];
    if (!s.actions.examine) missed.push("Examined patient");
    if (!s.actions.ctNonCon) missed.push("Obtained non-contrast CT");
    if (required.has("cta") && !s.actions.cta) missed.push("Obtained CTA");
    if (required.has("disposition") && !s.actions.admitted && !s.actions.cancel) missed.push("Selected disposition or cancelled code appropriately");
    let penalty=0; if (missed.length) penalty+=Math.min(60, missed.length*10);
    if ((s.type==="ICH"||s.type==="SAH"||s.type==="Mimic") && (s.actions.tnk||s.actions.evt)) penalty+=25;
    const finalScore = clamp(s.score - penalty);
    const grade = gradeLetter(finalScore);
    const summary = [missed.length ? "Missed steps: " + missed.join("; ") + "." : "All essential steps completed."];
    push("Case graded: "+grade, summary.join(" "), grade[0]==="A"||grade[0]==="B"?"good":grade[0]==="C"?"warn":"bad", 6600);
    setData({...s, score: finalScore, finished:true});
  };

  const chooseClass = (val)=>{
    const ok = (val==="disabling" && isDisablingDeficit(data.nihssDetail, data.dominantSide)) ||
               (val==="non" && !isDisablingDeficit(data.nihssDetail, data.dominantSide));
    setData((d)=>({...d, userClass:val, score: clamp(d.score + (ok?4:-5))}));
    push("Classification recorded","You chose " + (val==="disabling"?"Disabling":"Non-disabling") + ".", ok?"good":"warn");
    setShowExam(false);
  };

  const disabledMap = (()=>{
    const A=data.actions||{}; const dm={};
    for (const k of ["examine","ctNonCon","cta","ctp","mri","tnk","evt","cancel"]) dm[k]=!!A[k];
    dm.mri = !!A.mri;
    dm.floor = !!A.admitted || data.finished || !!A.cancel;
    dm.nicu = dm.floor;
    dm.other = false;
    return dm;
  })();

  const admitLbl = pendingAdmit==="nicu"?"NeuroICU":"Floor";
  const modeMsg = pendingMode==="learning"
    ? "Learning mode: fewer mimics and more intervention-eligible cases. Switching resets the current case. Continue?"
    : "Realistic mode: more mimics and contraindications. Switching resets the current case. Continue?";

  const revealButton = data.finished ? (
    <button
      onClick={()=>{ if(!revealScore) setRevealScore(true); }}
      disabled={false}
      className="rounded-lg border border-violet-700 bg-violet-900/40 px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-900/60"
    >
      {revealScore ? `Grade ${gradeLetter(data.score)} — Score ${data.score}` : "Reveal Score"}
    </button>
  ) : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <Toasts items={toasts} />

      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/70 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <h1 className="text-lg font-bold">🤖🧠 StrokeBot Simulator 7070 v0.515</h1>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <span>Mode:</span>
            <div className="inline-flex items-center gap-2">
              <button onClick={()=>{ if(mode!=="learning") setPendingMode("learning"); }} className={"rounded-lg border px-3 py-1 border-slate-700 " + (mode==="learning"?"bg-slate-800 text-slate-100":"bg-slate-900 text-slate-400 hover:bg-slate-800")}>Learning</button>
              <button onClick={()=>{ if(mode!=="realistic") setPendingMode("realistic"); }} className={"rounded-lg border px-3 py-1 border-slate-700 " + (mode==="realistic"?"bg-slate-800 text-slate-100":"bg-slate-900 text-slate-400 hover:bg-slate-800")}>Realistic</button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <section className={PANEL}>
          <h2 className="text-base font-semibold">Case</h2>
          <pre className={"mt-2 whitespace-pre-wrap " + BLOCK + " p-3 text-sm leading-relaxed"}>{data.stem}</pre>

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={reset} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60">New Case</button>
            <button onClick={()=>finishCase()} disabled={data.finished} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60">Finish Case</button>
            {revealButton}
          </div>
        </section>

        <section className={PANEL + " flex flex-col lg:row-span-2"}>
          <h2 className="text-base font-semibold">Actions</h2>
          <ActionsPanel onAction={doAction} disabled={data.finished} disabledMap={disabledMap} hideSubs={false} />
          <h2 className="mt-4 text-base font-semibold">Log</h2>
          <div className="mt-2 flex-1 min-h-0 overflow-auto rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm">
            {log.length===0 ? <div className="text-slate-400">No activity yet.</div> : log.map((r)=>(
              <div key={r.id} className="border-b border-dashed border-slate-800 py-2 last:border-b-0">
                <div className="flex items-center gap-2">
                  <Tag kind={r.kind}>{r.kind.toUpperCase()}</Tag>
                  <span className="text-slate-200">{r.text}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={PANEL}>
          <h2 className="text-base font-semibold">Case Snapshot</h2>
          <CaseSnapshot s={data} />
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-6 -mt-2 text-center">
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <span>designed by micah etter, md</span><span>•</span>
          <span>educational use only</span><span>•</span>
          <button onClick={()=>setShowCitations(true)} className="underline hover:text-slate-300">citations</button>
        </div>
      </footer>

      <CitationsModal open={showCitations} onX={()=>setShowCitations(false)} />

      {/* Admission dialog */}
      <ConfirmDialog
        open={!!pendingAdmit}
        title={"Admit to " + (pendingAdmit==="nicu" ? "NeuroICU" : "Floor") + "?"}
        message={"Admit to " + (pendingAdmit==="nicu" ? "NeuroICU" : "Floor") + " now? This will end and grade the case."}
        ok="Yes, admit"
        onX={()=>{ setPendingAdmit(null); push("Admission cancelled","No changes made.","warn",2000); }}
        onOK={()=>{ const a=pendingAdmit; setPendingAdmit(null); commitAdmit(a); }}
      />

      {/* Mode switch dialog */}
      <ConfirmDialog
        open={!!pendingMode}
        title="Switch mode?"
        message={modeMsg}
        ok="Switch mode"
        cancel="Stay here"
        onX={()=>setPendingMode(null)}
        onOK={()=>{ const m=pendingMode; setPendingMode(null); applyMode(m); }}
      />

      {/* Cancel code dialog */}
      <ConfirmDialog
        open={!!pendingCancel}
        title="Cancel code stroke?"
        message="This will end the case now and no stroke intervention will be performed. Continue?"
        ok="Yes, cancel"
        cancel="Keep code active"
        onX={()=>setPendingCancel(false)}
        onOK={commitCancel}
      />

      {/* Examine modal */}
      <SimpleModal open={showExam} title="Examination" onX={()=>setShowExam(false)}>
        <NIHSSSummary detail={data.nihssDetail} onChoose={chooseClass} />
      </SimpleModal>

      {/* Other actions dialog */}
      <OtherActionsDialog
        open={showOther}
        onX={()=>setShowOther(false)}
        onPick={pickOther}
        s={data}
      />
    </div>
  );
}

/* =========================
 * Mount
 * ========================= */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
