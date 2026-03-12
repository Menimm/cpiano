const curriculum = [
  { stage: "היכרות עם הקלידים", focus: "שמות התווים הלבנים וספירת קלידים" },
  { stage: "לומדים תווים", focus: "דו, רה, מי, פה, סול + זיהוי שמיעתי" },
  { stage: "קצב בסיסי", focus: "נגינה בקצב יציב של רבעים וחצאים" },
  { stage: "יד ימין", focus: "תרגילי מנגינה קצרים ביד ימין" },
  { stage: "יד שמאל", focus: "בסיס ליווי פשוט ביד שמאל" },
  { stage: "שתי ידיים יחד", focus: "תיאום בסיסי בין הידיים" },
  { stage: "יצירות ראשונות", focus: "נגינת יצירות קצרות ברמת מתחילים" }
];

const targets = ["C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5"];

let targetIndex = 0;
let stars = 0;
let detectedStableNote = null;
let stableCount = 0;
let audioContext;
let analyser;

const stageNameEl = document.getElementById("stageName");
const starsEl = document.getElementById("stars");
const progressBarEl = document.getElementById("progressBar");
const lessonDescriptionEl = document.getElementById("lessonDescription");
const curriculumListEl = document.getElementById("curriculumList");
const targetNoteEl = document.getElementById("targetNote");
const feedbackEl = document.getElementById("feedback");
const targetHintEl = document.getElementById("targetHint");

function renderCurriculum() {
  curriculumListEl.innerHTML = "";
  curriculum.forEach((item, idx) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>שלב ${idx + 1}: ${item.stage}</strong> - ${item.focus}`;
    curriculumListEl.appendChild(li);
  });
}

function updateLesson() {
  const currentStage = Math.min(Math.floor(stars / 4), curriculum.length - 1);
  stageNameEl.textContent = curriculum[currentStage].stage;
  lessonDescriptionEl.textContent = `היום מתרגלים: ${curriculum[currentStage].focus}. המטרה: הצלחה קטנה בכל סבב!`;
  progressBarEl.style.width = `${((currentStage + 1) / curriculum.length) * 100}%`;
}

function setFeedback(text, type = "") {
  feedbackEl.textContent = text;
  feedbackEl.className = `feedback ${type}`.trim();
}

function noteToFrequency(note) {
  const match = note.match(/^([A-G])(#?)(\d)$/);
  if (!match) return null;
  const [, letter, sharp, octaveStr] = match;
  const semitoneMap = {
    C: 0,
    "C#": 1,
    D: 2,
    "D#": 3,
    E: 4,
    F: 5,
    "F#": 6,
    G: 7,
    "G#": 8,
    A: 9,
    "A#": 10,
    B: 11
  };
  const key = `${letter}${sharp}`;
  const octave = parseInt(octaveStr, 10);
  const midi = 12 * (octave + 1) + semitoneMap[key];
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function frequencyToNote(freq) {
  const noteNumber = 12 * (Math.log2(freq / 440)) + 69;
  const rounded = Math.round(noteNumber);
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = noteNames[rounded % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

function autoCorrelate(buffer, sampleRate) {
  let rms = 0;
  for (let i = 0; i < buffer.length; i++) rms += buffer[i] * buffer[i];
  rms = Math.sqrt(rms / buffer.length);
  if (rms < 0.01) return -1;

  let r1 = 0;
  let r2 = buffer.length - 1;
  const threshold = 0.2;

  for (let i = 0; i < buffer.length / 2; i++) {
    if (Math.abs(buffer[i]) < threshold) {
      r1 = i;
      break;
    }
  }

  for (let i = 1; i < buffer.length / 2; i++) {
    if (Math.abs(buffer[buffer.length - i]) < threshold) {
      r2 = buffer.length - i;
      break;
    }
  }

  const trimmed = buffer.slice(r1, r2);
  const c = new Array(trimmed.length).fill(0);

  for (let i = 0; i < trimmed.length; i++) {
    for (let j = 0; j < trimmed.length - i; j++) c[i] += trimmed[j] * trimmed[j + i];
  }

  let d = 0;
  while (c[d] > c[d + 1]) d++;

  let maxval = -1;
  let maxpos = -1;
  for (let i = d; i < trimmed.length; i++) {
    if (c[i] > maxval) {
      maxval = c[i];
      maxpos = i;
    }
  }

  const t0 = maxpos;
  if (t0 <= 0) return -1;
  return sampleRate / t0;
}

function evaluateDetectedNote(note) {
  const target = targets[targetIndex];
  if (note === detectedStableNote) {
    stableCount += 1;
  } else {
    detectedStableNote = note;
    stableCount = 1;
  }

  if (stableCount < 3) {
    setFeedback(`שומעים: ${note}. ממשיכים להאזין לייצוב…`, "");
    return;
  }

  if (note === target) {
    stars += 1;
    starsEl.textContent = `${stars} ⭐`;
    setFeedback(`כל הכבוד! ניגנת נכון את ${target}.`, "good");
    if (stars % 2 === 0) {
      targetIndex = (targetIndex + 1) % targets.length;
      targetNoteEl.textContent = targets[targetIndex];
      targetHintEl.textContent = "התקדמת! בואו ננסה את התו הבא.";
    }
    updateLesson();
  } else {
    const targetFreq = noteToFrequency(target);
    const detectedFreq = noteToFrequency(note);
    const direction = detectedFreq < targetFreq ? "גבוה יותר" : "נמוך יותר";
    setFeedback(`שומעים ${note}. נסו תו ${direction} כדי להגיע ל-${target}.`, "warn");
  }
}

async function startMicrophone() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    setFeedback("המיקרופון פעיל! נגנו את התו שמופיע למעלה.", "good");
    detectPitch();
  } catch (error) {
    setFeedback("לא הצלחנו להפעיל מיקרופון. בדקו הרשאות בדפדפן.", "warn");
  }
}

function detectPitch() {
  if (!analyser || !audioContext) return;
  const buffer = new Float32Array(analyser.fftSize);

  const tick = () => {
    analyser.getFloatTimeDomainData(buffer);
    const freq = autoCorrelate(buffer, audioContext.sampleRate);

    if (freq !== -1 && freq > 50 && freq < 1400) {
      const note = frequencyToNote(freq);
      evaluateDetectedNote(note);
    }
    requestAnimationFrame(tick);
  };

  tick();
}

document.getElementById("startMicBtn").addEventListener("click", startMicrophone);
document.getElementById("nextTargetBtn").addEventListener("click", () => {
  targetIndex = (targetIndex + 1) % targets.length;
  targetNoteEl.textContent = targets[targetIndex];
  setFeedback(`עברנו לתו חדש: ${targets[targetIndex]}. נסו לנגן אותו!`);
});

renderCurriculum();
updateLesson();
