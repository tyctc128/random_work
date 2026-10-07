// 奧特曼揭牌抽籤 — 純前端靜態網站（GitHub Pages 友善，相對路徑）
// 撕牌動作 v6：抽籤的整隻手臂以肩膀為軸，手肘連動，跟著每一撕「抬臂→下拉→收回」。
// 上方扶黑板的手不動。畫面是一疊作品紙，每一抽他捏住紙緣（支點：桌機左緣中段、手機卡片上緣 86%）
// 把最上面那整張作品往他身體方向（左下）扯下、甩出畫面，露出下一張；最後留下的就是中籤作品。

// 內建作品清單：檔名以相對路徑引用，確保在 /reponame/ 子路徑下也能載入
// 同一作品只列一次，避免增加其中籤機率。人工比對後排除以下不同版本：
// 558988_0.jpg = art1-traffic.jpg；558989_0.jpg = art2-star.jpg；558992_0.jpg = art3-sweet.jpg。
const ARTWORKS = [
  { src: "artworks/art1-traffic.jpg", name: "交通王國 · 小天" },
  { src: "artworks/art2-star.jpg",    name: "星星王國 · 小全" },
  { src: "artworks/art3-sweet.jpg",   name: "可愛甜美王國 · 小喬" },
  { src: "artworks/558990_0.jpg", name: "宇宙王國" },
  { src: "artworks/558991_0.jpg", name: "星光王國" },
  { src: "artworks/558993_0.jpg", name: "黃金珍珠王國" },
  { src: "artworks/558994_0.jpg", name: "海上王國" },
  { src: "artworks/558995_0.jpg", name: "名偵探柯南王國" },
  { src: "artworks/558996_0.jpg", name: "王國作品 · 558996" }, // 手寫標題待確認，暫用檔案編號
  { src: "artworks/558997_0.jpg", name: "海洋王國" },
  { src: "artworks/558998.jpg", name: "可愛寶王國" },
];

const wrap       = document.querySelector(".wrap");
const panel      = document.getElementById("panel");
const cover      = document.getElementById("cover");
const coverLabel = document.getElementById("coverLabel");
const artName    = document.getElementById("artname");
const hud        = document.getElementById("hud");
const startBtn   = document.getElementById("startBtn");
const resetBtn   = document.getElementById("resetBtn");
const sheets     = Array.from(document.querySelectorAll(".sheet"));   // 3 reusable layers
const shards     = Array.from(document.querySelectorAll(".shard"));   // 3 reusable scraps
const armEl      = document.getElementById("arm");
const forearmEl  = document.getElementById("forearm");
const controlsEl = document.querySelector(".controls");
const zoomEl     = document.getElementById("zoom");                     // winner lightbox
const zoomImg    = document.getElementById("zoomImg");
const zoomCap    = document.getElementById("zoomCap");

const reduceMQ = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;
const reduceMotion = () => !!(reduceMQ && reduceMQ.matches);
const canAnimate = typeof Element !== "undefined" && typeof Element.prototype.animate === "function";

// ── rhythm (total ≈ 4.8 s) ───────────────────────────────────────────────
const TEARS     = 8;     // sheets torn per draw (top sheet + 7 fillers; winner is always last)
const FINAL_D   = 760;   // let the whole-arm final pull read clearly
const PAUSE_MS  = 400;   // tense pause (corner jitter) before the final rip
const REVEAL_MS = 250;   // winner revealed → wait → badge pops + name fades in
// pre-final tear durations: 330ms → … → 600ms (second-to-last), progressively slower
const DUR = Array.from({ length: TEARS - 1 }, (_, i) =>
  Math.round(330 + 270 * Math.pow(i / (TEARS - 2), 3)));
// gaps between pre-final tears: 40ms → 80ms
const GAP = Array.from({ length: TEARS - 2 }, (_, i) =>
  Math.round(40 + 40 * Math.pow(i / (TEARS - 3), 2)));

