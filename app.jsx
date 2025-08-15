/* StrokeBot Simulator 7070 - external JSX build (no imports needed).

*/

/* global React, ReactDOM */
const { useRef, useState } = React;

/* =========================
 * Utility helpers
 * ========================= */
const assert = console.assert;

/** Random integer in [min, max] */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/** Random choice from array */
const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Unique id (uuid if available, else fallback) */
const uid = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch (_) {}
  return Math.random().toString(36).slice(2) + Date.now();
};

/** Minutes -> hours (float) */
const minutesToHours = (m) => m / 60;

/** Clamp value between 0 and n (default 100) */
const clamp = (x, n = 100) => Math.max(0, Math.min(n, x));

/** Is the presentation “non-acute” for canceling codes (>24h or unknown onset)? */
const isNonAcute = (state) =>
  state.onsetType === "unknown" ? 1 : minutesToHours(state.minutesSinceLKAW) > 24;

/** Convert numeric score to letter grade */
const gradeLetter = (score) =>
  score === 100
    ? "S"
    : score >= 97
    ? "A+"
    : score >= 90
    ? "A"
    : score >= 87
    ? "B+"
    : score >= 80
    ? "B"
    : score >= 77
    ? "C+"
    : score >= 70
    ? "C"
    : score >= 67
    ? "D+"
    : score >= 60
    ? "D"
    : "F";

/** Random baseline mRS distribution */
const randomBaselineMrs = () => {
  const r = Math.random() * 100;
  return r < 63 ? 0 : r < 78 ? 1 : r < 88 ? 2 : r < 93 ? 3 : r < 98 ? 4 : 5;
};

/* =========================
 * Clinical constants
 * ========================= */
const EVT_SITES = ["ICA", "MCA - M1", "MCA - proximal M2", "MCA - distal M2", "Basilar artery"];
const NON_EVT_SITES = ["ACA - A1", "ACA - A2", "PCA - P1", "PCA - P2", "MCA - M3", "MCA - M4"];

/** Weighted occlusion picker (percent weights in comment) */
const pickOcclusion = () => {
  // 20 ICA, 30 M1, 15 prox M2, 10 dist M2, 5 M3, 5 M4, 5 P1, 5 A1, 5 basilar
  const table = [
    ["ICA", 20],
    ["MCA - M1", 30],
    ["MCA - proximal M2", 15],
    ["MCA - distal M2", 10],
    ["MCA - M3", 5],
    ["MCA - M4", 5],
    ["PCA - P1", 5],
    ["ACA - A1", 5],
    ["Basilar artery", 5],
  ];
  let r = Math.random() * 100;
  let acc = 0;
  for (const [site, weight] of table) {
    acc += weight;
    if (r < acc) return site;
  }
  return "Basilar artery";
};

/* =========================
 * Toast system
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
      const stripe =
        (
          {
            good: "border-l-8 border-l-emerald-500",
            bad: "border-l-8 border-l-rose-500",
            warn: "border-l-8 border-l-amber-500",
          }[t.type]
        ) || "border-l-8 border-l-sky-400";

      return (
        <div
          key={t.id}
          className={
            "min-w-[260px] max-w-[360px] rounded-xl border px-3 py-2 shadow-2xl backdrop-blur-sm bg-slate-900/85 border-slate-700 text-slate-100 " +
            stripe
          }
        >
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
  const cls =
    kind === "good"
      ? "bg-emerald-950/60 text-emerald-300 border-emerald-800"
      : kind === "bad"
      ? "bg-rose-950/60 text-rose-300 border-rose-800"
      : "bg-sky-950/60 text-sky-200 border-sky-800";

  return <span className={"inline-block rounded-md border px-2 py-0.5 text-xs " + cls}>{children}</span>;
};

const InfoChip = ({ label, value }) => (
  <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/70 px-3 py-1 text-sm text-slate-200">
    <span className="font-semibold text-slate-300">{label}:</span>
    <span>{value}</span>
  </div>
);

const BUTTON = {
  base: "rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-60",
  accent: "rounded-lg border border-violet-700 bg-violet-900/40 px-3 py-2 text-sm font-semibold text-violet-200 hover:bg-violet-900/60",
  on: "border-slate-600 bg-slate-800 text-slate-100",
  off: "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800",
};

const PANEL = "rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-xl";
const BLOCK = "rounded-xl border border-slate-800 bg-slate-950/70";

/* =========================
 * Clinical helpers
 * ========================= */
const contraindicationLabels = (s) =>
  [
    s.doac && "DOAC <=48h",
    s.recentGISurgery && "GI surgery 7d",
    s.recentStroke30d && "Prior stroke 30d",
    s.glucose < 60 && `Hypoglycemia (${s.glucose})`,
  ].filter(Boolean);

/* =========================
 * Reusable dialog
 * ========================= */
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

/* =========================
 * Imaging / exam logic
 * ========================= */

/** ASPECTS calculator (very coarse simulation) */
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

  score += choice([0, 0, 0, 1, -1]);
  return { score: clamp(score, 10) };
}

/** NIHSS generator based on type/site/side (stochastic but bounded) */
function calcNIHSS({ type, affectedSide, dominantSide, site, mimicBias = null }) {
  const cap4 = (n) => clamp(n, 4);
  const cap = (n, h) => clamp(n, h);

  let facial = 0,
    gaze = 0,
    visual = 0,
    armL = 0,
    armR = 0,
    legL = 0,
    legR = 0,
    language = 0,
    dysarthria = 0,
    ataxia = 0,
    sensory = 0;

  if (type === "Mimic") {
    if (mimicBias === "non") {
      sensory = choice([0, 1]);
      dysarthria = choice([0, 1]);
    } else {
      sensory = choice([0, 1]);
      dysarthria = choice([0, 1]);
      if (Math.random() < 0.25) facial = 1;
    }
  } else if (type === "ICH" || type === "SAH") {
    facial = cap(randInt(0, 2), 3);
    gaze = cap(randInt(0, 2), 2);
    visual = cap(randInt(0, 2), 3);
    dysarthria = cap(randInt(0, 2), 2);
    if (affectedSide === "left") {
      armL = cap4(randInt(1, 3));
      legL = cap4(randInt(1, 3));
    } else {
      armR = cap4(randInt(1, 3));
      legR = cap4(randInt(1, 3));
    }
    language = affectedSide === (dominantSide === "right" ? "left" : "right") ? cap(randInt(0, 2), 3) : 0;
  } else if (type === "SDH") {
    facial = cap(randInt(0, 2), 3);
    gaze = cap(randInt(0, 1), 1);
    visual = cap(randInt(0, 1), 2);

    if (affectedSide === "left") {
      armL = cap4(randInt(1, 3));
      legL = cap4(randInt(1, 3));
      armR = cap4(randInt(0, 1));
      legR = cap4(randInt(0, 1));
    } else {
      armR = cap4(randInt(1, 3));
      legR = cap4(randInt(1, 3));
      armL = cap4(randInt(0, 1));
      legL = cap4(randInt(0, 1));
    }

    language = affectedSide === (dominantSide === "right" ? "left" : "right") ? cap(randInt(0, 1), 2) : 0;
    dysarthria = cap(randInt(0, 2), 2);
    ataxia = cap(randInt(0, 1), 1);
    sensory = cap(randInt(0, 2), 2);
  } else {
    const severe = ["ICA", "MCA - M1", "Basilar artery"].includes(site);
    const moderate = site === "MCA - proximal M2" || site === "MCA - distal M2";
    const mild = NON_EVT_SITES.includes(site) || !site;

    facial = cap(randInt(0, severe ? 2 : moderate ? 2 : 1), 3);
    gaze = cap(randInt(0, severe ? 2 : 1), 2);
    visual = cap(randInt(0, severe ? 2 : 1), 3);

    if (affectedSide === "left") {
      armL = cap4(randInt(severe ? 2 : moderate ? 1 : 0, severe ? 4 : moderate ? 3 : 2));
      legL = cap4(randInt(severe ? 2 : moderate ? 1 : 0, severe ? 4 : moderate ? 3 : 2));
    } else {
      armR = cap4(randInt(severe ? 2 : moderate ? 1 : 0, severe ? 4 : moderate ? 3 : 2));
      legR = cap4(randInt(severe ? 2 : moderate ? 1 : 0, severe ? 4 : moderate ? 3 : 2));
    }

    language =
      affectedSide === (dominantSide === "right" ? "left" : "right")
        ? cap(randInt(mild ? 0 : 1, severe ? 3 : 2), 3)
        : 0;

    dysarthria = cap(randInt(0, moderate || severe ? 2 : 1), 2);
    ataxia = cap(randInt(0, moderate || severe ? 2 : 1), 2);
    sensory = cap(randInt(0, 2), 2);
  }

  // PCA/basilar: language=0
  if (site === "Basilar artery" || (site && site.includes("PCA"))) language = 0;

  // Mild anti-aphasia coupling for left weakness
  if (affectedSide === "left" && (armL > 0 || legL > 0) && language > 0) {
    language = Math.random() < 0.02 ? language : 0;
  }

  const total =
    facial + gaze + visual + armL + armR + legL + legR + language + dysarthria + ataxia + sensory;

  return { facial, gaze, visual, armL, armR, legL, legR, language, dysarthria, ataxia, sensory, total };
}

