import { audio } from './audio.js';

const SAVE_KEY = 'escape-prototype-save-v1';
const $ = id => document.getElementById(id);
const screens = ['loading', 'title', 'novel', 'escape', 'end'];
let scenario, room, keypadInput = '';
let state = freshState();

function freshState() { return { version:1, mode:'novel', novelScene:'opening', novelIndex:0, direction:'front', inventory:[], selectedItem:null, acquiredItems:[], flags:{ boxOpened:false, keypadUnlocked:false, escaped:false, drawerSearched:false } }; }
function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
function hasSave() { return localStorage.getItem(SAVE_KEY) !== null; }
function load() { try { const parsed=JSON.parse(localStorage.getItem(SAVE_KEY)); if(parsed?.version===1) state={...freshState(),...parsed,flags:{...freshState().flags,...parsed.flags}}; } catch { localStorage.removeItem(SAVE_KEY); } }
function show(name) { screens.forEach(id => $(id).classList.toggle('hidden', id!==name)); state.mode=name==='title'?state.mode:name; if(name!=='title'&&name!=='loading') save(); }
function title() { show('title'); $('continue-game').disabled=!hasSave(); }
function startNew() { localStorage.removeItem(SAVE_KEY); state=freshState(); save(); renderNovel(); }
function continueGame() { load(); renderMode(); }
function renderMode() { if(state.mode==='novel') renderNovel(); else if(state.mode==='escape') renderEscape(); else if(state.mode==='end') show('end'); else renderNovel(); }

function renderNovel() {
  show('novel'); const scene=scenario[state.novelScene]; const line=scene.lines[state.novelIndex];
  $('novel-scene-label').textContent=scene.label; $('speaker').textContent=line.speaker; $('dialogue-text').textContent=line.text;
}
function advanceNovel() {
  const scene=scenario[state.novelScene];
  if(state.novelIndex < scene.lines.length-1) state.novelIndex++;
  else if(scene.nextMode==='escape') { state.mode='escape'; state.novelIndex=0; renderEscape(); return; }
  else { state.mode='end'; show('end'); return; }
  save(); renderNovel(); audio.play('click');
}

function renderEscape() {
  show('escape'); $('direction-label').textContent=state.direction.toUpperCase();
  $('room-art').className=`room-art ${state.direction}`; $('room-art').dataset.direction=state.direction.toUpperCase();
  const host=$('hotspots'); host.replaceChildren();
  room.hotspots.filter(h=>h.direction===state.direction).forEach(h=>{ const b=document.createElement('button'); b.className='hotspot'; b.setAttribute('aria-label',`${h.id}を調べる`); Object.assign(b.style,{left:`${h.rect.x}%`,top:`${h.rect.y}%`,width:`${h.rect.width}%`,height:`${h.rect.height}%`}); b.addEventListener('click',()=>inspect(h)); host.append(b); });
  renderInventory(); save();
}
function turn(delta) { const i=room.directions.indexOf(state.direction); state.direction=room.directions[(i+delta+4)%4]; renderEscape(); audio.play('click'); }
function message(text) { $('message').textContent=text; }
function take(item) { if(!state.inventory.includes(item)) state.inventory.push(item); if(!state.acquiredItems.includes(item)) state.acquiredItems.push(item); audio.play('item'); }
function inspect(h) {
  if(h.event==='takeItem' && !state.acquiredItems.includes(h.item)) { take(h.item); if(h.setFlag) state.flags[h.setFlag]=true; message(h.firstMessage); }
  else if(h.event==='unlockBox') {
    if(state.flags.boxOpened) message('箱は空だ。');
    else if(state.selectedItem===h.requiredItem) { state.flags.boxOpened=true; state.inventory=state.inventory.filter(i=>i!==h.requiredItem); state.selectedItem=null; take('numberMemo'); message(h.successMessage); }
    else message(h.message);
  } else if(h.event==='keypad') { message(h.message); openKeypad(); }
  else if(h.event==='exit' && state.flags.keypadUnlocked) { state.flags.escaped=true; state.mode='novel'; state.novelScene='ending'; state.novelIndex=0; save(); renderNovel(); return; }
  else message(h.message);
  renderInventory(); save();
}
function renderInventory() {
  const host=$('inventory'); host.replaceChildren();
  state.inventory.forEach(id=>{ const item=room.items[id], b=document.createElement('button'); b.className=`item${state.selectedItem===id?' selected':''}`; b.setAttribute('aria-label',`${item.name}を選択`); b.innerHTML=`<span class="icon">${item.icon}</span>${item.name}`; b.addEventListener('click',()=>{ state.selectedItem=state.selectedItem===id?null:id; message(state.selectedItem?`${item.name}を選択した。`:'選択を解除した。'); renderInventory(); save(); }); if(item.detailType){ const d=document.createElement('span'); d.className='detail'; d.textContent='＋'; d.setAttribute('aria-label','詳細を見る'); d.addEventListener('click',e=>{e.stopPropagation();openItem(id)}); b.append(d); } host.append(b); });
}
function openItem(id) { const item=room.items[id]; $('item-name').textContent=item.name; $('item-description').textContent=item.description; $('item-visual').className=item.detailType==='note'?'item-note':'item-key'; $('item-visual').textContent=item.detailText||item.icon; $('item-modal').classList.remove('hidden'); }
function closeItem() { $('item-modal').classList.add('hidden'); }
function openKeypad() { keypadInput=''; updateKeypad(); $('keypad-modal').classList.remove('hidden'); }
function updateKeypad() { $('keypad-display').textContent=(keypadInput+'---').slice(0,3); }
function pressKey(value) { if(value==='C') keypadInput=''; else if(keypadInput.length<3) keypadInput+=value; updateKeypad(); if(keypadInput.length===3){ if(keypadInput===room.puzzle.keypad.answer){ state.flags.keypadUnlocked=true; message(room.puzzle.keypad.successMessage); save(); setTimeout(()=>$('keypad-modal').classList.add('hidden'),350); } else { message(room.puzzle.keypad.wrongMessage); setTimeout(()=>{keypadInput='';updateKeypad()},400); } } }

async function init() {
  try { [scenario,room]=await Promise.all([fetch('./data/scenario.json').then(r=>r.json()),fetch('./data/room.json').then(r=>r.json())]); }
  catch { $('loading').innerHTML='<p>データを読み込めませんでした。HTTPサーバーから開いてください。</p>'; return; }
  const keys=$('keypad-buttons'); ['1','2','3','4','5','6','7','8','9','C','0'].forEach(k=>{const b=document.createElement('button');b.textContent=k;b.addEventListener('click',()=>pressKey(k));keys.append(b)});
  $('new-game').addEventListener('click',startNew); $('continue-game').addEventListener('click',continueGame); $('novel').addEventListener('click',advanceNovel); $('novel').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' ')advanceNovel()}); $('turn-left').addEventListener('click',()=>turn(-1)); $('turn-right').addEventListener('click',()=>turn(1)); $('to-title').addEventListener('click',title); $('end-title').addEventListener('click',title); $('keypad-close').addEventListener('click',()=>$('keypad-modal').classList.add('hidden')); $('item-close').addEventListener('click',closeItem); $('item-modal').addEventListener('click',e=>{if(e.target===$('item-modal'))closeItem()});
  title();
}
init();
