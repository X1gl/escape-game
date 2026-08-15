import { isEnabled, play, setEnabled, startHum, stopHum } from "./audio.js";

const app = document.querySelector("#app");
const DIRECTIONS = ["FRONT", "RIGHT", "BACK", "LEFT"];
let data;
let touchStartX = null;
let timers = [];

const freshState = () => ({
  version: 1,
  screen: "novel",
  novelIndex: 0,
  direction: "FRONT",
  inventory: [],
  selectedItem: null,
  flags: {},
  hintLevel: 0,
  speaker: "",
  message: "",
  modal: null,
  keypad: "",
  keypadLength: 3,
  knobBeat: 0,
  escapeEventIndex: 0,
  escape02Index: 0,
  area: "staff",
  updatedAt: new Date(0).toISOString(),
});

let state = { ...freshState(), screen: "title" };

async function loadData() {
  const names = ["scenario", "room", "room2", "items", "documents", "flags", "hints"];
  const values = await Promise.all(names.map(async (name) => {
    const response = await fetch(`./data/${name}.json`);
    if (!response.ok) throw new Error(`${name}.json could not be loaded`);
    return response.json();
  }));
  data = Object.fromEntries(names.map((name, index) => [name, values[index]]));
  ensurePersistentData();
  render();
}

function ensurePersistentData() {
  if (!localStorage.getItem(data.flags.persistentKey)) {
    localStorage.setItem(data.flags.persistentKey, JSON.stringify(data.flags.defaults));
  }
  if (!localStorage.getItem(data.flags.metaKey)) {
    localStorage.setItem(data.flags.metaKey, JSON.stringify({ starts: 0, clears: 0, lastPlayedAt: null }));
  }
}

function readSave() {
  try {
    const raw = localStorage.getItem(data.flags.saveKey);
    return raw ? { ...freshState(), ...JSON.parse(raw), modal: null, keypad: "", knobBeat: 0 } : null;
  } catch {
    return null;
  }
}

function save() {
  if (state.screen === "title") return;
  const payload = {
    version: state.version,
    screen: state.screen,
    novelIndex: state.novelIndex,
    direction: state.direction,
    inventory: state.inventory,
    selectedItem: state.selectedItem,
    flags: state.flags,
    hintLevel: state.hintLevel,
    speaker: state.speaker,
    message: state.message,
    escapeEventIndex: state.escapeEventIndex,
    escape02Index: state.escape02Index,
    area: state.area,
    updatedAt: new Date().toISOString(),
  };
  localStorage.setItem(data.flags.saveKey, JSON.stringify(payload));
  updateMeta({ lastPlayedAt: payload.updatedAt });
}

function updateMeta(changes) {
  let meta = { starts: 0, clears: 0, lastPlayedAt: null };
  try { meta = { ...meta, ...JSON.parse(localStorage.getItem(data.flags.metaKey) || "{}") }; } catch { /* use defaults */ }
  localStorage.setItem(data.flags.metaKey, JSON.stringify({ ...meta, ...changes }));
}

function mutate(changes, shouldSave = true) {
  state = { ...state, ...changes };
  if (shouldSave) save();
  render();
}

function setFlags(changes) {
  state.flags = { ...state.flags, ...changes };
}

function hasItem(id) {
  return state.inventory.includes(id);
}

function addItem(id) {
  if (!hasItem(id)) state.inventory = [...state.inventory, id];
  state.selectedItem = id;
  play("item");
}

function removeItem(id) {
  state.inventory = state.inventory.filter((item) => item !== id);
  if (state.selectedItem === id) state.selectedItem = null;
}

function say(message, speaker = "悠") {
  state.message = message;
  state.speaker = speaker;
}

function clearTimers() {
  timers.forEach(window.clearTimeout);
  timers = [];
}

function begin() {
  play("tap");
  clearTimers();
  localStorage.removeItem(data.flags.saveKey);
  let meta = {};
  try { meta = JSON.parse(localStorage.getItem(data.flags.metaKey) || "{}"); } catch { /* ignore */ }
  updateMeta({ starts: (meta.starts || 0) + 1 });
  state = freshState();
  state.speaker = data.scenario.intro[0].speaker;
  state.message = data.scenario.intro[0].text;
  save();
  render();
}