/** Is the deficit “disabling” in our training rules? */
const isDisablingDeficit = (d, dominantSide) => {
  const leftWeak = d.armL > 0 || d.legL > 0;
  const rightWeak = d.armR > 0 || d.legR > 0;
  const unilateral = (leftWeak && !rightWeak) || (rightWeak && !leftWeak);

  const dominantUE = dominantSide === "right" ? d.armR > 0 : d.armL > 0;
  const anyLeg = d.legL > 0 || d.legR > 0;

  return (
    unilateral ||
    dominantUE ||
    anyLeg ||
    d.language > 0 ||
    d.dysarthria >= 2 ||
    d.ataxia > 0 ||
    d.gaze > 0 ||
    d.visual > 0 ||
    d.facial >= 2
  );
};

/** Admit disposition appropriateness */
const shouldGoToNeuroICU = (state) => {
  return (
    !!state?.actions?.tnk ||
    !!state?.actions?.evt ||
    state?.type === "ICH" ||
    state?.type === "SAH" ||
    state?.type === "SDH"
  );
};

const isAdmitAppropriate = (state, admitTo) => {
  const needsICU = shouldGoToNeuroICU(state);
  return (needsICU && admitTo === "nicu") || (!needsICU && admitTo === "floor");
};

/** MRI eligibility per rules in app */
const isHyperacuteMRIAllowed = (s) =>
  s &&
  s.type === "Ischemic" &&
  s.actions.ctNonCon &&
  s.actions.cta &&
  s.userClass === "disabling" &&
  ((s.onsetType === "wake-up" &&
    (!s.ctaOcclusion ||
      (s.ctaOcclusion === "MCA - distal M2"
        ? !(
            minutesToHours(s.minutesSinceLKAW) <= 6 ||
            !s.actions.ctp ||
            s.ischemicVolume > 100 ||
            s.perfMismatch
          )
        : !EVT_SITES.includes(s.ctaOcclusion)))) ||
    (s.onsetType === "unknown" && !s.ctaOcclusion));

/** TNK indication */
const isTNKIndicated = (s) =>
  s.type === "Ischemic" &&
  s.userClass === "disabling" &&
  !s.doac &&
  !s.recentGISurgery &&
  !s.recentStroke30d &&
  s.glucose >= 60 &&
  s.actions.ctNonCon &&
  ((s.onsetType === "known" && minutesToHours(s.minutesSinceLKAW) <= 4.5) ||
    ((s.onsetType === "wake-up" || s.onsetType === "unknown") && s.actions.mri && !s.ctaOcclusion && s.mriMismatch));

/** EVT indication */
const isEVTIndicated = (s) =>
  s.type === "Ischemic" &&
  s.ctaOcclusion &&
  s.baselineMrs !== 5 &&
  ((s.ctaOcclusion === "MCA - distal M2" &&
    minutesToHours(s.minutesSinceLKAW) > 6 &&
    s.actions.ctp &&
    (s.ischemicVolume > 100 || s.perfMismatch)) ||
    (EVT_SITES.includes(s.ctaOcclusion) && minutesToHours(s.minutesSinceLKAW) <= 24));

/* =========================
 * NIHSS summary pick + classify widget
 * ========================= */
function NIHSSSummary({ detail, onChoose }) {
  if (!detail) return null;

  const rows = [
    ["Facial", detail.facial],
    ["Gaze/Eyes", detail.gaze],
    ["Visual fields", detail.visual],
    ["Left arm", detail.armL],
    ["Right arm", detail.armR],
    ["Left leg", detail.legL],
    ["Right leg", detail.legR],
    ["Language", detail.language],
    ["Dysarthria", detail.dysarthria],
    ["Ataxia", detail.ataxia],
    ["Sensory", detail.sensory],
  ];

  return (
    <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="text-sm font-semibold">Neurologic exam summary (NIHSS)</div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300 sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-2 py-1"
          >
            <span>{k}</span>
            <span className="font-mono">{v}</span>
          </div>
        ))}
        <div className="col-span-2 sm:col-span-3 flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-2 py-1">
          <span>Total NIHSS</span>
          <span className="font-mono font-bold">{detail.total}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() => onChoose("non")}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm font-semibold hover:bg-slate-800"
        >
          Non-disabling
        </button>
        <button
          onClick={() => onChoose("disabling")}
          className="rounded-lg border border-emerald-700 bg-emerald-900/40 px-3 py-1.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-900/60"
        >
          Disabling
        </button>
      </div>
    </div>
  );
}

/* =========================
 * Case generator (learning/realistic)
 * ========================= */
