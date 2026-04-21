const { ipcRenderer } = require("electron");

console.log("feretory UI Loaded");

let sounds = {
  HIGH: null,
  MEDIUM: null,
  LOW: null
};

function scan() {
  ipcRenderer.send("manual-scan");
}

function save() {
  ["HIGH", "MEDIUM", "LOW"].forEach(level => {
    const input = document.getElementById(level.toLowerCase());

    if (input && input.files[0]) {
      sounds[level] = input.files[0].path;
    }
  });

  ipcRenderer.send("save-settings", {
    interval: 60000,
    autoLaunch: true,
    startMinimized: true,
    volume: parseInt(document.getElementById("volume").value, 10),
    tts: document.getElementById("tts").checked,
    quietStart: document.getElementById("quietStart").value,
    quietEnd: document.getElementById("quietEnd").value,
    sounds
  });
}

function play(level) {
  const file = sounds[level];

  if (file) {
    const audio = new Audio(file);
    audio.volume =
      parseInt(document.getElementById("volume").value, 10) / 100;

    audio.play().catch(() => {
      beep();
    });
  } else {
    beep();
  }

  if (document.getElementById("tts").checked) {
    const msg = new SpeechSynthesisUtterance(
      level + " alert detected"
    );

    speechSynthesis.speak(msg);
  }
}

function beep() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();

  osc.frequency.value = 880;
  osc.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

function test(level) {
  play(level);
}

ipcRenderer.on("play-alert", (event, level) => {
  play(level);
});

ipcRenderer.on("progress", (event, value) => {
  document.getElementById("bar").style.width = value + "%";
});

ipcRenderer.on("stage", (event, text) => {
  document.getElementById("stage").innerText = text;
});

ipcRenderer.on("results", (event, rows) => {
  document.getElementById("results").innerHTML =
    rows.map(row => `
      <div class="card">
        <div>${row.text}</div>
        <div class="small">${row.source} | ${row.level}</div>
      </div>
    `).join("");
});

ipcRenderer.on("settings", (event, settings) => {
  document.getElementById("volume").value = settings.volume;
  document.getElementById("tts").checked = settings.tts;
  document.getElementById("quietStart").value = settings.quietStart;
  document.getElementById("quietEnd").value = settings.quietEnd;

  sounds = settings.sounds || sounds;
});

window.onload = () => {
  ipcRenderer.send("request-cache");
};