function resume() {
  const saved = readSave();
  if (!saved) return begin();
  play("tap");
  state = saved;
  if (state.screen === "room") {
    state.message ||= data.scenario.escape01.openingMessage;
    state.speaker ||= "悠";
  }
  if (state.screen === "room2") {
    state.message ||= data.scenario.escape02.openingMessage;
    state.speaker ||= "悠";
  }
  render();
}

function advanceNovel() {
  play("tap");
  const next = state.novelIndex + 1;
  if (next >= data.scenario.intro.length) {
    state.screen = "room";
    state.speaker = "悠";
    state.message = data.scenario.escape01.openingMessage;
    save();
    render();
    startHum();
    return;
  }
  state.novelIndex = next;
  state.speaker = data.scenario.intro[next].speaker;
  state.message = data.scenario.intro[next].text;
  save();
  render();
}

function rotate(delta) {
  play("tap");
  const current = DIRECTIONS.indexOf(state.direction);
  mutate({ direction: DIRECTIONS[(current + delta + DIRECTIONS.length) % DIRECTIONS.length] });
}

function triggerFootsteps() {
  if (state.flags.footstepsDone) return;
  setFlags({ footstepsDone: true });
  say("……足音が、近づいてくる。", "");
  save();
  render();
  [750, 1450, 2700].forEach((delay, index) => {
    timers.push(window.setTimeout(() => {
      state.knobBeat = index + 1;
      play("knob");
      render();
    }, delay));
  });
  timers.push(window.setTimeout(() => {
    state.knobBeat = 0;
    say("三度、ノブが回った。……足音は、遠ざかっていく。");
    save();
    render();
  }, 3900));
}

function interact(id) {
  play("tap");
  if (state.screen === "room2") return interact02(id);
  switch (id) {
    case "door":
      if (state.flags.doorUnlocked) {
        stopHum();
        play("unlock");
        let meta = {};
        try { meta = JSON.parse(localStorage.getItem(data.flags.metaKey) || "{}"); } catch { /* ignore */ }
        updateMeta({ clears: Math.max(1, meta.clears || 0) });
        mutate({ screen: "escape-event", escapeEventIndex: 0 });
        return;
      }
      say(state.flags.footstepsDone ? "今なら開けられるはずだ。点検パネルを確認しよう。" : "開かない。外側から施錠されているようだ。");
      break;
    case "doorTrace":
      setFlags({ sawDoorTrace: true });
      say("名札を外したネジ穴。塗装の跡が、うっすら『207』に見える。");
      break;
    case "panel":
      if (!state.flags.panelOpened) {
        if (state.selectedItem !== "metal_piece") {
          say("プラスねじが四本。ドライバーはない。平たくて硬い物なら……。");
          break;
        }
        setFlags({ panelOpened: true });
        say("金属片の先端がねじ溝に入った。四本とも外せた。……中のワイヤーが切り離されている。");
        play("metal");
        save();
        render();
        if (state.flags.lockerOpened) timers.push(window.setTimeout(triggerFootsteps, 700));
        return;
      }
      if (state.flags.doorUnlocked) {
        say("非常解錠レバーは、もう作動している。");
        break;
      }
      if (state.selectedItem !== "inner_lock") {
        say("レバーまでワイヤーが届かない。引っ掛けられる部品が必要だ。");
        break;
      }
      setFlags({ doorUnlocked: true });
      removeItem("inner_lock");
      say("古い内鍵部品をワイヤーに掛け、レバーを引く。扉の奥で、錠が外れる音がした。");
      play("unlock");
      break;
    case "wagon":
      if (!state.flags.memoryWagon) {
        setFlags({ memoryWagon: true });
        say("ガシャァン――！　金属音。暗い床。誰かの手。……それ以上は、思い出せない。", "");
      } else if (!hasItem("tweezers")) {
        addItem("tweezers");
        setFlags({ gotTweezers: true });
        say("トレイの隅に医療用ピンセットが残っていた。使えるかもしれない。");
      } else {
        say("古い医療用ワゴンだ。ぶつけたような新しい凹みがある。");
      }
      break;
    case "sink":
      if (state.flags.gotSmallKey) {
        say("洗面台の隙間には、もう何もない。");
      } else if (state.selectedItem !== "tweezers") {
        say("排水管の裏に小さな鍵が見える。指では届かない。");
      } else {
        addItem("small_key");
        setFlags({ gotSmallKey: true });
        say("ピンセットで、小さな鍵をつまみ出した。");
      }
      break;
    case "cabinet":
      if (state.flags.cabinetOpened) {
        say("中に残っていた物は回収した。『207 経過観察室』――ここは、207号室だったらしい。");
      } else if (state.selectedItem !== "small_key") {
        say("金属製キャビネット。小さな鍵穴がある。");
      } else {
        setFlags({ cabinetOpened: true, hasFlashlight: true, readWardDoc: true });
        removeItem("small_key");
        addItem("flashlight");
        say("懐中電灯と古い院内資料。見出しは『207 経過観察室』。別紙には、何日分もの『施錠・朝食・昼食・夕食』が並んでいる。");
      }
      break;
    case "opening":
      setFlags({ sawOpening: true });
      say("高い位置に古い開口がある。板が打たれていて、今は開きそうにない。……換気口か。");
      break;
    case "bed":
      if (!state.flags.hasFlashlight) say("ベッドの下は暗くて見えない。");
      else {
        setFlags({ sawScratches: true });
        say("ベッド下の床際に、日数を数えたような傷がいくつもある。数える気にはなれない。");
      }
      break;
    case "metalPiece":
      if (!state.flags.hasFlashlight) say("暗くて、奥までは見えない。");
      else if (!state.flags.gotMetalPiece) {
        addItem("metal_piece");
        setFlags({ gotMetalPiece: true });
        say("床際の擦れ跡。その奥に、薄い金属片が隠れていた。平たい先端なら何かに使えそうだ。");
      } else say("ここには小さな擦れ跡だけが残っている。");
      break;
    case "locker":
      if (state.flags.lockerOpened) say("ロッカーは空だ。古い内鍵の部品は手元にある。");
      else {
        state.modal = "keypad";
        state.keypad = "";
      }
      break;
    case "shelf":
      if (!state.flags.shelfMoved) {
        setFlags({ shelfMoved: true });
        say("重い棚を少しずつずらす。裏の低い位置に、拙い猫と星の落書きがあった。古いものだ。");
      } else say("猫と星の落書き。誰が描いたものだろう。");
      break;
    default:
      return;
  }
  save();
  render();
}

