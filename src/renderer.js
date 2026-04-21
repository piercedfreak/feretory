const { ipcRenderer } = require("electron");

function scan(){
  ipcRenderer.send("manual-scan");
}

ipcRenderer.on("progress",(e,v)=>{
  document.getElementById("bar").style.width = v + "%";
});

ipcRenderer.on("stage",(e,t)=>{
  document.getElementById("stage").innerText = t;
});

ipcRenderer.on("results",(e,rows)=>{
  document.getElementById("results").innerHTML =
    rows.map(r=>`
      <div class="card">
        <div>${r.text}</div>
        <div class="small">${r.source} | ${r.level} | Score ${r.score}</div>
      </div>
    `).join("");
});

ipcRenderer.on("logs",(e,rows)=>{
  document.getElementById("logs").innerHTML =
    rows.map(x => `${x.time} - ${x.text}`).join("<br>");
});

window.onload = ()=>{
  ipcRenderer.send("request-cache");
};