let spinning    = false;
let rafId       = null;      // requestAnimationFrame id (so we can cancel a stray tick)
let timers      = new Set(); // every pending setTimeout of the current draw
let anims       = [];        // every running Web Animation of the current draw
let ready       = false;     // true once all artworks are preloaded
let winnerSheet = null;      // sheet element showing the current winner (won state)
let winnerIdx   = -1;

// ── draw audio ─────────────────────────────────────────────────────────
// Unlock a single context in the start-button gesture; cache both decoded clips.
let soundContext = null;
const sounds = {
  cheer: { url: "sound/歡呼聲.mp3", buffer: null, source: null, version: 0 },
  paper: { url: "sound/paper.mp3", buffer: null, source: null, version: 0 },
};
function prepareAudio() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    if (!soundContext) soundContext = new AudioContext();
    if (soundContext.state === "suspended") soundContext.resume().catch(() => {});
    Object.values(sounds).forEach(sound => {
      if (!sound.buffer) {
        sound.buffer = fetch(sound.url)
          .then(response => {
            if (!response.ok) throw new Error("Audio could not be loaded");
            return response.arrayBuffer();
          })
          .then(bytes => soundContext.decodeAudioData(bytes))
          .catch(() => { sound.buffer = null; return null; });
      }
    });
  } catch (e) { /* unavailable audio must never block the draw */ }
}
function stopSound(name) {
  const sound = sounds[name];
  sound.version += 1;
  if (sound.source) {
    sound.source.onended = null;
    sound.source.stop();
    sound.source.disconnect();
    sound.source = null;
  }
}
function stopAudio() { Object.keys(sounds).forEach(stopSound); }
async function playSound(name, maxDuration = Infinity) {
  stopSound(name);
  const sound = sounds[name], version = sound.version;
  const requestedAt = performance.now();
  try {
    const buffer = await sound.buffer;
    if (!buffer || version !== sound.version || soundContext.state !== "running") return;
    // Skip a late paper tick instead of playing it against the next sheet.
    if (name === "paper" && performance.now() - requestedAt > 120) return;
    const source = soundContext.createBufferSource();
    source.buffer = buffer;
    source.connect(soundContext.destination);
    source.onended = () => {
      source.disconnect();
      if (sound.source === source) sound.source = null;
    };
    sound.source = source;
    source.start(0, 0, Math.min(buffer.duration, maxDuration));
  } catch (e) { /* visual results remain usable if playback is unavailable */ }
}

// ── winner confetti ─────────────────────────────────────────────────────
const confettiEl = document.getElementById("confetti");
const confettiAnimations = new Set();
function stopConfetti() {
  confettiAnimations.forEach(animation => animation.cancel());
  confettiAnimations.clear();
  confettiEl.replaceChildren();
  confettiEl.hidden = true;
}
function celebrateWinner() {
  stopConfetti();
  if (reduceMotion() || !canAnimate) return;
  const rect = panel.getBoundingClientRect();
  const colors = ["#ffd23b", "#ff557b", "#4ddfff", "#ac83ff", "#6bf0b2", "#fff3ca"];
  const perBurst = window.innerWidth <= 640 ? 26 : 40;
  const spread = Math.min(window.innerWidth * .6, 460);
  confettiEl.hidden = false;
  for (let burst = 0; burst < 3; burst++) {
    const x = Math.max(24, Math.min(window.innerWidth - 24, rect.left + rect.width * [.2, .8, .5][burst]));
    const y = Math.max(90, Math.min(window.innerHeight * .65, rect.top + rect.height * .35));
    for (let i = 0; i < perBurst; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      piece.style.left = `${x}px`;
      piece.style.top = `${y}px`;
      piece.style.backgroundColor = colors[i % colors.length];
      piece.style.width = `${5 + Math.random() * 5}px`;
      piece.style.height = `${i % 3 === 0 ? 16 : 7}px`;
      confettiEl.appendChild(piece);
      const angle = Math.PI + Math.random() * Math.PI;
      const dx = Math.cos(angle) * spread * (.45 + Math.random() * .55);
      const lift = 150 + Math.abs(Math.sin(angle)) * 350;
      const spin = (Math.random() < .5 ? -1 : 1) * (360 + Math.random() * 720);
      const frames = Array.from({ length: 13 }, (_, frame) => {
        const t = frame / 12;
        const px = dx * (1 - Math.exp(-3 * t));
        const py = -lift * t + (window.innerHeight + lift) * t * t;
        return { offset: t, opacity: t < .7 ? 1 : (1 - t) / .3,
          transform: `translate3d(${px}px, ${py}px, 0) rotate(${spin * t}deg) rotateY(${t * 720}deg)` };
      });
      const animation = piece.animate(frames, { duration: 2400 + Math.random() * 800, delay: burst * 160, fill: "both", easing: "linear" });
      confettiAnimations.add(animation);
      animation.onfinish = () => {
        animation.cancel();
        piece.remove();
        confettiAnimations.delete(animation);
        if (!confettiAnimations.size) confettiEl.hidden = true;
      };
    }
  }
}

