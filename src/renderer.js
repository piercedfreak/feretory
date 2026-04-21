const { ipcRenderer } = require("electron");

console.log("feretory UI loaded");

let sounds = {
  HIGH: null,
  MEDIUM: null,
  LOW: null
};

function scan() {
  ipcRenderer.send("manual-scan");
}

function save() {
  ["HIGH", "MEDIUM", "LOW"].forEach((level) => {
    const input = document.getElementById(level.toLowerCase());
    if (input && input.files[0]) {
      sounds[level] = input.files[0].path;
    }
  });

  ipcRenderer.send("save-settings", {
    interval: parseInt(document.getElementById("interval").value, 10),
    autoLaunch: document.getElementById("startup").checked,
    startMinimized: document.getElementById("minimized").checked,
    notifyHighOnly: document.getElementById("highonly").checked,
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
    audio.volume = parseInt(document.getElementById("volume").value, 10) / 100;

    audio.play().catch(() => {
      beep(level);
    });
  } else {
    beep(level);
  }

  if (document.getElementById("tts").checked) {
    const msg = new SpeechSynthesisUtterance(`${level} alert detected`);
    speechSynthesis.speak(msg);
  }
}

function beep(level) {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  if (level === "HIGH") osc.frequency.value = 980;
  else if (level === "MEDIUM") osc.frequency.value = 740;
  else osc.frequency.value = 520;

  gain.gain.value = parseInt(document.getElementById("volume").value, 10) / 100;

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();
  osc.stop(ctx.currentTime + 0.2);
}

function test(level) {
  play(level);
}

ipcRenderer.on("play-alert", (_event, level) => {
  play(level);
});

ipcRenderer.on("progress", (_event, value) => {
  document.getElementById("bar").style.width = value + "%";
});

ipcRenderer.on("stage", (_event, text) => {
  document.getElementById("stage").innerText = text;
});

ipcRenderer.on("results", (_event, rows) => {
  document.getElementById("results").innerHTML =
    rows.map((row) => `
      <div class="card">
        <div>${row.text}</div>
        <div class="small">
          ${row.source} | ${row.level} | Score ${row.score} | ${row.time}
        </div>
      </div>
    `).join("");
});

ipcRenderer.on("logs", (_event, rows) => {
  document.getElementById("logs").innerHTML =
    rows.map((x) => `${x.time} - ${x.text}`).join("<br>");
});

ipcRenderer.on("settings", (_event, settings) => {
  document.getElementById("interval").value = settings.interval;
  document.getElementById("startup").checked = settings.autoLaunch;
  document.getElementById("minimized").checked = settings.startMinimized;
  document.getElementById("highonly").checked = settings.notifyHighOnly;
  document.getElementById("volume").value = settings.volume;
  document.getElementById("tts").checked = settings.tts;
  document.getElementById("quietStart").value = settings.quietStart;
  document.getElementById("quietEnd").value = settings.quietEnd;

  sounds = settings.sounds || sounds;
});

window.onload = () => {
  ipcRenderer.send("request-cache");
};