function startEscape02() {
  play("tap");
  clearTimers();
  mutate({ screen: "escape02-intro", escape02Index: 0, direction: "FRONT", area: "staff", selectedItem: null, message: "", speaker: "" });
}

function advanceEscape02Intro() {
  play("tap");
  const next = state.escape02Index + 1;
  if (next >= data.scenario.escape02.intro.length) {
    mutate({ screen: "room2", escape02Index: 0, speaker: "悠", message: data.scenario.escape02.openingMessage });
    return;
  }
  mutate({ escape02Index: next });
}

function enterRecordsRoom() {
  mutate({ screen: "escape02-records-intro", escape02Index: 0, direction: "FRONT", area: "records", selectedItem: null });
}

function advanceRecordsIntro() {
  play("tap");
  const next = state.escape02Index + 1;
  if (next >= data.scenario.escape02.recordsIntro.length) {
    mutate({ screen: "room2", escape02Index: 0, speaker: "悠", message: "棚の奥に、分類されていない診療記録がある。" });
    return;
  }
  mutate({ escape02Index: next });
}

function advanceEscape02End() {
  play("tap");
  const next = state.escape02Index + 1;
  if (next >= data.scenario.escape02.ending.length) {
    mutate({ screen: "escaped2", escape02Index: 0 });
    return;
  }
  mutate({ escape02Index: next });
}