function generateCase(mode = "learning") {
  const age = randInt(38, 92);
  const sex = choice(["male", "female"]);

  let onsetType = "known";
  let minutesSinceLKAW = randInt(10, 270);
  let type = "Ischemic";
  let baselineMrs = randomBaselineMrs();
  let ctaOcclusion = null;
  let dominantSide = Math.random() < 0.9 ? "right" : "left";
  let affectedSide = choice(["left", "right"]);

  let doac = Math.random() < 0.1;
  let recentGISurgery = Math.random() < 0.05;
  let recentStroke30d = Math.random() < 0.06;
  let glucose = Math.random() < 0.08 ? randInt(40, 59) : randInt(60, 280);

  let perfMismatch = false;
  let ischemicVolume = 0;

  if (mode === "learning") {
    const r = Math.random();
    baselineMrs = randomBaselineMrs();
    doac = recentGISurgery = recentStroke30d = false;
    glucose = randInt(80, 180);

    if (r < 0.15) {
      type = "ICH";
      ctaOcclusion = null;
      onsetType = "known";
      minutesSinceLKAW = randInt(30, 1440);
    } else if (r < 0.17) {
      type = "SAH";
      ctaOcclusion = null;
      onsetType = "known";
      minutesSinceLKAW = randInt(30, 1440);
    } else if (r < 0.20) {
      type = "SDH";
      ctaOcclusion = null;
      onsetType = "known";
      minutesSinceLKAW = randInt(30, 1440);
    } else {
      type = "Ischemic";
      const hasLVO = Math.random() < 0.66;
      if (hasLVO) {
        ctaOcclusion = pickOcclusion();
        minutesSinceLKAW = ctaOcclusion === "MCA - distal M2" ? randInt(361, 1200) : randInt(30, 1200);
        perfMismatch = Math.random() < 0.5;
        ischemicVolume = randInt(30, 160);
      } else {
        ctaOcclusion = null;
        onsetType = choice(["known", "wake-up", "unknown"]);
        minutesSinceLKAW = onsetType === "known" ? randInt(60, 540) : randInt(240, 960);
        ischemicVolume = randInt(10, 80);
      }
    }
  } else {
    const r = Math.random();
    if (r < 0.7) {
      type = "Mimic";
      ctaOcclusion = null;
      onsetType = choice(["known", "wake-up", "unknown"]);
      minutesSinceLKAW =
        onsetType === "known" ? randInt(30, 600) : onsetType === "wake-up" ? randInt(360, 1440) : randInt(120, 1440);
    } else if (r < 0.73) {
      type = "SAH";
      onsetType = "known";
      minutesSinceLKAW = randInt(30, 1440);
    } else if (r < 0.88) {
      type = "Ischemic";
      ctaOcclusion = pickOcclusion();
      minutesSinceLKAW = ctaOcclusion === "MCA - distal M2" ? randInt(361, 1200) : randInt(30, 1200);
      perfMismatch = Math.random() < 0.5;
      ischemicVolume = randInt(30, 160);
    } else if (r < 0.93) {
      type = "Ischemic";
      onsetType = "known";
      minutesSinceLKAW = randInt(10, 270);
      doac = Math.random() < 0.05;
      recentGISurgery = Math.random() < 0.03;
      recentStroke30d = Math.random() < 0.03;
      glucose = randInt(70, 220);
    } else {
      if (Math.random() < 0.6) type = "ICH";
      else {
        type = "Ischemic";
        ctaOcclusion = Math.random() < 0.86 ? pickOcclusion() : null;
      }
      onsetType = choice(["known", "wake-up", "unknown"]);
      minutesSinceLKAW = onsetType === "known" ? randInt(60, 1440) : randInt(240, 1440);
      if (ctaOcclusion === "MCA - distal M2") {
        onsetType = "known";
        if (minutesSinceLKAW <= 360) minutesSinceLKAW = randInt(361, 1200);
      }
    }
  }

  if (mode === "learning" && Math.random() < 0.15) {
    const k = choice(["doac", "recentGISurgery", "recentStroke30d", "glc"]);
    if (k === "glc") glucose = randInt(40, 59);
    else if (k === "doac") doac = true;
    else if (k === "recentGISurgery") recentGISurgery = true;
    else recentStroke30d = true;
  }

  let mimicBias = null;
  if (type === "Mimic" && Math.random() < 0.7) mimicBias = "non";

  let nihssDetail = calcNIHSS({
    type,
    affectedSide,
    dominantSide,
    site: ctaOcclusion,
    mimicBias,
  });

  if (type === "Mimic" && mimicBias === "non" && isDisablingDeficit(nihssDetail, dominantSide)) {
    nihssDetail = calcNIHSS({ type, affectedSide, dominantSide, site: ctaOcclusion, mimicBias: "non" });
  }

  if (type === "Ischemic" && ischemicVolume === 0) {
    perfMismatch = Math.random() < (ctaOcclusion ? 0.55 : 0.3);
    ischemicVolume = randInt(20, ctaOcclusion ? 180 : 90);
  }

  let ctpTmax6 = 0,
    ctpRcbf30 = 0;
  if (type === "Ischemic") {
    ctpTmax6 = ischemicVolume;
    const ratio = perfMismatch ? choice([1.8, 2.1, 2.4, 2.8, 3.0]) : choice([1.0, 1.2, 1.3, 1.4, 1.5]);
    ctpRcbf30 = Math.max(1, Math.round(ctpTmax6 / ratio));
  }

  const notes = [];
  const activator = Math.random() < 0.75 ? "EMS" : "Inpatient staff";
  if (doac) notes.push("recent DOAC ingestion within 48h");
  if (recentGISurgery) notes.push("GI surgery within the past week");
  if (recentStroke30d) notes.push("prior stroke within the last month");
  if (glucose < 60) notes.push("fingerstick glucose " + glucose + " mg/dL");

  const extraEMS = notes.length ? "\n" + activator + " adds: " + notes.join("; ") + "." : "";
  const mrs5 = baselineMrs === 5 ? "\n" + activator + " reports the patient has severe baseline disability (mRS 5)." : "";

  const d = nihssDetail;
  const side = affectedSide;
  const arm = (side === "left" ? d.armL : d.armR) > 0;
  const leg = (side === "left" ? d.legL : d.legR) > 0;

  const hints = [];
  if (arm && leg) hints.push(side + "-sided weakness");
  else if (arm) hints.push(side + " arm weakness");
  else if (leg) hints.push(side + " leg weakness");
  if (d.language > 0) hints.push("word-finding difficulty");
  if (d.dysarthria > 0) hints.push("slurred speech");
  if (d.facial > 0) hints.push(side + " facial droop");
  if (d.gaze > 0) hints.push("gaze deviation");
  if (d.visual > 0) hints.push("visual field deficit");
  if (d.ataxia > 0) hints.push("incoordination");
  if (d.sensory > 0) hints.push("numbness");

  const hint = hints.slice(0, 2).join(" and ");

  let sbp = type === "ICH" ? randInt(180, 230) : randInt(100, 185);
  let dbp = type === "ICH" ? randInt(95, 130) : randInt(55, sbp < 140 ? 99 : 110);

  const extra = hint ? " for deficits of " + hint : "";
  const lka =
    onsetType === "known"
      ? Math.round(minutesToHours(minutesSinceLKAW) * 10) / 10 + " hours ago"
      : onsetType === "wake-up"
      ? "wake-up stroke (unknown exact time)"
      : "unknown";

  const stem =
    activator +
    " activates a stroke code for a " +
    age +
    "-year-old " +
    sex +
    extra +
    ".\nLast known awake & well: " +
    lka +
    ".\nArrival vitals: BP " +
    sbp +
    "/" +
    dbp +
    ", HR " +
    randInt(56, 118) +
    ", SpO2 " +
    randInt(92, 100) +
    "%." +
    mrs5 +
    extraEMS +
    "\nYou are at bedside with the team.";

  return {
    mode,
    age,
    sex,
    onsetType,
    minutesSinceLKAW,
    baselineMrs,
    type,
    ctaOcclusion,
    dominantSide,
    affectedSide,
    nihssDetail,
    doac,
    glucose,
    recentGISurgery,
    recentStroke30d,
    perfMismatch,
    ischemicVolume,
    ctpTmax6,
    ctpRcbf30,
    aspects: null,
    mriMismatch: Math.random() < 0.55,
    actions: {
      examine: false,
      ctNonCon: false,
      cta: false,
      ctp: false,
      mri: false,
      tnk: false,
      evt: false,
      admitted: null,
      cancel: false,
    },
    userClass: null,
    score: 100,
    finished: false,
    stem,
    sbp,
    dbp,
  };
}