// 均勻亂數：優先使用 crypto，fallback 到 Math.random（已驗證公平，勿改）
function uniformIndex(n) {
  if (window.crypto && window.crypto.getRandomValues) {
    // rejection sampling 以避免模數偏差
    const max = Math.floor(0xFFFFFFFF / n) * n;
    const buf = new Uint32Array(1);
    let v;
    do { window.crypto.getRandomValues(buf); v = buf[0]; } while (v >= max);
    return v % n;
  }
  return Math.floor(Math.random() * n);
}

// ── helpers ──────────────────────────────────────────────────────────────
function setDisabled(btn, v) {
  btn.disabled = v;
  if (v) btn.setAttribute("aria-disabled", "true");
  else btn.removeAttribute("aria-disabled");
}

// setTimeout that is tracked (cancelled on reset) and only fires while a draw is running
function later(fn, ms) {
  const id = setTimeout(() => { timers.delete(id); if (spinning) fn(); }, ms);
  timers.add(id);
  return id;
}

function clearTimers() {
  timers.forEach(id => clearTimeout(id));
  timers.clear();
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
}

function animate(el, keyframes, opts) {
  if (!canAnimate) return null;
  const a = el.animate(keyframes, opts);
  anims.push({ el, a });
  return a;
}

function cancelAnims(el) {
  anims = anims.filter(r => {
    if (el && r.el !== el) return true;
    try { r.a.cancel(); } catch (e) { /* ignore */ }
    return false;
  });
}

// put a sheet back to a clean resting state (never touches the img src)
function restSheet(el) {
  cancelAnims(el);
  el.classList.remove("fadeout", "fadein", "fadein-start");
  el.style.zIndex = "";
}

// load artwork i onto a sheet. Never sets src="" / removes src (no broken-image icon).
function loadSheet(el, i) {
  const img = el.firstElementChild;
  if (img.getAttribute("src") !== ARTWORKS[i].src) img.src = ARTWORKS[i].src;
  img.alt = "";                // filler sheets are decorative while cycling (no spoiler)
  el.dataset.art = String(i);
  restSheet(el);
  el.hidden = false;
}

// z-order of the stack, top first
function applyZ(stack) {
  stack.forEach((el, k) => { el.style.zIndex = String(10 - k); });
}

// random but non-consecutive filler artworks; the winner is always last.
// Built backwards from the winner so the sheet right above the winner differs from it,
// and the first filler differs from whatever is on top right now.
function buildFillers(winner, prevTop, count) {
  const n = ARTWORKS.length;
  const out = new Array(count);
  let below = winner;
  for (let k = count - 1; k >= 0; k--) {
    let cand = [];
    for (let i = 0; i < n; i++) if (i !== below && (k > 0 || i !== prevTop)) cand.push(i);
    if (!cand.length) for (let i = 0; i < n; i++) if (i !== below) cand.push(i);
    if (!cand.length) cand = [below];               // only one artwork: repeats unavoidable
    out[k] = cand[uniformIndex(cand.length)];
    below = out[k];
  }
  return out;
}