function interact02(id) {
  switch (id) {
    case "clock2": setFlags({ sawClock2: true }); say("時計は2月6日、午前0時を少し過ぎている。止まっていない。"); break;
    case "staffExit": say("廊下へ戻るより、ここを調べる。まだ使われているなら、咲の痕跡もあるかもしれない。"); break;
    case "fridge2": setFlags({ sawFridge2: true }); say("冷蔵庫は通電している。中には新しい飲み物と、今日の日付の弁当がある。"); break;
    case "sink2": setFlags({ sawSink2: true }); say("流し台は濡れている。ついさっき、誰かが使ったようだ。"); break;
    case "trash2": setFlags({ sawTrash2: true }); say("ゴミ箱に、処置室2の清掃記録が捨てられている。ここは廃院じゃない。"); break;
    case "board2": setFlags({ sawBoard2: true }); say("掲示板の担当表。『記録担当：STAFF C』。横のホワイトボードには『2/6 搬入・消耗品補充・処置室2 清掃』とある。"); break;
    case "locker2":
      if (!state.flags.sawBoard2) say("職員ロッカー。どの扉を調べればいいか、担当表を見よう。");
      else if (!hasItem("staff_card")) { addItem("staff_card"); setFlags({ gotStaffCard: true }); say("STAFF Cのロッカーに職員証が残っていた。ID:4721。"); }
      else say("STAFF Cのロッカーは空だ。");
      break;
    case "pc2":
      if (!hasItem("staff_card")) say("業務用PCはログイン画面のままだ。職員用の認証が必要らしい。");
      else if (state.selectedItem !== "staff_card") say("職員証を使えそうだ。");
      else { setFlags({ pcLoggedIn: true }); say("ID:4721でログインできた。業務画面に『記録室認証：職員番号下2桁＋当日の日付（日）』と表示されている。認証は更新済み。 "); }
      break;
    case "recordsDoor2":
      if (!state.flags.pcLoggedIn) say("4桁電子ロック。職員証のIDをそのまま入れても反応しない。");
      else { state.modal = "keypad2"; state.keypad = ""; state.keypadLength = 4; render(); }
      return;
    case "records2": setFlags({ readRecords2: true }); say("M-04、F-02、M-11……名前も住所もない。M-11の欄には『銃創』。名前を書けないんじゃない。書かないようにしてる。"); break;
    case "shelves2": setFlags({ sawFormalShelves2: true }); say("正式なカルテ棚とは別に、匿名の患者だけをまとめた記録がある。単なる記入漏れじゃない。"); break;
    case "cabinet2":
      if (!state.flags.readRecords2) say("鍵付きキャビネット。近くの記録を先に確認しよう。");
      else if (!hasItem("passage_key")) { addItem("passage_key"); addItem("management_sheet"); setFlags({ cabinetOpened2: true }); say("記録分類と同じ色の仕切りをずらすと、キャビネットの錠が外れた。鍵と管理表が入っている。"); }
      else say("キャビネットは空だ。");
      break;
    case "management2":
      if (!hasItem("management_sheet")) say("キャビネットの中に、今日の管理表がある。");
      else say("最下部に『侵入 2』。誰のことだ？");
      break;
    case "passageDoor2":
      if (!hasItem("passage_key")) say("スタッフ専用通路の扉。鍵が掛かっている。");
      else mutate({ screen: "escape02-end", escape02Index: 0, selectedItem: null });
      return;
    default: return;
  }
  save(); render();
}

function submitKeypad() {
  if (state.modal === "keypad2") {
    if (state.keypad !== "2106") { play("knob"); state.keypad = ""; render(); return; }
    state.modal = null;
    setFlags({ recordsDoorUnlocked: true });
    say("2106。電子錠が解除された。診療記録室に入れる。");
    save(); render();
    timers.push(window.setTimeout(enterRecordsRoom, 900));
    return;
  }
  if (state.keypad !== "207") {
    play("knob");
    state.keypad = "";
    render();
    return;
  }
  state.modal = null;
  setFlags({ lockerOpened: true });
  addItem("inner_lock");
  say("ロッカーが開いた。中に古い内鍵の部品がある。今の扉から、意図的に取り外された物と同じ形だ。");
  save();
  render();
  if (state.flags.panelOpened) timers.push(window.setTimeout(triggerFootsteps, 700));
}

function room2Art() {
  const base = state.area === "staff" ? "staffroom" : "records";
  const file = `${base}-${state.direction.toLowerCase()}-v1.webp`;
  return `<div class="room-art asset-art" style="--room-image:url('assets/escape02/${file}')" aria-hidden="true"></div>`;
}

function objectArt(file, className) {
  return `<img class="scene-object ${className}" src="assets/room207/objects-v2/${file}" alt="" aria-hidden="true">`;
}

