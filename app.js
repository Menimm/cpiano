const APP_VERSION = "hero-kids-v4";
const BUILD_ID = `${APP_VERSION} | ${new Date(document.lastModified).toISOString()}`;

const MIDI_START = 36; // C2
const MIDI_END = 96; // C7 => 61 keys
const NOTES_61 = Array.from({ length: MIDI_END - MIDI_START + 1 }, (_, i) => MIDI_START + i);

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const BLACKS = new Set([1, 3, 6, 8, 10]);

const SONGS = {
  twinkle: {
    title: "ניצנץ כוכב קטן",
    notes: [
      ["C4", 1], ["C4", 1], ["G4", 1], ["G4", 1], ["A4", 1], ["A4", 1], ["G4", 2],
      ["F4", 1], ["F4", 1], ["E4", 1], ["E4", 1], ["D4", 1], ["D4", 1], ["C4", 2]
    ]
  },
  mary: {
    title: "Mary Had a Little Lamb",
    notes: [
      ["E4", 1], ["D4", 1], ["C4", 1], ["D4", 1], ["E4", 1], ["E4", 1], ["E4", 2],
      ["D4", 1], ["D4", 1], ["D4", 2], ["E4", 1], ["G4", 1], ["G4", 2]
    ]
  },
  ode: {
    title: "Ode to Joy",
    notes: [
      ["E4", 1], ["E4", 1], ["F4", 1], ["G4", 1], ["G4", 1], ["F4", 1], ["E4", 1], ["D4", 1],
      ["C4", 1], ["C4", 1], ["D4", 1], ["E4", 1], ["E4", 1.5], ["D4", 0.5], ["D4", 2]
    ]
  },
  pinkpanther: {
    title: "הפנתר הוורוד (קטע פתיחה)",
    notes: [
      ["D#4", 1], ["E4", 0.5], ["F#4", 0.5], ["G4", 1], ["A4", 1], ["B4", 1], ["C5", 2],
      ["B4", 1], ["G4", 1], ["E4", 2]
    ]
  }
};

const state = {
  bpm: 90,
  hitWindow: 0.28,
  autoScroll: true,
  isPlaying: true,
  score: 0,
  combo: 0,
  hits: 0,
  attempts: 0,
  currentBeat: 0,
  activeSong: "twinkle",
  events: [],
  keyLayout: new Map(),
  lastTime: performance.now(),
  lastDetectedMidi: null,
  pressedMidi: null
};

