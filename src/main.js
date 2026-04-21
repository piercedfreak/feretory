const {
app,BrowserWindow,ipcMain,Tray,Menu,Notification
}=require("electron");

const path=require("path");
const axios=require("axios");
const cheerio=require("cheerio");
const Store=require("electron-store").default;

const store=new Store();

let win,tray,timer,busy=false;

const SOURCES=[
{name:"Blizzard News",url:"https://news.blizzard.com/en-us/diablo4",type:"html"},
{name:"Forums",url:"https://us.forums.blizzard.com/en/d4/",type:"html"},
{name:"Reddit",url:"https://www.reddit.com/r/diablo4/new/.json",type:"json"}
];

function settings(){
return store.get("settings")||{
interval:60000,
autoLaunch:false,
startMinimized:true,
volume:100,
tts:false,
quietStart:"22:00",
quietEnd:"07:00",
sounds:{
HIGH:null,
MEDIUM:null,
LOW:null
}
};
}

function createWindow(){
const set=settings();

win=new BrowserWindow({
width:1180,
height:820,
show:!set.startMinimized,
title:"Feretory",
webPreferences:{
nodeIntegration:true,
contextIsolation:false
}
});

win.loadFile("index.html");

win.on("close",(e)=>{
if(!app.isQuiting){
e.preventDefault();
win.hide();
}
});
}

function createTray(){
tray=new Tray(path.join(__dirname,"icon.png"));

tray.setContextMenu(Menu.buildFromTemplate([
{label:"Open",click:()=>win.show()},
{label:"Scan Now",click:()=>scan()},
{label:"Quit",click:()=>{
app.isQuiting=true;
app.quit();
}}
]));

tray.setToolTip("Feretory");
}

function send(ch,data){
if(win) win.webContents.send(ch,data);
}

function score(t){
t=t.toLowerCase();
let s=0;
if(t.includes("free")) s+=15;
if(t.includes("claim")) s+=12;
if(t.includes("reward")) s+=10;
if(t.includes("cosmetic")) s+=12;
if(t.includes("shop")) s+=10;
return s;
}

function level(s){
if(s>=28) return "HIGH";
if(s>=16) return "MEDIUM";
return "LOW";
}

function inQuietHours(){
const set=settings();

const now=new Date();
const current=now.getHours()*60+now.getMinutes();

const [sh,sm]=set.quietStart.split(":").map(Number);
const [eh,em]=set.quietEnd.split(":").map(Number);

const start=sh*60+sm;
const end=eh*60+em;

if(start<end){
return current>=start && current<end;
}else{
return current>=start || current<end;
}
}

async function getHTML(url){
try{
const r=await axios.get(url,{timeout:8000});
return r.data;
}catch{return null;}
}

function parseHTML(html){
const $=cheerio.load(html);
const arr=[];
$("h1,h2,h3,a,p").each((i,e)=>{
const t=$(e).text().trim();
if(t.length>8 && t.length<140) arr.push(t);
});
return arr;
}

async function getJSON(url){
try{
const r=await axios.get(url,{timeout:8000});
return r.data;
}catch{return null;}
}

function parseReddit(json){
const arr=[];
try{
json.data.children.forEach(p=>arr.push(p.data.title));
}catch{}
return arr;
}

async function scan(){
if(busy) return;
busy=true;

send("stage","Scanning...");
send("progress",10);

const seen=store.get("seen")||{};
let found=[];

for(let i=0;i<SOURCES.length;i++){
const src=SOURCES[i];

send("stage","Checking "+src.name);
send("progress",25+i*20);

let items=[];

if(src.type==="html"){
const html=await getHTML(src.url);
if(html) items=parseHTML(html);
}

if(src.type==="json"){
const json=await getJSON(src.url);
if(json) items=parseReddit(json);
}

for(const text of items){
const key=text.toLowerCase();
if(seen[key]) continue;

const s=score(text);

if(s>=10){
found.push({
text,
source:src.name,
score:s,
level:level(s),
time:new Date().toLocaleTimeString()
});
seen[key]=true;
}
}
}

found.sort((a,b)=>b.score-a.score);

const hist=store.get("history")||[];
const merged=[...found,...hist].slice(0,75);

store.set("history",merged);
store.set("seen",seen);

send("results",merged);
send("progress",100);
send("stage","Complete");

if(found.length){
const top=found[0];

new Notification({
title:"Feretory Alert",
body:top.text
}).show();

if(!inQuietHours()){
send("play-alert",top.level);
}
}

busy=false;
}

function loop(){
if(timer) clearInterval(timer);
scan();
timer=setInterval(scan,settings().interval);
}

ipcMain.on("manual-scan",scan);

ipcMain.on("save-settings",(e,data)=>{
store.set("settings",data);
loop();
});

ipcMain.on("request-cache",()=>{
send("settings",settings());
send("results",store.get("history")||[]);
});

app.whenReady().then(()=>{
createWindow();
createTray();
loop();
});