function roomBackdrop(direction) {
  return `<div class="room-art asset-art chapter1-backdrop" style="--room-image:url('assets/room207/backgrounds-v2/${direction}-clean-v3.webp')" aria-hidden="true"></div>`;
}

function roomArt() {
  const flags = state.flags;
  if (state.direction === "FRONT") {
    const door = flags.panelOpened ? "front-door-panel-open-v2.webp" : "front-door-closed-v2.webp";
    return `${roomBackdrop("front")}${objectArt(door, "object-front-door")}`;
  }
  if (state.direction === "RIGHT") {
    const cabinet = flags.cabinetOpened ? "right-cabinet-open-v2.webp" : "right-cabinet-closed-v2.webp";
    return `${roomBackdrop("right")}${objectArt("right-mirror-v3.webp", "object-right-mirror")}${objectArt("right-sink-v3.webp", "object-right-sink")}${objectArt(cabinet, flags.cabinetOpened ? "object-right-cabinet-open" : "object-right-cabinet")}`;
  }
  if (state.direction === "BACK") {
    const metalPiece = flags.hasFlashlight && !flags.gotMetalPiece
      ? objectArt("back-metal-piece-v2.webp", "object-back-metal-piece")
      : "";
    const locker = flags.lockerOpened ? "back-locker-open-v2.webp" : "back-locker-closed-v2.webp";
    const lockerClass = flags.lockerOpened ? "object-back-locker-open" : "object-back-locker";
    return `${roomBackdrop("back")}${objectArt("back-opening-v2.webp", "object-back-opening")}${objectArt("back-bed-v3.webp", "object-back-bed")}${objectArt(locker, lockerClass)}${metalPiece}`;
  }
  const shelf = flags.shelfMoved ? "left-shelf-moved-v2.webp" : "left-shelf-base-v2.webp";
  const wagon = flags.shelfMoved && !flags.gotTweezers ? "left-wagon-tweezers-v2.webp" : "left-wagon-empty-v2.webp";
  return `${roomBackdrop("left")}${objectArt(shelf, flags.shelfMoved ? "object-left-shelf-moved" : "object-left-shelf")}${objectArt(wagon, "object-left-wagon")}`;
}

function titleTemplate() {
  const canResume = Boolean(readSave());
  return `<section class="title-screen"><div class="title-noise"></div><div class="title-copy">
    <p class="eyebrow">旧深山病院 / CHAPTER 1</p><h1><span>escape</span><span>game</span></h1><p class="title-number">ROOM <b>207</b></p>
    <p class="title-lead">廃院のはずだった。<br>けれど、どこかで設備が動いている。</p></div>
    <div class="title-actions"><button class="primary-button" data-action="begin">はじめから</button><button class="secondary-button" data-action="resume" ${canResume ? "" : "disabled"}>つづきから</button>
    ${canResume ? '<button class="text-button" data-action="menu">データ管理</button>' : ""}</div><p class="version-mark">ESCAPE 01 · ROOM 207</p></section>`;
}

function novelTemplate() {
  const line = data.scenario.intro[state.novelIndex];
  return `<section class="novel-screen" data-action="novel" role="button" tabindex="0"><div class="novel-room"><div class="novel-door"></div><div class="novel-bed"></div></div><div class="vignette"></div>
    <div class="novel-box"><p class="novel-speaker">${line.speaker}</p><p>${line.text}</p><span>tap</span></div></section>`;
}