// clip-path for a sheet whose top + right edges are torn (amp = 0 → intact rectangle).
// Same vertex count either way so the browser can morph intact → jagged.
function edgePoly(amp) {
  const N = 14, M = 10, ax = amp * 0.75, pts = ["0% 0%"];
  const jag = (a, odd) => a ? (odd ? a * (0.5 + Math.random()) : a * 0.15 * Math.random()) : 0;
  for (let i = 1; i < N; i++) pts.push(`${(i / N * 100).toFixed(2)}% ${jag(amp, i % 2).toFixed(2)}%`);
  pts.push(amp ? `${(100 - ax).toFixed(2)}% ${(amp * 0.9).toFixed(2)}%` : "100% 0%");
  for (let j = 1; j < M; j++) pts.push(`${(100 - jag(ax, j % 2)).toFixed(2)}% ${(j / M * 100).toFixed(2)}%`);
  pts.push(`${(100 - (amp ? ax * 0.3 : 0)).toFixed(2)}% 100%`, "0% 100%");
  // torn edges = top + right (MX = -1 would mirror them to top + left; same vertex count either way)
  const out = MX === 1 ? pts : pts.map(pt => { const [px, py] = pt.split(" "); return `${(100 - parseFloat(px)).toFixed(2)}% ${py}`; });
  return `polygon(${out.join(", ")})`;
}

// v5: back to the original (un-mirrored) hero — Ultraman on the LEFT, paper flung down-left
// (v2.1 keyframes). MX = 1 keeps every value as written; MX = -1 would mirror x / rotate / skewX.
const MX = 1;
const flipX = x => (MX === 1 ? x            // no mirror: keep every value exactly as written
  : typeof x === "number" ? x * MX
  : (x.startsWith("-") ? x.slice(1) : (parseFloat(x) === 0 ? x : "-" + x)));
const T = (x, y, r, s, k) => `translate(${flipX(x)}, ${y}) rotate(${r * MX}deg) skewX(${s * MX}deg) scale(${k})`;

// the stage shakes once at the moment of the rip
function shake(heavy) {
  const a = heavy ? 5 : 3, b = heavy ? 3 : 2;   // (symmetric jolt — fine for both sides)
  animate(wrap, heavy
    ? [{ transform: "translate(0,0)" }, { transform: `translate(-${a}px,${b}px)` },
       { transform: `translate(${a - 1}px,-${b - 1}px)` }, { transform: "translate(-2px,1px)" },
       { transform: "translate(0,0)" }]
    : [{ transform: "translate(0,0)" }, { transform: `translate(-${a}px,${b}px)` },
       { transform: "translate(0,0)" }],
    { duration: heavy ? 160 : 80, easing: "ease-out" });
}

// 1–2 scraps (3 on the final rip) burst from the top / right edges, drift up-right 20px
function burst(count) {
  for (let i = 0; i < count && i < shards.length; i++) {
    const sh = shards[i];
    if (i % 2 === 0) { sh.style.left = (35 + Math.random() * 55).toFixed(1) + "%"; sh.style.top = "0%"; }
    else             { sh.style.left = "100%"; sh.style.top = (8 + Math.random() * 50).toFixed(1) + "%"; }
    sh.hidden = false;
    const rot = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 120);
    cancelAnims(sh);
    animate(sh, [
      { transform: "translate(0px,0px) rotate(0deg)", opacity: 1 },
      { transform: `translate(20px,-20px) rotate(${rot.toFixed(0)}deg)`, opacity: 0 },
    ], { duration: 250, easing: "ease-out", fill: "forwards" });
    later(() => { sh.hidden = true; cancelAnims(sh); }, 260);
  }
}

