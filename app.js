/*************************************************
 * Storage Keys
 *************************************************/
const SRS_KEY = "srs_v3";
const DAILY_KEY = "daily_v3";

/*************************************************
 * Time helpers
 *************************************************/
function todayDay() {
  return Math.floor(Date.now() / 86400000);
}

/*************************************************
 * SRS
 *************************************************/
function loadSrs() {
  return JSON.parse(localStorage.getItem(SRS_KEY)) || {};
}
function saveSrs() {
  localStorage.setItem(SRS_KEY, JSON.stringify(srs));
}
let srs = loadSrs();

/*************************************************
 * Daily goal
 *************************************************/
function loadDaily() {
  return JSON.parse(localStorage.getItem(DAILY_KEY)) || {
    day: todayDay(),
    goodCount: 0,
    goal: 10
  };
}
function saveDaily() {
  localStorage.setItem(DAILY_KEY, JSON.stringify(daily));
}
let daily = loadDaily();

function ensureDaily() {
  const t = todayDay();
  if (daily.day !== t) {
    daily = { day: t, goodCount: 0, goal: daily.goal || 10 };
    saveDaily();
  }
}

/*************************************************
 * State
 *************************************************/
let cards = [];
let cardsByMode = [];
let index = 0;
let revealed = false;   // 英語表示
let showNote = false;   // NOTE表示（答え後）
let currentAnswer = "";

/*************************************************
 * DOM
 *************************************************/
const jpEl = document.getElementById("jp");
const enEl = document.getElementById("en");
const cardEl = document.getElementById("card");
const noteEl = document.getElementById("noteText");

const nextBtn = document.getElementById("next");
const videoBtn = document.getElementById("videoOrder");
const againBtn = document.getElementById("again");
const goodBtn = document.getElementById("good");
const reviewBtn = document.getElementById("review");

/*************************************************
 * CSV Loader
 * header:
 * no,jp,en,slots,video,lv,note,scene
 *************************************************/
async function loadCSV() {
  const res = await fetch("data.csv");
  const text = await res.text();
  cards = parseCSV(text);

  cardsByMode = getCardsByBlock(1);
  resetCardView();

  renderBlockButtons();
  renderSceneButtons();
  render();
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  lines.shift();

  return lines.map(line => {
    const cols = splitCSV(line);

    const no = Number(cols[0]);
    const jp = cols[1] || "";
    const en = cols[2] || "";
    const slotsRaw = cols[3] || "";
    const video = cols[4] || "";
    const lv = Number(cols[5] || "1");
    const note = cols[6] || "";
    const scene = cols[7] || "";

    let slots = null;
    if (slotsRaw) {
      slots = slotsRaw.split("|").map(s => {
        const [jpSlot, enSlot] = s.split("=");
        return { jp: jpSlot, en: enSlot };
      });
    }

    return { no, jp, en, slots, video, lv, note, scene };
  });
}

function splitCSV(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;

  for (let c of line) {
    if (c === '"') inQuotes = !inQuotes;
    else if (c === "," && !inQuotes) {
      result.push(cur);
      cur = "";
    } else cur += c;
  }
  result.push(cur);
  return result.map(s => s.replace(/^"|"$/g, ""));
}

/*************************************************
 * Block helpers
 *************************************************/
function getBlockIndex(no) {
  return Math.floor((no - 1) / 30) + 1;
}

function getCardsByBlock(blockIndex) {
  return [...cards]
    .filter(c => getBlockIndex(c.no) === blockIndex)
    .sort((a, b) => a.no - b.no);
}

function getMaxBlock() {
  if (!cards.length) return 1;
  return Math.ceil(Math.max(...cards.map(c => c.no)) / 30);
}

/*************************************************
 * Progress (V3.1)
 *************************************************/
function getBlockProgress(blockIndex) {
  const list = getCardsByBlock(blockIndex);
  const total = list.length;
  const learned = list.filter(c => srs[c.no]?.interval > 0).length;
  return { learned, total };
}

function getCurrentBlockIndex() {
  if (!cardsByMode.length) return 1;
  return getBlockIndex(cardsByMode[0].no);
}

function renderProgress() {
  const { learned, total } = getBlockProgress(getCurrentBlockIndex());
  const textEl = document.getElementById("progressText");
  const barEl = document.getElementById("progressBar");
  if (!textEl || !barEl) return;

  textEl.textContent = `進捗：${learned} / ${total}`;
  barEl.style.width = total ? `${Math.round((learned / total) * 100)}%` : "0%";
}

/*************************************************
 * Daily (V3.2)
 *************************************************/