function roomTemplate() {
  const view = data.room.views[state.direction];
  const selected = state.selectedItem ? data.items[state.selectedItem] : null;
  const hotspots = view.hotspots.filter((spot) => !(spot.id === "metalPiece" && state.flags.gotMetalPiece)).map((spot) =>
    `<button class="hotspot hotspot-${spot.id}" data-interact="${spot.id}" style="left:${spot.x}%;top:${spot.y}%;width:${spot.w}%;height:${spot.h}%" aria-label="${spot.label}"><span>${spot.label}</span></button>`).join("");
  const inventory = state.inventory.length ? state.inventory.map((id) => `<button class="item-card ${state.selectedItem === id ? "selected" : ""}" data-item="${id}"><span class="item-icon item-${id}"></span><small>${data.items[id].name}</small></button>`).join("") : '<p class="empty-inventory">まだ何も持っていない</p>';
  return `<section class="room-screen"><header class="room-header"><div><span>CHAPTER 1</span><strong>${data.scenario.escape01.room}</strong></div><div class="header-actions">
    <button data-action="sound" aria-label="${isEnabled() ? "音を消す" : "音を出す"}">${isEnabled() ? "音 ON" : "音 OFF"}</button><button data-action="hint">ヒント</button><button data-action="menu" aria-label="メニュー">•••</button></div></header>
    <div class="scene-wrap">${roomArt()}<div class="direction-chip">${view.label}</div>${hotspots}<button class="turn-button turn-left" data-action="left" aria-label="左を向く">‹</button><button class="turn-button turn-right" data-action="right" aria-label="右を向く">›</button>
    ${state.knobBeat ? `<div class="knob-event"><span class="knob-ring"></span><b>${state.knobBeat === 3 ? "……ガチャ" : "ガチャ"}</b></div>` : ""}</div>
    <div class="message-box"><p class="message-speaker">${state.speaker}</p><p>${state.message}</p></div><div class="inventory-wrap"><div class="inventory-title"><span>ITEM</span><small>${selected ? `${selected.name}を選択中` : "使うアイテムを選択"}</small></div>
    <div class="inventory-list">${inventory}${selected ? '<button class="detail-button" data-action="item-detail">詳細</button>' : ""}</div></div></section>`;
}

function room2Template() {
  const views = state.area === "staff" ? data.room2.staffViews : data.room2.recordViews;
  const view = views[state.direction];
  const selected = state.selectedItem ? data.items[state.selectedItem] : null;
  const hotspots = view.hotspots.map((spot) => `<button class="hotspot hotspot-${spot.id}" data-interact="${spot.id}" style="left:${spot.x}%;top:${spot.y}%;width:${spot.w}%;height:${spot.h}%" aria-label="${spot.label}"><span>${spot.label}</span></button>`).join("");
  const inventory = state.inventory.length ? state.inventory.map((id) => `<button class="item-card ${state.selectedItem === id ? "selected" : ""}" data-item="${id}"><span class="item-icon item-${id}"></span><small>${data.items[id].name}</small></button>`).join("") : '<p class="empty-inventory">まだ何も持っていない</p>';
  const roomName = state.area === "staff" ? data.scenario.escape02.room : "本棟・診療記録室";
  return `<section class="room-screen"><header class="room-header"><div><span>CHAPTER 1 / ESCAPE 02</span><strong>${roomName}</strong></div><div class="header-actions"><button data-action="sound">${isEnabled() ? "音 ON" : "音 OFF"}</button><button data-action="menu" aria-label="メニュー">•••</button></div></header><div class="scene-wrap">${room2Art()}<div class="direction-chip">${view.label}</div>${hotspots}<button class="turn-button turn-left" data-action="left" aria-label="左を向く">‹</button><button class="turn-button turn-right" data-action="right" aria-label="右を向く">›</button></div><div class="message-box"><p class="message-speaker">${state.speaker}</p><p>${state.message}</p></div><div class="inventory-wrap"><div class="inventory-title"><span>ITEM</span><small>${selected ? `${selected.name}を選択中` : "使うアイテムを選択"}</small></div><div class="inventory-list">${inventory}${selected ? '<button class="detail-button" data-action="item-detail">詳細</button>' : ""}</div></div></section>`;
}

function escape02NovelTemplate(kind) {
  const lines = kind === "intro" ? data.scenario.escape02.intro : data.scenario.escape02.recordsIntro;
  const line = lines[state.escape02Index];
  const image = kind === "intro" ? "staffroom-front-v1.webp" : "records-front-v1.webp";
  const action = kind === "intro" ? "escape02-intro" : "records-intro";
  return `<section class="novel-screen escape02-event" data-action="${action}" role="button" tabindex="0"><div class="novel-room asset-art" style="--room-image:url('assets/escape02/${image}')"></div><div class="vignette"></div><div class="novel-box"><p class="novel-speaker">${line.speaker}</p><p>${line.text}</p><span>tap</span></div></section>`;
}