const el = {
  buildTag: document.getElementById("buildTag"),
  versionFooter: document.getElementById("versionFooter"),
  songSelect: document.getElementById("songSelect"),
  speedControl: document.getElementById("speedControl"),
  speedValue: document.getElementById("speedValue"),
  playBtn: document.getElementById("playBtn"),
  pauseBtn: document.getElementById("pauseBtn"),
  resetBtn: document.getElementById("resetBtn"),
  startMicBtn: document.getElementById("startMicBtn"),
  openSettingsBtn: document.getElementById("openSettingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  hitWindowControl: document.getElementById("hitWindowControl"),
  hitWindowValue: document.getElementById("hitWindowValue"),
  autoScrollToggle: document.getElementById("autoScrollToggle"),
  feedback: document.getElementById("feedback"),
  score: document.getElementById("score"),
  combo: document.getElementById("combo"),
  accuracy: document.getElementById("accuracy"),
  currentTarget: document.getElementById("currentTarget"),
  noteInfo: document.getElementById("noteInfo"),
  staffNote: document.getElementById("staffNote"),
  staffLabel: document.getElementById("staffLabel"),
  ledger: document.getElementById("ledger"),
  piano61: document.getElementById("piano61"),
  heroCanvas: document.getElementById("heroCanvas"),
  sheetCanvas: document.getElementById("sheetCanvas")
};

const heroCtx = el.heroCanvas.getContext("2d");
const sheetCtx = el.sheetCanvas.getContext("2d");

let audioContext;
let analyser;

function midiToName(midi) {
  const name = NOTE_NAMES[midi % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

function nameToMidi(note) {
  const match = note.match(/^([A-G])(#?)(\d)$/);
  if (!match) return null;
  const [, letter, sharp, octaveStr] = match;
  const pitchClass = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] + (sharp ? 1 : 0);
  return (parseInt(octaveStr, 10) + 1) * 12 + pitchClass;
}

function midiToStaffY(midi) {
  const c4 = 60;
  return 170 - (midi - c4) * 10;
}

function setFeedback(text, kind = "") {
  el.feedback.textContent = text;
  el.feedback.className = `feedback ${kind}`.trim();
}

function updateStats() {
  el.score.textContent = String(state.score);
  el.combo.textContent = `${state.combo}🔥`;
  const acc = state.attempts > 0 ? Math.round((state.hits / state.attempts) * 100) : 0;
  el.accuracy.textContent = `${acc}%`;
}

function updateStaff(midi) {
  const name = midiToName(midi);
  const y = midiToStaffY(midi);
  el.staffNote.setAttribute("cy", String(y));
  el.staffLabel.textContent = name.toUpperCase();
  el.noteInfo.textContent = `${name.toUpperCase()} - זה התו הבא לנגן.`;

  const needsLedger = y > 150 || y < 70;
  el.ledger.setAttribute("x1", needsLedger ? "186" : "0");
  el.ledger.setAttribute("x2", needsLedger ? "236" : "0");
  el.ledger.setAttribute("y1", needsLedger ? String(y) : "0");
  el.ledger.setAttribute("y2", needsLedger ? String(y) : "0");
}

function buildSongEvents(songKey) {
  let beat = 0;
  return SONGS[songKey].notes.map(([name, len]) => {
    const ev = { midi: nameToMidi(name), name: name.toUpperCase(), beat, len, status: "pending" };
    beat += len;
    return ev;
  });
}

function totalBeats() {
  if (!state.events.length) return 1;
  const last = state.events[state.events.length - 1];
  return last.beat + last.len;
}

function findNextPending() {
  return state.events.find((e) => e.status === "pending");
}

function flashKey(midi, cls) {
  const keyNode = state.keyLayout.get(midi)?.node;
  if (!keyNode) return;
  keyNode.classList.add(cls);
  setTimeout(() => keyNode.classList.remove(cls), 220);
}

function buildPiano() {
  el.piano61.innerHTML = "";
  state.keyLayout.clear();

  const width = el.piano61.clientWidth;
  const whiteCount = NOTES_61.filter((m) => !BLACKS.has(m % 12)).length;
  const whiteW = width / whiteCount;
  const blackW = whiteW * 0.62;

  let whiteIndex = 0;
  NOTES_61.forEach((midi) => {
    const black = BLACKS.has(midi % 12);
    const key = document.createElement("div");
    key.className = `piano-key ${black ? "black" : "white"}`;

    let x;
    if (!black) {
      x = whiteIndex * whiteW;
      key.style.width = `${whiteW}px`;
      whiteIndex += 1;
    } else {
      x = (whiteIndex - 1) * whiteW + whiteW * 0.69;
      key.style.width = `${blackW}px`;
    }

    key.style.left = `${x}px`;
    key.dataset.midi = String(midi);
    key.title = midiToName(midi).toUpperCase();
    key.textContent = midi % 12 === 0 ? midiToName(midi).toUpperCase() : "";
    key.addEventListener("click", () => processInput(midi, true));

    el.piano61.appendChild(key);
    state.keyLayout.set(midi, {
      center: x + (black ? blackW / 2 : whiteW / 2),
      node: key
    });
  });
}

function drawHero() {
  const ctx = heroCtx;
  const w = el.heroCanvas.width;
  const h = el.heroCanvas.height;
  const hitY = h - 34; // top of key area target line

  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#0b1532");
  grad.addColorStop(1, "#1f386f");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, hitY);
  ctx.lineTo(w, hitY);
  ctx.stroke();

  const lookAhead = 4;
  state.events.forEach((ev) => {
    if (ev.status === "removed") return;

    const d = ev.beat - state.currentBeat;
    if (d < -0.7 || d > lookAhead) return;

    const key = state.keyLayout.get(ev.midi);
    if (!key) return;

    const y = hitY - (d / lookAhead) * (h - 48);
    const noteH = Math.max(14, ev.len * 26);
    const isAtKeyTop = Math.abs(d) <= state.hitWindow;

    let color = "#73b4ff";
    if (isAtKeyTop) color = "#00d68f";
    if (ev.status === "hit") color = "#00d68f";
    if (ev.status === "miss") color = "#ff6a6a";

    ctx.fillStyle = color;
    ctx.fillRect(key.center - 9, y - noteH / 2, 18, noteH);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 12px Rubik";
    ctx.fillText(ev.name.toUpperCase(), key.center - 16, y - noteH / 2 - 6);
  });
}

function drawSheet() {
  const ctx = sheetCtx;
  const w = el.sheetCanvas.width;
  const h = el.sheetCanvas.height;
  const total = totalBeats();

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = "#2a3f69";
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 5; i += 1) {
    const y = 70 + i * 20;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.lineTo(w - 20, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#132d5f";
  ctx.font = "40px serif";
  ctx.fillText("𝄞", 24, 131);

  state.events.forEach((ev) => {
    const x = 86 + (ev.beat / total) * (w - 130);
    const y = midiToStaffY(ev.midi);

    ctx.fillStyle = ev.status === "hit" ? "#00a967" : ev.status === "miss" ? "#d14b4b" : "#2d6dff";
    ctx.beginPath();
    ctx.ellipse(x, y, 9, 7, -0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0e1f3f";
    ctx.font = "bold 10px Rubik";
    ctx.fillText(ev.name.toUpperCase(), x - 14, y - 14);
  });

  if (state.autoScroll) {
    const playX = 86 + (Math.min(state.currentBeat, total) / total) * (w - 130);
    ctx.strokeStyle = "#ff4e4e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 34);
    ctx.lineTo(playX, h - 22);
    ctx.stroke();
  }
}

function processInput(midi, fromTap) {
  state.attempts += 1;
  state.pressedMidi = midi;

  const candidate = state.events.find((e) => e.status === "pending" && Math.abs(e.beat - state.currentBeat) <= state.hitWindow);
  if (!candidate) {
    if (fromTap) {
      flashKey(midi, "wrong");
      state.combo = 0;
      setFeedback("עדיין מוקדם/מאוחר. עקבו אחרי כניסת התו לראש הקליד.", "bad");
      updateStats();
    }
    return;
  }

  if (candidate.midi === midi) {
    candidate.status = "hit";
    state.hits += 1;
    state.score += 10 + Math.min(state.combo, 20);
    state.combo += 1;
    flashKey(midi, "correct");
    setFeedback(`מעולה! ${candidate.name.toUpperCase()} נקלט נכון.`, "good");
    updateStaff(midi);
  } else {
    state.combo = 0;
    flashKey(candidate.midi, "wrong");
    setFeedback(`התו הצפוי היה ${candidate.name.toUpperCase()} ולא ${midiToName(midi).toUpperCase()}.`, "bad");
  }

  updateStats();
}

function evaluateArrivals() {
  state.events.forEach((ev) => {
    if (ev.status !== "pending") return;

    if (Math.abs(ev.beat - state.currentBeat) <= state.hitWindow) {
      // בעת כניסת התו לראש הקליד - ירוק ואז נעלם
      ev.status = "hit";
      setTimeout(() => {
        if (ev.status === "hit") ev.status = "removed";
      }, 120);
      return;
    }

    if (state.currentBeat > ev.beat + state.hitWindow) {
      ev.status = "miss";
      flashKey(ev.midi, "wrong");
      state.combo = 0;
      setFeedback(`פספוס: ${ev.name.toUpperCase()}`, "bad");
      updateStats();
      setTimeout(() => {
        if (ev.status === "miss") ev.status = "removed";
      }, 180);
    }
  });
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
  if (best < 0.84 || bestOffset < 0) return -1;
  return sampleRate / bestOffset;
}

function frequencyToMidi(freq) {
  const noteNumber = 12 * (Math.log2(freq / 440)) + 69;
  return Math.round(noteNumber);
}

async function startMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    setFeedback("המיקרופון פעיל. נגן/י כשהתו נכנס לראש הקליד.", "good");
    detectPitch();
  } catch (_err) {
    setFeedback("לא הצלחנו להפעיל מיקרופון.", "bad");
  }
}

function detectPitch() {
  if (!analyser) return;
  const buffer = new Float32Array(analyser.fftSize);
  const tick = () => {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(buffer);
    const freq = autoCorrelate(buffer, audioContext.sampleRate);
    if (freq > 50 && freq < 1800) {
      const midi = frequencyToMidi(freq);
      if (midi >= MIDI_START && midi <= MIDI_END && midi !== state.lastDetectedMidi) {
        state.lastDetectedMidi = midi;
        processInput(midi, false);
      }
    }
    requestAnimationFrame(tick);
  };
  tick();
}

function resetSongProgress() {
  state.events = buildSongEvents(state.activeSong);
  state.currentBeat = 0;
  state.score = 0;
  state.combo = 0;
  state.hits = 0;
  state.attempts = 0;
  updateStats();
  const first = findNextPending();
  if (first) {
    el.currentTarget.textContent = first.name.toUpperCase();
    updateStaff(first.midi);
  }
}

function applySettingsFromModal() {
  state.bpm = Number(el.speedControl.value);
  state.hitWindow = Number(el.hitWindowControl.value);
  state.autoScroll = el.autoScrollToggle.checked;

  el.speedValue.textContent = String(state.bpm);
  el.hitWindowValue.textContent = state.hitWindow.toFixed(2);
}

function openSettings() {
  el.speedControl.value = String(state.bpm);
  el.hitWindowControl.value = String(state.hitWindow);
  el.autoScrollToggle.checked = state.autoScroll;
  el.speedValue.textContent = String(state.bpm);
  el.hitWindowValue.textContent = state.hitWindow.toFixed(2);
  el.settingsModal.classList.remove("hidden");
}

function closeSettings() {
  el.settingsModal.classList.add("hidden");
}

function wireUI() {
  Object.entries(SONGS).forEach(([key, song]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = song.title;
    el.songSelect.appendChild(opt);
  });

  el.songSelect.addEventListener("change", () => {
    state.activeSong = el.songSelect.value;
    resetSongProgress();
    setFeedback(`נבחר שיר: ${SONGS[state.activeSong].title}`);
  });

  el.playBtn.addEventListener("click", () => {
    state.isPlaying = true;
    setFeedback("ניגון הופעל");
  });

  el.pauseBtn.addEventListener("click", () => {
    state.isPlaying = false;
    setFeedback("ניגון נעצר");
  });

  el.resetBtn.addEventListener("click", () => {
    resetSongProgress();
    setFeedback("איפוס הושלם");
  });

  el.startMicBtn.addEventListener("click", startMic);

  el.openSettingsBtn.addEventListener("click", openSettings);
  el.closeSettingsBtn.addEventListener("click", closeSettings);
  el.saveSettingsBtn.addEventListener("click", () => {
    applySettingsFromModal();
    closeSettings();
    setFeedback("ההגדרות נשמרו");
  });

  el.settingsModal.addEventListener("click", (e) => {
    if (e.target === el.settingsModal) closeSettings();
  });

  el.speedControl.addEventListener("input", () => {
    el.speedValue.textContent = String(el.speedControl.value);
  });
  el.hitWindowControl.addEventListener("input", () => {
    el.hitWindowValue.textContent = Number(el.hitWindowControl.value).toFixed(2);
  });

  window.addEventListener("keydown", (event) => {
    const map = { Digit1: 60, Digit2: 62, Digit3: 64, Digit4: 65, Digit5: 67, Digit6: 69, Digit7: 71, Digit8: 72 };
    const midi = map[event.code];
    if (midi) processInput(midi, true);
  });

  window.addEventListener("resize", buildPiano);
}

function gameLoop(now) {
  const dt = Math.min(now - state.lastTime, 40);
  state.lastTime = now;

  if (state.isPlaying) {
    state.currentBeat += (dt / 1000) * (state.bpm / 60);
    if (state.currentBeat > totalBeats()) {
      state.currentBeat = 0;
      state.events.forEach((e) => {
        e.status = "pending";
      });
      setFeedback("הגענו לסוף המקטע. מתחילים שוב.");
    }

    evaluateArrivals();

    const target = findNextPending();
    if (target) {
      el.currentTarget.textContent = target.name.toUpperCase();
      updateStaff(target.midi);
    } else {
      el.currentTarget.textContent = "-";
    }
  }

  drawHero();
  drawSheet();
  requestAnimationFrame(gameLoop);
}

function init() {
  el.buildTag.textContent = `Build: ${BUILD_ID}`;
  el.versionFooter.textContent = `Version: ${BUILD_ID}`;

  wireUI();
  buildPiano();
  resetSongProgress();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  }

  requestAnimationFrame(gameLoop);
}

init();