function renderDaily() {
  ensureDaily();
  const textEl = document.getElementById("dailyText");
  const barEl = document.getElementById("dailyBar");
  if (!textEl || !barEl) return;

  const done = daily.goodCount;
  const goal = daily.goal;
  textEl.textContent = `今日: ${Math.min(done, goal)} / ${goal}`;
  barEl.style.width = `${Math.min(100, Math.round((done / goal) * 100))}%`;
}

/*************************************************
 * Scene (NEW)
 *************************************************/
function getScenes() {
  return [...new Set(cards.map(c => c.scene).filter(Boolean))];
}

function startScene(scene) {
  const list = cards.filter(c => c.scene === scene).sort((a, b) => a.no - b.no);
  if (!list.length) return;
  cardsByMode = list;
  index = 0;
  resetCardView();
  render();
}

function renderSceneButtons() {
  const wrap = document.getElementById("scenes");
  if (!wrap) return;

  wrap.innerHTML = "";

  const allBtn = document.createElement("button");
  allBtn.textContent = "ALL";
  allBtn.onclick = startVideoOrder;
  wrap.appendChild(allBtn);

  getScenes().forEach(sc => {
    const btn = document.createElement("button");
    btn.textContent = sc;
    btn.onclick = () => startScene(sc);
    wrap.appendChild(btn);
  });
}

/*************************************************
 * UI helpers
 *************************************************/
function renderBlockButtons() {
  const wrap = document.getElementById("blocks");
  if (!wrap) return;

  wrap.innerHTML = "";
  const max = getMaxBlock();

  for (let b = 1; b <= max; b++) {
    const { learned, total } = getBlockProgress(b);
    const btn = document.createElement("button");
    btn.textContent = `${(b-1)*30+1}-${b*30} ${Math.round((learned/total)*100)||0}%`;
    btn.onclick = () => {
      cardsByMode = getCardsByBlock(b);
      index = 0;
      resetCardView();
      render();
    };
    wrap.appendChild(btn);
  }
}

function resetCardView() {
  revealed = false;
  showNote = false;
}

/*************************************************
 * Card rendering
 *************************************************/
function pickSlot(card) {
  if (!card.slots) return null;
  return card.slots[Math.floor(Math.random() * card.slots.length)];
}

function renderNote(card) {
  if (!noteEl) return;
  noteEl.textContent = showNote && card.note ? `💡 ${card.note}` : "";
}

function render() {
  if (!cardsByMode.length) return;

  const card = cardsByMode[index];
  const slot = pickSlot(card);

  if (slot) {
    jpEl.textContent = card.jp.replace("{x}", slot.jp);
    currentAnswer = card.en.replace("{x}", slot.en);
    enEl.textContent = revealed ? currentAnswer : card.en.replace("{x}", "___");
  } else {
    jpEl.textContent = card.jp;
    currentAnswer = card.en;
    enEl.textContent = revealed ? currentAnswer : "タップして答え";
  }

  renderNote(card);
  renderProgress();
  renderDaily();
}

/*************************************************
 * SRS
 *************************************************/
function nextIntervalGood(prev) {
  return prev <= 0 ? 1 : Math.min(120, prev * 2);
}

function goNext() {
  index = (index + 1) % cardsByMode.length;
  resetCardView();
  render();
}

function gradeAgain() {
  const card = cardsByMode[index];
  srs[card.no] = { interval: 0, due: todayDay() };
  saveSrs();
  goNext();
}

function gradeGood() {
  const card = cardsByMode[index];
  const prev = srs[card.no]?.interval ?? 0;
  const interval = nextIntervalGood(prev);
  srs[card.no] = { interval, due: todayDay() + interval };
  saveSrs();

  ensureDaily();
  daily.goodCount++;
  saveDaily();

  renderBlockButtons();
  goNext();
}

/*************************************************
 * Events
 *************************************************/
cardEl.addEventListener("click", () => {
  revealed = !revealed;
  showNote = revealed;
  enEl.textContent = revealed ? currentAnswer : "タップして答え";
  renderNote(cardsByMode[index]);
});

nextBtn.onclick = goNext;
videoBtn.onclick = startVideoOrder;
againBtn.onclick = gradeAgain;
goodBtn.onclick = gradeGood;
reviewBtn.onclick = startReviewDue;

/*************************************************
 * Review
 *************************************************/
function startVideoOrder() {
  cardsByMode = [...cards].sort((a, b) => a.no - b.no);
  index = 0;
  resetCardView();
  render();
}

function startReviewDue() {
  const t = todayDay();
  const due = cards.filter(c => (srs[c.no]?.due ?? Infinity) <= t);
  if (!due.length) return alert("復習はありません");
  cardsByMode = due.sort((a,b)=>a.no-b.no);
  index = 0;
  resetCardView();
  render();
}

/*************************************************
 * Init
 *************************************************/
loadCSV();