function escape02EndTemplate() {
  const line = data.scenario.escape02.ending[state.escape02Index];
  return `<section class="novel-screen escape02-event" data-action="escape02-end" role="button" tabindex="0"><div class="novel-room asset-art" style="--room-image:url('assets/escape02/records-right-v1.webp')"></div><div class="vignette"></div><div class="novel-box"><p class="novel-speaker">${line.speaker}</p><p>${line.text}</p><span>tap</span></div></section>`;
}

function escaped2Template() {
  return `<section class="escape-screen"><div class="corridor" aria-hidden="true"></div><div class="escape-copy"><p>ESCAPE 02</p><h2>診療記録室を抜けた</h2><span>この施設は、今も動いている。</span><strong>『侵入 2』は、誰を数えた記録だ。</strong><button data-action="title">タイトルへ戻る</button><small>次回実装：第3脱出「搬送・備品管理区画」</small></div></section>`;
}

function escapedTemplate() {
  return `<section class="escape-screen"><div class="corridor" aria-hidden="true"></div><div class="escape-copy"><p>ESCAPE 01</p><h2>${data.scenario.escape01.clearTitle}</h2>
    <span>${data.scenario.escape01.clearLines[0]}</span><strong>${data.scenario.escape01.clearLines[1]}</strong><button data-action="start-escape02">スタッフルームへ進む</button><button class="sub-clear-button" data-action="title">タイトルへ戻る</button></div></section>`;
}

function escapeEventTemplate() {
  const line = data.scenario.escape01.belongingEvent[state.escapeEventIndex];
  return `<section class="novel-screen escape-event" data-action="escape-event" role="button" tabindex="0"><div class="escape-event-room"></div><div class="vignette"></div>
    <div class="novel-box"><p class="novel-speaker">${line.speaker}</p><p>${line.text}</p><span>tap</span></div></section>`;
}

function advanceEscapeEvent() {
  play("tap");
  const next = state.escapeEventIndex + 1;
  if (next >= data.scenario.escape01.belongingEvent.length) {
    state.screen = "escaped";
    state.escapeEventIndex = 0;
    save();
    render();
    return;
  }
  state.escapeEventIndex = next;
  if (next === 3 && !state.flags.sakiStrapFound) {
    addItem("saki_strap");
    setFlags({ sakiStrapFound: true });
  }
  save();
  render();
}

function modalTemplate() {
  if (!state.modal) return "";
  let content = "";
  if (state.modal === "keypad" || state.modal === "keypad2") {
    const buttons = [1,2,3,4,5,6,7,8,9,"消",0,"決定"].map((key) => `<button data-key="${key}">${key}</button>`).join("");
    const isSecond = state.modal === "keypad2";
    content = `<p class="modal-kicker">${isSecond ? "RECORDS ROOM" : "SMALL LOCKER"}</p><h2>${isSecond ? "4桁電子ロック" : "3桁ダイヤル"}</h2><div class="keypad-display">${state.keypad.padEnd(isSecond ? 4 : 3, "·")}</div><div class="keypad-grid">${buttons}</div>`;
  } else if (state.modal === "item") {
    const item = data.items[state.selectedItem];
    content = `<p class="modal-kicker">ITEM DETAIL</p><h2>${item.name}</h2><span class="large-item-icon item-${state.selectedItem}"></span><p>${item.description}</p>`;
  } else if (state.modal === "hint") {
    const level = Math.min(state.hintLevel, 2);
    content = `<p class="modal-kicker">HINT / ${level + 1}</p><h2>行き詰まったときは</h2><div class="hint-text"><span>段階 ${level + 1}</span><p>${data.hints.escape01[level]}</p></div>
      <button class="modal-action" data-action="next-hint" ${level >= 2 ? "disabled" : ""}>もう少し詳しいヒント</button>`;
  } else if (state.modal === "menu") {
    content = `<p class="modal-kicker">DATA</p><h2>データ管理</h2><p>進行状況は、この端末のブラウザに自動保存されています。</p><button class="danger-button" data-action="delete-all">全データを削除</button>`;
  }
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal modal-${state.modal}" role="dialog" aria-modal="true"><button class="modal-close" data-action="close-modal" aria-label="閉じる">×</button>${content}</section></div>`;
}

