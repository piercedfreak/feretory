const { ipcRenderer } = require("electron");

let sounds={
HIGH:null,
MEDIUM:null,
LOW:null
};

function scan(){
ipcRenderer.send("manual-scan");
}

function save(){
["HIGH","MEDIUM","LOW"].forEach(k=>{
const el=document.getElementById(k.toLowerCase());
if(el.files[0]) sounds[k]=el.files[0].path;
});

ipcRenderer.send("save-settings",{
interval:60000,
autoLaunch:true,
startMinimized:true,
volume:parseInt(document.getElementById("volume").value),
tts:document.getElementById("tts").checked,
quietStart:document.getElementById("quietStart").value,
quietEnd:document.getElementById("quietEnd").value,
sounds
});
}

function play(level){
const file=sounds[level];

if(file){
const a=new Audio(file);
a.volume=document.getElementById("volume").value/100;
a.play();
}else{
beep();
}

if(document.getElementById("tts").checked){
speechSynthesis.speak(
new SpeechSynthesisUtterance(level+" alert detected")
);
}
}

function beep(){
const ctx=new AudioContext();
const osc=ctx.createOscillator();
osc.frequency.value=880;
osc.connect(ctx.destination);
osc.start();
osc.stop(ctx.currentTime+.2);
}

function test(level){
play(level);
}

ipcRenderer.on("play-alert",(e,level)=>{
play(level);
});

ipcRenderer.on("progress",(e,v)=>{
document.getElementById("bar").style.width=v+"%";
});

ipcRenderer.on("stage",(e,t)=>{
document.getElementById("stage").innerText=t;
});

ipcRenderer.on("results",(e,rows)=>{
document.getElementById("results").innerHTML=
rows.map(r=>`
<div class="card">
<div>${r.text}</div>
<div class="small">${r.source} | ${r.level}</div>
</div>
`).join("");
});

ipcRenderer.on("settings",(e,s)=>{
document.getElementById("volume").value=s.volume;
document.getElementById("tts").checked=s.tts;
document.getElementById("quietStart").value=s.quietStart;
document.getElementById("quietEnd").value=s.quietEnd;
sounds=s.sounds||sounds;
});

window.onload=()=>{
ipcRenderer.send("request-cache");
};
