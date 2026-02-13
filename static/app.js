const MIN_RMS = 1e-10;

const elements = {
  status: document.getElementById("status"),
  statusImage: document.getElementById("statusImage"),
  db: document.getElementById("db"),
  counters: document.getElementById("counters"),
  panel: document.getElementById("panel"),
  controls: document.getElementById("controls"),
  toggleControls: document.getElementById("toggleControls"),
  toggleControls_reset: document.getElementById("toggleControls_reset"),
  manualToggle: document.getElementById("manualToggle"),
  manualLevel: document.getElementById("manualLevel"),
  levelGreen: document.getElementById("levelGreen"),
  levelYellow: document.getElementById("levelYellow"),
  levelRed: document.getElementById("levelRed"),
  levelMax: document.getElementById("levelMax"),
  levelError: document.getElementById("levelError"),
};

const imageMap = {
  GREEN: "/static/mi_meme_1.png",
  YELLOW: "/static/mi_meme_2.png",
  RED: "/static/mi_meme_3.png",
  MAX: "/static/mi_meme_4.png",
};

const colorMap = {
  GREEN: "#1ea97c",
  YELLOW: "#f4c542",
  RED: "#ff5a5a",
  MAX: "#7a1d1d",
};

const audioMap = {
  GREEN: "",
  YELLOW: "/static/mgs_alert.mp3",
  RED: "/static/red_alert.mp3",
  MAX: "/static/max_scream.mp3",
};

let levels = {
  GREEN: -25.0,
  YELLOW: -10.0,
  RED: -8.0,
  MAX: 0.0,
};

let audioContext;
let analyser;
let buffer;
let lastZone = null;
let counts = { yellow: 0, red: 0, max: 0 };
let levelsUpdateTimer;
let zoneAudioPlayer;
let isZoneAudioPlaying = false;

function rmsToDb(rms) {
  const safe = Math.max(rms, MIN_RMS);
  return 20 * Math.log10(safe / 1.0);
}

function classify(db) {
  if (db >= levels.MAX) {
    return { label: "MAX", color: colorMap.MAX };
  }
  if (db >= levels.RED) {
    return { label: "RED", color: colorMap.MAX };
  }
  if (db >= levels.YELLOW) {
    return { label: "RED", color: colorMap.RED };
  }
  if (db >= levels.GREEN) {
    return { label: "YELLOW", color: colorMap.YELLOW };
  }
  return { label: "GREEN", color: colorMap.GREEN };
}

function updateDisplay({ label, color, dbText }) {
  elements.status.textContent = label;
  elements.statusImage.src = imageMap[label];
  elements.db.textContent = dbText;
  elements.panel.style.borderColor = color;
  elements.panel.style.boxShadow = `0 24px 60px ${color}55`;
}

function updateCounters() {
  elements.counters.textContent = `Yellow: ${counts.yellow} | Red: ${counts.red} | Max: ${counts.max}`;
}

async function postState(label) {
  try {
    await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
  } catch (err) {
    // Ignore transient failures.
  }
}

function playZoneAudio(label) {
  const src = audioMap[label];
  if (!src) {
    return Promise.resolve();
  }

  if (!zoneAudioPlayer) {
    zoneAudioPlayer = new Audio();
  }

  zoneAudioPlayer.pause();
  zoneAudioPlayer.currentTime = 0;
  zoneAudioPlayer.src = src;
  isZoneAudioPlaying = true;

  return new Promise((resolve) => {
    const finish = () => {
      isZoneAudioPlaying = false;
      resolve();
    };

    zoneAudioPlayer.addEventListener("ended", finish, { once: true });
    zoneAudioPlayer.addEventListener("error", finish, { once: true });
    zoneAudioPlayer.play().catch(finish);
  });
}

function handleZoneChange(label) {
  if (label === lastZone) {
    return;
  }
  lastZone = label;
  if (label === "YELLOW") {
    counts.yellow += 1;
  } else if (label === "RED") {
    counts.red += 1;
  } else if (label === "MAX") {
    counts.max += 1;
  }
  updateCounters();
  postState(label);
  void playZoneAudio(label);
}