function render() {
  const screen = state.screen === "title" ? titleTemplate() : state.screen === "novel" ? novelTemplate() : state.screen === "room" ? roomTemplate() : state.screen === "room2" ? room2Template() : state.screen === "escape-event" ? escapeEventTemplate() : state.screen === "escape02-intro" ? escape02NovelTemplate("intro") : state.screen === "escape02-records-intro" ? escape02NovelTemplate("records") : state.screen === "escape02-end" ? escape02EndTemplate() : state.screen === "escaped2" ? escaped2Template() : escapedTemplate();
  app.className = `game-shell screen-${state.screen}`;
  app.innerHTML = screen + modalTemplate();
  bindEvents();
  if (state.screen === "room" || state.screen === "room2") startHum();
  else stopHum();
}

function bindEvents() {
  app.querySelectorAll("[data-action]").forEach((element) => element.addEventListener("click", (event) => {
    const action = element.dataset.action;
    if (action === "begin") begin();
    else if (action === "resume") resume();
    else if (action === "novel") advanceNovel();
    else if (action === "escape-event") advanceEscapeEvent();
    else if (action === "start-escape02") startEscape02();
    else if (action === "escape02-intro") advanceEscape02Intro();
    else if (action === "records-intro") advanceRecordsIntro();
    else if (action === "escape02-end") advanceEscape02End();
    else if (action === "left") rotate(-1);
    else if (action === "right") rotate(1);
    else if (action === "sound") { setEnabled(!isEnabled()); render(); }
    else if (action === "hint") mutate({ modal: "hint" }, false);
    else if (action === "menu") mutate({ modal: "menu" }, false);
    else if (action === "item-detail") mutate({ modal: "item" }, false);
    else if (action === "next-hint" && state.hintLevel < 2) mutate({ hintLevel: state.hintLevel + 1, modal: "hint" });
    else if (action === "title") { stopHum(); mutate({ screen: "title", modal: null }, false); }
    else if (action === "close-modal") {
      if (event.target.closest(".modal") && !event.target.classList.contains("modal-close")) return;
      mutate({ modal: null }, false);
    } else if (action === "delete-all") {
      if (!window.confirm("セーブ・周回解禁・記録をすべて消しますか？")) return;
      [data.flags.saveKey, data.flags.persistentKey, data.flags.metaKey].forEach((key) => localStorage.removeItem(key));
      ensurePersistentData();
      state = freshState();
      state.screen = "title";
      render();
    }
  }));
  app.querySelectorAll("[data-interact]").forEach((element) => element.addEventListener("click", () => interact(element.dataset.interact)));
  app.querySelectorAll("[data-item]").forEach((element) => element.addEventListener("click", () => {
    play("tap");
    mutate({ selectedItem: state.selectedItem === element.dataset.item ? null : element.dataset.item });
  }));
  app.querySelectorAll("[data-key]").forEach((element) => element.addEventListener("click", () => {
    play("tap");
    const key = element.dataset.key;
    if (key === "消") state.keypad = "";
    else if (key === "決定") return submitKeypad();
    else if (state.keypad.length < (state.modal === "keypad2" ? 4 : 3)) state.keypad += key;
    render();
  }));
  const scene = app.querySelector(".scene-wrap");
  if (scene) {
    scene.addEventListener("touchstart", (event) => { touchStartX = event.touches[0].clientX; }, { passive: true });
    scene.addEventListener("touchend", (event) => {
      if (touchStartX === null) return;
      const delta = event.changedTouches[0].clientX - touchStartX;
      touchStartX = null;
      if (Math.abs(delta) > 45) rotate(delta < 0 ? 1 : -1);
    }, { passive: true });
  }
}

window.addEventListener("keydown", (event) => {
  if (state.screen === "novel" && (event.key === "Enter" || event.key === " ")) advanceNovel();
  if (state.screen === "room" && !state.modal && event.key === "ArrowLeft") rotate(-1);
  if (state.screen === "room" && !state.modal && event.key === "ArrowRight") rotate(1);
  if (event.key === "Escape" && state.modal) mutate({ modal: null }, false);
});

loadData().catch((error) => {
  console.error(error);
  app.innerHTML = '<section class="load-error"><h1>読み込みに失敗しました</h1><p>通信環境を確認して、ページを再読み込みしてください。</p></section>';
});