// Shoulder is the parent joint; the forearm and palm inherit its whole-arm sweep.
// No translation at the shoulder: the arm stays attached to the torso at every frame.
const ARM_TENSE = -10;
const ELBOW_TENSE = -8;
const rotate = degrees => `rotate(${degrees}deg)`;
function stopArm() {
  [armEl, forearmEl].forEach(el => { if (el) cancelAnims(el); });
}
function armSwing(d, heavy) {
  if (!armEl || !forearmEl || reduceMotion()) return;
  stopArm();
  const k = heavy ? 1.25 : 1;
  const frames = (tense, lift, pull, follow, rebound) => [
    { offset: 0, transform: rotate(heavy ? tense : 0), easing: "ease-out" },
    { offset: .15, transform: rotate(lift * k), easing: "cubic-bezier(.35,0,.2,1)" },
    { offset: .38, transform: rotate(pull * k), easing: "ease-out" },
    { offset: .62, transform: rotate(follow * k), easing: "ease-in-out" },
    { offset: .86, transform: rotate(rebound), easing: "ease-out" },
    { offset: 1, transform: rotate(0) },
  ];
  animate(armEl, frames(ARM_TENSE, -12, 27, 23, -3), { duration: d });
  animate(forearmEl, frames(ELBOW_TENSE, -10, 12, 8, -4), { duration: d });
}
function armTense(ms) {
  if (!armEl || !forearmEl || reduceMotion()) return;
  stopArm();
  [[armEl, ARM_TENSE], [forearmEl, ELBOW_TENSE]].forEach(([el, angle]) => {
    animate(el, [
      { offset: 0, transform: rotate(0), easing: "ease-out" },
      { offset: .3, transform: rotate(angle) },
      { offset: .45, transform: rotate(angle + .7) },
      { offset: .6, transform: rotate(angle - .7) },
      { offset: .75, transform: rotate(angle + .7) },
      { offset: .9, transform: rotate(angle - .7) },
      { offset: 1, transform: rotate(angle) },
    ], { duration: ms, fill: "forwards" });
  });
}

// pre-final pause: the gripped corner jitters harder and harder (tension).
// v3: the jitter is mostly translation toward his hand (down-left) with very little
// rotation, so the far (right) edge never lifts above the board while it tautens.
// Track the same physical fingertip through both joints. Paper follows the grip
// until release; pixels are scaled from the SVG to the current responsive stage.
function gripTransform(shoulder, elbow, rotation = 0, skew = 0) {
  const turn = (point, pivot, degrees) => {
    const r = degrees * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    const x = point.x - pivot.x, y = point.y - pivot.y;
    return { x: pivot.x + x * c - y * s, y: pivot.y + x * s + y * c };
  };
  const home = window.matchMedia("(max-width: 640px)").matches ? 7 : 0;
  const finger = { x: 491, y: 491 };
  const shoulderPivot = { x: 127, y: 267 };
  const base = turn(finger, shoulderPivot, home);
  const bent = turn(finger, { x: 173, y: 415 }, elbow);
  const moved = turn(bent, shoulderPivot, shoulder + home);
  const scale = document.querySelector(".arm-rig").getBoundingClientRect().width / 1536;
  return T(`${(moved.x - base.x) * scale}px`, `${(moved.y - base.y) * scale}px`, rotation, skew, 1);
}
function tense(el, ms) {
  animate(el, [
    { offset: 0, transform: gripTransform(0, 0), easing: "ease-out" },
    { offset: .3, transform: gripTransform(ARM_TENSE, ELBOW_TENSE, -1) },
    { offset: .45, transform: gripTransform(ARM_TENSE + .7, ELBOW_TENSE + .7, -1) },
    { offset: .6, transform: gripTransform(ARM_TENSE - .7, ELBOW_TENSE - .7, -1) },
    { offset: .75, transform: gripTransform(ARM_TENSE + .7, ELBOW_TENSE + .7, -1) },
    { offset: .9, transform: gripTransform(ARM_TENSE - .7, ELBOW_TENSE - .7, -1) },
    { offset: 1, transform: gripTransform(ARM_TENSE, ELBOW_TENSE, -1) },
  ], { duration: ms, fill: "forwards" });
}

