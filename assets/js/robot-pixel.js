/* Pixel face adapted from Kie70/Robot-face-design, revision 7bbb590.
   Low-resolution renderer and original expression director; scenery is a static PNG. */
(function () {
'use strict';
const instances = new WeakMap();
function mount(host) {
if (instances.has(host)) return instances.get(host);
/* ═══════════════════════════════════════════════════════════════
   core —— 索引帧缓冲 + 调色板 + 绘制原语 + 确定性随机

   这一层是为「能机械翻译成 Kotlin」设计的，不是为 Web 好写：
     · 所有绘制写进 Uint8Array 索引缓冲，最后一次性出图
       → Compose 侧写 IntArray → ImageBitmap → FilterQuality.None 放大
     · 只有整数运算，没有 Canvas 渐变 / arc / bezier / filter / alpha
     · 随机走固定种子 PRNG，两端同算法同结果

   ⚠ 签名不得改动，scene / face / fx / director 四个模块都依赖它
   ═══════════════════════════════════════════════════════════════ */

/* ───────── 逻辑分辨率 ─────────
   **高固定、宽自适应。**
   高固定是因为整个版面的行坐标（天空分层、地平线、脸的锚点）全是写死的绝对行，
   高一变全得重排。宽自适应是因为窗口比例千变万化：宽度写死就必然在左右留白，
   而留白只能靠拉伸最外一列来填，那条假背景一眼就能看出来 ——
   鸟飞到边上会被拉成一条横贯屏幕的黑线。宽度跟着窗口长就根本不产生留白。

   1920×1200 → k=8，宽 240（正好整除）
   1920×1080 → k=7，宽 275 */
let LW = 240;
const LH = 150;

/* ───────── 调色板：封闭 21 色，不允许表外颜色 ───────── */
const C = {
  SKY_DEEP: 0, SKY_MID: 1, SKY_LOW: 2, SKY_PALE: 3,
  CLOUD: 4, CLOUD_SHADE: 5,
  HILL_FAR: 6, HILL_NEAR: 7, GRASS: 8, GRASS_DARK: 9,
  INK: 10,
  EYE_LIGHT: 11, EYE_MID: 12, EYE_DARK: 13,
  WHITE: 14,
  FLOWER_RED: 15, FLOWER_YELLOW: 16, FLOWER_CORE: 17, STEM: 18,
  BLUSH: 19, SHADOW: 20,
};

const PALETTE = [
  0x1C7AD0, 0x3F97E2, 0x6FB6EE, 0x93CEF5,
  0xF7F2E0, 0xDCD5BC,
  0x8FD48F, 0x5CB85C, 0x3E9E4A, 0x2C7C38,
  0x1B2A5E,
  0xA9C4EE, 0x7196D6, 0x4C6FB4,
  0xFFFFFF,
  0xF2726F, 0xFFD93B, 0xFFF6E0, 0x2C7C38,
  0xF58FA0, 0x2A63A8,
];

/* 预解算成 ABGR（小端 Uint32 直写用），省掉每像素三次移位 */
const ABGR = new Uint32Array(256);
for (let i = 0; i < PALETTE.length; i++) {
  const v = PALETTE[i];
  ABGR[i] = 0xFF000000 | ((v & 0xFF) << 16) | (v & 0xFF00) | ((v >> 16) & 0xFF);
}

/* ───────── 帧缓冲：每字节一个调色板索引 ───────── */
let FB = new Uint8Array(LW * LH);

/** 改逻辑宽度、重建帧缓冲。返回是否真的变了（变了就得重新预渲染背景底图）。
    必须在任何绘制之前调用 */
function setLogicalWidth(w) {
  const nw = Math.max(160, Math.min(720, Math.round(w)));
  if (nw === LW) return false;
  LW = nw;
  FB = new Uint8Array(LW * LH);
  imgData = null; buf32 = null;      // 尺寸变了，ImageData 缓存作废
  return true;
}

/* ═══════════ 绘制原语（白名单，只有这些） ═══════════ */

function clear(ci) { FB.fill(ci); }

function px(x, y, ci) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= LW || y >= LH) return;
  FB[y * LW + x] = ci;
}

function rect(x, y, w, h, ci) {
  let x0 = x | 0, y0 = y | 0, x1 = x0 + (w | 0), y1 = y0 + (h | 0);
  if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
  if (x1 > LW) x1 = LW; if (y1 > LH) y1 = LH;
  for (let yy = y0; yy < y1; yy++) FB.fill(ci, yy * LW + x0, yy * LW + x1);
}

function hline(x0, x1, y, ci) {
  if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
  rect(x0, y, x1 - x0 + 1, 1, ci);
}

function vline(x, y0, y1, ci) {
  if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
  rect(x, y0, 1, y1 - y0 + 1, ci);
}

function rectOutline(x, y, w, h, ci) {
  hline(x, x + w - 1, y, ci);
  hline(x, x + w - 1, y + h - 1, ci);
  vline(x, y, y + h - 1, ci);
  vline(x + w - 1, y, y + h - 1, ci);
}

/** 整数中点圆，实心。逐行填水平跨度，边缘自然出台阶 */
function fillCircle(cx, cy, r, ci) {
  cx |= 0; cy |= 0; r |= 0;
  if (r <= 0) return;
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    hline(cx - x, cx + x, cy + y, ci);
    hline(cx - x, cx + x, cy - y, ci);
    hline(cx - y, cx + y, cy + x, ci);
    hline(cx - y, cx + y, cy - x, ci);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}

/** 整数中点圆，只描边（1px） */
function strokeCircle(cx, cy, r, ci) {
  cx |= 0; cy |= 0; r |= 0;
  if (r <= 0) return;
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    px(cx + x, cy + y, ci); px(cx - x, cy + y, ci);
    px(cx + x, cy - y, ci); px(cx - x, cy - y, ci);
    px(cx + y, cy + x, ci); px(cx - y, cy + x, ci);
    px(cx + y, cy - x, ci); px(cx - y, cy - x, ci);
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}

/* 抖动图案：返回 true 时取 a，否则取 b */
const DITHER = {
  CHECKER: (x, y) => ((x + y) & 1) === 0,                 // 50%
  SPARSE:  (x, y) => ((x & 1) === 0) && ((y & 1) === 0),  // 25%
  DENSE:   (x, y) => !(((x + 1) & 1) === 0 && ((y + 1) & 1) === 0), // 75%
};

/** 抖动带：a/b 两色按图案交错。渐变一律用它，禁止平滑插值 */
function ditherBand(x, y, w, h, ciA, ciB, pat) {
  const f = pat || DITHER.CHECKER;
  const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
  const x1 = Math.min(LW, (x | 0) + (w | 0)), y1 = Math.min(LH, (y | 0) + (h | 0));
  for (let yy = y0; yy < y1; yy++) {
    const row = yy * LW;
    for (let xx = x0; xx < x1; xx++) FB[row + xx] = f(xx, yy) ? ciA : ciB;
  }
}

/**
 * 精灵：行字符串数组。'.' 和 ' ' 透明，其余字符查 map 得调色板索引。
 * 这个格式可以原样搬成 Kotlin arrayOf<String>。
 *   sprite(10, 20, ['.##.', '####'], { '#': C.WHITE })
 */
function sprite(x, y, rows, map, flipX) {
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j], n = row.length;
    for (let i = 0; i < n; i++) {
      const ch = row[flipX ? n - 1 - i : i];
      if (ch === '.' || ch === ' ') continue;
      const ci = map[ch];
      if (ci === undefined) continue;
      px(x + i, y + j, ci);
    }
  }
}

/* ═══════════ 确定性随机 ═══════════ */

/** mulberry32。禁止 Math.random —— 行为要可复现，Kotlin 侧同算法同结果 */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ═══════════ 缓动 ═══════════ */