/* =========================
 * Actions panel
 * ========================= */
function ActionsPanel({ onAction, disabled, disabledMap, hideSubs }) {
  const ACTIONS = {
    examine: ["Examine", "NIHSS, glucose, HPI, LKAW"],
    ctNonCon: ["CT Head (Non-con)", "Rule out hemorrhage + ASPECTS"],
    cta: ["CTA Head & Neck", "Identify occlusion & site"],
    ctp: ["CT Perfusion", ">6h; distal M2 guidance"],
    mri: ["Hyperacute MRI (DWI/FLAIR)", "Wake-up/Unknown if no LVO"],
    tnk: ["Administer TNK", "Known <=4.5h or MRI mismatch"],
    evt: ["Endovascular Thrombectomy", "By site & time"],
    floor: ["Admit to Floor", "Stroke unit care"],
    nicu: ["Admit to NeuroICU", "Higher acuity"],
    cancel: ["Cancel Code Stroke", "End code if criteria met"],
  };

  const baseBtn = "rounded-xl px-4 py-3 text-left font-semibold disabled:opacity-60 border";
  const neutral = "border-slate-700 bg-slate-900/70 text-slate-100 hover:bg-slate-800/70";
  const green = "border-emerald-700 bg-emerald-900/40 text-emerald-200 hover:bg-emerald-900/60";
  const blue = "border-sky-700 bg-sky-900/40 text-sky-200 hover:bg-sky-900/60";

  const kindClass = {
    tnk: green,
    evt: green,
    floor: blue,
    nicu: blue,
    cancel: "border-rose-700 bg-rose-900/40 text-rose-200 hover:bg-rose-900/60",
  };

  const renderButton = (key) => {
    const [title, subtitle] = ACTIONS[key];
    const color = kindClass[key] || neutral;
    const size =
      key === "mri"
        ? " px-2.5 py-2 w-[70%] max-w-[360px] text-sm"
        : key === "cancel"
        ? " px-2 py-1.5 w-[60%] max-w-[300px] text-sm"
        : "";

    return (
      <button
        key={key}
        onClick={() => onAction(key)}
        disabled={disabled || !!disabledMap[key]}
        className={baseBtn + " " + color + size}
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

      <div className="col-span-2 flex justify-center">{renderButton("mri")}</div>

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
 * Snapshot widget
 * ========================= */
function CaseSnapshot({ s }) {
  const fmtMins = (m) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return h ? `${h}h ${mm}m` : `${mm}m`;
  };

  const onset =
    s.onsetType === "known"
      ? `${fmtMins(s.minutesSinceLKAW)} since LKAW`
      : s.onsetType === "wake-up"
      ? "Wake-up stroke (unknown exact time)"
      : "Unknown LKAW";

  const cx = [];
  if (s.doac) cx.push("DOAC <=48h");
  if (s.recentGISurgery) cx.push("GI surgery 7d");
  if (s.recentStroke30d) cx.push("Prior stroke 30d");
  if (s.glucose < 60) cx.push(`Hypoglycemia (${s.glucose})`);

  const perf =
    s.type === "Ischemic"
      ? `TMax>6s ${s.ctpTmax6}cc; rCBF<30% ${s.ctpRcbf30}cc (ratio ${(s.ctpTmax6 / Math.max(1, s.ctpRcbf30)).toFixed(
          1
        )})`
      : "n/a";

  const items = [
    ["Age / Sex", `${s.age} / ${s.sex}`],
    ["Onset", onset],
    ["Baseline mRS", s.baselineMrs],
    ...(cx.length ? [["Contraindications", cx.join(", ")]] : []),
    ...(s.actions.examine ? [["NIHSS total", s.nihssDetail.total], ["Glucose", `${s.glucose} mg/dL`]] : []),
    ...(s.actions.ctNonCon
      ? [
          [
            "CT Head",
            s.type === "Ischemic" || s.type === "Mimic"
              ? `No hemorrhage${s.aspects !== null ? ", ASPECTS " + s.aspects : ""}`
              : s.type + " on CT",
          ],
        ]
      : []),
    ...(s.actions.cta ? [["CTA", s.type === "Ischemic" ? (s.ctaOcclusion ? s.ctaOcclusion : "No occlusion") : "n/a"]] : []),
    ...(s.actions.ctp ? [["CT Perfusion", perf]] : []),
    ...(s.actions.mri ? [["Hyperacute MRI", s.mriMismatch ? "DWI/FLAIR mismatch" : "No mismatch"]] : []),
    ...(s.actions.tnk ? [["TNK", "Given"]] : []),
    ...(s.actions.evt ? [["EVT", "Performed"]] : []),
    ...(s.actions.cancel || s.actions.admitted
      ? [["Disposition", s.actions.cancel ? "Code cancelled" : s.actions.admitted === "nicu" ? "NeuroICU" : "Floor"]]
      : []),
  ];

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map(([k, v]) => (
        <InfoChip key={k} label={k} value={String(v)} />
      ))}
    </div>
  );
}

/* =========================
 * Citations
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
      <a
        key={url + idx}
        href={url}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-sky-300 break-all"
      >
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
        <button
          onClick={onX}
          className="absolute right-2 top-2 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300"
        >
          Close
        </button>
        <h3 className="text-base font-semibold pr-8">citations</h3>

        <ul className="mt-3 list-disc space-y-3 pl-5 text-sm leading-relaxed text-slate-300 select-text">
          {items.map((entry, i) => (
            <li key={i} className="break-words">
              {renderWithLinks(entry)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

/* =========================
 * Main App
 * ========================= */