// 0–15%: lift together. 15–38%: whole-arm pull with the paper at the fingertip.
// From 38%: release the sheet down-left while the arm follows through and returns.
const PULL_EASE = "cubic-bezier(.5,0,.9,.6)";
const FLING_EASE = "cubic-bezier(.3,.45,.75,1)"; // 62→100%: carries the speed off the stage
function tearSheet(el, d, heavy) {
  later(() => playSound("paper", d * .75 / 1000), d * .15);
  armSwing(d, heavy);                           // shoulder and elbow pull together
  const k = heavy ? 1.25 : 1;
  const grip = [
    { offset: 0, transform: heavy ? gripTransform(ARM_TENSE, ELBOW_TENSE, -1) : gripTransform(0, 0), easing: "ease-out" },
    { offset: .15, transform: gripTransform(-12 * k, -10 * k, -2, -1.5), easing: "cubic-bezier(.35,0,.2,1)" },
    { offset: .38, transform: gripTransform(27 * k, 12 * k, -8), easing: PULL_EASE },
    { offset: .62, transform: T("-46%", "45%", -16, 0, .96), easing: FLING_EASE },
    { offset: 1, transform: T("-95%", "90%", -27, 0, .9) },
  ];
  animate(el, grip, { duration: d, fill: "forwards" });

  const intact = edgePoly(0), torn = edgePoly(heavy ? 5.5 : 3.2);
  animate(el, [
    { offset: 0, clipPath: intact }, { offset: 0.15, clipPath: intact },
    { offset: 0.19, clipPath: torn }, { offset: 1, clipPath: torn },
  ], { duration: d, fill: "forwards" });

  animate(el, [{ opacity: 1 }, { opacity: 0 }],
    { duration: d * 0.2, delay: d * 0.8, fill: "forwards" });

  if (canAnimate) {
    later(() => shake(heavy), d * 0.15);
    later(() => burst(heavy ? 3 : 1 + (Math.random() < 0.5 ? 1 : 0)), d * 0.25);
  }
}

// ── winner zoom (lightbox) ──────────────────────────────────────────────
// Only the revealed winner can be opened; click anywhere / Esc closes; reset & redraw close it.
// The caption comes from captionFor() — the single hook for showing a different label later
// (e.g. a class list kept only on the teacher's own computer). Never written to the repo.
function captionFor(i) {
  return ARTWORKS[i].name;
}
function openZoom() {
  if (spinning || !winnerSheet || winnerIdx < 0 || !panel.classList.contains("won")) return;
  const a = ARTWORKS[winnerIdx];
  zoomImg.src = a.src;
  zoomImg.alt = a.name;
  zoomCap.textContent = captionFor(winnerIdx);   // textContent only (no HTML injection)
  zoomEl.hidden = false;
  zoomEl.focus();
}
function closeZoom() {
  if (zoomEl.hidden) return;
  const hadFocus = zoomEl.contains(document.activeElement) || document.activeElement === zoomEl;
  zoomEl.hidden = true;
  zoomCap.textContent = "";
  if (hadFocus && panel.classList.contains("won")) panel.focus();
}
function setZoomable(on) {
  if (on) {
    panel.setAttribute("tabindex", "0");
    panel.setAttribute("role", "button");
    panel.setAttribute("aria-label", "放大中籤作品");
  } else {
    panel.removeAttribute("tabindex");
    panel.removeAttribute("role");
    panel.removeAttribute("aria-label");
  }
}
panel.addEventListener("click", openZoom);
panel.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && panel.classList.contains("won")) { e.preventDefault(); openZoom(); }
});
zoomEl.addEventListener("click", closeZoom);
document.addEventListener("keydown", e => { if (e.key === "Escape") closeZoom(); });