const Ease = {
  linear: t => t,
  inQuad: t => t * t,
  outQuad: t => t * (2 - t),
  inOutQuad: t => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: t => { const u = t - 1; return u * u * u + 1; },
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** 回弹：超过终点再拉回，弹跳/惊醒用 */
  outBack: t => { const c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; },
  /** 弹性衰减，happy 的上下弹跳用 */
  outElastic: t => t === 0 || t === 1 ? t
    : Math.pow(2, -9 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
};

const clamp01 = t => (t < 0 ? 0 : t > 1 ? 1 : t);
const lerp = (a, b, t) => a + (b - a) * t;
/** 把 0..1 量化到 n 档（0..n-1）。眼睛开合、嘴型缩放都要过它 */
const quant = (t, n) => Math.min(n - 1, Math.max(0, Math.round(clamp01(t) * (n - 1))));

/* ═══════════ 出图 ═══════════ */

let imgData = null, buf32 = null;

/**
 * 把索引缓冲刷到 2D context。ctx 的画布必须正好是 LW×LH，
 * 放大交给 CSS（image-rendering: pixelated）或外层整数倍 drawImage。
 */
function present(ctx) {
  if (!imgData) {
    imgData = ctx.createImageData(LW, LH);
    buf32 = new Uint32Array(imgData.data.buffer);
  }
  for (let i = 0, n = LW * LH; i < n; i++) buf32[i] = ABGR[FB[i]];
  ctx.putImageData(imgData, 0, 0);
}

/** 把帧缓冲整块复制出去（背景预渲染缓存用） */
function snapshot() { return FB.slice(); }
/** 把缓存整块贴回帧缓冲 */
function restore(snap) { FB.set(snap); }

/* ═══════════════════════════════════════════════════════════════
   face —— 脸部渲染：眼睛（open / arc / star）、嘴（五型）、腮红

   Face.draw(pose) 只负责「把 pose 画出来」，一个字节的状态都不存，
   也不判断该做什么表情 —— 那是 director 的事。
   同一个 pose 画两次必须完全一样，所以这里没有随机、没有时间、没有累加量。

   ─── 形状数据从哪来 ───
   形状分两类，用两种方式硬编码，这是刻意的取舍：

   · 眼球（open）是规则圆 → 存「每行左侧内缩像素数」数表。
     34 个整数就把一个圆说清楚了，写成 34×36 的 ASCII 反而没人看得懂对错；
     而且压扁档位、明暗分带、高光裁剪都要按行查这张表，数表比字符串直接。
   · 弧眼 / 星星眼 / 五种嘴 / 腮红是不规则形 → 存 ASCII 行字符串。
     这些形状的可爱程度全在手调的那几个像素上，必须能一眼看见画的是什么。

   两种都能原样搬成 Kotlin（IntArray / arrayOf<String>），没有翻译损耗。
   所有表都是离线算好写死的，运行期不求任何曲线（没有 sqrt / sin / 三角）。

   ─── INK 描边怎么来的 ───
   ASCII 里的 'K' 是离线做 8 邻域膨胀烧进去的；眼球的描边是运行期算的
   （因为眼球会被 gaze 推来推去、被 tilt 逐行错开，烧死不划算）。
   算法是「上中下三行跨度取并集，左右各外扩 1px，再挖掉本行填充」——
   这样斜边上的台阶会被整块包住，不会出现只描到一半的漏口。

   ⚠ 依赖 core.js 的全局名（LW/LH/C/px/rect/hline/sprite/quant/clamp01…），
     不 import，最终拼进同一个 <script>。
   ═══════════════════════════════════════════════════════════════ */

const Face = (function () {

  /* ═══════════ 锚点与常量 ═══════════ */

  /* 版面比例按参考图量的，单位统一取眼球直径 D：
       眼中心高度   画面 45%       → 68 行
       双眼间距     1.71 D         → 58px（91 ↔ 149）
       嘴距眼中心   0.67 D         → 23px → 91 行
     之前是 52% / 1.88 D / 0.88 D，脸整体偏低、嘴挂太远，
     远看像下巴掉下来了。 */
  const EYE_Y = 68;          // 双眼中心行
  const EYE_DX = 29;         // 眼心到画面中线的距离（双眼间距 58 = 1.71 D）
  const EYE_W = 34;          // 眼球直径（描边画在这 34px 之外，所以整只眼占 36px）
  const MOUTH_Y = 91;

  /* 横坐标一律现算，不写死 —— LW 会跟着窗口宽度变（见 core.js），
     写死的话换个比例的屏脸就跑偏了 */
  const faceCx = () => LW >> 1;
  const eyeLX = () => (LW >> 1) - EYE_DX;
  const eyeRX = () => (LW >> 1) + EYE_DX;

  // 腮红挂在眼心的「下外侧」：往外 16px、往下 22px。
  // 往外推是为了让它落在眼球轮廓之外，两块颜色不打架。
  const BLUSH_DX = 16;
  const BLUSH_DY = 22;

  /* ─── 视线 ───
     gaze 单位是**逻辑像素**，跟 director 的产出对齐（§5 契约）。
     这里只做上限夹取，防止眼球被甩出眼窝，不做单位换算 ——
     换算过一次的话，director 的扫视缓动会在第一帧就撞到上限，
     150ms 的 outCubic 会退化成硬切，「微漂移」也会被放大成大幅摆动。
     横向给得比纵向大，人眼横向可视角本来就更宽。 */
  const GAZE_MAX_X = 9;
  const GAZE_MAX_Y = 7;

  /* ─── 高光跟随率 ───
     1 = 高光跟眼球一起整体位移。
     曾经设成 0.3 做「光源固定在世界空间」的视差，但在这套像素风里读不出来：
     眼球本身就是整只在动（没有独立眼白做参照），高光慢半拍只会显得
     两个东西各动各的、没黏在一起。 */
  const HL_FOLLOW = 1;

  /* ─── 歪头 ───
     像素风没有真旋转，用整数行错位（横向错切）伪造。
     支点放在眼和嘴之间偏下的 96 行：眼在支点上方往一边移、嘴在下方往另一边移，
     一正一反才读得出「歪」；支点若放在脸外，整张脸只会平移，看着像滑走了。
     TILT_SPAN=18 表示 tilt=1 时每 18 行错 1px。 */
  const TILT_PIVOT_Y = 82;
  const TILT_SPAN = 18;

  /* ═══════════ 形状数据（离线生成，勿手改） ═══════════ */

  /* 眼球：宽恒定 34，高按开合档位压扁；数组是每行左侧内缩量，
     右侧对称（右端 = 33 - inset）。闭合档只剩 2 行，读作一条粗线。 */
  const EYE_INSET = [
    [2,2], // 档 0：高 2px —— 闭合
    [10,5,2,1,0,0,1,2,5,10], // 档 1：高 10px —— 细缝
    [11,8,5,4,2,1,1,0,0,0,0,1,1,2,4,5,8,11], // 档 2：高 18px
    [12,9,7,5,4,3,2,2,1,1,0,0,0,0,0,0,1,1,2,2,3,4,5,7,9,12], // 档 3：高 26px
    [13,10,8,7,5,4,4,3,2,2,1,1,1,0,0,0,0,0,0,0,0,1,1,1,2,2,3,4,4,5,7,8,10,13], // 档 4：高 34px —— 全开
  ];

  /* 每档的明暗分带：[顶部 EYE_LIGHT 行数, 底部 EYE_DARK 行数]，中间是 EYE_MID。
     上亮下暗对应固定顶光，和高光位置是同一个光源假设，不能各画各的。
     闭合档没有「上部」，整条压成暗色，闭眼本来就不该有反光。 */
  const EYE_BAND = [[0, 2], [3, 3], [6, 5], [8, 7], [10, 9]];

  /* ─── 档 5「睁大」───
     档 4 已经是一个完整的圆，没有「再睁开一点」的余地了。
     所以 wink / curious / doze 的「睁大」只能靠**整只眼变大**来表达，
     而不是继续拉开合度 —— 这就是 pose.eyeX.scale 在 open 模式下的落点。

     这一档的轮廓不手写，按圆方程算出来。同样的算法喂 w=34 能逐行复现上面
     手写的档 4，所以两者的形状语言是一致的，不会有一档看起来是另一个画风。 */
  function genInset(w) {
    const r = w / 2, out = [];
    for (let j = 0; j < w; j++) {
      const dy = j + 0.5 - r;
      out.push(Math.max(0, Math.round(r - Math.sqrt(Math.max(0, r * r - dy * dy)))));
    }
    return out;
  }
  const EYE_W_BIG = 40;
  EYE_INSET.push(genInset(EYE_W_BIG));
  EYE_BAND.push([12, 11]);                 // 按 40/34 等比放大档 4 的 [10,9]
  /** 每档的眼球直径。只有「睁大」档不一样 */
  const EYE_W_LV = [EYE_W, EYE_W, EYE_W, EYE_W, EYE_W, EYE_W_BIG];

  /* 高光：[大高光 x,y,边长, 小高光 x,y,边长]，眼球局部坐标，边长 0 = 不画。
     右上大块是主光源的直接反射，左下小块是环境光的补反射 —— 一大一小、分处对角，
     才有「一个球被一盏灯照着」的感觉；两块一样大或者左右对称就摊回平面了。
     眼睛越眯，留给高光的地方越少，所以逐档缩小，闭合档直接不画。

     形状是**圆**不是方。方块高光在 ×8 放大后四个直角特别硬，读起来像贴了两张纸；
     圆的边缘有台阶，反而更像光落在球面上。

     尺寸照参考图量：大高光占眼球直径的 1/4、小高光 1/8，比一般直觉大不少。
     这两块白就是"可爱"的主要来源 —— 缩到 1/8 和 1/16 立刻变成一颗普通玻璃珠。
     位置：大的在 66% x / 35% y，小的在 33% x / 64% y。 */
  const EYE_HL = [
    [0, 0, 0, 0, 0, 0],
    [20, 2, 3, 0, 0, 0],
    [19, 4, 5, 11, 11, 2],
    [18, 6, 7, 10, 15, 3],
    [18, 8, 8, 9, 20, 4],    // 全开：大高光 8px = 0.24 D，小高光 4px = 0.12 D
    [22, 10, 9, 11, 23, 5],  // 档 5「睁大」：按 40/34 等比放大
  ];

  /* 高光圆盘：每行的 [起列, 止列)。用和眼球轮廓同一套圆方程算，
     两者的"圆"才是同一种圆；d≤3 时圆方程退化成方块，单独给个十字。 */
  function genDisc(d) {
    if (d <= 2) return [[0, d], [0, d]].slice(0, d);
    if (d === 3) return [[1, 2], [0, 3], [1, 2]];
    const r = d / 2, rows = [];
    for (let j = 0; j < d; j++) {
      const dy = j + 0.5 - r, half = Math.sqrt(Math.max(0, r * r - dy * dy));
      rows.push([Math.round(r - half), Math.round(r + half)]);
    }
    return rows;
  }
  const DISC = [];                                  // DISC[d] = 直径 d 的圆盘跨度表
  for (let d = 0; d <= 12; d++) DISC[d] = d > 0 ? genDisc(d) : [];

  const EYE_ARC = [ // 30×13
    '..........KKKKKKKKKK..........',
    '.......KKKKWWWWWWWWKKKK.......',
    '.....KKKWWWWWWWWWWWWWWKKK.....',
    '....KKWWWWWWWWWWWWWWWWWWKK....',
    '..KKKWWWWWWWWWWWWWWWWWWWWKKK..',
    '.KKWWWWWWWWWWWWWWWWWWWWWWWWKK.',
    'KKWWWWWWWWWKKKKKKKKWWWWWWWWWKK',
    'KWWWWWWWKKKK......KKKKWWWWWWWK',
    'KWWWWWKKK............KKKWWWWWK',
    'KWWWWKK................KKWWWWK',
    'KWWKKK..................KKKWWK',
    'KWKK......................KKWK',
    'KKK........................KKK',
  ];

  /* 四角星三档。同心三色：外 FLOWER_YELLOW → 中 FLOWER_CORE → 芯 WHITE，
     越靠中间越亮，远处看是一个会发光的点而不是一片黄。
     尖角用二次曲线收（半宽 ∝ (1-d)²）而不是直线，直线收出来是菱形不是星。 */
  const EYE_STAR = [
    [ // 21×21
      '.........KKK.........',
      '.........KYK.........',
      '.........KYK.........',
      '........KKYKK........',
      '.......KKYYYKK.......',
      '......KKYYCYYKK......',
      '.....KKYYYCYYYKK.....',
      '....KKYYYCCCYYYKK....',
      '..KKKYYYCCWCCYYYKKK..',
      'KKKYYYYCCWWWCCYYYYKKK',
      'KYYYYCCCWWWWWCCCYYYYK',
      'KKKYYYYCCWWWCCYYYYKKK',
      '..KKKYYYCCWCCYYYKKK..',
      '....KKYYYCCCYYYKK....',
      '.....KKYYYCYYYKK.....',
      '......KKYYCYYKK......',
      '.......KKYYYKK.......',
      '........KKYKK........',
      '.........KYK.........',
      '.........KYK.........',
      '.........KKK.........',
    ],
    [ // 27×27
      '............KKK............',
      '............KYK............',
      '............KYK............',
      '...........KKYKK...........',
      '...........KYYYK...........',
      '..........KKYYYKK..........',
      '.........KKYYCYYKK.........',
      '........KKYYYCYYYKK........',
      '.......KKYYYCCCYYYKK.......',
      '.....KKKYYYYCCCYYYYKKK.....',
      '....KKYYYYYCCWCCYYYYYKK....',
      '..KKKYYYYCCCCWCCCCYYYYKKK..',
      'KKKYYYYYCCCCWWWCCCCYYYYYKKK',
      'KYYYYYCCCCWWWWWWWCCCCYYYYYK',
      'KKKYYYYYCCCCWWWCCCCYYYYYKKK',
      '..KKKYYYYCCCCWCCCCYYYYKKK..',
      '....KKYYYYYCCWCCYYYYYKK....',
      '.....KKKYYYYCCCYYYYKKK.....',
      '.......KKYYYCCCYYYKK.......',
      '........KKYYYCYYYKK........',
      '.........KKYYCYYKK.........',
      '..........KKYYYKK..........',
      '...........KYYYK...........',
      '...........KKYKK...........',
      '............KYK............',
      '............KYK............',
      '............KKK............',
    ],
    [ // 33×33
      '...............KKK...............',
      '...............KYK...............',
      '...............KYK...............',
      '..............KKYKK..............',
      '..............KYYYK..............',
      '.............KKYYYKK.............',
      '.............KYYYYYK.............',
      '............KKYYYYYKK............',
      '...........KKYYYCYYYKK...........',
      '..........KKYYYYCYYYYKK..........',
      '........KKKYYYYCCCYYYYKKK........',
      '.......KKYYYYYYCCCYYYYYYKK.......',
      '.....KKKYYYYYYCCWCCYYYYYYKKK.....',
      '....KKYYYYYYYCCCWCCCYYYYYYYKK....',
      '..KKKYYYYYYCCCCWWWCCCCYYYYYYKKK..',
      'KKKYYYYYYYCCCCWWWWWCCCCYYYYYYYKKK',
      'KYYYYYYYCCCCWWWWWWWWWCCCCYYYYYYYK',
      'KKKYYYYYYYCCCCWWWWWCCCCYYYYYYYKKK',
      '..KKKYYYYYYCCCCWWWCCCCYYYYYYKKK..',
      '....KKYYYYYYYCCCWCCCYYYYYYYKK....',
      '.....KKKYYYYYYCCWCCYYYYYYKKK.....',
      '.......KKYYYYYYCCCYYYYYYKK.......',
      '........KKKYYYYCCCYYYYKKK........',
      '..........KKYYYYCYYYYKK..........',
      '...........KKYYYCYYYKK...........',
      '............KKYYYYYKK............',
      '.............KYYYYYK.............',
      '.............KKYYYKK.............',
      '..............KYYYK..............',
      '..............KKYKK..............',
      '...............KYK...............',
      '...............KYK...............',
      '...............KKK...............',
    ],
  ];

  /* 五种嘴，每种三档尺寸（小/中/大），中档是标准尺寸。
     四种带状嘴（smile/bigSmile/flat/wave）都是「沿一条曲线铺 3~5px 厚的白带」，
     厚度是硬要求：1px 的线在 3 米外直接消失，而且描完 INK 就只剩黑线了。 */
  /* ─── 笑弧生成器 ───
     手写的问题是逐行宽度跳变不均匀（12→10→10 再接一条 10px 平底），
     ×8 放大后下唇那圈描边就是一段一段的直角台阶，很扎眼。
     改成按**圆弧**算：每列求出弧心所在行，往下铺 thick 行白，
     再做一次 8 邻域膨胀出 1px 描边 —— 台阶由圆方程决定，
     整条下缘的宽度是单调收敛的，不会突然缩两格。

     和眼球轮廓（genInset）、高光圆盘（genDisc）用的是同一套圆，
     三者的"圆"必须是同一种圆，混用会看出是两个人画的。

     w = 白色部分宽度，depth = 中间比两端低多少，thick = 唇厚。
     成品尺寸 = (w+2) × (depth+thick+2)，多出来的 2 是描边留边。 */
  function genSmile(w, depth, thick) {
    const H = depth + thick + 2, W = w + 2;
    const halfW = (w - 1) / 2;
    const R = (halfW * halfW + depth * depth) / (2 * depth);   // 过两端和中点的圆半径
    const g = [];
    for (let j = 0; j < H; j++) g.push(new Array(W).fill(0));  // 0 空 1 白
    for (let x = 0; x < w; x++) {
      const dx = x - halfW;
      const y = depth - (R - Math.sqrt(Math.max(0, R * R - dx * dx)));
      const y0 = Math.round(y);
      for (let k = 0; k < thick; k++) {
        const yy = y0 + k + 1;
        if (yy >= 0 && yy < H) g[yy][x + 1] = 1;
      }
    }
    // 8 邻域膨胀 → 描边
    const out = [];
    for (let j = 0; j < H; j++) {
      let row = '';
      for (let i = 0; i < W; i++) {
        if (g[j][i]) { row += 'W'; continue; }
        let near = 0;
        for (let dj = -1; dj <= 1 && !near; dj++)
          for (let di = -1; di <= 1; di++) {
            const a = j + dj, b = i + di;
            if (a >= 0 && a < H && b >= 0 && b < W && g[a][b]) { near = 1; break; }
          }
        row += near ? 'K' : '.';
      }
      out.push(row);
    }
    return out;
  }

  /* 三档尺寸。小/中/大对应 pose.mouth.scale 的三档。
     中档 18×11 = 参考图量出来的 0.53 D × 0.32 D */
  const SMILE_SET = [genSmile(12, 4, 3), genSmile(16, 5, 4), genSmile(22, 7, 5)];
  const BIG_SMILE_SET = [genSmile(18, 7, 4), genSmile(24, 9, 5), genSmile(30, 11, 6)];

  const MOUTH = {
    smile: SMILE_SET,
    bigSmile: BIG_SMILE_SET,
    open: [
      [ // 20×14
        '.KKKKKKKKKKKKKKKKKK.',
        '.KWWWWWWWWWWWWWWWWK.',
        'KKWWWWWWWWWWWWWWWWKK',
        'KWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWK',
        'KKWWWWWWWWWWWWWWWWKK',
        '.KWWWWWWWWWWWWWWWWK.',
        '.KKWWWWWWWWWWWWWWKK.',
        '..KKKWWWWWWWWWWKKK..',
        '....KKKWWWWWWKKK....',
        '......KKKKKKKK......',
      ],
      [ // 26×18
        '..KKKKKKKKKKKKKKKKKKKKKK..',
        '.KKWWWWWWWWWWWWWWWWWWWWKK.',
        '.KWWWWWWWWWWWWWWWWWWWWWWK.',
        'KKWWWWWWWWWWWWWWWWWWWWWWKK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KKWWWWWWWWWWWWWWWWWWWWWWKK',
        '.KWWWWWWWWWWWWWWWWWWWWWWK.',
        '.KKWWWWWWWWWWWWWWWWWWWWKK.',
        '..KKWWWWWWWWWWWWWWWWWWKK..',
        '...KKWWWWWWWWWWWWWWWWKK...',
        '....KKKWWWWWWWWWWWWKKK....',
        '......KKKWWWWWWWWKKK......',
        '........KKKKKKKKKK........',
      ],
      [ // 32×22
        '...KKKKKKKKKKKKKKKKKKKKKKKKKK...',
        '..KKWWWWWWWWWWWWWWWWWWWWWWWWKK..',
        '.KKWWWWWWWWWWWWWWWWWWWWWWWWWWKK.',
        '.KWWWWWWWWWWWWWWWWWWWWWWWWWWWWK.',
        'KKWWWWWWWWWWWWWWWWWWWWWWWWWWWWKK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KKWWWWWWWWWWWWWWWWWWWWWWWWWWWWKK',
        '.KWWWWWWWWWWWWWWWWWWWWWWWWWWWWK.',
        '.KKWWWWWWWWWWWWWWWWWWWWWWWWWWKK.',
        '..KKWWWWWWWWWWWWWWWWWWWWWWWWKK..',
        '...KWWWWWWWWWWWWWWWWWWWWWWWWK...',
        '...KKKWWWWWWWWWWWWWWWWWWWWKKK...',
        '.....KKWWWWWWWWWWWWWWWWWWKK.....',
        '......KKKWWWWWWWWWWWWWWKKK......',
        '........KKKKWWWWWWWWKKKK........',
        '...........KKKKKKKKKK...........',
      ],
    ],
    /* flat：首尾各削 1px，端头不那么方；纯矩形看着像贴了段胶布 */
    flat: [
      [ // 16×5
        '.KKKKKKKKKKKKKK.',
        'KKWWWWWWWWWWWWKK',
        'KWWWWWWWWWWWWWWK',
        'KKWWWWWWWWWWWWKK',
        '.KKKKKKKKKKKKKK.',
      ],
      [ // 22×5
        '.KKKKKKKKKKKKKKKKKKKK.',
        'KKWWWWWWWWWWWWWWWWWWKK',
        'KWWWWWWWWWWWWWWWWWWWWK',
        'KKWWWWWWWWWWWWWWWWWWKK',
        '.KKKKKKKKKKKKKKKKKKKK.',
      ],
      [ // 28×5
        '.KKKKKKKKKKKKKKKKKKKKKKKKKK.',
        'KKWWWWWWWWWWWWWWWWWWWWWWWWKK',
        'KWWWWWWWWWWWWWWWWWWWWWWWWWWK',
        'KKWWWWWWWWWWWWWWWWWWWWWWWWKK',
        '.KKKKKKKKKKKKKKKKKKKKKKKKKK.',
      ],
    ],
    /* wave：整整一个正弦周期。半周期读作「歪嘴」不是「疑惑」 */
    wave: [
      [ // 22×9
        '...KKKKKKK............',
        '.KKKWWWWWKKK..........',
        'KKWWWWWWWWWKK.........',
        'KWWWWWWWWWWWKKK...KKKK',
        'KWWWKKKKKWWWWWKKKKKWWK',
        'KWKKK...KKKWWWWWWWWWWK',
        'KKK.......KKWWWWWWWWWK',
        '...........KKKWWWWWKKK',
        '.............KKKKKKK..',
      ],
      [ // 30×11
        '.....KKKKKKK..................',
        '...KKKWWWWWKKK................',
        '.KKKWWWWWWWWWKKK..............',
        'KKWWWWWWWWWWWWWKK.............',
        'KWWWWWKKKKKWWWWWKKK.......KKKK',
        'KWWWKKK...KKKWWWWWKKK...KKKWWK',
        'KWKKK.......KKKWWWWWKKKKKWWWWK',
        'KKK...........KKWWWWWWWWWWWWWK',
        '...............KKKWWWWWWWWWKKK',
        '.................KKKWWWWWKKK..',
        '...................KKKKKKK....',
      ],
      [ // 36×12
        '......KKKKKKKK......................',
        '...KKKKWWWWWWKKKK...................',
        '.KKKWWWWWWWWWWWWKKK.................',
        'KKWWWWWWWWWWWWWWWWKK................',
        'KWWWWWWWWWWWWWWWWWWKKK..........KKKK',
        'KWWWWWWKKKKKKWWWWWWWWKKKK....KKKKWWK',
        'KWWWKKKK....KKKKWWWWWWWWKKKKKKWWWWWK',
        'KWKKK..........KKKWWWWWWWWWWWWWWWWWK',
        'KKK..............KKWWWWWWWWWWWWWWWWK',
        '..................KKKWWWWWWWWWWWWKKK',
        '....................KKKKWWWWWWKKKK..',
        '.......................KKKKKKKK.....',
      ],
    ],
  };

  /* open 的嘴要往下挂：它是从唇线往下张开的，按外框居中会顶到眼睛下缘 */
  const MOUTH_OY = { smile: 0, bigSmile: 0, open: 4, flat: 0, wave: 0 };

  /* 腮红三档，纯色块不描边。
     §1.3 的描边规则点名的是「眼、嘴、眼弧、特效」，腮红不在其列 ——
     它是脸颊上的一片颜色而不是一个物体，围上 INK 会立刻变成伤疤。 */
  const BLUSH = [
    [ // 10×5
      '..BBBBBB..',
      'BBBBBBBBBB',
      'BBBBBBBBBB',
      'BBBBBBBBBB',
      '..BBBBBB..',
    ],
    [ // 14×6
      '...BBBBBBBB...',
      '.BBBBBBBBBBBB.',
      'BBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBB',
      '.BBBBBBBBBBBB.',
      '...BBBBBBBB...',
    ],
    [ // 18×8
      '.....BBBBBBBB.....',
      '..BBBBBBBBBBBBBB..',
      '.BBBBBBBBBBBBBBBB.',
      'BBBBBBBBBBBBBBBBBB',
      'BBBBBBBBBBBBBBBBBB',
      '.BBBBBBBBBBBBBBBB.',
      '..BBBBBBBBBBBBBB..',
      '.....BBBBBBBB.....',
    ],
  ];

  const MAP_FACE = { W: C.WHITE, K: C.INK };
  const MAP_STAR = { Y: C.FLOWER_YELLOW, C: C.FLOWER_CORE, W: C.WHITE, K: C.INK };
  const MAP_BLUSH = { B: C.BLUSH };

  const DEF_EYE = { mode: 'open', open: 1, gaze: null, scale: 1 };
  const DEF_MOUTH = { mode: 'smile', scale: 1 };
  const ZERO = { x: 0, y: 0 };

  /* ═══════════ 歪头状态（每帧 draw 开头设一次） ═══════════ */

  let tiltK = 0;      // 每行的横移量（px/行）
  let tiltPivot = 0;  // 支点行（世界坐标，跟着 head.y 走）
  let tiltLim = 0;    // 横移上限

  /* 某一行该往横里挪几个像素。取整发生在这里，所以自然形成「每隔 n 行错 1px」的台阶。
     上限存在的理由：眼球有 34 行高，不封顶的话大 tilt 会把圆剪成一条斜面。 */
  function rowShift(y) {
    if (tiltK === 0) return 0;
    let s = Math.round((tiltPivot - y) * tiltK);
    if (s > tiltLim) s = tiltLim;
    else if (s < -tiltLim) s = -tiltLim;
    return s;
  }

  /* ═══════════ 小工具 ═══════════ */

  const ONE = ['']; // 复用同一个单行数组，避免每帧几十次数组分配

  /** 缺字段、NaN、Infinity 一律退回默认值。
      NaN 一旦漏进来会顺着 quant 变成 EYE_INSET[NaN]，整个待机动画当场停摆 ——
      渲染层宁可画错一帧，也不能因为上游一次除零就黑屏。 */
  function num(v, d) {
    return (typeof v === 'number' && v - v === 0) ? v : d;
  }

  /** 一行一行地贴精灵，每行按 rowShift 横移 —— 歪头就是这么来的 */
  function spriteTilted(x, y, rows, map) {
    for (let j = 0; j < rows.length; j++) {
      const wy = y + j;
      ONE[0] = rows[j];
      sprite(x + rowShift(wy), wy, ONE, map);
    }
  }

  /** 连续 scale 量化成三档，1.0 落在中档。
      director 让 scale 在 1±0.2 之间脉动就能扫过三档，看起来就是「一闪一闪」。
      注意 scale 只是尺寸档位，不是显隐开关：scale=0 画的是最小档而不是不画，
      要藏元素请从 pose 里换 mode，别指望把 scale 归零。 */
  function scaleLv(s) {
    if (!(s > 0)) return 0;
    return s < 0.82 ? 0 : (s < 1.12 ? 1 : 2);
  }

  /** 越界行当作空行：inset=17 时左右端会交叉，跨度自动为空，描边算法不用特判 */
  function insetAt(tab, h, j, empty) {
    return (j < 0 || j >= h) ? empty : tab[j];
  }

  /* ═══════════ 眼睛 ═══════════ */

  /**
   * 圆眼球。cx/cy 是眼心（已含 head 偏移），gx/gy 是已取整的视线像素偏移。
   */
  function drawEyeBall(cx, cy, lv, gx, gy) {
    const inset = EYE_INSET[lv];
    const h = inset.length;
    const band = EYE_BAND[lv];
    const ew = EYE_W_LV[lv];             // 「睁大」档比其余档宽，宽度得逐档取
    // 空行哨兵必须正好是半宽：本行为空时下面两段 hline 在中线相接，连成完整盖帽。
    // 取大于半宽的值会让盖帽横着拉穿整个画面
    const empty = ew >> 1;
    const x0 = cx - (ew >> 1) + gx;      // 眼球左上角
    const y0 = cy - (h >> 1) + gy;

    // ── 1. INK 外圈 ──
    // 逐行取「上中下三行跨度的并集」向外扩 1px，再挖掉本行填充，剩下的就是描边。
    // 直接按本行左右各画一点的话，斜边台阶的拐角会漏出来。
    for (let j = -1; j <= h; j++) {
      const a = insetAt(inset, h, j - 1, empty);
      const b = insetAt(inset, h, j, empty);
      const c2 = insetAt(inset, h, j + 1, empty);
      let m = a < b ? a : b;
      if (c2 < m) m = c2;
      if (m >= empty) continue;         // 三行全空，这行没边可描
      const wy = y0 + j;
      const bx = x0 + rowShift(wy);
      // b=17（本行为空）时，下面两段刚好在中线接上，连成完整的一条盖帽
      if (b - 1 >= m - 1) hline(bx + m - 1, bx + b - 1, wy, C.INK);
      if (ew - m >= ew - b) hline(bx + ew - b, bx + ew - m, wy, C.INK);
    }

    // ── 2. 球体三段明暗 ──
    const lightRows = band[0];
    const darkFrom = h - band[1];
    for (let j = 0; j < h; j++) {
      const ins = inset[j];
      const wy = y0 + j;
      const bx = x0 + rowShift(wy);
      const ci = j < lightRows ? C.EYE_LIGHT : (j >= darkFrom ? C.EYE_DARK : C.EYE_MID);
      hline(bx + ins, bx + ew - 1 - ins, wy, ci);
    }

    // ── 3. 高光 ──
    // 关键：高光的世界位置只吃 30% 的 gaze。先把眼球身上那份 gaze 退掉再补 30%，
    // 于是眼球转得多、高光挪得少，两者错开 —— 这就是唯一的「球」的证据。
    const hl = EYE_HL[lv];
    const hx = x0 - gx + Math.round(gx * HL_FOLLOW);
    const hy = y0 - gy + Math.round(gy * HL_FOLLOW);
    for (let k = 0; k < 2; k++) {
      const side = hl[k * 3 + 2];
      if (side <= 0) continue;
      const sx = hx + hl[k * 3];
      const sy = hy + hl[k * 3 + 1];
      const disc = DISC[side] || DISC[2];
      for (let j = 0; j < side; j++) {
        const wy = sy + j;
        const ly = wy - y0;
        if (ly < 0 || ly >= h) continue;          // 错位后跑出眼球高度就整行不画
        const ins = inset[ly];
        const bx = x0 + rowShift(wy);
        const span = disc[j];
        for (let i = span[0]; i < span[1]; i++) {
          const lx = sx + i - x0;
          if (lx < ins || lx > ew - 1 - ins) continue;  // 逐像素裁进球内，绝不溢出描边
          px(bx + lx, wy, C.WHITE);
        }
      }
    }
  }

  function drawEye(e, cx, cy) {
    const eye = e || DEF_EYE;
    const mode = eye.mode || 'open';

    if (mode === 'arc') {
      // 闭着的笑眼不看任何地方，所以不吃 gaze；跟着 gaze 飘会显得眼皮在游走。
      // scale < 1 时整条弧往下沉，弹出过程读作「弧从眼窝里升上来」——
      // 像素图没法平滑缩放，位移是唯一不破坏描边的弹出方式
      const rows = EYE_ARC;
      const pop = Math.round((1 - clampPx(num(eye.scale, 1), 1)) * 5);
      spriteTilted(cx - (rows[0].length >> 1), cy - (rows.length >> 1) + pop, rows, MAP_FACE);
      return;
    }

    const g = eye.gaze || ZERO;
    const gx = Math.round(clampPx(g.x, GAZE_MAX_X));
    const gy = Math.round(clampPx(g.y, GAZE_MAX_Y));

    if (mode === 'star') {
      const rows = EYE_STAR[scaleLv(num(eye.scale, 1))];
      // 星星整体就是瞳孔，100% 跟随视线（没有球面，也就没有高光错位这回事）
      spriteTilted(cx - (rows[0].length >> 1) + gx, cy - (rows.length >> 1) + gy, rows, MAP_STAR);
      return;
    }

    // 'open'：开合量化成 5 档，不做连续形变（§1.5）。
    // scale 再在档位上加减一档：>1.12 睁大一档（档 5，更大的球），<0.82 收一档。
    // 「睁大」不能靠继续拉 open —— 档 4 已经是完整的圆了
    let lv = quant(num(eye.open, 1), 5) + (scaleLv(num(eye.scale, 1)) - 1);
    if (lv < 0) lv = 0; else if (lv > 5) lv = 5;
    drawEyeBall(cx, cy, lv, gx, gy);
  }

  /** 视线夹到 ±m 逻辑像素。超了就是「看到底」，不会把眼球甩出眼窝 */
  function clampPx(v, m) {
    const n = num(v, 0);
    return n < -m ? -m : (n > m ? m : n);
  }

  /* ═══════════ 嘴 ═══════════ */

  function drawMouth(m, hx, hy) {
    const mo = m || DEF_MOUTH;
    const mode = MOUTH[mo.mode] ? mo.mode : 'smile';
    const rows = MOUTH[mode][scaleLv(num(mo.scale, 1))];
    const x0 = faceCx() + hx - (rows[0].length >> 1);
    const y0 = MOUTH_Y + hy - (rows.length >> 1) + MOUTH_OY[mode];
    spriteTilted(x0, y0, rows, MAP_FACE);
  }

  /* ═══════════ 腮红 ═══════════ */

  function drawBlushAt(cx, cy, rows) {
    spriteTilted(cx - (rows[0].length >> 1), cy - (rows.length >> 1), rows, MAP_BLUSH);
  }

  function drawBlush(vRaw, hx, hy) {
    const v = num(vRaw, 0);
    if (!(v > 0)) return;
    // 用 ceil 分三档：任何大于 0 的值都至少出一档，淡淡的腮红不会被量化掉
    let lv = Math.ceil(clamp01(v) * 3) - 1;
    if (lv < 0) lv = 0;
    else if (lv > 2) lv = 2;
    const rows = BLUSH[lv];
    const y = EYE_Y + hy + BLUSH_DY;
    drawBlushAt(eyeLX() + hx - BLUSH_DX, y, rows);
    drawBlushAt(eyeRX() + hx + BLUSH_DX, y, rows);
  }

  /* ═══════════ 入口 ═══════════ */

  /**
   * 把一个 pose 画到帧缓冲上。假定背景已经铺好。
   * pose 缺字段一律走默认值 —— 渲染层不该因为 director 少填一项就崩。
   */
  function draw(pose) {
    const p = pose || {};
    const head = p.head || ZERO;

    // 浮点只活在运动计算里，进到绘制层第一件事就是取整（§1.5）
    const hx = Math.round(num(head.x, 0));
    const hy = Math.round(num(head.y, 0));

    const tilt = num(head.tilt, 0);
    tiltK = tilt / TILT_SPAN;
    tiltPivot = TILT_PIVOT_Y + hy;              // 支点跟着头一起浮动
    tiltLim = Math.round(Math.abs(tilt)) + 1;   // 整数上限，夹完仍是整数像素

    // 顺序：腮红最先 —— 它和眼球贴得近，万一擦边也该让眼睛的 INK 描边压住它
    drawBlush(p.blush, hx, hy);
    drawEye(p.eyeL, eyeLX() + hx, EYE_Y + hy);
    drawEye(p.eyeR, eyeRX() + hx, EYE_Y + hy);
    drawMouth(p.mouth, hx, hy);
  }

  return {
    draw,
    /* 给 fx 用的只读锚点，省得特效模块再抄一遍魔法数字 */
    ANCHOR: {
      eyeY: EYE_Y, eyeDX: EYE_DX, eyeW: EYE_W, mouthY: MOUTH_Y,
    },
  };
})();

/* ═══════════════════════════════════════════════════════════════
   director —— 节拍调度器（整套动画的大脑）

   只产出 Pose，face / fx 照着画就行，绘制层不做任何时间判断。
   把「什么时候动、动多少」全收在这一个文件里是为了 Compose 迁移：
   Kotlin 侧原样搬这份状态机，绘制层一行都不用改。

   三条纪律：
     · 时间只来自参数 dtMs，绝不读系统时钟 —— 否则录屏、回放、单测都不可复现
     · 随机只来自 makeRng 固定种子 —— Kotlin 同算法同序列，两端表现一模一样
     · 连续量（位移）保持浮点、取整交给绘制层；但形状档位（眼睛开合、
       星星缩放）在这里就 quant 掉，免得 face 各画各的档

   ── 坐标 / 符号约定 ────────────────────────────────────────────
     head.x / head.y   逻辑像素偏移，右为正、下为正
     head.tilt         头顶相对下巴的水平位移（像素），正 = 头顶向右歪
     gaze.x / gaze.y   眼球（虹膜+高光）相对眼窝中心的偏移，像素
     eye.open          0..1，已量化到 5 档：0 / .25 / .5 / .75 / 1
     eye.scale         眼睛整体缩放倍率，1 = 常态

   ── 与 fx 的接口约定 ───────────────────────────────────────────
     Fx.spawn(pose.fx, kind, x, y)   往粒子表塞一颗，kind: 'star'|'note'|'z'
     Fx.update(pose.fx, dtMs)        推进并回收
   director 只负责「在哪儿冒出什么」，粒子往哪飘、活多久是 fx 的事。
   两个调用都做了存在性保护，fx 没加载时动画照跑不崩。
   ═══════════════════════════════════════════════════════════════ */

const Director = (function () {

  /* ───────── 脸部锚点（需求 §2），特效落点得贴着脸算 ───────── */
  /* 特效落点。横向现算 —— LW 随窗口变，写死会让星星飘到脸外面去。
     （这三个数原本还停在改版前的 88/152/78，脸挪了它们没跟上） */
  const EYE_DX = 29, EYE_CY = 68;
  const eyeL = () => (LW >> 1) - EYE_DX;
  const eyeR = () => (LW >> 1) + EYE_DX;
  const faceCx = () => LW >> 1;

  const TAU = Math.PI * 2;
  /** 取 [a,b] 窗口内的归一化进度，窗口外自动夹到 0/1 */
  const seg = (t, a, b) => clamp01((t - a) / (b - a));

  /* ═══════════════════════════════════════════════════════════
     基础层
     ═══════════════════════════════════════════════════════════ */

  /* 六条曲线，周期刻意取成彼此不成整数倍的数。
     只要有两条周期成倍数，它们每隔几秒就会同时过零 —— 呼吸和眼漂
     一起停一起走，整张脸「一块儿动」，3 米外一眼看出是死循环。
     3400 是需求钉死的呼吸周期，其余全取质数错开，合周期长到看不出头。 */
  const T_BREATH  = 3400;              // 呼吸浮动 ±1px
  const T_SWAY    = 7307;              // 身体左右微摆，比呼吸慢一倍多
  const T_GAZE_X1 = 5171, T_GAZE_X2 = 2833;   // 眼球横漂：两条正弦叠加
  const T_GAZE_Y1 = 4297, T_GAZE_Y2 = 1933;   // 眼球纵漂

  let phBreath = 0, phSway = 0, phGX1 = 0, phGX2 = 0, phGY1 = 0, phGY2 = 0;

  /* 相位一律先对周期取模再累加。不是洁癖：7×24 常驻累计毫秒会到 6e8 量级，
     Kotlin 侧若用 Float（24 位尾数）那时早就丢光小数位，正弦会卡成阶梯。 */
  function wrap(ph, dt, period) {
    ph += dt;
    if (ph >= period) ph -= period * Math.floor(ph / period);
    return ph;
  }
  const sinP = (ph, period) => Math.sin(ph / period * TAU);

  /* ═══════════════════════════════════════════════════════════
     节拍表（需求 §3.2，数值不得改）
     ═══════════════════════════════════════════════════════════ */

  const B_IDLE = 0, B_BLINK = 1, B_DBLINK = 2, B_LOOK = 3,
        B_WINK = 4, B_HAPPY = 5, B_STAR = 6, B_DOZE = 7;

  /* 平铺成同长数组而不是对象数组：Kotlin 侧就是几个 IntArray，
     不用为九个节拍造一个 data class。列顺序 = 上面那组常量的顺序 */
  /*                idle blink dbl  look  wink happy star  doze */
  const WEIGHT = [    34,  30,  10,   28,    5,    5,    2,    2];
  const COOL   = [     0,1600,9000, 2500,18000,20000,45000,60000];
  /* DMIN/DMAX 是**基准**时长，实际时长 = 基准 × STRETCH */
  const DMIN   = [  1400, 190, 430, 1400,  900, 1600, 2200, 3000];
  const DMAX   = [  3400, 190, 430, 2200,  900, 1600, 2200, 3000];

  /* ─── 时间轴拉伸 ───
     光把 DMIN/DMAX 调大没用：每个节拍内部的关键帧时刻是写死的，
     节拍变长只会让动作照旧演完、然后干等到时间到 —— 那是「表情后面接一段发呆」，
     不是「表情变慢」。所以改成缩放喂给节拍函数的时间：
     节拍看到的 t = 真实经过时间 / STRETCH，所有关键帧和缓动曲线一起等比变慢。

     眨眼不拉伸 —— 人眨眼本来就是 190ms，拉长会变成「眼皮沉重」。 */
  const STRETCH = [    1,   1,   1,  1.5,  2.0,  1.7,  1.7,  1.6];
  const N_BEAT = 8;
  const BEAT_NAMES = ['idle', 'blink', 'double-blink', 'look', 'wink', 'happy', 'star', 'doze'];

  /* 冷却剩余时间。选中某拍时置成 冷却 + 本次时长，
     于是它在播放期间就开始倒数，播完刚好还剩一个完整冷却 —— 一个计时器搞定，
     不用存「上次结束的绝对时刻」（那又要引入时钟）。 */
  const cool = [0, 0, 0, 0, 0, 0, 0, 0];

  /* 固定种子。换种子 = 换一整条演出序列，但同一个种子每次开机都一样，
     出问题能原样复现 */
  const rng = makeRng(0x5C1AB0);

  let cur = B_IDLE;      // 当前节拍
  let tRaw = 0;          // 当前节拍已播的**真实**毫秒，只用来判断这一拍演完没有
  let tPrevRaw = 0;
  let t = 0;             // 节拍**内部**时间 = tRaw / STRETCH，节拍函数看到的就是它
  let tPrev = 0;         // 上一帧的 t，用来判断「本帧跨过了某个时刻」
  let dur = 900;         // 当前节拍总时长（**真实**毫秒，用来判断演完没有）
  let durLocal = 900;    // 同一拍在**内部时间轴**上的长度 = dur / STRETCH。
                         // 节拍函数排关键帧必须用它 —— 用 dur 会排到时间轴之外，
                         // 最后一段（比如「视线回中」）永远走不到，视线就会在切拍时硬跳回去
  let dtNow = 0;

  /** 本帧是否跨过时刻 mark —— 特效只在这一帧发一次，不会重复喷 */
  const hit = (mark) => tPrev < mark && t >= mark;

  /* ───────── 抽签 ───────── */
  const elig = [0, 0, 0, 0, 0, 0, 0, 0];
  function pick() {
    let total = 0;
    for (let i = 0; i < N_BEAT; i++) {
      /* 三条排除规则：冷却没走完 / 和上一拍重样 / idle 后面必须换非 idle
         （后两条在 idle 上其实是同一条，分开写是为了对齐需求，
           以后若放宽「不得连抽」也不会顺手把 idle 连播放出来） */
      const ok = cool[i] <= 0 && i !== cur && !(cur === B_IDLE && i === B_IDLE);
      elig[i] = ok ? 1 : 0;
      if (ok) total += WEIGHT[i];
    }
    if (total <= 0) {
      /* 全在冷却：与其让脸僵在 idle 上发呆，不如把最快解冻的那拍提前放出来。
         宁可某个节拍早了几百毫秒，也不能出现「一动不动」 */
      let best = -1, bestCool = 1e9;
      for (let i = 0; i < N_BEAT; i++) {
        if (i === cur) continue;
        if (cool[i] < bestCool) { bestCool = cool[i]; best = i; }
      }
      return best < 0 ? B_BLINK : best;
    }
    let r = rng() * total;
    for (let i = 0; i < N_BEAT; i++) {
      if (!elig[i]) continue;
      r -= WEIGHT[i];
      if (r <= 0) return i;
    }
    return B_BLINK;   // 浮点兜底，理论上到不了
  }

  /* ───────── 每拍开场：掷时长 + 掷这一拍的随机参数 ─────────
     参数在开场一次性掷定、整拍不变。逐帧掷会让动作抖成噪声。 */
  function startBeat(i, carry) {
    cur = i;
    dur = Math.round((DMIN[i] + (DMAX[i] - DMIN[i]) * rng()) * STRETCH[i]);
    durLocal = dur / STRETCH[i];
    cool[i] = COOL[i] + dur;
    tRaw = carry;
    tPrevRaw = 0;
    t = carry / STRETCH[i];
    tPrev = 0;
    fxAcc = 0;
    headFollow = 0;
    if (i === B_LOOK) rollLook();
  }

  /* ═══════════════════════════════════════════════════════════
     Pose —— 全程复用同一个对象，逐帧改字段。
     每帧新建对象在 60fps 下就是给 GC 送料，Kotlin 侧同理。
     ═══════════════════════════════════════════════════════════ */
  const pose = {
    t: 0,
    head:  { x: 0, y: 0, tilt: 0 },
    eyeL:  { mode: 'open', open: 1, gaze: { x: 0, y: 0 }, scale: 1 },
    eyeR:  { mode: 'open', open: 1, gaze: { x: 0, y: 0 }, scale: 1 },
    mouth: { mode: 'smile', scale: 1 },
    blush: 0,
    fx: [],
  };

  function reset() {
    const h = pose.head; h.x = 0; h.y = 0; h.tilt = 0;
    const l = pose.eyeL, r = pose.eyeR;
    l.mode = 'open'; l.open = 1; l.scale = 1; l.gaze.x = 0; l.gaze.y = 0;
    r.mode = 'open'; r.open = 1; r.scale = 1; r.gaze.x = 0; r.gaze.y = 0;
    pose.mouth.mode = 'smile'; pose.mouth.scale = 1;
    pose.blush = 0;
  }

  /* 两只眼是一副眼睛，视线必须完全一致。
     给左右眼掺不同的漂移只会在取整边界上让一只跳一只不跳 —— 直接变斗鸡眼 */
  function gazeAdd(x, y) {
    pose.eyeL.gaze.x += x; pose.eyeL.gaze.y += y;
    pose.eyeR.gaze.x += x; pose.eyeR.gaze.y += y;
  }
  function openBoth(v) { pose.eyeL.open = v; pose.eyeR.open = v; }
  function scaleBoth(v) { pose.eyeL.scale = v; pose.eyeR.scale = v; }

  /** 特效落点自动带上当前头部偏移，粒子才是从「脸上」冒出来的 */
  function emit(kind, x, y) {
    if (typeof Fx === 'undefined' || !Fx || !Fx.spawn) return;
    Fx.spawn(pose.fx, kind,
             Math.round(x + pose.head.x), Math.round(y + pose.head.y));
  }

  /* ═══════════════════════════════════════════════════════════
     九个节拍
     ═══════════════════════════════════════════════════════════ */

  /* ───── blink ─────
     闭 70 / 开 120 的非对称是这一拍的全部灵魂。对称开合是机械快门；
     真人眼睑闭合是弹道式（起手最快、到底急刹），睁开慢一截且收尾放缓。 */
  function blinkAt(tt) {
    if (tt < 70)  return 1 - Ease.outQuad(tt / 70);
    if (tt < 190) return Ease.outQuad((tt - 70) / 120);
    return 1;
  }
  function beatBlink() { openBoth(blinkAt(t)); }

  /* ───── doubleBlink ───── 70+120 | 50 停 | 70+120 = 430
     第一下只睁回 3 档就接第二下 —— 连眨的特征恰恰是「没睁利索」那点抖，
     真睁满再闭会读成两次独立眨眼 */
  function beatDoubleBlink() {
    let v;
    if (t < 70)       v = 1 - Ease.outQuad(t / 70);
    else if (t < 190) v = 0.78 * Ease.outQuad((t - 70) / 120);
    else if (t < 240) v = 0.78;
    else if (t < 310) v = 0.78 * (1 - Ease.outQuad((t - 240) / 70));
    else              v = Ease.outQuad((t - 310) / 120);
    openBoth(v);
  }

  /* ───── lookAround ─────
     八个方向偏横向：正侧目在 3~5 米外辨识度最高，纯上下看只是眼皮变化。 */
  const LOOK_DIRS = [9, 0, -9, 0, 9, -4, -9, -4, 7, 4, -7, 4, 5, -6, -5, -6];
  /* 关键帧走平铺数组、定长复用，整拍零分配 */
  const lkT = [0, 0, 0, 0, 0, 0], lkX = [0, 0, 0, 0, 0, 0], lkY = [0, 0, 0, 0, 0, 0];
  let lkN = 0, headFollow = 0;

  function rollLook() {
    const backStart = durLocal - 380;
    const i0 = (rng() * 8) | 0;
    const ax = LOOK_DIRS[i0 * 2], ay = LOOK_DIRS[i0 * 2 + 1];
    lkT[0] = 0;   lkX[0] = 0;  lkY[0] = 0;
    lkT[1] = 150; lkX[1] = ax; lkY[1] = ay;
    if (durLocal >= 1800) {
      /* 时间够长就看两处。一直盯着同一个方向发呆两秒，比不看还假 */
      const i1 = (i0 + 1 + ((rng() * 7) | 0)) % 8;
      const bx = LOOK_DIRS[i1 * 2], by = LOOK_DIRS[i1 * 2 + 1];
      const mid = Math.round((150 + backStart) * 0.5);
      lkT[2] = mid;        lkX[2] = ax; lkY[2] = ay;
      lkT[3] = mid + 130;  lkX[3] = bx; lkY[3] = by;
      lkT[4] = backStart;  lkX[4] = bx; lkY[4] = by;
      lkT[5] = durLocal;   lkX[5] = 0;  lkY[5] = 0;
      lkN = 6;
    } else {
      lkT[2] = backStart;  lkX[2] = ax; lkY[2] = ay;
      lkT[3] = durLocal;   lkX[3] = 0;  lkY[3] = 0;
      lkN = 4;
    }
  }

  function beatLookAround() {
    let i = 0;
    while (i < lkN - 2 && t >= lkT[i + 1]) i++;
    const t0 = lkT[i], t1 = lkT[i + 1];
    const u = t1 > t0 ? seg(t, t0, t1) : 1;
    /* 扫视 outCubic：一步到位然后急刹，眼球就是这么动的（saccade 没有缓入）。
       最后一段回中换 inOutCubic：收回视线是「懒得看了」，两头都要缓。 */
    const e = (i === lkN - 2) ? Ease.inOutCubic(u) : Ease.outCubic(u);
    const gx = lerp(lkX[i], lkX[i + 1], e);
    const gy = lerp(lkY[i], lkY[i + 1], e);
    gazeAdd(gx, gy);
    /* 头跟 1px，但要慢半拍：眼先到位、头再追过去。
       同步位移会读成「整个脑袋平移」，错开才有脖子的重量感。 */
    headFollow += (gx * 0.2 - headFollow) * Math.min(1, dtNow / 90);
    pose.head.x += headFollow;
    pose.head.y += gy * 0.15;
  }

  /* ───── wink ───── 左眼固定，这是小豹的习惯动作，随机左右会散掉性格
     左眼闭到底再换成 ^ 弧；右眼**保持原样不放大** ——
     一放大就读成「惊讶」，跟 wink 的俏皮是两种表情。 */
  function beatWink() {
    if (t < 110) {
      /* 先老实闭上，闭到底了才换成 ^ 弧。
         直接从睁眼跳成弧线会「闪」一下：像素画没有中间帧糊过去，
         形态切换必须发生在两边都接近「一条线」的那一帧 */
      pose.eyeL.open = 1 - Ease.outQuad(t / 110);
    } else if (t < 770) {
      pose.eyeL.mode = 'arc';
      pose.eyeL.scale = lerp(0.55, 1, Ease.outBack(seg(t, 110, 250)));
    } else {
      pose.eyeL.open = Ease.outQuad(seg(t, 770, 900));
    }
    const tin = Ease.outBack(seg(t, 30, 300));
    const tout = Ease.inOutCubic(seg(t, 680, 900));
    const k = tin * (1 - tout);
    pose.head.tilt = -2.4 * k;               // 歪向眨的那只眼
    pose.head.x += -1 * k;
    pose.head.y += -0.6 * k;
    /* 嘴维持 smile 不换 bigSmile：脸整体缩版之后 bigSmile 会占掉半张脸。
       wink 的读点在眼和歪头，嘴只要跟着扬一点就够 */
    pose.mouth.scale = 1 + 0.10 * k;
  }

  /* ───── happy ───── 上下弹跳两次 + 音符
     一次完整弹跳 520ms：蹬地(outQuad 起手最快) → 下落(inQuad 重力加速)
     → 砸到 +squash → 顿 3 帧 → outElastic 弹回。
     压这一下很关键：像素风画不了形变挤压，只能用整体下沉替代 squash&stretch。
     那 50ms 的停顿也不能省 —— 60fps 下不顿住的话压缩只存在一两帧，
     眼睛根本来不及读到，落地就变成了「穿过去」而不是「砸下去」。 */
  function hopY(tt, t0, amp, squash) {
    const l = tt - t0;
    if (l < 0 || l >= 520) return 0;
    if (l < 170) return -amp * Ease.outQuad(l / 170);
    if (l < 300) return lerp(-amp, squash, Ease.inQuad((l - 170) / 130));
    if (l < 350) return squash;
    return lerp(squash, 0, Ease.outElastic((l - 350) / 170));
  }

  function beatHappy() {
    const hy = hopY(t, 0, 5, 2.0) + hopY(t, 520, 3.5, 1.4);  // 第二跳矮一截才像「余兴」
    pose.head.y += hy;
    pose.head.tilt = hy * 0.12;    // 起跳时顺带一点点歪，纯竖直弹跳像弹簧玩具

    if (t < 110) {
      openBoth(1 - Ease.outQuad(seg(t, 40, 110)));   // 先动身体后变表情，动作才有先后
    } else if (t < 1420) {
      pose.eyeL.mode = 'arc'; pose.eyeR.mode = 'arc';
    } else {
      openBoth(Ease.outQuad(seg(t, 1420, 1560)));
    }

    const air = clamp01(-hy / 5);                    // 腾空越高嘴张越大
    if (t >= 110 && t < 1400)      { pose.mouth.mode = 'open';     pose.mouth.scale = 1 + 0.22 * air; }
    else if (t >= 1400 && t < 1540) { pose.mouth.mode = 'bigSmile'; }

    /* 音符卡在两次腾空的最高点甩出去，落地再补一颗 */
    if (hit(150))  emit('note', eyeL() - 24, EYE_CY - 30);
    if (hit(560))  emit('note', eyeR() + 22, EYE_CY - 34);
    if (hit(1000)) emit('note', eyeL() - 10, EYE_CY - 38);
  }

  /* ───── starEyes ───── 四角星 3 档缩放（需求 §3.3）
     缩放必须是三档硬跳，不能连续插值：像素星星逐帧长一点点只会边缘乱抖，
     跳档反而是「闪」 */
  const STAR_STEPS = [0.72, 0.96, 1.20];
  let fxAcc = 0;

  function beatStarEyes() {
    /* 头先弹起来一点，兴奋是从身体开始的 */
    pose.head.y += -2 * Ease.outBack(seg(t, 120, 320))
                      * (1 - Ease.inOutQuad(seg(t, 1900, 2150)));

    if (t < 150) {
      /* 先眯一下再炸开。像素风没有动态模糊，冲击力全靠这个预备动作 */
      openBoth(1 - 0.8 * Ease.outQuad(t / 150));
    } else if (t < 2060) {
      const grow = clamp01(Ease.outBack(seg(t, 150, 360)));
      const gone = 1 - Ease.inQuad(seg(t, 2000, 2060));
      /* 两眼错相 110ms：同相闪烁像两只灯泡接同一根线，错开才像在「亮」 */
      const pL = 0.5 + 0.5 * Math.sin((t - 150) / 380 * TAU);
      const pR = 0.5 + 0.5 * Math.sin((t - 40) / 380 * TAU);
      pose.eyeL.mode = 'star';
      pose.eyeR.mode = 'star';
      pose.eyeL.scale = STAR_STEPS[quant(grow * gone * (0.60 + 0.40 * pL), 3)];
      pose.eyeR.scale = STAR_STEPS[quant(grow * gone * (0.60 + 0.40 * pR), 3)];
    } else {
      openBoth(Ease.outQuad(seg(t, 2060, 2200)));
    }

    pose.blush = clamp01(Ease.outQuad(seg(t, 220, 560)) - Ease.inQuad(seg(t, 1950, 2200)));
    if (t >= 150 && t < 2000) { pose.mouth.mode = 'open'; pose.mouth.scale = 1.12; }

    /* 星星只在脸上方的半圈冒，下半圈会糊在嘴上；
       两侧末端落在 x≈54/186，正好避开眼球外沿 */
    if (t >= 200 && t < 1750) {
      fxAcc += dtNow;
      while (fxAcc >= 190) {
        fxAcc -= 190;
        const a = Math.PI + rng() * Math.PI;
        emit('star',
             faceCx() + Math.cos(a) * (56 + rng() * 10),
             EYE_CY  + Math.sin(a) * (34 + rng() * 8));
      }
    }
  }

  /* ───── doze ───── 下沉 → Z → 惊醒回弹 */
  const DOZE_WAKE = 2320;
  function dozeSink(tt) {
    const s = 4.2 * Ease.inOutCubic(seg(tt, 0, 1500));
    /* 1.5s 后开始点头：打盹不是匀速下沉，是一沉一顿。
       用 (1-cos)/2 起步值为 0，和前段无缝接上，且永远不会把头抬回去 */
    const nod = tt > 1500 ? 0.6 * (1 - Math.cos((tt - 1500) / 900 * TAU)) : 0;
    return s + nod;
  }
  const SINK_AT_WAKE = dozeSink(DOZE_WAKE);

  function beatDoze() {
    if (t < DOZE_WAKE) {
      pose.head.y += dozeSink(t);
      /* 眼皮跟着头一起沉，停在 2 档。再低就闭死了，Z 飘出来没人看得懂是谁在睡 */
      /* 只降到 0.72（量化后 3 档，26px 高）。原来降到 0.5 会落到 2 档、
         点头时甚至掉到 1 档细缝 —— 那已经是「睡着」不是「打盹」，眼睛扁得没表情。
         点头幅度也收到 0.10，让它只在最低点短暂掉一档，别一路压着 */
      const lid = 1 - 0.28 * Ease.inOutCubic(seg(t, 120, 1500));
      const nod = t > 1500 ? 0.05 * (1 - Math.cos((t - 1500) / 900 * TAU)) : 0;
      openBoth(lid - nod);
      gazeAdd(0, 1.2 * Ease.inOutCubic(seg(t, 200, 1200)));   // 视线下垂
      if (t > 300) pose.mouth.mode = 'flat';
      if (hit(560))  emit('z', eyeR() + 16, EYE_CY - 22);
      if (hit(1240)) emit('z', eyeR() + 22, EYE_CY - 28);
      if (hit(1920)) emit('z', eyeR() + 12, EYE_CY - 32);
    } else {
      /* 惊醒：outBack 让头冲过中位再压回来，那一下过冲就是「猛地抬头」。
         少了过冲就只是慢慢坐直，完全没有被吓醒的意思 */
      pose.head.y += (t < 2640)
        ? lerp(SINK_AT_WAKE, -2.6, Ease.outBack(seg(t, DOZE_WAKE, 2640)))
        : lerp(-2.6, 0, Ease.outQuad(seg(t, 2640, 3000)));
      openBoth(0.72 + 0.28 * Ease.outQuad(seg(t, DOZE_WAKE, 2400)));
      scaleBoth(1 + 0.18 * Ease.outBack(seg(t, DOZE_WAKE, 2460))
                      * (1 - Ease.inOutQuad(seg(t, 2500, 2900))));
      if (t < 2620) pose.mouth.mode = 'open';   // 醒的一瞬间嘴是张着的
    }
  }

  /* ═══════════════════════════════════════════════════════════
     主入口
     ═══════════════════════════════════════════════════════════ */

  function update(dtMs) {
    /* dt 夹在 100ms 内。切标签页回来会攒出几秒的 dt，直接吃进去会让
       节拍瞬移、正弦跳相 —— 卡一下远比「一帧闪过整段动作」好看 */
    let dt = dtMs;
    if (!(dt > 0)) dt = 0;
    if (dt > 100) dt = 100;
    dtNow = dt;

    phBreath = wrap(phBreath, dt, T_BREATH);
    phSway   = wrap(phSway,   dt, T_SWAY);
    phGX1    = wrap(phGX1,    dt, T_GAZE_X1);
    phGX2    = wrap(phGX2,    dt, T_GAZE_X2);
    phGY1    = wrap(phGY1,    dt, T_GAZE_Y1);
    phGY2    = wrap(phGY2,    dt, T_GAZE_Y2);

    for (let i = 0; i < N_BEAT; i++) {
      cool[i] -= dt;
      if (cool[i] < 0) cool[i] = 0;
    }

    tPrevRaw = tRaw;
    tRaw += dt;
    if (tRaw >= dur) startBeat(pick(), tRaw - dur);   // 余量带进下一拍，长期不漂
    // 换算成节拍内部时间。必须在 startBeat 之后取 STRETCH[cur]，那时 cur 才是新的
    const st = STRETCH[cur];
    tPrev = tPrevRaw / st;
    t = tRaw / st;

    reset();
    switch (cur) {
      case B_BLINK:   beatBlink();      break;
      case B_DBLINK:  beatDoubleBlink();break;
      case B_LOOK:    beatLookAround(); break;
      case B_WINK:    beatWink();       break;
      case B_HAPPY:   beatHappy();      break;
      case B_STAR:    beatStarEyes();   break;
      case B_DOZE:    beatDoze();       break;
      default: break;                   // idle：只留基础层
    }

    /* 基础层永远叠在节拍之上，连打盹时也在呼吸。
       幅度都压在 1px 以内：正弦在峰值附近走得最慢，取整后会「停住 1px」
       再跳回来 —— 是干净的一步位移，不是逐帧抖动 */
    pose.head.y += sinP(phBreath, T_BREATH);
    pose.head.x += sinP(phSway, T_SWAY) * 0.55;
    gazeAdd(sinP(phGX1, T_GAZE_X1) * 0.55 + sinP(phGX2, T_GAZE_X2) * 0.30,
            sinP(phGY1, T_GAZE_Y1) * 0.40 + sinP(phGY2, T_GAZE_Y2) * 0.22);

    /* 开合在这一层就量化成 5 档（需求 §1.5：形状类状态不做连续形变），
       face 直接照着画，不用也不该自己再判一次 */
    pose.eyeL.open = quant(pose.eyeL.open, 5) / 4;
    pose.eyeR.open = quant(pose.eyeR.open, 5) / 4;
    pose.t = t;
    pose.expression = BEAT_NAMES[cur];
    // Preserve authored expressions: only idle and looking beats accept a little pointer influence.
    pose.pointerWeight = cur === B_IDLE ? 0.65 : cur === B_LOOK ? 0.3 : 0;

    if (typeof Fx !== 'undefined' && Fx && Fx.update) Fx.update(pose.fx, dt);
    /* 常驻 7×24，粒子表哪怕漏回收一颗也会攒成内存泄漏。留个硬上限兜底 */
    if (pose.fx.length > 64) pose.fx.splice(0, pose.fx.length - 64);

    return pose;
  }

  return { update };
})();

  setLogicalWidth(267);
  const canvas = document.createElement('canvas');
  canvas.width = LW; canvas.height = LH;
  canvas.className = 'robot-pixel-face';
  canvas.setAttribute('aria-hidden', 'true');
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) return null;
  const scenery = document.createElement('img');
  scenery.className = 'robot-pixel-scenery';
  scenery.alt = ''; scenery.setAttribute('aria-hidden', 'true');
  scenery.width = LW; scenery.height = LH;
  scenery.src = host.dataset.robotBackground || '/images/robot-pixel-background.png';
  host.append(scenery, canvas);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let visible = false, destroyed = false, raf = 0, last = 0;
  let pointerX = 0, pointerY = 0, tracking = 0, mix = 0;
  let gazeX = 0, gazeY = 0, rectCache = null, pointerListening = false;
  const frameInterval = 1000 / 30;
  let backgroundReady = false, firstFrame = false;
  function reveal() {
    if (backgroundReady && firstFrame) host.classList.add('robot-pixel-ready');
  }
  scenery.addEventListener('load', () => { backgroundReady = true; reveal(); }, {once:true});
  if (scenery.complete && scenery.naturalWidth) backgroundReady = true;

  function onPointer(event) {
    if (event.pointerType === 'touch') return;
    if (!rectCache) rectCache = canvas.getBoundingClientRect();
    const r = rectCache;
    if (!r.width || !r.height) return;
    pointerX = Math.max(-9, Math.min(9, (event.clientX - r.left - r.width / 2) / (r.width / 2) * 9));
    pointerY = Math.max(-7, Math.min(7, (event.clientY - r.top - r.height / 2) / (r.height / 2) * 7));
    tracking = 1;
  }
  function leavePointer(event) {
    if (!event || !event.relatedTarget) tracking = 0;
  }
  function invalidateRect() { rectCache = null; }
  function listenPointer(enabled) {
    if (pointerListening === enabled) return;
    pointerListening = enabled;
    if (enabled) {
      document.addEventListener('pointermove', onPointer, {passive:true});
      document.addEventListener('pointerout', leavePointer, {passive:true});
      window.addEventListener('blur', leavePointer);
      window.addEventListener('scroll', invalidateRect, {passive:true});
      window.addEventListener('resize', invalidateRect, {passive:true});
    } else {
      document.removeEventListener('pointermove', onPointer);
      document.removeEventListener('pointerout', leavePointer);
      window.removeEventListener('blur', leavePointer);
      window.removeEventListener('scroll', invalidateRect);
      window.removeEventListener('resize', invalidateRect);
      tracking = 0; rectCache = null;
    }
  }
  function draw(dt, still) {
    const pose = Director.update(dt);
    if (host.dataset.robotExpression !== pose.expression) host.dataset.robotExpression = pose.expression;
    if (!still) {
      const blend = 1 - Math.exp(-dt / 180);
      gazeX += (pointerX - gazeX) * blend;
      gazeY += (pointerY - gazeY) * blend;
      mix += (tracking * pose.pointerWeight - mix) * blend;
      // The original director retains control of blinks, smiles, head movement and mood.
      // Suppress pointer influence immediately during expressive beats, then ease it back in.
      const weight = Math.min(mix, pose.pointerWeight);
      pose.eyeL.gaze.x = pose.eyeL.gaze.x * (1 - weight) + gazeX * weight;
      pose.eyeR.gaze.x = pose.eyeR.gaze.x * (1 - weight) + gazeX * weight;
      pose.eyeL.gaze.y = pose.eyeL.gaze.y * (1 - weight) + gazeY * weight;
      pose.eyeR.gaze.y = pose.eyeR.gaze.y * (1 - weight) + gazeY * weight;
    }
    clear(255); // Unused palette index is transparent; scenery never redraws.
    Face.draw(pose);
    present(context);
    firstFrame = true; reveal();
  }
  function frame(now) {
    raf = 0;
    if (destroyed || !visible || document.hidden || reduced.matches) return;
    if (!last) last = now;
    const elapsed = now - last;
    if (elapsed >= frameInterval - 0.5) {
      draw(Math.min(elapsed, 64), false);
      last = now;
    }
    raf = requestAnimationFrame(frame);
  }
  function sync() {
    const active = visible && !document.hidden && !reduced.matches && !destroyed;
    listenPointer(active);
    if (active && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!active && raf) {
      cancelAnimationFrame(raf); raf = 0; last = 0;
    }
    if (visible && !document.hidden && !firstFrame) draw(0, true);
  }
  const observer = new IntersectionObserver(entries => {
    visible = entries.some(entry => entry.isIntersecting);
    sync();
  }, {threshold:0});
  observer.observe(host);
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', sync);
  const api = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(raf); raf = 0;
      observer.disconnect(); listenPointer(false);
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
      scenery.remove(); canvas.remove();
      host.classList.remove('robot-pixel-ready');
      delete host.dataset.robotExpression;
      instances.delete(host);
    }
  };
  instances.set(host, api);
  return api;

}
function init(){ document.querySelectorAll("[data-robot-pixel]").forEach(mount); }
window.BlogRobotPixel = { mount, init };
if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once:true}); else init();
})();
