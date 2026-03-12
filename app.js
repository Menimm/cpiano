const BUILD_ID = "hero-2026-03-12";
const NOTES = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];
const NOTE_INFO = {
  C4: { he: "דו", y: 170, text: "דו אמצעי - המקום הכי טוב להתחיל." },
  D4: { he: "רה", y: 160, text: "רה הוא צעד אחד מעל דו." },
  E4: { he: "מי", y: 150, text: "מי יושב על הקו התחתון של החמשה." },
  F4: { he: "פה", y: 140, text: "פה הוא בין הקו הראשון לשני." },
  G4: { he: "סול", y: 130, text: "סול מופיע על הקו השני." },
  A4: { he: "לה", y: 120, text: "לה מעל הקו השני. תו חשוב לתרגול שמיעה." },
  B4: { he: "סי", y: 110, text: "סי בין הקו השלישי לרביעי." },
  C5: { he: "דו גבוה", y: 100, text: "דו גבוה - אותה אות, אוקטבה מעל C4." }
};

const scoreEl = document.getElementById("score");
const comboEl = document.getElementById("combo");
const hitsEl = document.getElementById("hits");
const stageEl = document.getElementById("stage");
const feedbackEl = document.getElementById("feedback");
const noteMeaningEl = document.getElementById("noteMeaning");
const staffNoteEl = document.getElementById("staffNote");
const staffLabelEl = document.getElementById("staffLabel");
const ledgerEl = document.getElementById("ledger");
const noteKeysEl = document.getElementById("noteKeys");
const modeBtn = document.getElementById("toggleModeBtn");
const buildTagEl = document.getElementById("buildTag");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const state = {
  running: true,
  mode: "tap",
  score: 0,
  combo: 0,
  hits: 0,
  stage: 1,
  spawnTimer: 0,
  speed: 180,
  hitLineY: 380,
  notes: [],
  streakGlow: 0,
  lastDetected: null
};

let audioContext;
let analyser;

if (buildTagEl) buildTagEl.textContent = `Build: ${BUILD_ID}`;

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

function updateBookNote(note) {
  const info = NOTE_INFO[note];
  noteMeaningEl.textContent = `${note} = ${info.he}. ${info.text}`;
  staffNoteEl.setAttribute("cy", String(info.y));
  staffLabelEl.textContent = `${note} / ${info.he}`;
  const isC4 = note === "C4";
  ledgerEl.setAttribute("x1", isC4 ? "186" : "0");
  ledgerEl.setAttribute("x2", isC4 ? "236" : "0");
  ledgerEl.setAttribute("y1", isC4 ? "170" : "0");
  ledgerEl.setAttribute("y2", isC4 ? "170" : "0");
  [...noteKeysEl.children].forEach((btn, idx) => btn.classList.toggle("active-note", NOTES[idx] === note));
}

function buildNoteButtons() {
  noteKeysEl.innerHTML = "";
  NOTES.forEach((note) => {
    const btn = document.createElement("button");
    btn.textContent = `${NOTE_INFO[note].he} · ${note}`;
    btn.addEventListener("click", () => handlePlayerHit(note, true));
    noteKeysEl.appendChild(btn);
  });
}

function spawnNote() {
  const lane = Math.floor(Math.random() * NOTES.length);
  state.notes.push({
    lane,
    note: NOTES[lane],
    y: -30,
    radius: 16,
    hit: false,
    glow: Math.random() * Math.PI * 2
  });
}

function drawBackground(now) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#0a1430");
  gradient.addColorStop(1, "#1a2f5d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const laneWidth = canvas.width / NOTES.length;
  for (let i = 0; i < NOTES.length; i += 1) {
    const pulse = 0.1 + 0.06 * Math.sin(now / 220 + i);
    ctx.fillStyle = `rgba(255,255,255,${i % 2 === 0 ? pulse : pulse * 1.5})`;
    ctx.fillRect(i * laneWidth, 0, laneWidth, canvas.height);

    ctx.fillStyle = "rgba(210,226,255,0.82)";
    ctx.font = "bold 15px Rubik";
    ctx.fillText(`${NOTE_INFO[NOTES[i]].he} (${NOTES[i]})`, i * laneWidth + 8, 24);
  }

  const glowAlpha = 0.3 + Math.min(state.combo / 25, 0.45);
  ctx.strokeStyle = `rgba(255,255,255,${glowAlpha})`;
  ctx.lineWidth = 4 + Math.min(state.combo / 6, 5);
  ctx.beginPath();
  ctx.moveTo(0, state.hitLineY);
  ctx.lineTo(canvas.width, state.hitLineY);
  ctx.stroke();
}

