const BUILD_ID = "clean-2026-03-12";

const NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
const NOTE_META = {
  C4: { he: "דו", y: 170, info: "דו אמצעי" },
  D4: { he: "רה", y: 160, info: "רה מעל דו" },
  E4: { he: "מי", y: 150, info: "מי על הקו התחתון" },
  F4: { he: "פה", y: 140, info: "פה בין הקו 1 ל-2" },
  G4: { he: "סול", y: 130, info: "סול על הקו השני" },
  A4: { he: "לה", y: 120, info: "לה (440Hz)" },
  B4: { he: "סי", y: 110, info: "סי לפני דו גבוה" },
  C5: { he: "דו גבוה", y: 100, info: "דו באוקטבה גבוהה" }
};

const state = {
  mode: "tap",
  score: 0,
  combo: 0,
  hits: 0,
  stage: 1,
  notes: [],
  spawnMs: 0,
  speed: 190,
  hitY: 385,
  lastDetected: null
};

const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const hitsEl = document.getElementById("hits");
const stageEl = document.getElementById("stage");
const feedbackEl = document.getElementById("feedback");
const noteInfoEl = document.getElementById("noteInfo");
const staffNoteEl = document.getElementById("staffNote");
const staffLabelEl = document.getElementById("staffLabel");
const ledgerEl = document.getElementById("ledger");
const buildTagEl = document.getElementById("buildTag");
const versionFooterEl = document.getElementById("versionFooter");
const modeBtn = document.getElementById("toggleModeBtn");
const noteButtonsEl = document.getElementById("noteButtons");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let audioContext;
let analyser;

buildTagEl.textContent = `Build: ${BUILD_ID}`;
versionFooterEl.textContent = `Version: ${BUILD_ID}`;

function setFeedback(text, kind = "") {
  feedbackEl.textContent = text;
  feedbackEl.className = `feedback ${kind}`.trim();
}

function updateStats() {
  scoreEl.textContent = state.score;
  comboEl.textContent = `${state.combo}🔥`;
  hitsEl.textContent = state.hits;
  stageEl.textContent = state.stage;
}

function updateStaff(note) {
  const meta = NOTE_META[note];
  noteInfoEl.textContent = `${note} = ${meta.he} (${meta.info})`;
  staffLabelEl.textContent = `${note} / ${meta.he}`;
  staffNoteEl.setAttribute("cy", String(meta.y));
  const c4 = note === "C4";
  ledgerEl.setAttribute("x1", c4 ? "186" : "0");
  ledgerEl.setAttribute("x2", c4 ? "236" : "0");
  ledgerEl.setAttribute("y1", c4 ? "170" : "0");
  ledgerEl.setAttribute("y2", c4 ? "170" : "0");
  [...noteButtonsEl.children].forEach((b, i) => b.classList.toggle("active-note", NOTES[i] === note));
}

function initButtons() {
  noteButtonsEl.innerHTML = "";
  NOTES.forEach((note) => {
    const btn = document.createElement("button");
    btn.textContent = `${NOTE_META[note].he} · ${note}`;
    btn.addEventListener("click", () => tryPlayerHit(note, true));
    noteButtonsEl.appendChild(btn);
  });
}

function spawnNote() {
  const lane = Math.floor(Math.random() * NOTES.length);
  state.notes.push({ lane, note: NOTES[lane], y: -30, hit: false, phase: Math.random() * Math.PI * 2 });
}

function drawBackground(t) {
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, "#0b1634");
  g.addColorStop(1, "#203a6f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const laneW = canvas.width / NOTES.length;
  for (let i = 0; i < NOTES.length; i += 1) {
    const a = 0.08 + 0.05 * Math.sin(t / 260 + i);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(i * laneW, 0, laneW, canvas.height);
    ctx.fillStyle = "rgba(225,236,255,.85)";
    ctx.font = "bold 14px Rubik";
    ctx.fillText(NOTES[i], i * laneW + 12, 22);
  }

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, state.hitY);
  ctx.lineTo(canvas.width, state.hitY);
  ctx.stroke();
}