async function loadLevels() {
  try {
    const response = await fetch("/api/levels");
    if (!response.ok) {
      throw new Error("Failed to load levels");
    }
    const data = await response.json();
    levels = data;
  } catch (err) {
    // Keep defaults if the API isn't ready.
  }

  elements.levelGreen.value = levels.GREEN;
  elements.levelYellow.value = levels.YELLOW;
  elements.levelRed.value = levels.RED;
  elements.levelMax.value = levels.MAX;
}

async function loadState() {
  try {
    const response = await fetch("/api/state");
    if (!response.ok) {
      throw new Error("Failed to load state");
    }
    const data = await response.json();
    counts = {
      yellow: data.yellow || 0,
      red: data.red || 0,
      max: data.max || 0,
    };
    lastZone = data.last_zone || null;
    updateCounters();
  } catch (err) {
    // Ignore if state isn't available yet.
  }
}

function parseLevelsFromInputs() {
  const newLevels = {
    GREEN: Number(elements.levelGreen.value),
    YELLOW: Number(elements.levelYellow.value),
    RED: Number(elements.levelRed.value),
    MAX: Number(elements.levelMax.value),
  };
  if (
    Number.isNaN(newLevels.GREEN) ||
    Number.isNaN(newLevels.YELLOW) ||
    Number.isNaN(newLevels.RED) ||
    Number.isNaN(newLevels.MAX)
  ) {
    return { error: "Enter numeric values." };
  }
  if (!(newLevels.GREEN < newLevels.YELLOW && newLevels.YELLOW < newLevels.RED && newLevels.RED <= newLevels.MAX)) {
    return { error: "Order: GREEN < YELLOW < RED ≤ MAX" };
  }
  return { value: newLevels };
}

function scheduleLevelsUpdate() {
  clearTimeout(levelsUpdateTimer);
  levelsUpdateTimer = setTimeout(async () => {
    const parsed = parseLevelsFromInputs();
    if (parsed.error) {
      elements.levelError.textContent = parsed.error;
      return;
    }

    elements.levelError.textContent = "";
    try {
      const response = await fetch("/api/levels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.value),
      });
      if (!response.ok) {
        const data = await response.json();
        elements.levelError.textContent = data.error || "Invalid levels.";
        return;
      }
      levels = await response.json();
    } catch (err) {
      elements.levelError.textContent = "Failed to update levels.";
    }
  }, 250);
}

function attachLevelInputListeners() {
  [
    elements.levelGreen,
    elements.levelYellow,
    elements.levelRed,
    elements.levelMax,
  ].forEach((input) => {
    input.addEventListener("input", scheduleLevelsUpdate);
  });
}

async function startAudio() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;
  buffer = new Float32Array(analyser.fftSize);
  source.connect(analyser);
}

function updateLoop() {
  if (isZoneAudioPlaying) {
    return;
  }

  const manual = elements.manualToggle.checked;
  if (manual) {
    const label = elements.manualLevel.value;
    const color = colorMap[label];
    updateDisplay({ label, color, dbText: "MANUAL" });
    handleZoneChange(label);
    return;
  }

  if (!analyser) {
    updateDisplay({ label: "WAIT", color: "#5f6b7a", dbText: "Mic permission needed" });
    return;
  }

  analyser.getFloatTimeDomainData(buffer);
  let sum = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    const sample = buffer[i];
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / buffer.length);
  const db = rmsToDb(rms);
  const { label, color } = classify(db);
  updateDisplay({ label, color, dbText: `${db.toFixed(1)} dB` });
  handleZoneChange(label);
}

function toggleControls() {
  const isHidden = elements.controls.classList.toggle("hidden");
  elements.toggleControls.textContent = isHidden ? "Show Controls" : "Hide Controls";
}
function resetCounters() {
  counts = { yellow: 0, red: 0, max: 0 };
  updateCounters();
  postState("RESET");
}

async function init() {
  await loadLevels();
  await loadState();
  attachLevelInputListeners();

  elements.toggleControls.addEventListener("click", toggleControls);
  elements.toggleControls_reset.addEventListener("click", resetCounters);

  try {
    await startAudio();
  } catch (err) {
    elements.levelError.textContent = "Mic access denied. Enable microphone permissions.";
  }

  setInterval(updateLoop, 50);
}

init();