function drawNotes(now) {
  const laneWidth = canvas.width / NOTES.length;
  state.notes.forEach((n) => {
    const x = n.lane * laneWidth + laneWidth / 2;
    const aura = 4 + 2 * Math.sin(now / 120 + n.glow);

    ctx.beginPath();
    ctx.fillStyle = n.hit ? "#00d68f" : "#6cb0ff";
    ctx.arc(x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.strokeStyle = n.hit ? "rgba(0,214,143,.7)" : "rgba(120,170,255,.75)";
    ctx.lineWidth = 2;
    ctx.arc(x, n.y, n.radius + aura, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Rubik";
    ctx.fillText(n.note, x - 15, n.y + 30);
  });
}

function updateGame(dt) {
  state.spawnTimer += dt;
  const spawnEvery = Math.max(560 - state.stage * 30, 260);
  if (state.spawnTimer >= spawnEvery) {
    spawnNote();
    state.spawnTimer = 0;
  }

  const speed = state.speed + state.stage * 18;
  state.notes.forEach((n) => {
    n.y += speed * (dt / 1000);
  });

  const missWindow = 34;
  state.notes = state.notes.filter((n) => {
    if (!n.hit && n.y > state.hitLineY + missWindow) {
      state.combo = 0;
      setFeedback(`פספוס של ${n.note}. ממשיכים!`, "bad");
      updateStats();
      return false;
    }
    return n.y < canvas.height + 60;
  });

  state.stage = Math.floor(state.hits / 9) + 1;
}

function tryHit(note) {
  const tolerance = 30;
  const idx = state.notes.findIndex((n) => !n.hit && n.note === note && Math.abs(n.y - state.hitLineY) <= tolerance);
  if (idx === -1) return false;

  state.notes[idx].hit = true;
  state.score += 12 + Math.min(state.combo, 22);
  state.combo += 1;
  state.hits += 1;
  state.streakGlow = 1;
  updateBookNote(note);
  setFeedback(`מעולה! פגיעה ב-${note} (${NOTE_INFO[note].he})`, "good");
  updateStats();

  setTimeout(() => {
    const i = state.notes.indexOf(state.notes[idx]);
    if (i >= 0) state.notes.splice(i, 1);
  }, 90);
  return true;
}

function handlePlayerHit(note, fromTap = false) {
  const ok = tryHit(note);
  if (!ok && fromTap) {
    state.combo = 0;
    setFeedback(`עוד שניה! ${note} עדיין לא הגיע לקו הפגיעה.`, "bad");
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
    for (let i = 0; i < buffer.length - offset; i += 1) {
      corr += Math.abs(buffer[i] - buffer[i + offset]);
    }
    corr = 1 - corr / (buffer.length - offset);
    if (corr > best) {
      best = corr;
      bestOffset = offset;
    }
  }
  if (best < 0.85 || bestOffset === -1) return -1;
  return sampleRate / bestOffset;
}

function frequencyToNote(freq) {
  const noteNumber = 12 * (Math.log2(freq / 440)) + 69;
  const rounded = Math.round(noteNumber);
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = noteNames[rounded % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
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
    setFeedback("מיקרופון פעיל! עכשיו ניתן לפגוע בתווים גם בנגינה אמיתית.", "good");
    detectPitch();
  } catch (_error) {
    setFeedback("לא הצלחנו לגשת למיקרופון. אפשר להמשיך במצב מקלדת.", "bad");
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
        handlePlayerHit(note, false);
      }
    }
    requestAnimationFrame(tick);
  };

  tick();
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

document.getElementById("startGameBtn").addEventListener("click", () => {
  state.score = 0;
  state.combo = 0;
  state.hits = 0;
  state.stage = 1;
  state.notes = [];
  state.spawnTimer = 0;
  updateStats();
  setFeedback("משחק חדש התחיל!", "good");
});

document.getElementById("startMicBtn").addEventListener("click", startMicrophone);
modeBtn.addEventListener("click", () => {
  state.mode = state.mode === "tap" ? "mic" : "tap";
  modeBtn.textContent = `מצב: ${state.mode === "tap" ? "מקלדת" : "מיקרופון"}`;
  setFeedback(state.mode === "tap" ? "מצב מקלדת פעיל - השתמשו במקשים 1-8." : "מצב מיקרופון פעיל.");
  if (state.mode === "mic" && analyser) detectPitch();
});

window.addEventListener("keydown", (event) => {
  const keyMap = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Digit5: 4, Digit6: 5, Digit7: 6, Digit8: 7 };
  const idx = keyMap[event.code];
  if (idx !== undefined) handlePlayerHit(NOTES[idx], true);
});

buildNoteButtons();
updateStats();
updateBookNote("C4");
requestAnimationFrame(loop);


if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}