// ── keep the whole card above the sticky buttons (short phones, e.g. 375×667) ──
// Only scrolls when the card doesn't fit between the top of the screen and the button bar.
function syncControlsHeight() {
  if (controlsEl) document.documentElement.style.setProperty("--controls-h", controlsEl.offsetHeight + "px");
}
function ensurePanelVisible() {
  if (!controlsEl) return;
  syncControlsHeight();
  const r = panel.getBoundingClientRect();
  const sticky = getComputedStyle(controlsEl).position === "sticky";
  const bottomLimit = window.innerHeight - (sticky ? controlsEl.offsetHeight + 8 : 0);
  if (r.bottom > bottomLimit + 1) {
    panel.scrollIntoView({ block: "end", behavior: reduceMotion() ? "auto" : "smooth" });
  }
}
window.addEventListener("resize", syncControlsHeight);

// ── states ───────────────────────────────────────────────────────────────
// 待機：封面紙四邊蓋滿、作品層用 hidden 藏起來（絕不清 src，避免破圖）
function toIdle() {
  spinning = false;
  stopAudio();
  stopConfetti();
  clearTimers();
  cancelAnims();
  stopArm();                                  // 重置：手的動畫全部取消，回到原位不殘留角度
  closeZoom();
  setZoomable(false);
  panel.classList.remove("spinning", "won");
  panel.classList.add("idle");
  sheets.forEach(s => { restSheet(s); s.hidden = true; s.firstElementChild.alt = ""; });
  shards.forEach(sh => { sh.hidden = true; });
  cover.classList.remove("fadeout");
  cover.style.zIndex = "";
  cover.hidden = false;
  coverLabel.hidden = false;
  coverLabel.textContent = "等待撕牌";
  artName.classList.remove("show");
  artName.textContent = "";
  winnerSheet = null;
  winnerIdx = -1;
  hud.textContent = ready
    ? "按下按鈕，看奧特曼替你撕牌抽籤！"
    : "作品載入中…";
  setDisabled(startBtn, !ready);
  startBtn.textContent = ready ? "開始撕牌抽籤 ✦" : "載入作品中…";
  setDisabled(resetBtn, false);
}

function startDraw() {
  if (spinning || !ready) return;
  stopAudio();
  stopConfetti();
  prepareAudio();
  spinning = true;
  closeZoom();                                 // 再抽一次：放大畫面自動關閉
  setZoomable(false);
  ensurePanelVisible();                        // 短螢幕：捲一次讓整張卡片（含名字）在按鈕上方

  // the sheet on top right now: the cover (idle) or the previous winner ("再抽一次")
  const top = winnerSheet || cover;
  const prevTop = winnerSheet ? winnerIdx : -1;
  winnerSheet = null;
  winnerIdx = -1;
  if (top !== cover) top.firstElementChild.alt = "";

  panel.classList.remove("won", "idle");
  panel.classList.add("spinning");
  artName.classList.remove("show");
  artName.textContent = "";                    // 輪播期間名字欄一律空白（防暴雷）
  setDisabled(startBtn, true);
  setDisabled(resetBtn, true);                 // 抽籤中禁用重置，避免殘留排程弄亂狀態
  coverLabel.textContent = "撕牌中…";
  hud.textContent = "奧特曼正在撕牌…";

  const winner = uniformIndex(ARTWORKS.length);
  const free = sheets.filter(s => s !== top);

  // 減少動態：不撕、不震 — 封面紙淡出 → 中籤作品淡入 → 名字＋徽章
  if (reduceMotion()) {
    playSound("paper", .35);
    const ws = free[0];
    free.slice(1).forEach(s => { s.hidden = true; });
    loadSheet(ws, winner);
    ws.classList.add("fadein-start");
    applyZ([top, ws]);
    top.classList.add("fadeout");
    later(() => {
      top.hidden = true;
      void ws.offsetWidth;
      ws.classList.remove("fadein-start");
      ws.classList.add("fadein");
      later(() => finishDraw(winner, ws), 360);
    }, 360);
    return;
  }

  // the stack (top first): current top, then fillers…, winner last. 3 layers round-robin.
  const seq = buildFillers(winner, prevTop, TEARS - 1).concat([winner]);
  const stack = [top];
  let next = 0;
  free.forEach(s => {
    if (next < seq.length) { loadSheet(s, seq[next++]); stack.push(s); }
    else s.hidden = true;
  });
  applyZ(stack);

  // a torn sheet leaves: back to the bottom of the stack with the next artwork (no new DOM)
  function recycle() {
    const el = stack.shift();
    if (el === cover) { cancelAnims(cover); cover.hidden = true; }
    else if (next < seq.length) { loadSheet(el, seq[next++]); stack.push(el); }
    else { restSheet(el); el.hidden = true; }
    applyZ(stack);
  }

  let step = 0;
  function tick() {
    if (!spinning) return;                     // 擋掉任何殘留的 tick
    rafId = null;
    const el = stack[0];
    if (step < TEARS - 1) {
      const d = DUR[step];
      tearSheet(el, d, false);
      later(() => {
        recycle();
        step += 1;
        const gap = step < TEARS - 1 ? GAP[step - 1] : 0;
        later(() => { rafId = requestAnimationFrame(tick); }, gap);
      }, d);
    } else {
      // 最後一撕前停頓：紙角抖動加劇，然後重重一扯
      tense(el, PAUSE_MS);
      armTense(PAUSE_MS);
      later(() => {
        tearSheet(el, FINAL_D, true);
        later(() => {
          recycle();
          finishDraw(winner, stack[0]);       // the winner is always the last sheet
        }, FINAL_D);
      }, PAUSE_MS);
    }
  }
  rafId = requestAnimationFrame(tick);
}