function drawNotes(t) {
  const laneW = canvas.width / NOTES.length;
  state.notes.forEach((n) => {
    const x = n.lane * laneW + laneW / 2;
    const r = 15;
    const aura = 3 + Math.sin(t / 150 + n.phase) * 2;
    ctx.fillStyle = n.hit ? "#00d68f" : "#6aa9ff";
    ctx.beginPath();
    ctx.arc(x, n.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = n.hit ? "rgba(0,214,143,.7)" : "rgba(140,188,255,.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, n.y, r + aura, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "12px Rubik";
    ctx.fillText(n.note, x - 15, n.y + 28);
  });
}

function updateGame(dt) {
  state.spawnMs += dt;
  const every = Math.max(560 - state.stage * 25, 260);
  if (state.spawnMs >= every) {
    spawnNote();
    state.spawnMs = 0;
  }

  const speed = state.speed + state.stage * 16;
  state.notes.forEach((n) => {
    n.y += speed * (dt / 1000);
  });

  state.notes = state.notes.filter((n) => {
    if (!n.hit && n.y > state.hitY + 35) {
      state.combo = 0;
      setFeedback(`פספוס: ${n.note}`, "bad");
      updateStats();
      return false;
    }
    return n.y < canvas.height + 60;
  });

  state.stage = Math.floor(state.hits / 10) + 1;
}

function tryHit(note) {
  const idx = state.notes.findIndex((n) => !n.hit && n.note === note && Math.abs(n.y - state.hitY) <= 30);
  if (idx < 0) return false;

  state.notes[idx].hit = true;
  state.score += 10 + Math.min(state.combo, 25);
  state.combo += 1;
  state.hits += 1;
  updateStaff(note);
  setFeedback(`פגיעה טובה: ${note} (${NOTE_META[note].he})`, "good");
  updateStats();
  setTimeout(() => {
    state.notes = state.notes.filter((n) => n !== state.notes[idx]);
  }, 90);
  return true;
}

function tryPlayerHit(note, fromTap) {
  const ok = tryHit(note);
  if (!ok && fromTap) {
    state.combo = 0;
    setFeedback(`עוד רגע: ${note} עדיין לא על הקו`, "bad");
    updateStats();
  }
}

function autoCorrelate(buffer, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i += 1) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return -1;

  let best = -1;
  let bestOffset = -1;
  for (let offset = 10; offset < 900; offset += 1) {
    let corr = 0;
    for (let i = 0; i < buffer.length - offset; i += 1) corr += Math.abs(buffer[i] - buffer[i + offset]);
    corr = 1 - corr / (buffer.length - offset);
    if (corr > best) {
      best = corr;
      bestOffset = offset;
    }
  }
  if (best < 0.85 || bestOffset < 0) return -1;
  return sampleRate / bestOffset;
}

function frequencyToNote(freq) {
  const noteNumber = 12 * (Math.log2(freq / 440)) + 69;
  const rounded = Math.round(noteNumber);
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${noteNames[rounded % 12]}${Math.floor(rounded / 12) - 1}`;
}

async function startMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    state.mode = "mic";
    modeBtn.textContent = "מצב: מיקרופון";
    setFeedback("מיקרופון הופעל בהצלחה", "good");
    detectPitch();
  } catch (_e) {
    setFeedback("לא הצלחנו להפעיל מיקרופון", "bad");
  }
}

function detectPitch() {
  if (!analyser || state.mode !== "mic") return;
  const buffer = new Float32Array(analyser.fftSize);
  const tick = () => {
    if (!analyser || state.mode !== "mic") return;
    analyser.getFloatTimeDomainData(buffer);
    const freq = autoCorrelate(buffer, audioContext.sampleRate);
    if (freq > 50 && freq < 1500) {
      const note = frequencyToNote(freq);
      if (NOTES.includes(note) && note !== state.lastDetected) {
        state.lastDetected = note;
        tryPlayerHit(note, false);
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}

function resetGame() {
  state.score = 0;
  state.combo = 0;
  state.hits = 0;
  state.stage = 1;
  state.spawnMs = 0;
  state.notes = [];
  updateStats();
  setFeedback("משחק חדש התחיל", "good");
}

function loop(now) {
  const dt = Math.min(now - loop.last, 40);
  loop.last = now;
  updateGame(dt);
  drawBackground(now);
  drawNotes(now);
  requestAnimationFrame(loop);
}
loop.last = performance.now();

// Input wiring
window.addEventListener("keydown", (e) => {
  const map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7 };
  const i = map[e.code];
  if (i !== undefined) tryPlayerHit(NOTES[i], true);
});

modeBtn.addEventListener("click", () => {
  state.mode = state.mode === "tap" ? "mic" : "tap";
  modeBtn.textContent = `מצב: ${state.mode === "tap" ? "מקלדת" : "מיקרופון"}`;
  setFeedback(state.mode === "tap" ? "מצב מקלדת פעיל" : "מצב מיקרופון פעיל");
  if (state.mode === "mic" && analyser) detectPitch();
});

document.getElementById("startMicBtn").addEventListener("click", startMicrophone);
document.getElementById("resetBtn").addEventListener("click", resetGame);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}

initButtons();
updateStaff("C4");
updateStats();
requestAnimationFrame(loop);