function App() {
  const { toasts, push } = useToasts();

  const [mode, setMode] = useState("learning");
  const [data, setData] = useState(() => generateCase(mode));
  const [log, setLog] = useState([]);
  const [revealScore, setRevealScore] = useState(false);

  const [pendingAdmit, setPendingAdmit] = useState(null);
  const [pendingMode, setPendingMode] = useState(null);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [showCitations, setShowCitations] = useState(false);

  const addLog = (kind, text) =>
    setLog((l) => [{ id: uid(), kind, text, t: Date.now() }, ...l]);

  const reset = () => {
    const c = generateCase(mode);
    setData(c);
    setLog([]);
    setRevealScore(false);
    setPendingAdmit(null);
    push("New case ready", "Mode: " + mode + ". Start with an exam, then image appropriately.");
  };

  const askMode = (n) => {
    if (n !== mode) setPendingMode(n);
  };

  const applyMode = (n) => {
    setMode(n);
    const c = generateCase(n);
    setData(c);
    setLog([]);
    setRevealScore(false);
    setPendingAdmit(null);
    push("Mode switched", "Now in " + n + " mode. New case generated.");
  };

  const commitAdmit = (admitTo) => {
    if (data.finished) {
      push("Case finished", "Start a new case to continue.", "warn");
      return;
    }
    const s = { ...data, actions: { ...data.actions, admitted: admitTo } };
    const ok = isAdmitAppropriate(s, admitTo);
    const label = admitTo === "nicu" ? "NeuroICU" : "Floor";

    s.score = clamp(s.score + (ok ? 4 : -10));
    addLog(ok ? "good" : "bad", ok ? label + " appropriate." : label + " suboptimal for condition.");
    push("Disposition selected", label + " chosen. Case will be graded.", ok ? "good" : "warn", 4200);
    setPendingAdmit(null);
    finishCase(s);
  };

  const commitCancel = () => {
    if (data.finished) {
      push("Case finished", "Start a new case to continue.", "warn");
      setPendingCancel(false);
      return;
    }
    const s = { ...data, actions: { ...data.actions, cancel: true } };
    const disabling = isDisablingDeficit(s.nihssDetail, s.dominantSide);
    const ok =
      isNonAcute(s) ||
      (s.userClass !== null ? s.userClass === "non" : !disabling) ||
      s.type === "Mimic";
    s.finished = true;

    if (ok) {
      s.score = clamp(s.score + 8);
      push(
        "Code stroke cancelled",
        "Cancelled for " +
          [isNonAcute(s) && ">24h", s.userClass === "non" && "non-disabling", s.type === "Mimic" && "non-neurologic"]
            .filter(Boolean)
            .join(", ") +
          ".",
        "good"
      );
      addLog("good", "Cancelled appropriately.");
    } else {
      s.score = clamp(s.score - 16);
      push(
        "Cancelled prematurely",
        "Patient remains acute, disabling, and neurologic - continue evaluation/treatment.",
        "bad"
      );
      addLog("bad", "Cancelled prematurely.");
    }

    setData(s);
    setPendingCancel(false);
  };

  const doAction = (actionKey) => {
    if (data.finished) {
      push("Case finished", "Start a new case to continue.", "warn");
      return;
    }

    const s = { ...data, actions: { ...data.actions } };

    const penalize = (delta, title, msg) => {
      s.score = clamp(s.score - delta);
      push(title, msg, "bad");
      addLog("bad", msg);
    };

    const reward = (delta, title, msg) => {
      s.score = clamp(s.score + delta);
      push(title, msg, "good");
      addLog("good", msg);
    };

    switch (actionKey) {
      case "examine":
        if (s.actions.examine) {
          penalize(2, "Already examined", "Repeated action.");
          break;
        }
        s.actions.examine = 1;
        reward(3, "Exam complete", `NIHSS ${s.nihssDetail.total}, glucose ${s.glucose} mg/dL. Please classify as disabling or non-disabling.`);
        break;

      case "ctNonCon":
        if (s.actions.ctNonCon) {
          penalize(2, "CT repeated", "Duplicate non-contrast CT.");
          break;
        }
        if (!s.actions.examine) penalize(3, "Premature imaging", "Rapid exam first helps triage and consent.");
        s.actions.ctNonCon = 1;

        if (s.type === "ICH" || s.type === "SAH" || s.type === "SDH") {
          reward(4, "CT done", `${s.type} detected. TNK and EVT are contraindicated.`);
          push("Recommended", "Admit to NeuroICU and manage accordingly.", "info", 2600);
        } else {
          const aspects = calcASPECTS(s.onsetType, s.minutesSinceLKAW, s.ctaOcclusion, s.type);
          s.aspects = aspects.score;
          reward(4, "CT done", "No hemorrhage identified. ASPECTS " + (aspects.score != null ? aspects.score : "n/a") + ".");
        }
        break;

      case "cta":
        if (s.actions.cta) {
          penalize(2, "CTA repeated", "Duplicate CTA.");
          break;
        }
        if (!s.actions.ctNonCon) penalize(5, "Out of sequence", "Perform non-contrast CT before CTA.");
        s.actions.cta = 1;

        if (s.type !== "Ischemic") {
          penalize(4, "CTA low yield", "Primary hemorrhage or mimic - CTA rarely helpful.");
        } else if (s.ctaOcclusion) {
          reward(6, "CTA result", "Occlusion: " + s.ctaOcclusion + ".");
          const h = minutesToHours(s.minutesSinceLKAW);
          if (h > 6 && s.ctaOcclusion === "MCA - distal M2")
            push("Consider CTP", ">6h LKAW and distal M2 - obtain CTP to guide EVT (large territory or favorable ratio).", "info", 4600);
        } else {
          reward(4, "CTA result", "No proximal occlusion identified.");
        }
        if (isHyperacuteMRIAllowed(s)) push("Next step", "Hyperacute MRI appropriate for TNK evaluation.", "info", 5200);
        break;

      case "ctp": {
        const h = minutesToHours(s.minutesSinceLKAW);
        if (h < 6) {
          penalize(6, "Too early for CTP", "CT perfusion should not be obtained prior to 6 hours from LKAW.");
          break;
        }
        if (s.actions.ctp) {
          penalize(2, "CTP repeated", "Duplicate perfusion imaging.");
          break;
        }
        if (!s.actions.ctNonCon) penalize(4, "Out of sequence", "Perform non-contrast CT first.");

        s.actions.ctp = 1;

        if (s.type !== "Ischemic") {
          penalize(4, "CTP not indicated", "Perfusion imaging does not apply to hemorrhage or mimic.");
        } else if (s.ctaOcclusion === "MCA - distal M2") {
          const ok = s.ischemicVolume > 100 || s.perfMismatch;
          if (ok) {
            reward(
              6,
              "CTP favorable",
              `TMax>6s ${s.ctpTmax6}cc; rCBF<30% ${s.ctpRcbf30}cc (ratio ${(s.ctpTmax6 / Math.max(1, s.ctpRcbf30)).toFixed(
                1
              )}). Supports EVT for distal M2.`
            );
          } else {
            addLog(
              "info",
              `CTP unfavorable: TMax>6s ${s.ctpTmax6}cc; rCBF<30% ${s.ctpRcbf30}cc (ratio ${(s.ctpTmax6 / Math.max(
                1,
                s.ctpRcbf30
              )).toFixed(1)}).`
            );
            push("CTP result", "Not favorable for distal M2 intervention.", "warn", 4000);
          }
        } else {
          addLog(
            "info",
            `CTP recorded: TMax>6s ${s.ctpTmax6}cc; rCBF<30% ${s.ctpRcbf30}cc (ratio ${(s.ctpTmax6 / Math.max(
              1,
              s.ctpRcbf30
            )).toFixed(1)}).`
          );
        }
        if (isHyperacuteMRIAllowed(s)) push("Next step", "Hyperacute MRI appropriate for TNK evaluation.", "info", 5200);
        break;
      }

      case "mri":
        if (s.actions.mri) {
          penalize(2, "MRI repeated", "Duplicate MRI.");
          break;
        }
        if (!isHyperacuteMRIAllowed(s)) {
          penalize(4, "MRI not available", "Hyperacute MRI is reserved for wake-up/unknown per rules.");
          break;
        }
        s.actions.mri = 1;
        if (s.mriMismatch) {
          addLog("good", "MRI: DWI/FLAIR mismatch present.");
          push("MRI result", "Mismatch present - consider TNK if otherwise eligible.", "good", 4800);
        } else {
          addLog("info", "MRI: No DWI/FLAIR mismatch.");
          push("MRI result", "No mismatch - TNK not indicated.", "warn", 4800);
        }
        break;

      case "tnk":
        if (s.actions.tnk) {
          penalize(3, "TNK already given", "Duplicate thrombolysis is unsafe.");
          break;
        }
        if (!s.actions.ctNonCon) penalize(8, "Unsafe sequence", "Rule out hemorrhage on non-contrast CT before thrombolysis.");

        if (s.type !== "Ischemic") {
          penalize(40, "Contraindicated", "Hemorrhage or mimic present. Do not administer TNK.");
          s.actions.tnk = 1;
          break;
        }
        if (!s.userClass) {
          penalize(5, "Classify first", "Classify deficits as Disabling vs Non-disabling before TNK.");
          break;
        }
        if (!isTNKIndicated(s)) {
          const list = contraindicationLabels(s);
          if (list.length) {
            penalize(18, "Contraindicated", "Contraindication present: " + list.join(", ") + ".");
            s.actions.tnk = 1;
            break;
          }
          penalize(18, "TNK not indicated", "Known <=4.5h or wake-up/unknown + MRI mismatch required.");
          s.actions.tnk = 1;
          break;
        }
        s.actions.tnk = 1;
        reward(10, "TNK administered", "Appropriate selection.");
        break;

      case "evt":
        if (s.actions.evt) {
          penalize(3, "EVT already performed", "Duplicate EVT not possible.");
          break;
        }
        if (!s.actions.ctNonCon) penalize(8, "Unsafe sequence", "Perform non-contrast CT first.");
        if (!s.actions.cta) penalize(6, "Missing CTA", "Identify occlusion and site on CTA before EVT.");
        if (s.type !== "Ischemic") {
          penalize(40, "Contraindicated", "Hemorrhage or mimic - EVT not indicated.");
          s.actions.evt = 1;
          break;
        }
        if (s.baselineMrs === 5) {
          penalize(15, "Not indicated (mRS 5)", "Baseline mRS 5 - no thrombectomy indicated.");
          s.actions.evt = 1;
          break;
        }
        if (!s.ctaOcclusion) {
          penalize(18, "No target", "No occlusion identified on CTA.");
          s.actions.evt = 1;
          break;
        }
        {
          const h2 = minutesToHours(s.minutesSinceLKAW);
          if (s.ctaOcclusion === "MCA - distal M2" && h2 > 6 && (!s.actions.ctp || !(s.ischemicVolume > 100 || s.perfMismatch))) {
            penalize(16, "Insufficient criteria", "Distal M2 >6h requires favorable CTP (large territory or favorable ratio). ");
            s.actions.evt = 1;
            break;
          }
          if (!isEVTIndicated(s)) {
            penalize(16, "Site/time not appropriate", "EVT not indicated for " + s.ctaOcclusion + " at this time.");
            s.actions.evt = 1;
            break;
          }
        }
        s.actions.evt = 1;
        reward(12, "EVT performed", "Appropriate candidate treated.");
        break;

      case "floor":
      case "nicu":
        if (s.actions.admitted) {
          penalize(2, "Disposition chosen", "Duplicate disposition.");
          break;
        }
        setPendingAdmit(actionKey);
        return;

      case "cancel":
        if (s.actions.cancel) {
          penalize(2, "Already cancelled", "Code already cancelled.");
          break;
        }
        setPendingCancel(true);
        return;

      default:
        break;
    }

    setData(s);
  };

  const finishCase = (incoming) => {
    if (!incoming && data.finished) {
      push("Already graded", "Start a new case to continue.", "warn");
      return;
    }

    const s = incoming ? { ...incoming } : { ...data };
    const required = new Set(["examine", "ctNonCon"]);

    if (s.type === "Ischemic") {
      if (s.ctaOcclusion) required.add("cta");
      if (isTNKIndicated(s)) required.add("tnk");
      if (isEVTIndicated(s)) required.add("evt");
    } else if (s.type === "ICH" || s.type === "SAH" || s.type === "SDH") {
      required.add("nicu");
    }

    if (!s.actions.admitted && !s.actions.cancel) required.add("disposition");

    const missed = [];
    for (const step of required) {
      if (step === "examine" && !s.actions.examine) missed.push("Examined patient");
      if (step === "ctNonCon" && !s.actions.ctNonCon) missed.push("Obtained non-contrast CT");
      if (step === "cta" && !s.actions.cta) missed.push("Obtained CTA");
      if (step === "tnk" && !s.actions.tnk) missed.push("Administered TNK when indicated");
      if (step === "evt" && !s.actions.evt) missed.push("Performed EVT when indicated");
      if (step === "disposition" && !s.actions.admitted && !s.actions.cancel) missed.push("Selected disposition or cancelled code appropriately");
    }

    let penalty = 0;
    if (missed.length) penalty += Math.min(60, missed.length * 10);
    if ((s.type === "ICH" || s.type === "SAH" || s.type === "Mimic") && (s.actions.tnk || s.actions.evt)) penalty += 25;

    if (s.type === "Ischemic") {
      if (s.actions.tnk && !isTNKIndicated(s)) penalty += 15;
      if (s.actions.evt && !isEVTIndicated(s)) penalty += 15;
    }

    const finalScore = clamp(s.score - penalty);
    const grade = gradeLetter(finalScore);
    const summary = [missed.length ? "Missed steps: " + missed.join("; ") + "." : "All essential steps completed."];

    push("Case graded: " + grade, summary.join(" "), grade[0] === "A" || grade[0] === "B" ? "good" : grade[0] === "C" ? "warn" : "bad", 6600);
    addLog("info", "Final summary -> " + summary.join(" "));
    setData({ ...s, score: finalScore, finished: true });
  };

  const chooseClass = (val) => {
    const ok =
      (val === "disabling" && isDisablingDeficit(data.nihssDetail, data.dominantSide)) ||
      (val === "non" && !isDisablingDeficit(data.nihssDetail, data.dominantSide));

    setData((d) => ({ ...d, userClass: val, score: clamp(d.score + (ok ? 4 : -5)) }));
    push("Classification recorded", "You chose " + (val === "disabling" ? "Disabling" : "Non-disabling") + ".", ok ? "good" : "warn");
    addLog(ok ? "good" : "bad", ok ? "Classification correct: " + val + "." : "Classification likely incorrect: " + val + ".");
  };

  // Disable states for buttons
  const disabledMap = (() => {
    const A = data.actions || {};
    const dm = {};
    for (const k of ["examine", "ctNonCon", "cta", "ctp", "mri", "tnk", "evt", "cancel"]) dm[k] = !!A[k];
    dm.mri = !!A.mri || !isHyperacuteMRIAllowed(data);
    dm.floor = !!A.admitted || data.finished || !!A.cancel;
    dm.nicu = dm.floor;
    return dm;
  })();

  const admitLbl = pendingAdmit === "nicu" ? "NeuroICU" : "Floor";
  const admitTitle = "Admit to " + admitLbl + "?";
  const admitMsg = "Admit to " + admitLbl + " now? This will end and grade the case.";

  const modeMsg =
    pendingMode === "learning"
      ? "Learning mode: fewer mimics and more intervention-eligible cases. Switching resets the current case. Continue?"
      : "Realistic mode: more mimics and contraindications. Switching resets the current case. Continue?";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100">
      <Toasts items={toasts} />

      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/70 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <h1 className="text-lg font-bold">🤖🧠 StrokeBot Simulator 7070 v0.5</h1>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
            <span>Mode:</span>
            <div className="inline-flex items-center gap-2">
              <button
                onClick={() => askMode("learning")}
                className={"rounded-lg border px-3 py-1 " + (mode === "learning" ? BUTTON.on : BUTTON.off)}
              >
                Learning
              </button>
              <button
                onClick={() => askMode("realistic")}
                className={"rounded-lg border px-3 py-1 " + (mode === "realistic" ? BUTTON.on : BUTTON.off)}
              >
                Realistic
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-4 p-4 lg:grid-cols-2">
        <section className={PANEL}>
          <h2 className="text-base font-semibold">Case</h2>
          <pre className={"mt-2 whitespace-pre-wrap " + BLOCK + " p-3 text-sm leading-relaxed"}>{data.stem}</pre>

          {data.actions.examine && data.userClass === null && (
            <NIHSSSummary detail={data.nihssDetail} onChoose={chooseClass} />
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={reset} className={BUTTON.base}>
              New Case
            </button>
            <button onClick={() => finishCase()} disabled={data.finished} className={BUTTON.base}>
              Finish Case
            </button>
            {data.finished && (
              <button onClick={() => setRevealScore((v) => !v)} className={BUTTON.accent}>
                {revealScore ? "Hide Score" : "Reveal Score"}
              </button>
            )}
          </div>

          {data.finished && revealScore && (
            <div className="mt-3 inline-flex items-center gap-3 rounded-2xl border border-violet-800 bg-violet-900/30 px-3 py-2 text-sm">
              <span className="text-slate-300">Grade:</span>
              <span className="text-xl font-extrabold text-violet-200">{gradeLetter(data.score)}</span>
            </div>
          )}
        </section>

        <section className={PANEL + " flex flex-col lg:row-span-2"}>
          <h2 className="text-base font-semibold">Actions</h2>
          <ActionsPanel onAction={doAction} disabled={data.finished} disabledMap={disabledMap} hideSubs={mode === "realistic"} />

          <h2 className="mt-4 text-base font-semibold">Log</h2>
          <div className="mt-2 flex-1 min-h-0 overflow-auto rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm">
            {log.length === 0 ? (
              <div className="text-slate-400">No activity yet.</div>
            ) : (
              log.map((r) => (
                <div key={r.id} className="border-b border-dashed border-slate-800 py-2 last:border-b-0">
                  <div className="flex items-center gap-2">
                    <Tag kind={r.kind}>{r.kind.toUpperCase()}</Tag>
                    <span className="text-slate-200">{r.text}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={PANEL}>
          <h2 className="text-base font-semibold">Case Snapshot</h2>
          <CaseSnapshot s={data} />
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-6 -mt-2 text-center">
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <span>designed by micah etter, md</span>
          <span>•</span>
          <span>educational use only</span>
          <span>•</span>
          <button onClick={() => setShowCitations(true)} className="underline hover:text-slate-300">
            citations
          </button>
        </div>
      </footer>

      <CitationsModal open={showCitations} onX={() => setShowCitations(false)} />

      {/* Admission dialog */}
      <ConfirmDialog
        open={!!pendingAdmit}
        title={"Admit to " + (pendingAdmit === "nicu" ? "NeuroICU" : "Floor") + "?"}
        message={"Admit to " + (pendingAdmit === "nicu" ? "NeuroICU" : "Floor") + " now? This will end and grade the case."}
        ok="Yes, admit"
        onX={() => {
          setPendingAdmit(null);
          push("Admission cancelled", "No changes made.", "warn", 2000);
        }}
        onOK={() => {
          const a = pendingAdmit;
          setPendingAdmit(null);
          commitAdmit(a);
        }}
      />

      {/* Mode switch dialog */}
      <ConfirmDialog
        open={!!pendingMode}
        title="Switch mode?"
        message={modeMsg}
        ok="Switch mode"
        cancel="Stay here"
        onX={() => setPendingMode(null)}
        onOK={() => {
          const m = pendingMode;
          setPendingMode(null);
          applyMode(m);
        }}
      />

      {/* Cancel code dialog */}
      <ConfirmDialog
        open={!!pendingCancel}
        title="Cancel code stroke?"
        message="This will end the case now and no stroke intervention will be performed. Continue?"
        ok="Yes, cancel"
        cancel="Keep code active"
        onX={() => setPendingCancel(false)}
        onOK={commitCancel}
      />
    </div>
  );
}

/* =========================
 * Regression checks (keep lightweight)
 * ========================= */
try {
  assert(gradeLetter(99) !== "S");
  assert(gradeLetter(100) === "S");
  assert(calcASPECTS("known", 120, "Basilar artery", "Ischemic").score === 10);
  assert(calcASPECTS("known", 120, "PCA - P1", "Ischemic").score === 10);

  const base = {
    type: "Ischemic",
    onsetType: "known",
    minutesSinceLKAW: 180,
    doac: false,
    userClass: "disabling",
    actions: { ctNonCon: true, cta: true, ctp: false, mri: false },
    ctaOcclusion: "MCA - M1",
    ischemicVolume: 0,
    perfMismatch: false,
    mriMismatch: false,
    baselineMrs: 0,
    recentGISurgery: false,
    recentStroke30d: false,
    glucose: 100,
    nihssDetail: { total: 8 },
  };

  assert(contraindicationLabels({ ...base, doac: true }).length > 0);
  assert(contraindicationLabels({ ...base, glucose: 55 }).length > 0);

  assert(isTNKIndicated({ ...base }) === true);
  assert(isTNKIndicated({ ...base, doac: true }) === false);
  assert(isTNKIndicated({ ...base, recentGISurgery: true }) === false);
  assert(isTNKIndicated({ ...base, recentStroke30d: true }) === false);
  assert(isTNKIndicated({ ...base, glucose: 55 }) === false);
  assert(
    isTNKIndicated({
      ...base,
      onsetType: "wake-up",
      ctaOcclusion: null,
      actions: { ...base.actions, mri: true },
      mriMismatch: true,
    }) === true
  );
  assert(
    isTNKIndicated({
      ...base,
      onsetType: "unknown",
      ctaOcclusion: null,
      actions: { ...base.actions, mri: true },
      mriMismatch: true,
    }) === true
  );

  assert(isEVTIndicated({ ...base }) === true);
  assert(isEVTIndicated({ ...base, baselineMrs: 5 }) === false);
  assert(
    isEVTIndicated({
      ...base,
      minutesSinceLKAW: 8 * 60,
      ctaOcclusion: "MCA - distal M2",
      actions: { ...base.actions, ctp: true },
      perfMismatch: true,
    }) === true
  );

  assert(isNonAcute({ onsetType: "unknown", minutesSinceLKAW: 60 }) === true);
  assert(isNonAcute({ onsetType: "known", minutesSinceLKAW: 23 * 60 }) === false);

  assert(
    isHyperacuteMRIAllowed({
      ...base,
      onsetType: "wake-up",
      ctaOcclusion: "PCA - P1",
      actions: { ...base.actions, cta: true },
      userClass: "disabling",
    }) === true
  );
  assert(
    isHyperacuteMRIAllowed({
      ...base,
      onsetType: "wake-up",
      ctaOcclusion: "MCA - M1",
      actions: { ...base.actions, cta: true },
      userClass: "disabling",
    }) === false
  );
  assert(
    isHyperacuteMRIAllowed({
      ...base,
      onsetType: "unknown",
      ctaOcclusion: null,
      actions: { ...base.actions, cta: true },
      userClass: "disabling",
    }) === true
  );

  const d1 = { facial: 0, gaze: 0, visual: 0, armL: 0, armR: 0, legL: 1, legR: 0, language: 0, dysarthria: 0, ataxia: 0, sensory: 0, total: 1 };
  const d2 = { facial: 1, gaze: 0, visual: 0, armL: 0, armR: 0, legL: 0, legR: 0, language: 0, dysarthria: 1, ataxia: 0, sensory: 1, total: 3 };
  const d3 = { facial: 0, gaze: 0, visual: 0, armL: 0, armR: 1, legL: 0, legR: 0, language: 0, dysarthria: 0, ataxia: 0, sensory: 0, total: 1 };
  const d4 = { facial: 2, gaze: 0, visual: 0, armL: 0, armR: 0, language: 0, legL: 0, legR: 0, dysarthria: 0, ataxia: 0, sensory: 0, total: 2 };

  assert(isDisablingDeficit(d1, "right") === true);
  assert(isDisablingDeficit(d2, "right") === false);
  assert(isDisablingDeficit(d3, "right") === true);
  assert(isDisablingDeficit(d4, "right") === true);

  for (let i = 0; i < 120; i++) {
    const s = pickOcclusion();
    assert(
      [
        "ICA",
        "MCA - M1",
        "MCA - proximal M2",
        "MCA - distal M2",
        "MCA - M3",
        "MCA - M4",
        "PCA - P1",
        "ACA - A1",
        "Basilar artery",
      ].includes(s)
    );
  }

  let seen = false;
  for (let i = 0; i < 200; i++) {
    const c = generateCase("realistic");
    if (c.ctaOcclusion === "MCA - distal M2") {
      assert(c.minutesSinceLKAW > 360);
      seen = true;
      break;
    }
  }
  if (!seen) {}

  const admitBase = {
    ...base,
    nihssDetail: { total: 12 },
    actions: { ...base.actions },
    type: "Ischemic",
  };
  assert(isAdmitAppropriate({ ...admitBase, actions: { ...admitBase.actions, tnk: true } }, "nicu") === true);
  assert(isAdmitAppropriate({ ...admitBase, nihssDetail: { total: 2 } }, "floor") === true);

  assert(typeof generateCase() === "object");
  assert(typeof generateCase("realistic") === "object");

  assert(calcASPECTS("known", 120, "MCA - M1", "ICH").score === null);
  assert(calcASPECTS("known", 120, "MCA - M1", "Mimic").score === 10);
  assert(isEVTIndicated({ ...base, ctaOcclusion: "MCA - distal M2", minutesSinceLKAW: 5 * 60 }) === true);
  assert(isHyperacuteMRIAllowed({ ...base, userClass: "non" }) === false);

  assert(generateCase().stem.includes("stroke code"));
  assert(/\n/.test(generateCase().stem));

  assert(calcASPECTS("known", 120, "PCA - P2", "Ischemic").score === 10);
  assert(calcASPECTS("known", 120, "MCA - M1", "SAH").score === null);

  assert(isTNKIndicated({ ...base, onsetType: "unknown", ctaOcclusion: null, actions: { ...base.actions, mri: false }, mriMismatch: false }) === false);
  assert(isEVTIndicated({ ...base, ctaOcclusion: "PCA - P1" }) === false);
  assert(isEVTIndicated({ ...base, ctaOcclusion: null }) === false);
  assert(isTNKIndicated({ ...base, actions: { ...base.actions, ctNonCon: false } }) === false);

  assert(calcASPECTS("known", 120, "Basilar artery", "Mimic").score === 10);
  assert(calcNIHSS({ type: "Ischemic", affectedSide: "left", dominantSide: "right", site: "Basilar artery" }).language === 0);
  assert(calcNIHSS({ type: "Ischemic", affectedSide: "left", dominantSide: "right", site: "PCA - P1" }).language === 0);

  {
    let I = 0,
      A1 = 0,
      D = 0,
      T = 400;
    for (let i = 0; i < T; i++) {
      const c = generateCase("learning");
      if (c.type === "ICH") I++;
      else if (c.type === "SAH") A1++;
      else if (c.type === "SDH") D++;
    }
    assert(I >= 30 && I <= 90);
    assert(A1 >= 2 && A1 <= 20);
    assert(D >= 4 && D <= 30);
    assert(T - (I + A1 + D) >= 250);
  }

  assert(isTNKIndicated({ ...base, type: "ICH" }) === false);
  assert(isTNKIndicated({ ...base, type: "SAH" }) === false);
  assert(isTNKIndicated({ ...base, type: "SDH" }) === false);
  assert(isEVTIndicated({ ...base, type: "ICH", ctaOcclusion: "MCA - M1" }) === false);
  assert(isAdmitAppropriate({ ...base, type: "SDH", nihssDetail: { total: 2 }, actions: { ...base.actions } }, "nicu") === true);

  {
    let got = 0;
    for (let i = 0; i < 800; i++) {
      const c = generateCase("learning");
      if (c.type === "ICH") {
        assert(c.sbp >= 180 && c.dbp >= 95);
        got++;
      }
    }
    assert(got >= 5);
  }

  {
    let w = 0,
      g0 = 0,
      N = 120;
    for (let i = 0; i < N; i++) {
      const d = calcNIHSS({ type: "SDH", affectedSide: "left", dominantSide: "right", site: null });
      if (d.armL > 0 || d.legL > 0) w++;
      if (d.gaze <= 1) g0++;
    }
    assert(w >= 70);
    assert(g0 >= 80);
  }

  {
    let I = 0,
      A2 = 0,
      D = 0,
      E = 0,
      M = 0,
      N = 1000;
    for (let i = 0; i < N; i++) {
      const c = generateCase("learning");
      if (c.type === "ICH") I++;
      else if (c.type === "SAH") A2++;
      else if (c.type === "SDH") D++;
      else if (c.type === "Ischemic") E++;
      else M++;
    }
    assert(M === 0);
    assert(I >= 130 && I <= 180);
    assert(A2 >= 10 && A2 <= 30);
    assert(D >= 20 && D <= 45);
    assert(E >= 720 && E <= 860);
  }

  {
    let K0 = 0,
      N = 1000;
    for (let i = 0; i < N; i++) {
      const c = generateCase("learning");
      if (c.doac || c.recentGISurgery || c.recentStroke30d || c.glucose < 60) K0++;
    }
    assert(K0 >= 120 && K0 <= 180);
  }

  {
    for (let i = 0; i < 800; i++) {
      const c = generateCase("learning");
      if (c.type !== "ICH" && c.sbp < 140) assert(c.dbp <= 99);
    }
    for (let i = 0; i < 800; i++) {
      const c = generateCase("realistic");
      if (c.type !== "ICH" && c.sbp < 140) assert(c.dbp <= 99);
    }
  }
} catch (e) {
  console.warn("tests", e);
}

/* =========================
 * Mount
 * ========================= */
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