// 收尾：只留中籤那張；已扯走的紙、碎屑、「撕牌中…」全部 display:none。
// 等 250ms → 徽章彈出 → 名字這時才淡入（名字只在這裡寫入）。
function finishDraw(winner, winEl) {
  stopSound("paper");
  clearTimers();
  cancelAnims();
  stopArm();
  sheets.forEach(s => { if (s !== winEl) { restSheet(s); s.hidden = true; } });
  restSheet(winEl);
  winEl.hidden = false;
  shards.forEach(sh => { sh.hidden = true; });
  coverLabel.hidden = true;
  cover.hidden = true;
  panel.classList.remove("spinning");

  const a = ARTWORKS[winner];
  later(() => {
    spinning = false;
    winnerSheet = winEl;
    winnerIdx = winner;
    winEl.firstElementChild.alt = a.name;
    panel.classList.add("won");                // 徽章 🏆 中籤！ 彈出
    playSound("cheer");                         // 結果揭曉時播放一次歡呼聲
    celebrateWinner();
    setZoomable(true);                         // 這時才能點作品放大
    artName.textContent = a.name;              // 名字這時才出現（300ms 淡入）
    void artName.offsetWidth;
    artName.classList.add("show");
    hud.textContent = "🏆 今天的幸運之星：" + a.name + "！";
    setDisabled(startBtn, false);
    startBtn.textContent = "再抽一次 ✦";
    setDisabled(resetBtn, false);
  }, REVEAL_MS);
}

startBtn.addEventListener("click", () => {
  if (spinning || !ready) return;
  startDraw();                                 // 再抽一次：直接從目前那張中籤作品開始撕
});
resetBtn.addEventListener("click", () => {
  if (spinning) return;                        // 抽籤中按鈕已 disabled，雙重保險
  toIdle();
});

// 預先載入所有作品（含解碼），載完才啟用開始按鈕。
function preloadArtworks() {
  let remaining = ARTWORKS.length;
  const done = () => {
    remaining -= 1;
    if (remaining <= 0) {
      ready = true;
      if (!spinning && !panel.classList.contains("won")) {
        setDisabled(startBtn, false);
        startBtn.textContent = "開始撕牌抽籤 ✦";
        hud.textContent = "按下按鈕，看奧特曼替你撕牌抽籤！";
      }
    }
  };
  ARTWORKS.forEach(a => {
    const img = new Image();
    img.onload = () => {
      if (img.decode) img.decode().then(done, done);
      else done();
    };
    img.onerror = done;                        // 載入失敗也放行，避免卡死按鈕
    img.src = a.src;
  });
}

// 初始狀態
syncControlsHeight();
toIdle();
preloadArtworks();
