const DATA = window.gardenData;
const APP_VERSION = "v1.7-layout-modal";
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=50.1109&longitude=8.6821&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunshine_duration&timezone=Europe%2FBerlin&forecast_days=7";

const startDate = new Date("2026-06-12T12:00:00+02:00");
const navItems = [
  { key: "overview", label: "总览", symbol: "总" },
  { key: "map", label: "菜园地图", symbol: "菜" },
  { key: "tasks", label: "任务与日程", symbol: "任", badge: "6" },
  { key: "planting", label: "播种与移栽", symbol: "播" },
  { key: "water", label: "浇水与施肥", symbol: "浇" },
  { key: "pests", label: "病虫害监测", symbol: "病", badge: "2", warm: true },
  { key: "harvest", label: "收获记录", symbol: "收" },
  { key: "rotation", label: "轮作计划", symbol: "轮" },
  { key: "notes", label: "笔记", symbol: "笔" },
];
const STORAGE_KEY = "garden-twin-state-v2";
const state = {
  selectedBed: 3,
  selectedPlant: null,
  plantDetails: {},
  pestDraft: { photo: "", fileName: "", imageStats: null },
  pestLogs: [],
  pestDiagnosisBusy: false,
  dayOffset: 0,
  playing: false,
  speed: 1,
  editMode: true,
  activeView: "overview",
  detailTab: "combo",
  libraryModalOpen: false,
  layoutModalOpen: false,
  cloud: { configured: false, status: "local", user: null, message: "本地保存" },
  moisture: 58,
  installReady: false,
  appMode: window.matchMedia("(display-mode: standalone)").matches,
  layout: defaultGardenLayout(),
  beds: clone(DATA.initialBeds),
  cropLibrary: clone(DATA.cropLibrary),
  weather: fallbackWeather(),
  taskSchedule: createDefaultTaskSchedule(),
  completed: new Set(["辣椒侧芽修剪", "检查叶面虫害"]),
};
const root = document.querySelector("#root");
let timer;
let cloudSaveTimer;
let applyingRemoteState = false;
let deferredInstallPrompt = null;

loadGardenState();
clearOldRuntimeCaches();

const spriteMap = {
  玉米: "corn",
  番茄: "tomato",
  辣椒: "pepper",
  丝瓜: "luffa",
  豇豆: "yardlong",
  西葫芦: "zucchini",
  香菜: "coriander",
  葱: "scallion",
  空心菜: "water_spinach",
  苋菜: "amaranth",
  豆腐菜: "water_spinach",
  豌豆尖: "fava",
  蚕豆: "fava",
  秋葵: "okra",
};

function formatDate(offset) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(d);
}

function defaultGardenLayout() {
  return {
    plotCount: 7,
    plotLength: 10,
    plotWidth: 0.72,
    pathCount: 6,
    pathWidth: 0.16,
  };
}

function normalizeGardenLayout(layout) {
  const base = defaultGardenLayout();
  return {
    plotCount: Math.max(1, Math.min(16, Math.round(Number(layout?.plotCount) || base.plotCount))),
    plotLength: Math.max(0.5, Math.min(50, Number(layout?.plotLength) || base.plotLength)),
    plotWidth: Math.max(0.2, Math.min(5, Number(layout?.plotWidth) || base.plotWidth)),
    pathCount: Math.max(0, Math.min(16, Math.round(Number(layout?.pathCount) || base.pathCount))),
    pathWidth: Math.max(0, Math.min(3, Number(layout?.pathWidth) || base.pathWidth)),
  };
}

function gardenTotalWidth(layout = state.layout) {
  return Math.round((layout.plotCount * layout.plotWidth + layout.pathCount * layout.pathWidth) * 10) / 10;
}

function bedCode(id) {
  let index = Math.max(1, Math.round(Number(id) || 1));
  let code = "";
  while (index > 0) {
    index -= 1;
    code = String.fromCharCode(65 + (index % 26)) + code;
    index = Math.floor(index / 26);
  }
  return code;
}

function bedTitle(bedOrId) {
  return bedCode(typeof bedOrId === "object" ? bedOrId.id : bedOrId);
}

function plantCode(bed, serial) {
  return `${bedTitle(bed)}${serial}`;
}
function defaultSowDate() {
  return startDate.toISOString().slice(0, 10);
}

function plantDetail(code) {
  return state.plantDetails?.[code] || {};
}

function createEmptyBed(id) {
  return {
    id,
    title: bedTitle(id),
    role: "待规划",
    crops: [],
    status: "good",
    water: 54,
    soil: "待记录",
    tasks: ["观察土壤湿度", "记录日照和风口"],
    note: "新增地块，等待规划作物组合。",
  };
}

function normalizeBedsForCount(sourceBeds, count) {
  return Array.from({ length: count }, (_, index) => {
    const fallback = DATA.initialBeds[index] || createEmptyBed(index + 1);
    return normalizeBed(sourceBeds?.[index], fallback);
  });
}

function syncBedsToLayout() {
  state.layout = normalizeGardenLayout(state.layout);
  state.beds = normalizeBedsForCount(state.beds, state.layout.plotCount);
  state.selectedBed = Math.min(state.selectedBed, state.layout.plotCount);
}

function dateFromOffset(offset) {
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);
  return d;
}

function dateKeyFromOffset(offset) {
  return dateFromOffset(offset).toISOString().slice(0, 10);
}

function currentDateKey() {
  return dateKeyFromOffset(state.dayOffset);
}

function createDefaultTaskSchedule() {
  const key = dateKeyFromOffset(0);
  const times = ["07:30", "08:00", "12:30", "18:00", "18:30", "19:00"];
  const tasks = [];
  DATA.initialBeds.forEach((bed) => {
    (bed.tasks || []).forEach((task) => {
      tasks.push({
        id: `seed-${key}-${bed.id}-${tasks.length}`,
        time: times[tasks.length % times.length],
        bedId: bed.id,
        title: task,
      });
    });
  });
  return { [key]: tasks.slice(0, 10) };
}

function fallbackWeather() {
  return {
    source: "本地备用",
    updatedAt: null,
    current: { temp: 18, humidity: 62, wind: 8, code: 3 },
    daily: DATA.timeline.slice(0, 7).map((day, index) => ({
      date: day.label,
      label: index === 0 ? "今天" : day.label,
      code: day.rain > 6 ? 61 : day.rain > 3 ? 3 : 2,
      max: day.temp,
      min: Math.max(8, day.temp - 7),
      rainProbability: Math.min(95, day.rain * 10),
      rainSum: day.rain,
      sunshineHours: Math.max(3, 13 - day.rain / 1.5),
    })),
    error: null,
  };
}

function weatherLabel(code) {
  if ([0, 1].includes(code)) return "晴";
  if ([2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "雾";
  if ([51, 53, 55, 56, 57].includes(code)) return "毛毛雨";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "雨";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "雪";
  if ([95, 96, 99].includes(code)) return "雷雨";
  return "变化";
}

function weatherClass(code) {
  if ([0, 1].includes(code)) return "sunny";
  if ([61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) return "rainy";
  return "cloudy";
}

function weatherDayLabel(date, index) {
  if (index === 0) return "今天";
  if (index === 1) return "明天";
  const d = new Date(`${date}T12:00:00+02:00`);
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(d);
}

function weatherAdvice(day) {
  if ((day.rainProbability || 0) >= 70 || (day.rainSum || 0) >= 8) return "少浇水，检查排水";
  if ((day.max || 0) >= 28) return "傍晚深浇，午后遮阴";
  if ((day.wind || 0) >= 22) return "加固番茄和豆架";
  if ((day.sunshineHours || 0) >= 10) return "适合整枝和移栽";
  return "正常巡园";
}

function parseWeather(data) {
  return {
    source: "Open-Meteo",
    updatedAt: new Date().toISOString(),
    current: {
      temp: Math.round(data.current?.temperature_2m ?? 18),
      humidity: Math.round(data.current?.relative_humidity_2m ?? 62),
      wind: Math.round(data.current?.wind_speed_10m ?? 8),
      code: Number(data.current?.weather_code ?? 3),
    },
    daily: (data.daily?.time || []).map((date, index) => ({
      date,
      label: weatherDayLabel(date, index),
      code: Number(data.daily.weather_code?.[index] ?? 3),
      max: Math.round(data.daily.temperature_2m_max?.[index] ?? 18),
      min: Math.round(data.daily.temperature_2m_min?.[index] ?? 10),
      rainProbability: Math.round(data.daily.precipitation_probability_max?.[index] ?? 0),
      rainSum: Number(data.daily.precipitation_sum?.[index] ?? 0),
      sunshineHours: Math.round((Number(data.daily.sunshine_duration?.[index] ?? 0) / 3600) * 10) / 10,
    })),
    error: null,
  };
}

function accountControl() {
  const cloud = state.cloud || {};
  const user = cloud.user;
  if (!cloud.configured) {
    return `<div class="account-control local"><span>本地保存</span></div>`;
  }
  if (user) {
    const name = user.displayName || user.email || "Google 用户";
    const avatar = user.photoURL ? `<img src="${user.photoURL}" alt="${name}" />` : `<b>${name.slice(0, 1).toUpperCase()}</b>`;
    return `<div class="account-control signed-in">${avatar}<span title="${name}">${name}</span><button type="button" data-action="sign-out-google">退出</button></div>`;
  }
  const label = cloud.status === "loading" ? "连接中" : "Google 登录";
  return `<button type="button" class="google-login" data-action="sign-in-google">${label}</button>`;
}

function cloudStatusText() {
  const cloud = state.cloud || {};
  if (!cloud.configured) return "本地保存";
  if (cloud.status === "loading") return "正在连接 Google";
  if (cloud.status === "saving") return "正在同步";
  if (cloud.status === "synced") return "云端已同步";
  if (cloud.status === "error") return cloud.message || "云同步异常";
  if (cloud.user) return "Google 云同步";
  return "登录后云同步";
}

function weatherStrip() {
  const weather = state.weather || fallbackWeather();
  const current = weather.current || fallbackWeather().current;
  return `
    <div class="weather-strip">
      <span>${current.temp}°C</span>
      <span>${weatherLabel(current.code)}</span>
      <span>湿度 ${current.humidity}%</span>
      <span>风 ${current.wind} km/h</span>
    </div>
  `;
}

function weatherForecastCard() {
  const weather = state.weather || fallbackWeather();
  const daily = weather.daily?.length ? weather.daily : fallbackWeather().daily;
  return `
    <section class="metric-card weather-card">
      <div class="weather-card-head">
        <h2>法兰克福天气</h2>
        <span>${weather.source}${weather.error ? " · 备用" : ""}</span>
      </div>
      <div class="forecast-list">
        ${daily.map((day) => `
          <article class="forecast-day ${weatherClass(day.code)}">
            <strong>${day.label}</strong>
            <b>${weatherLabel(day.code)}</b>
            <span>${day.min}° / ${day.max}°</span>
            <small>雨 ${day.rainProbability}% · ${weatherAdvice(day)}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function gardenLayoutEditor() {
  const layout = normalizeGardenLayout(state.layout);
  return `
    <section class="layout-editor garden-layout-editor" aria-label="菜园参数">
      <strong>菜园参数</strong>
      <label>地块数<input id="layout-plot-count" type="number" min="1" max="16" step="1" value="${layout.plotCount}" /></label>
      <label>plot 长<input id="layout-plot-length" type="number" min="0.5" max="50" step="0.1" value="${layout.plotLength}" /></label>
      <label>plot 宽<input id="layout-plot-width" type="number" min="0.2" max="5" step="0.05" value="${layout.plotWidth}" /></label>
      <label>走道数<input id="layout-path-count" type="number" min="0" max="16" step="1" value="${layout.pathCount}" /></label>
      <label>走道宽<input id="layout-path-width" type="number" min="0" max="3" step="0.05" value="${layout.pathWidth}" /></label>
      <button type="button" data-action="apply-layout">应用参数</button>
      <small>总宽约 ${gardenTotalWidth(layout)} m</small>
    </section>
  `;
}

function gardenLayoutModal() {
  if (!state.layoutModalOpen) return "";
  return `
    <div class="modal-backdrop">
      <section class="layout-modal" role="dialog" aria-modal="true" aria-label="菜园参数" data-modal-panel>
        <div class="modal-head">
          <div>
            <span>菜园布局</span>
            <h2>菜园参数</h2>
          </div>
          <button type="button" class="icon-button" data-action="close-layout-modal" aria-label="关闭">×</button>
        </div>
        <div class="layout-modal-body">
          ${gardenLayoutEditor()}
        </div>
      </section>
    </div>
  `;
}

function cropLibraryPanel(activeBed) {
  return `
    <section class="metric-card crop-library-panel">
      <div class="library-head"><strong>作物图表</strong><button type="button" data-action="open-library-modal">新增作物</button></div>
      <div class="library-list crop-chart">${getCropLibrary().map((crop) => `<div class="crop-chart-item"><button type="button" class="crop-chip" draggable="true" title="${escapeHtml(crop.note)}" data-action="add-crop" data-crop="${escapeHtml(crop.name)}"><img class="crop-icon" src="${spriteFor(crop.name)}" alt="${escapeHtml(crop.name)}" /><span>${escapeHtml(crop.name)}</span><small>拖到地块或点选</small></button><button class="crop-delete" type="button" data-action="remove-library-crop" data-crop="${escapeHtml(crop.name)}" aria-label="从作物库删除 ${escapeHtml(crop.name)}">×</button></div>`).join("")}</div>
      <div class="library-foot"><span>拖动到上方地块，或点击添加到${activeBed.title}</span><button type="button" data-action="export-csv">导出CSV</button></div>
    </section>
  `;
}

function cropLibraryModal() {
  if (!state.libraryModalOpen) return "";
  return `
    <div class="modal-backdrop">
      <section class="library-modal" role="dialog" aria-modal="true" aria-label="新增作物" data-modal-panel>
        <div class="modal-head">
          <div>
            <span>作物库</span>
            <h2>新增作物</h2>
          </div>
          <button type="button" class="icon-button" data-action="close-library-modal" aria-label="关闭">×</button>
        </div>
        <div class="library-modal-body">
          <label>作物名<input id="library-crop-name" type="text" placeholder="例如：生菜" /></label>
          <label>季节/状态<input id="library-crop-season" type="text" placeholder="例如：春秋可种" /></label>
          <label>种植备注<textarea id="library-crop-note" rows="4" placeholder="记录株距、喜水、支架、苗龄等信息"></textarea></label>
          <button type="button" data-action="add-library-crop">添加到作物库</button>
        </div>
      </section>
    </div>
  `;
}

async function loadWeatherForecast() {
  if (!("fetch" in window)) return;
  try {
    const response = await fetch(WEATHER_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.weather = parseWeather(await response.json());
  } catch (error) {
    state.weather = { ...fallbackWeather(), error: error.message };
  }
  const active = document.activeElement;
  if (!active || !["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) render();
}

function getBeds() {
  return state.beds.map((bed) => ({ ...bed, water: Math.max(28, Math.min(88, bed.water + Math.round((state.moisture - 58) / 5) - Math.floor(state.dayOffset / 7))) }));
}

function plantTotal(bed) {
  return safeCrops(bed).reduce((sum, crop) => sum + Math.max(0, crop.count || 0), 0);
}

function activeCrops(bed) {
  return safeCrops(bed).filter((crop) => (crop.count || 0) > 0);
}

function safeCrops(bed) {
  return Array.isArray(bed?.crops) ? bed.crops : [];
}

function safeTasks(bed) {
  return Array.isArray(bed?.tasks) ? bed.tasks : [];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getCropLibrary() {
  return Array.isArray(state.cropLibrary) ? state.cropLibrary : [];
}

function clearOldRuntimeCaches() {
  if ("caches" in window) {
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("garden-twin-")).map((key) => caches.delete(key))))
      .catch(() => {});
  }
  if ("serviceWorker" in navigator && location.search.includes("appVersion=11")) {
    navigator.serviceWorker.getRegistrations()
      .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
      .catch(() => {});
  }
}

function hasCrop(bed, names) {
  return activeCrops(bed).some((crop) => names.includes(crop.name));
}

function bedRoleName(bed) {
  const crops = activeCrops(bed);
  if (!crops.length) return `${expertSuggestion(bed).short}`;
  if (hasCrop(bed, ["番茄"]) && hasCrop(bed, ["辣椒"])) return "番茄辣椒主床";
  if (hasCrop(bed, ["玉米"])) return "玉米授粉区";
  if (hasCrop(bed, ["丝瓜"]) && hasCrop(bed, ["秋葵"])) return "暖位支架区";
  if (hasCrop(bed, ["丝瓜", "豇豆", "豆腐菜"])) return "爬藤支架区";
  if (hasCrop(bed, ["西葫芦"])) return "南瓜科控蔓区";
  if (hasCrop(bed, ["空心菜", "苋菜", "豆腐菜", "香菜"])) return "快收叶菜区";
  if (hasCrop(bed, ["豌豆尖", "蚕豆", "葱"])) return "秋冬轮作区";
  return `${crops[0].name}管理区`;
}

function expertSuggestion(bed) {
  const emptyPlans = {
    1: {
      short: "玉米小方阵",
      text: "这块适合玉米成小方阵种植，至少 12 株更利于授粉；地边可配少量葱或苋菜，不要排成单行。",
      crops: ["玉米", "葱"],
    },
    2: {
      short: "豆类支架",
      text: "建议做豇豆支架区。6 月法兰克福温度足够，搭 1.8-2 m 支架，支架尽量放北侧，减少遮阴。",
      crops: ["豇豆", "葱"],
    },
    3: {
      short: "茄果暖位",
      text: "你已购买番茄 7 株、辣椒 16 株。若这块日照和通风好，适合作为茄果主床；注意番茄绑枝，辣椒保持 40 cm 左右间距。",
      crops: ["番茄", "辣椒"],
    },
    4: {
      short: "丝瓜秋葵",
      text: "这块适合做暖位支架床。丝瓜放北侧搭架，秋葵放最暖、避风处；避免给 3 号地番茄辣椒遮阴。",
      crops: ["丝瓜", "秋葵"],
    },
    5: {
      short: "快收叶菜",
      text: "建议做夏季快收叶菜区：空心菜、苋菜、豆腐菜分批播。保持湿润但不积水，高温下午可加遮阴网。",
      crops: ["空心菜", "苋菜", "豆腐菜"],
    },
    6: {
      short: "西葫芦单株",
      text: "西葫芦占地大，建议只留 1 株，并保持通风预防白粉病。边缘可少量复播香菜或葱。",
      crops: ["西葫芦", "香菜"],
    },
    7: {
      short: "秋冬预备",
      text: "这块建议作为轮作缓冲：现在可种葱和短期叶菜，8 月下旬后安排豌豆尖，9-10 月考虑蚕豆。",
      crops: ["葱", "豌豆尖", "蚕豆"],
    },
  };
  const crops = activeCrops(bed);
  if (!crops.length) return emptyPlans[bed.id] || emptyPlans[5];
  const total = plantTotal(bed);
  if (hasCrop(bed, ["番茄", "辣椒"])) {
    return {
      short: "茄果管理",
      text: total > 22
        ? "这块茄果数量偏密，建议保持强通风：番茄及时绑枝和摘下部老叶，辣椒间距不足时优先保留强壮苗。"
        : "茄果组合适合暖位。番茄单杆或双杆整枝，辣椒前期少氮，结果期补钾并保持均匀水分。",
      crops: ["番茄", "辣椒"],
    };
  }
  if (hasCrop(bed, ["丝瓜", "豇豆", "豆腐菜"])) {
    return {
      short: "支架通风",
      text: "爬藤作物需要尽早搭架。支架尽量靠北侧或地块边缘，减少遮阴；根部覆盖草屑保持水分。",
      crops: ["丝瓜", "豇豆"],
    };
  }
  if (hasCrop(bed, ["空心菜", "苋菜", "香菜"])) {
    return {
      short: "分批快收",
      text: "叶菜适合少量多次播种。6 月香菜容易抽薹，放半阴边缘；空心菜和苋菜保持水分，可 10-14 天分批收。",
      crops: ["空心菜", "苋菜", "香菜"],
    };
  }
  return {
    short: bedRoleName({ ...bed, crops }),
    text: bed.note || "当前组合可继续观察。建议记录定植日期、浇水和施肥，后续按生长阶段调整任务。",
    crops: crops.map((crop) => crop.name),
  };
}

function plantMatrixSettings(bed) {
  const total = plantTotal(bed);
  if (!total) return { className: "", style: "" };
  const cols = total <= 4 ? 2 : total <= 10 ? 2 : total <= 18 ? 3 : total <= 32 ? 4 : total <= 50 ? 5 : 6;
  const size = total <= 4 ? 25 : total <= 10 ? 22 : total <= 18 ? 18 : total <= 32 ? 15 : total <= 50 ? 12 : 10;
  const gap = total <= 10 ? 5 : total <= 32 ? 3 : 2;
  const label = total <= 18 ? 7 : total <= 32 ? 6 : 5;
  const density = total > 50 ? "ultra" : total > 32 ? "dense" : total > 18 ? "compact" : "";
  return {
    className: density,
    style: `--plant-cols:${cols}; --plant-size:${size}px; --plant-gap:${gap}px; --plant-label:${label}px;`,
  };
}

function plantDensityClass(bed) {
  return plantMatrixSettings(bed).className;
}

function plantGridStyle(bed) {
  return plantMatrixSettings(bed).style;
}

function plantSprites(bed) {
  if (!activeCrops(bed).length) {
    const suggestion = expertSuggestion(bed);
    return `<div class="empty-bed-advisor"><b>种植顾问</b><span>${suggestion.short}</span><small>${suggestion.crops.join(" + ")}</small></div>`;
  }
  const sprites = [];
  let serial = 1;
  activeCrops(bed).forEach((crop) => {
    const count = Math.max(0, crop.count || 0);
    for (let index = 0; index < count; index += 1) {
      const code = plantCode(bed, serial);
      sprites.push(`<span class="plant-sprite-unit" data-plant-code="${code}" data-bed-id="${bed.id}" title="${code} · ${crop.name} ${index + 1}/${count}"><img class="plant-sprite" src="${spriteFor(crop.name)}" alt="${code} ${crop.name}" /><em>${code}</em></span>`);
      serial += 1;
    }
  });
  return sprites.join("");
}
function cropSummary(bed) {
  const crops = activeCrops(bed);
  if (!crops.length) return `<span class="advisor-summary">查看专家建议</span>`;
  return crops.map((crop) => `<span>${crop.name}${crop.count ? ` x${crop.count}` : ""}</span>`).join("");
}

function comboTitle(bed) {
  const crops = activeCrops(bed);
  if (!crops.length) return "暂无作物 · 查看专家建议";
  return crops.map((crop) => `${crop.name}${crop.count ? ` x${crop.count}` : ""}`).join(" + ");
}

function daysSinceStart() {
  return Math.max(0, Math.round((Date.now() - startDate.getTime()) / 86400000) + state.dayOffset);
}

function stageForCrop(cropName, index) {
  const age = daysSinceStart() + index;
  if (["番茄", "辣椒", "西葫芦", "丝瓜", "秋葵"].includes(cropName)) {
    if (age < 7) return "缓苗";
    if (age < 28) return "营养生长";
    if (age < 55) return "开花坐果";
    return "采收期";
  }
  if (["空心菜", "苋菜", "香菜", "葱", "豆腐菜"].includes(cropName)) {
    if (age < 10) return "幼苗";
    if (age < 28) return "快收生长";
    return "分批采收";
  }
  if (["豌豆尖", "蚕豆", "豇豆"].includes(cropName)) {
    if (age < 10) return "出苗";
    if (age < 35) return "爬蔓生长";
    return "开花结荚";
  }
  if (cropName === "玉米") {
    if (age < 14) return "出苗";
    if (age < 50) return "拔节";
    return "抽雄授粉";
  }
  return age < 21 ? "生长期" : "观察期";
}

function actionForPlant(cropName, stage, bed) {
  if (cropName === "番茄") return stage === "缓苗" ? "稳水缓苗" : "绑枝摘老叶";
  if (cropName === "辣椒") return "保持通风";
  if (["丝瓜", "豇豆", "豆腐菜"].includes(cropName)) return "检查支架";
  if (cropName === "西葫芦") return "查白粉病";
  if (["空心菜", "苋菜", "香菜"].includes(cropName)) return "少量分批收";
  if (cropName === "玉米") return "观察授粉";
  if (bed.water < 46) return "今晚深浇";
  return "正常观察";
}

function plantRecords(bed) {
  const records = [];
  let serial = 1;
  activeCrops(bed).forEach((crop) => {
    for (let index = 1; index <= crop.count; index += 1) {
      const stage = stageForCrop(crop.name, index);
      const code = plantCode(bed, serial);
      const detail = plantDetail(code);
      records.push({
        id: `${bed.id}-${crop.name}-${index}`,
        plantId: code,
        nickname: detail.nickname || code,
        sowDate: detail.sowDate || defaultSowDate(),
        note: detail.note || "",
        crop: crop.name,
        number: serial,
        cropNumber: index,
        stage,
        age: daysSinceStart() + index,
        health: bed.water < 46 ? "偏干" : "正常",
        action: actionForPlant(crop.name, stage, bed),
      });
      serial += 1;
    }
  });
  return records;
}
function infoCard(title, text) {
  return `<section class="info-card"><h3>${title}</h3><p>${text}</p></section>`;
}

function advisorAdviceCard(bed) {
  const suggestion = expertSuggestion(bed);
  const empty = !activeCrops(bed).length;
  return `
    <section class="info-card advisor-advice-card">
      <div class="advisor-card-head">
        <h3>种植专家建议</h3>
        <span>${empty ? "待规划" : bedRoleName(bed)}</span>
      </div>
      <p>${suggestion.text}</p>
      <div class="advisor-crop-suggestions">
        ${suggestion.crops.map((name) => `
          <button type="button" data-action="add-crop" data-crop="${name}">
            <img src="${spriteFor(name)}" alt="${name}" />
            <span>${name}</span>
          </button>
        `).join("")}
      </div>
    </section>
  `;
}

function detailContent(bed) {
  return `
    <div class="tabs single-tab"><button type="button" class="active" data-action="set-detail-tab" data-tab="combo">作物组合</button></div>
    ${`
    <section class="crop-combo"><div class="combo-preview">${activeCrops(bed).slice(0, 3).map((crop) => `<img src="${spriteFor(crop.name)}" alt="${crop.name}" />`).join("") || `<span class="empty-combo">空</span>`}</div><div><strong>${comboTitle(bed)}</strong><button type="button">编辑组合</button></div></section>
    <section class="info-card editor-card">
      <h3>编辑地块数据</h3>
      <div class="edit-rows">
        ${safeCrops(bed).map((crop, index) => `
          <div class="edit-row">
            <img src="${spriteFor(crop.name)}" alt="${crop.name}" />
            <span>${crop.name}</span>
            <div class="stepper">
              <button type="button" data-action="dec-crop" data-crop-index="${index}">−</button>
              <strong>${crop.count || 0}</strong>
              <button type="button" data-action="inc-crop" data-crop-index="${index}">+</button>
            </div>
            <button class="remove-button" type="button" data-action="remove-crop" data-crop-index="${index}">删除</button>
          </div>
        `).join("") || `<p class="muted">这个地块还没有作物。</p>`}
      </div>
      <label class="field-label" for="crop-add-select">添加作物</label>
      <div class="add-crop-row">
        <select id="crop-add-select">
          ${getCropLibrary().map((crop) => `<option value="${escapeHtml(crop.name)}">${escapeHtml(crop.name)}</option>`).join("")}
        </select>
        <button type="button" data-action="add-selected-crop">添加</button>
      </div>
      <button class="reset-button" type="button" data-action="reset-bed">重置此地块</button>
    </section>
    ${advisorAdviceCard(bed)}
    <section class="info-card"><h3>水分需求</h3><div class="water-meter">${Array.from({ length: 7 }).map((_, index) => `<span class="${index < Math.round(bed.water / 14) ? "filled" : ""}"></span>`).join("")}</div><p>${bed.water < 46 ? "偏干，今晚需要深浇。" : "保持均匀湿润，避免积水。"}</p></section>
    ${infoCard("有机施肥建议", `${bed.soil}；果菜期每 2-3 周薄施堆肥茶或羊毛肥。`)}
    <section class="info-card tasks"><h3>当前任务（${safeTasks(bed).filter((task) => state.completed.has(task)).length}/${safeTasks(bed).length}）</h3>${safeTasks(bed).map((task) => `<button type="button" class="${state.completed.has(task) ? "done" : ""}" data-task="${task}"><span>${state.completed.has(task) ? "✓" : ""}</span>${task}</button>`).join("")}<button type="button" class="add-task" data-action="add-task">+ 添加任务</button></section>
    `}
  `;
}

function selectedPlantRecord(bed) {
  if (!state.selectedPlant) return null;
  return plantRecords(bed).find((record) => record.plantId === state.selectedPlant) || null;
}

function plantDetailContent(record) {
  return `
    <section class="plant-profile-card">
      <div class="plant-profile-hero">
        <img src="${spriteFor(record.crop)}" alt="${record.crop}" />
        <div>
          <span>${record.plantId}</span>
          <h3>${escapeHtml(record.nickname || record.plantId)}</h3>
          <p>${record.crop} · ${record.stage} · 第 ${record.age} 天</p>
        </div>
      </div>
      <label class="plant-field">名字<input id="plant-nickname" type="text" value="${escapeHtml(record.nickname || record.plantId)}" placeholder="例如：猪" /></label>
      <label class="plant-field">播种日期<input id="plant-sow-date" type="date" value="${escapeHtml(record.sowDate || defaultSowDate())}" /></label>
      <label class="plant-field">备注<textarea id="plant-note" rows="5" placeholder="记录长势、病虫害、施肥、修剪等">${escapeHtml(record.note || "")}</textarea></label>
      <section class="info-card plant-facts"><h3>单株状态</h3><p>${record.health} · 建议：${record.action}</p></section>
      <button class="reset-button" type="button" data-action="show-bed-editor">返回地块编辑</button>
    </section>
  `;
}

function detailPanel(bed) {
  const plant = selectedPlantRecord(bed);
  return `
    <aside class="detail-panel" aria-label="${plant ? plant.plantId : bedTitle(bed)}编辑栏">
      <div class="detail-title">
        <div>
          <span>${plant ? "单株档案" : "地块编辑"}</span>
          <h2>${plant ? `${plant.plantId} · ${plant.crop}` : `${bedTitle(bed)} · ${bedRoleName(bed)}`}</h2>
        </div>
      </div>
      ${plant ? plantDetailContent(plant) : detailContent(bed)}
    </aside>
  `;
}

function todayTasks() {
  const key = currentDateKey();
  const tasks = Array.isArray(state.taskSchedule?.[key]) ? state.taskSchedule[key] : [];
  return tasks.map((task) => {
    const bed = state.beds.find((item) => item.id === Number(task.bedId));
    return {
      id: task.id,
      time: task.time || "09:00",
      bedId: Number(task.bedId) || 0,
      bedTitle: bed ? bedTitle(bed) : "全园",
      task: task.title || task.task || "未命名任务",
      done: state.completed.has(task.id),
    };
  }).sort((a, b) => a.time.localeCompare(b.time));
}

function todayTaskRows(limit = 4) {
  const tasks = todayTasks().slice(0, limit);
  if (!tasks.length) return `<p class="muted">今天没有任务。</p>`;
  return tasks.map((item) => `
    <button type="button" class="today-task-row ${item.done ? "done" : ""}" data-task="${escapeHtml(item.id)}">
      <span>${item.done ? "✓" : ""}</span>
      <strong>${escapeHtml(item.task)}</strong>
      <small>${item.time} · ${item.bedTitle}</small>
    </button>
  `).join("");
}

function schedulePlannerView() {
  const tasks = todayTasks();
  const slots = [
    { time: "07:30", label: "晨间巡园", hint: "看叶片状态、支架、夜间雨后积水", tasks: tasks.filter((task) => task.time < "12:00") },
    { time: "12:30", label: "午间观察", hint: "只观察不大动土，记录萎蔫和日晒", tasks: tasks.filter((task) => task.time >= "12:00" && task.time < "17:00") },
    { time: "18:30", label: "傍晚操作", hint: "浇水、补苗、绑枝、轻度整枝", tasks: tasks.filter((task) => task.time >= "17:00") },
  ];
  const completed = tasks.filter((task) => task.done).length;
  const key = currentDateKey();
  return `
    <section class="schedule-view">
      <div class="schedule-head">
        <div>
          <span>任务与日程</span>
          <h1>日期任务编辑</h1>
          <p>${formatDate(state.dayOffset)} · ${completed}/${tasks.length} 已完成</p>
        </div>
        <div class="schedule-actions">
          <button type="button" data-action="prev">前一天</button>
          <button type="button" data-action="today">今天</button>
          <button type="button" data-action="next">后一天</button>
          <button type="button" data-action="open-map">返回地图</button>
        </div>
      </div>
      <section class="schedule-editor">
        <h2>添加 ${key} 的任务</h2>
        <div class="schedule-editor-grid">
          <input id="schedule-task-time" type="time" value="18:30" />
          <select id="schedule-task-bed">
            <option value="0">全园</option>
            ${state.beds.map((bed) => `<option value="${bed.id}">${bed.title}</option>`).join("")}
          </select>
          <input id="schedule-task-title" type="text" placeholder="例如：给番茄绑枝" />
          <button type="button" data-action="add-scheduled-task">添加任务</button>
        </div>
      </section>
      <div class="schedule-grid">
        ${slots.map((slot) => `
          <section class="schedule-slot">
            <time>${slot.time}</time>
            <div>
              <h2>${slot.label}</h2>
              <p>${slot.hint}</p>
              <div class="slot-task-list">
                ${slot.tasks.length ? slot.tasks.map((item) => `
                  <article class="schedule-task ${item.done ? "done" : ""}">
                    <button type="button" data-task="${escapeHtml(item.id)}">
                      <span>${item.done ? "✓" : ""}</span>
                      <strong>${escapeHtml(item.task)}</strong>
                      <small>${item.time} · ${escapeHtml(item.bedTitle || "全园")}</small>
                    </button>
                    <button class="task-delete" type="button" data-action="remove-scheduled-task" data-task-id="${escapeHtml(item.id)}">删除</button>
                  </article>
                `).join("") : `<p class="slot-empty">这段时间还没有任务。</p>`}
              </div>
            </div>
          </section>
        `).join("")}
      </div>
    </section>
  `;
}

function activeCropNames() {
  const names = new Set();
  state.beds.forEach((bed) => safeCrops(bed).forEach((crop) => names.add(crop.name)));
  return [...names];
}

function normalizePestLogs(logs) {
  return logs
    .filter((log) => log && typeof log === "object")
    .map((log, index) => ({
      id: String(log.id || `pest-${Date.now()}-${index}`),
      createdAt: String(log.createdAt || new Date().toISOString()),
      bedId: Number(log.bedId) || 0,
      crop: String(log.crop || "未指定作物"),
      note: String(log.note || ""),
      photo: String(log.photo || ""),
      fileName: String(log.fileName || ""),
      imageStats: log.imageStats && typeof log.imageStats === "object" ? log.imageStats : null,
      diagnosis: String(log.diagnosis || "待复核：叶面异常"),
      confidence: Math.max(35, Math.min(95, Number(log.confidence) || 62)),
      severity: String(log.severity || "中"),
      solution: Array.isArray(log.solution) ? log.solution.map(String) : [],
    }));
}

function pestMonitorView() {
  const cropNames = activeCropNames();
  const selectedBed = activeBedRaw();
  const cropOptions = cropNames.length ? cropNames : getCropLibrary().map((crop) => crop.name);
  return `
    <section class="pest-view">
      <div class="module-toolbar">
        <div><span class="module-icon">病</span><h1>病虫害监测</h1><p>上传叶片或植株照片，记录观察，生成有机处理建议并写入监测日志。</p></div>
        <button type="button" data-action="open-map">返回菜园地图</button>
      </div>
      <div class="pest-grid">
        <section class="pest-upload-card">
          <h2>新增监测</h2>
          <label class="pest-photo-drop" for="pest-photo-input">
            ${state.pestDraft.photo ? `<img src="${state.pestDraft.photo}" alt="已上传的病虫害照片" />` : `<span>上传图片</span><small>支持叶片、果实、茎部近照</small>`}
          </label>
          <input id="pest-photo-input" type="file" accept="image/*" hidden />
          <div class="pest-form-grid">
            <label>地块<select id="pest-bed-select">${state.beds.map((bed) => `<option value="${bed.id}" ${bed.id === selectedBed.id ? "selected" : ""}>${bedTitle(bed)} · ${escapeHtml(bedRoleName(bed))}</option>`).join("")}</select></label>
            <label>作物<select id="pest-crop-select">${cropOptions.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}</select></label>
          </div>
          <label class="pest-note-field">观察记录<textarea id="pest-note" rows="4" placeholder="例如：叶背有小绿虫、叶片卷曲；或叶面有白色粉状斑。"></textarea></label>
          <button class="primary-wide" type="button" data-action="analyze-pest-photo" ${state.pestDiagnosisBusy ? "disabled" : ""}>${state.pestDiagnosisBusy ? "正在识别..." : "识别问题并记录"}</button>
          <p class="pest-hint">当前会结合照片特征、作物和症状文字给出初判；若已配置远程诊断接口，会优先使用远程识别。</p>
        </section>
        <section class="pest-advice-card">
          <h2>拍照建议</h2>
          <ul>
            <li>拍一张全株位置，再拍一张叶背或病斑近照。</li>
            <li>照片里保留健康叶和异常叶，方便对比。</li>
            <li>备注里写清楚：出现几天、是否扩散、是否下雨或浇过叶面。</li>
          </ul>
        </section>
      </div>
      <section class="pest-log-section">
        <div class="section-title compact"><div><h2>监测日志</h2><p>共 ${state.pestLogs.length} 条记录</p></div></div>
        <div class="pest-log-list">${state.pestLogs.length ? state.pestLogs.map(pestLogCard).join("") : `<p class="empty-log">还没有监测记录。上传一张照片后，系统会把诊断和处理方案保存在这里。</p>`}</div>
      </section>
    </section>
  `;
}

function pestLogCard(log) {
  const bed = state.beds.find((item) => item.id === log.bedId);
  const date = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(log.createdAt));
  return `
    <article class="pest-log-card">
      <div class="pest-log-photo">${log.photo ? `<img src="${log.photo}" alt="${escapeHtml(log.crop)} 病虫害记录" />` : "无图"}</div>
      <div class="pest-log-body">
        <div class="pest-log-head"><div><strong>${escapeHtml(log.diagnosis)}</strong><span>${date} · ${bed ? bedTitle(bed) : "全园"} · ${escapeHtml(log.crop)}</span></div><b>可信度 ${log.confidence}%</b></div>
        ${log.note ? `<p class="pest-observation">${escapeHtml(log.note)}</p>` : ""}
        <div class="pest-tags"><span>严重度：${escapeHtml(log.severity)}</span><span>有机处理</span></div>
        <ol>${log.solution.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>
      </div>
      <button class="pest-delete" type="button" data-action="remove-pest-log" data-log-id="${escapeHtml(log.id)}">删除</button>
    </article>
  `;
}

function diagnosePest({ crop, note, imageStats }) {
  const text = `${crop} ${note}`.toLowerCase();
  const humid = state.weather?.current?.humidity >= 65 || state.moisture >= 65;
  const imageSuggestsPowder = imageStats?.whiteRatio > 0.16 && imageStats?.greenRatio > 0.18;
  const imageSuggestsSpots = imageStats?.yellowBrownRatio > 0.18 || imageStats?.darkRatio > 0.2;
  if (/白粉|粉状|灰白|powder|霉/.test(text) || imageSuggestsPowder || (humid && /西葫芦|丝瓜|黄瓜|南瓜/.test(crop))) {
    return {
      diagnosis: "疑似白粉病",
      confidence: /白粉|粉状|灰白/.test(text) ? 86 : imageSuggestsPowder ? 74 : 68,
      severity: humid ? "中高" : "中",
      solution: [
        "剪掉重病叶并带出菜地，不要堆在地块旁边。",
        "减少叶面喷水，早晨浇根部，增加株间通风。",
        "傍晚喷施有机许可的碳酸氢钾或 Netzschwefel，先小范围试喷并按标签浓度。",
      ],
    };
  }
  if (/蚜|小绿虫|小黑虫|卷叶|黏|蜜露|aphid/.test(text)) {
    return {
      diagnosis: "疑似蚜虫危害",
      confidence: 84,
      severity: /大量|很多|扩散|卷曲/.test(text) ? "中高" : "中",
      solution: [
        "先用清水冲洗叶背和嫩梢，连续 2-3 天观察回落情况。",
        "保护瓢虫、草蛉等天敌，避免广谱杀虫剂。",
        "严重时傍晚使用钾皂/软皂或 Neem，重点喷叶背，5-7 天后复查。",
      ],
    };
  }
  if (/蜗牛|蛞蝓|洞|咬|缺口|slugg|snail/.test(text)) {
    return {
      diagnosis: "疑似蜗牛或蛞蝓取食",
      confidence: 80,
      severity: /幼苗|整株|很多/.test(text) ? "高" : "中",
      solution: [
        "傍晚或雨后巡查手捡，清理木板、杂草和潮湿藏身处。",
        "幼苗周围铺羊毛颗粒、铜带或粗糙覆盖物形成屏障。",
        "必要时少量使用有机园艺常用的磷酸铁诱饵，避开可食叶片。",
      ],
    };
  }
  if (/萎|缺水|干|黄叶|焦边|下垂/.test(text)) {
    return {
      diagnosis: "疑似水分胁迫或根区干湿不均",
      confidence: 72,
      severity: state.moisture < 45 ? "中高" : "中",
      solution: [
        "手指检查 5-8 cm 土层，干透再深浇，避免只打湿表层。",
        "用草屑、稻草或堆肥薄覆盖保湿，但不要贴住茎基部。",
        "高温日给新移栽苗临时遮阴，傍晚复查叶片是否恢复。",
      ],
    };
  }
  if (/斑|黑点|褐|腐|疫|叶斑/.test(text) || imageSuggestsSpots || /番茄|辣椒/.test(crop)) {
    return {
      diagnosis: "叶斑/早疫病风险，需复查",
      confidence: /斑|黑点|褐/.test(text) ? 76 : imageSuggestsSpots ? 66 : 58,
      severity: "中",
      solution: [
        "摘除贴地老叶和明显病斑叶，工具使用后擦拭消毒。",
        "浇水只浇根部，给番茄和辣椒绑蔓，让叶片更快干。",
        "3 天后同角度复拍；若病斑扩大，再考虑有机认证可用制剂。",
      ],
    };
  }
  return {
    diagnosis: "待复核：叶面异常",
    confidence: 55,
    severity: "低中",
    solution: [
      "补拍叶背、茎基部和全株照片，记录是否正在扩散。",
      "先隔离严重叶片并保持通风，暂停叶面施肥。",
      "48 小时后复查，如果扩散明显，再按具体症状细分处理。",
    ],
  };
}

function readPestUpload(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const photo = String(reader.result || "");
    imageStatsFromDataUrl(photo, (imageStats) => {
      state.pestDraft = { photo, fileName: file.name || "病虫害照片", imageStats };
      render();
    });
  };
  reader.readAsDataURL(file);
}

function imageStatsFromDataUrl(photo, callback) {
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement("canvas");
    const size = 96;
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size).data;
    let green = 0;
    let white = 0;
    let yellowBrown = 0;
    let dark = 0;
    const total = size * size;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const greenValue = pixels[index + 1];
      const blue = pixels[index + 2];
      const brightness = (red + greenValue + blue) / 3;
      if (greenValue > red * 1.08 && greenValue > blue * 1.08) green += 1;
      if (brightness > 190 && Math.abs(red - greenValue) < 32 && Math.abs(greenValue - blue) < 32) white += 1;
      if (red > 95 && greenValue > 65 && blue < 95 && red >= greenValue * 0.86) yellowBrown += 1;
      if (brightness < 58) dark += 1;
    }
    callback({
      greenRatio: Math.round((green / total) * 100) / 100,
      whiteRatio: Math.round((white / total) * 100) / 100,
      yellowBrownRatio: Math.round((yellowBrown / total) * 100) / 100,
      darkRatio: Math.round((dark / total) * 100) / 100,
    });
  };
  image.onerror = () => callback(null);
  image.src = photo;
}

async function analyzePestFromForm() {
  const bedId = Number(document.querySelector("#pest-bed-select")?.value) || state.selectedBed;
  const crop = document.querySelector("#pest-crop-select")?.value || "未指定作物";
  const note = document.querySelector("#pest-note")?.value.trim() || "";
  if (!state.pestDraft.photo && !note) {
    window.alert("请先上传图片，或至少写一条观察记录。");
    return;
  }
  state.pestDiagnosisBusy = true;
  render();
  const result = await diagnosePestWithRemoteFallback({ crop, note, imageStats: state.pestDraft.imageStats, photo: state.pestDraft.photo });
  state.pestLogs.unshift({
    id: `pest-${Date.now()}`,
    createdAt: new Date().toISOString(),
    bedId,
    crop,
    note,
    photo: state.pestDraft.photo,
    fileName: state.pestDraft.fileName,
    imageStats: state.pestDraft.imageStats,
    ...result,
  });
  state.pestDraft = { photo: "", fileName: "", imageStats: null };
  state.pestDiagnosisBusy = false;
  saveGardenState();
  render();
}

async function diagnosePestWithRemoteFallback(payload) {
  const endpoint = window.GARDEN_TWIN_PEST_API_URL || "";
  if (!endpoint) return diagnosePest(payload);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crop: payload.crop,
        note: payload.note,
        imageStats: payload.imageStats,
        photo: payload.photo,
        weather: state.weather?.current || null,
        moisture: state.moisture,
        location: "Frankfurt am Main, Germany",
      }),
    });
    if (!response.ok) throw new Error(`diagnosis ${response.status}`);
    const data = await response.json();
    return normalizePestDiagnosis(data, diagnosePest(payload));
  } catch (error) {
    console.warn("Remote diagnosis failed; using local rules.", error);
    return diagnosePest(payload);
  }
}

function normalizePestDiagnosis(data, fallback) {
  if (!data || typeof data !== "object") return fallback;
  return {
    diagnosis: String(data.diagnosis || fallback.diagnosis),
    confidence: Math.max(35, Math.min(95, Number(data.confidence) || fallback.confidence)),
    severity: String(data.severity || fallback.severity),
    solution: Array.isArray(data.solution) && data.solution.length ? data.solution.slice(0, 5).map(String) : fallback.solution,
  };
}

function removePestLog(id) {
  state.pestLogs = state.pestLogs.filter((log) => log.id !== id);
  saveGardenState();
}

function moduleView() {
  const item = navItems.find((nav) => nav.key === state.activeView) || navItems[0];
  if (state.activeView === "tasks") return schedulePlannerView();
  if (state.activeView === "pests") return pestMonitorView();
  const notes = {
    planting: ["管理播种、移栽、苗龄和作物阶段。", "以后会从作物数据库自动计算定植后第几天。"],
    water: ["记录每个地块的浇水量和施肥类型。", "未来会接入天气，自动提高高温日浇水优先级。"],
    pests: ["记录蚜虫、白粉病、蜗牛、缺水萎蔫等问题。", "以后可以上传照片并记录有机处理方案。"],
    harvest: ["记录收获数量、重量、口感和是否明年继续种。", "未来会生成每个品种的产量表现。"],
    rotation: ["查看 4 年轮作建议，避免同科连续种植。", "以后会根据历史种植自动推荐下一季作物。"],
    notes: ["自由记录观察、灵感和下一次采购想法。", "以后会支持按地块和作物关联笔记。"],
  };
  const list = notes[state.activeView] || ["这里是简化后的模块入口。", "先把地图和地块弹窗做好，再逐步展开专业功能。"];
  return `
    <section class="module-view">
      <div class="module-panel">
        <span>${item.symbol}</span>
        <h1>${item.label}</h1>
        ${list.map((text) => `<p>${text}</p>`).join("")}
        <button type="button" data-action="open-map">返回菜园地图</button>
      </div>
    </section>
  `;
}

function spriteFor(name) {
  return `./assets/crops/${spriteMap[name] || "water_spinach"}.png`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadGardenState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (saved.layout && typeof saved.layout === "object") {
      state.layout = normalizeGardenLayout(saved.layout);
    }
    if (Array.isArray(saved.beds)) {
      state.beds = normalizeBedsForCount(saved.beds, state.layout.plotCount);
    }
    if (Array.isArray(saved.cropLibrary)) {
      state.cropLibrary = normalizeCropLibrary(saved.cropLibrary);
    }
    if (saved.plantDetails && typeof saved.plantDetails === "object") state.plantDetails = saved.plantDetails;
    if (Array.isArray(saved.pestLogs)) state.pestLogs = normalizePestLogs(saved.pestLogs);
    if (saved.taskSchedule && typeof saved.taskSchedule === "object") {
      state.taskSchedule = normalizeTaskSchedule(saved.taskSchedule);
    }
    if (Number.isFinite(saved.moisture)) state.moisture = saved.moisture;
    if (Array.isArray(saved.completed)) state.completed = new Set(saved.completed);
  } catch {
    state.beds = clone(DATA.initialBeds);
    state.cropLibrary = clone(DATA.cropLibrary);
    state.taskSchedule = createDefaultTaskSchedule();
  }
  syncBedsToLayout();
}

function normalizeTaskSchedule(schedule) {
  const normalized = {};
  Object.entries(schedule || {}).forEach(([date, tasks]) => {
    if (!Array.isArray(tasks)) return;
    normalized[date] = tasks
      .filter((task) => task && typeof task === "object")
      .map((task, index) => ({
        id: String(task.id || `task-${date}-${index}-${Date.now()}`),
        time: String(task.time || "09:00").slice(0, 5),
        bedId: Number(task.bedId) || 0,
        title: String(task.title || task.task || "").trim(),
      }))
      .filter((task) => task.title);
  });
  return Object.keys(normalized).length ? normalized : createDefaultTaskSchedule();
}

function normalizeCropLibrary(crops) {
  const seen = new Set();
  return crops
    .filter((crop) => crop && typeof crop === "object")
    .map((crop, index) => {
      const name = String(crop.name || "").trim();
      if (!name || seen.has(name)) return null;
      seen.add(name);
      return {
        id: crop.id || `custom-${index}-${name}`,
        name,
        season: String(crop.season || "自定义"),
        color: crop.color || "#72b56b",
        water: Math.max(1, Math.min(5, Number(crop.water) || 3)),
        note: String(crop.note || "自定义作物。"),
      };
    })
    .filter(Boolean);
}

function normalizeBed(savedBed, fallbackBed) {
  const base = clone(fallbackBed);
  const source = savedBed && typeof savedBed === "object" ? savedBed : {};
  const crops = Array.isArray(source.crops) ? source.crops : base.crops;
  const tasks = Array.isArray(source.tasks) ? source.tasks : base.tasks;
  return {
    ...base,
    ...source,
    id: Number.isFinite(source.id) ? source.id : base.id,
    title: source.title || base.title,
    role: source.role || base.role,
    status: source.status || base.status,
    water: Number.isFinite(source.water) ? source.water : base.water,
    soil: source.soil || base.soil,
    note: source.note || base.note,
    crops: crops
      .filter((crop) => crop && typeof crop === "object")
      .map((crop) => {
        const meta = cropMeta(crop.name);
        return {
          name: crop.name || meta.name || "自定义作物",
          count: Math.max(0, Number(crop.count) || 0),
          color: crop.color || meta.color || "#72b56b",
        };
      }),
    tasks: tasks.filter(Boolean).map(String),
  };
}

function gardenSnapshot() {
  return {
    beds: state.beds,
    layout: state.layout,
    plantDetails: state.plantDetails,
    pestLogs: state.pestLogs,
    cropLibrary: state.cropLibrary,
    taskSchedule: state.taskSchedule,
    moisture: state.moisture,
    completed: [...state.completed],
    updatedAt: new Date().toISOString(),
  };
}

function applyGardenSnapshot(data) {
  if (!data || typeof data !== "object") return;
  if (data.layout && typeof data.layout === "object") state.layout = normalizeGardenLayout(data.layout);
  if (Array.isArray(data.beds)) state.beds = normalizeBedsForCount(data.beds, state.layout.plotCount);
  if (Array.isArray(data.cropLibrary)) state.cropLibrary = normalizeCropLibrary(data.cropLibrary);
  state.plantDetails = data.plantDetails && typeof data.plantDetails === "object" ? data.plantDetails : state.plantDetails || {};
  if (Array.isArray(data.pestLogs)) state.pestLogs = normalizePestLogs(data.pestLogs);
  if (data.taskSchedule && typeof data.taskSchedule === "object") state.taskSchedule = normalizeTaskSchedule(data.taskSchedule);
  if (Number.isFinite(data.moisture)) state.moisture = data.moisture;
  state.completed = new Set(Array.isArray(data.completed) ? data.completed : [...state.completed]);
  syncBedsToLayout();
}

function saveGardenState(options = {}) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(gardenSnapshot()));
  if (!options.skipCloud) scheduleCloudSave();
}

function scheduleCloudSave() {
  if (applyingRemoteState || !window.gardenCloud?.save || !state.cloud?.user) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(async () => {
    try {
      state.cloud = { ...state.cloud, status: "saving", message: "正在同步" };
      await window.gardenCloud.save(gardenSnapshot());
      state.cloud = { ...state.cloud, status: "synced", message: "云端已同步" };
      render();
    } catch (error) {
      state.cloud = { ...state.cloud, status: "error", message: error.message || "云同步失败" };
      render();
    }
  }, 700);
}

function activeBedRaw() {
  return state.beds.find((bed) => bed.id === state.selectedBed) || state.beds[0];
}

function cropMeta(name) {
  return getCropLibrary().find((crop) => crop.name === name) || { name, color: "#72b56b", note: "自定义作物" };
}

function addCropToBed(bedId, name, amount = 1) {
  const bed = state.beds.find((item) => item.id === Number(bedId)) || activeBedRaw();
  if (!Array.isArray(bed.crops)) bed.crops = [];
  const existing = bed.crops.find((crop) => crop.name === name);
  if (existing) {
    existing.count += amount;
  } else {
    const meta = cropMeta(name);
    bed.crops.push({ name, count: amount, color: meta.color });
  }
  state.selectedBed = bed.id;
  saveGardenState();
}

function addCropToActiveBed(name, amount = 1) {
  addCropToBed(state.selectedBed, name, amount);
}

function changeCropCount(index, delta) {
  const bed = activeBedRaw();
  const crop = bed.crops[index];
  if (!crop) return;
  crop.count = Math.max(0, (crop.count || 0) + delta);
  if (crop.count === 0) bed.crops.splice(index, 1);
  saveGardenState();
}

function removeCrop(index) {
  const bed = activeBedRaw();
  bed.crops.splice(index, 1);
  saveGardenState();
}

function addTaskToActiveBed() {
  const text = window.prompt("添加今天/近期任务");
  if (!text || !text.trim()) return;
  if (!Array.isArray(activeBedRaw().tasks)) activeBedRaw().tasks = [];
  activeBedRaw().tasks.push(text.trim());
  saveGardenState();
}

function addScheduledTask() {
  const title = document.querySelector("#schedule-task-title")?.value.trim();
  const time = document.querySelector("#schedule-task-time")?.value || "09:00";
  const bedId = Number(document.querySelector("#schedule-task-bed")?.value) || 0;
  if (!title) {
    document.querySelector("#schedule-task-title")?.focus();
    return;
  }
  const key = currentDateKey();
  if (!Array.isArray(state.taskSchedule[key])) state.taskSchedule[key] = [];
  state.taskSchedule[key].push({
    id: `task-${key}-${Date.now()}`,
    time,
    bedId,
    title,
  });
  saveGardenState();
}

function removeScheduledTask(id) {
  const key = currentDateKey();
  state.taskSchedule[key] = (state.taskSchedule[key] || []).filter((task) => task.id !== id);
  state.completed.delete(id);
  saveGardenState();
}

function applyGardenLayoutFromInputs() {
  state.layout = normalizeGardenLayout({
    plotCount: document.querySelector("#layout-plot-count")?.value,
    plotLength: document.querySelector("#layout-plot-length")?.value,
    plotWidth: document.querySelector("#layout-plot-width")?.value,
    pathCount: document.querySelector("#layout-path-count")?.value,
    pathWidth: document.querySelector("#layout-path-width")?.value,
  });
  syncBedsToLayout();
  saveGardenState();
}

function resetActiveBed() {
  const original = DATA.initialBeds.find((bed) => bed.id === state.selectedBed);
  const index = state.beds.findIndex((bed) => bed.id === state.selectedBed);
  if (original && index >= 0) state.beds[index] = clone(original);
  saveGardenState();
}

function addLibraryCrop() {
  const nameInput = document.querySelector("#library-crop-name");
  const seasonInput = document.querySelector("#library-crop-season");
  const noteInput = document.querySelector("#library-crop-note");
  const name = nameInput?.value.trim();
  if (!name) {
    nameInput?.focus();
    return;
  }
  if (getCropLibrary().some((crop) => crop.name === name)) {
    window.alert(`${name} 已经在作物库里了。`);
    return;
  }
  state.cropLibrary.push({
    id: `custom-${Date.now()}`,
    name,
    season: seasonInput?.value.trim() || "自定义",
    color: "#72b56b",
    water: 3,
    note: noteInput?.value.trim() || "自定义作物，可继续记录品种、苗龄和种植要点。",
  });
  state.libraryModalOpen = false;
  saveGardenState();
  render();
}

function removeLibraryCrop(name) {
  state.cropLibrary = getCropLibrary().filter((crop) => crop.name !== name);
  saveGardenState();
}

function exportJson() {
  downloadFile(
    `garden-twin-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(gardenSnapshot(), null, 2),
    "application/json",
  );
}

function exportCsv() {
  const rows = [["地块", "作物", "数量", "角色", "土壤", "任务", "备注"]];
  state.beds.forEach((bed) => {
    safeCrops(bed).forEach((crop) => {
      rows.push([bed.title, crop.name, crop.count || 0, bed.role, bed.soil, safeTasks(bed).join("；"), bed.note]);
    });
  });
  downloadFile(
    `garden-twin-${new Date().toISOString().slice(0, 10)}.csv`,
    rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n"),
    "text/csv;charset=utf-8",
  );
}

function downloadFile(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importJsonFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.beds)) throw new Error("缺少 beds 数据");
      applyGardenSnapshot(data);
      saveGardenState();
      render();
    } catch (error) {
      window.alert(`导入失败：${error.message}`);
    }
  };
  reader.readAsText(file);
}

async function initCloudSync() {
  if (!window.gardenCloud) {
    state.cloud = { configured: false, status: "local", user: null, message: "本地保存" };
    render();
    return;
  }
  try {
    await window.gardenCloud.init({
      initialData: gardenSnapshot(),
      onStatus: (cloudState) => {
        state.cloud = { ...state.cloud, ...cloudState };
        render();
      },
      onRemote: (remoteData) => {
        applyingRemoteState = true;
        applyGardenSnapshot(remoteData);
        saveGardenState({ skipCloud: true });
        applyingRemoteState = false;
        render();
      },
    });
  } catch (error) {
    state.cloud = { configured: true, status: "error", user: null, message: error.message || "云同步初始化失败" };
    render();
  }
}

async function signInWithGoogle() {
  if (!window.gardenCloud?.signIn) return;
  state.cloud = { ...state.cloud, status: "loading", message: "正在打开 Google 登录" };
  render();
  try {
    await window.gardenCloud.signIn();
  } catch (error) {
    state.cloud = { ...state.cloud, status: "error", message: error.message || "Google 登录失败" };
    render();
  }
}

async function signOutGoogle() {
  if (!window.gardenCloud?.signOut) return;
  try {
    await window.gardenCloud.signOut();
  } catch (error) {
    state.cloud = { ...state.cloud, status: "error", message: error.message || "退出失败" };
    render();
  }
}

function installLabel() {
  if (state.appMode) return "App 模式";
  if (location.protocol === "file:") return "本地版";
  return state.installReady ? "安装 App" : "可离线";
}

function render() {
  const beds = getBeds();
  const activeBed = beds.find((bed) => bed.id === state.selectedBed) || beds[2];

  root.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><span class="brand-mark">叶</span><div><strong>Garden Twin</strong><span>${cloudStatusText()}</span></div></div>
        <nav class="nav-list" aria-label="主要导航">
          ${navItems.map((item) => `<button class="nav-item ${state.activeView === item.key ? "active" : ""}" type="button" data-view="${item.key}"><span>${item.label}</span>${item.badge ? `<${item.warm ? "i" : "b"}>${item.badge}</${item.warm ? "i" : "b"}>` : ""}</button>`).join("")}
        </nav>
        <section class="edit-panel" aria-label="编辑模式">
          <div class="panel-head"><span>编辑模式</span><button class="switch ${state.editMode ? "on" : ""}" type="button" data-action="toggle-edit"><span></span></button></div>
          <p>拖换作物到地块，或调整数量。长按地块可查看轮作限制。</p>
          <label class="slider-label" for="moisture">土壤湿度（整体）</label>
          <input id="moisture" class="range" type="range" min="32" max="82" value="${state.moisture}" />
          <div class="range-row"><span>干燥</span><strong>${state.moisture}%</strong><span>湿润</span></div>
          <button class="outline-button" type="button">手动记录数据</button>
        </section>
      </aside>
      <main class="workspace">
        <header class="topbar">
          <div class="date-control"><span>今天</span><button type="button" class="date-picker">${formatDate(state.dayOffset)} <span>⌄</span></button><button type="button" class="icon-button" data-action="today">今</button></div>
          <div class="transport"><button type="button" class="icon-button ghost" data-action="prev">−</button><button type="button" class="play-button" data-action="play">${state.playing ? "暂停" : "播放"}</button><button type="button" class="icon-button ghost" data-action="next">+</button><button type="button" class="speed-button" data-action="speed">${state.speed}x <span>⌄</span></button></div>
          ${weatherStrip()}
          ${accountControl()}
          <input id="import-json-file" type="file" accept="application/json,.json" hidden />
        </header>
        ${["overview", "map"].includes(state.activeView) ? `
        <section class="content-grid fixed-scale">
          <div class="main-column">
            <div class="section-title"><div><h1>菜园布局（${Math.round(state.layout.plotLength * gardenTotalWidth())} m²）</h1><p>${state.layout.plotCount} 条地块 · 南北走向 · 走道 ${state.layout.pathCount} 条</p></div><div class="section-actions"><button type="button" class="layout-open-button" data-action="open-layout-modal">菜园参数</button></div></div>
            <div class="garden-area">
              <div class="map-panel">
                <div class="compass top">北</div><div class="compass bottom">南</div><div class="compass left">西</div><div class="compass right">东</div><div class="measure vertical">${gardenTotalWidth()} m</div><div class="measure horizontal">${state.layout.plotLength} m</div>
                <div class="garden-map" style="grid-template-columns: repeat(${state.layout.plotCount}, minmax(74px, 1fr));">${beds.map((bed) => `<button type="button" class="bed-card ${bed.status}" data-bed="${bed.id}"><span class="bed-number">${bedTitle(bed)}</span><strong>${bedRoleName(bed)}</strong><div class="plant-grid ${plantDensityClass(bed)} ${activeCrops(bed).length ? "" : "empty"}" style="${plantGridStyle(bed)}">${plantSprites(bed)}</div><div class="crop-summary">${cropSummary(bed)}</div></button>`).join("")}</div>
              </div>
            </div>
            <div class="dashboard-row simplified">
              ${weatherForecastCard()}
              ${cropLibraryPanel(activeBed)}
              <section class="metric-card today-tasks"><h2>今日任务</h2>${todayTaskRows(4)}<button class="view-schedule" type="button" data-view="tasks">查看日程</button></section>
            </div>
          </div>
          ${detailPanel(activeBed)}
        </section>
        ` : moduleView()}
      </main>
    </div>
    ${cropLibraryModal()}
    ${gardenLayoutModal()}
    `;
}

function startClock() {
  window.clearInterval(timer);
  if (!state.playing) return;
  timer = window.setInterval(() => {
    state.dayOffset = state.dayOffset >= 30 ? 0 : state.dayOffset + 1;
    render();
  }, 2200 / state.speed);
}

root.addEventListener("click", (event) => {
  const plantButton = event.target.closest("[data-plant-code]");
  const bedButton = event.target.closest("[data-bed]");
  const actionButton = event.target.closest("[data-action]");
  const taskButton = event.target.closest("[data-task]");
  const viewButton = event.target.closest("[data-view]");
  const modalPanel = event.target.closest("[data-modal-panel]");
  let didHandle = false;

  if (viewButton) {
    state.activeView = viewButton.dataset.view;
    didHandle = true;
  }
  if (plantButton && !actionButton) {
    state.selectedBed = Number(plantButton.dataset.bedId) || state.selectedBed;
    state.selectedPlant = plantButton.dataset.plantCode;
    didHandle = true;
  } else if (bedButton && !actionButton) {
    state.selectedBed = Number(bedButton.dataset.bed);
    state.selectedPlant = null;
    didHandle = true;
  }
  if (taskButton) {
    const task = taskButton.dataset.task;
    state.completed.has(task) ? state.completed.delete(task) : state.completed.add(task);
    saveGardenState();
    didHandle = true;
  }
  if (actionButton) {
    const action = actionButton.dataset.action;
    didHandle = true;
    if (action === "play") state.playing = !state.playing;
    if (action === "prev") state.dayOffset = Math.max(0, state.dayOffset - 1);
    if (action === "next") state.dayOffset = Math.min(30, state.dayOffset + 1);
    if (action === "today") state.dayOffset = 0;
    if (action === "speed") state.speed = state.speed === 1 ? 2 : state.speed === 2 ? 4 : 1;
    if (action === "toggle-edit") state.editMode = !state.editMode;
    if (action === "open-map") state.activeView = "map";
    if (action === "set-detail-tab") state.detailTab = actionButton.dataset.tab || "combo";
    if (action === "open-library-modal") state.libraryModalOpen = true;
    if (action === "close-library-modal") state.libraryModalOpen = false;
    if (action === "open-layout-modal") state.layoutModalOpen = true;
    if (action === "close-layout-modal") state.layoutModalOpen = false;
    if (action === "add-crop") addCropToActiveBed(actionButton.dataset.crop);
    if (action === "add-library-crop") addLibraryCrop();
    if (action === "remove-library-crop") removeLibraryCrop(actionButton.dataset.crop);
    if (action === "inc-crop") changeCropCount(Number(actionButton.dataset.cropIndex), 1);
    if (action === "dec-crop") changeCropCount(Number(actionButton.dataset.cropIndex), -1);
    if (action === "remove-crop") removeCrop(Number(actionButton.dataset.cropIndex));
    if (action === "add-selected-crop") addCropToActiveBed(document.querySelector("#crop-add-select").value);
    if (action === "add-task") addTaskToActiveBed();
    if (action === "add-scheduled-task") addScheduledTask();
    if (action === "remove-scheduled-task") removeScheduledTask(actionButton.dataset.taskId);
    if (action === "analyze-pest-photo" && !state.pestDiagnosisBusy) analyzePestFromForm();
    if (action === "remove-pest-log") removePestLog(actionButton.dataset.logId);
    if (action === "apply-layout") {
      applyGardenLayoutFromInputs();
      state.layoutModalOpen = false;
    }
    if (action === "add-plant-task") {
      activeBedRaw().tasks.push(actionButton.dataset.plantTask);
      saveGardenState();
    }
    if (action === "reset-bed") resetActiveBed();
    if (action === "export-json") exportJson();
    if (action === "export-csv") exportCsv();
    if (action === "import-json") document.querySelector("#import-json-file").click();
    if (action === "install-app" && deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      deferredInstallPrompt.userChoice.finally(() => {
        deferredInstallPrompt = null;
        state.installReady = false;
        render();
      });
      return;
    }
  }
  if (event.target.classList.contains("modal-backdrop") && !modalPanel) {
    state.libraryModalOpen = false;
    state.layoutModalOpen = false;
    didHandle = true;
  }
  if (didHandle) {
    render();
    startClock();
  }
});

root.addEventListener("dragstart", (event) => {
  const cropButton = event.target.closest("[data-crop]");
  if (!cropButton || !cropButton.draggable) return;
  event.dataTransfer.setData("text/plain", cropButton.dataset.crop);
  event.dataTransfer.effectAllowed = "copy";
});

root.addEventListener("dragover", (event) => {
  const bed = event.target.closest(".bed-card[data-bed]");
  if (!bed) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "copy";
  bed.classList.add("drag-over");
});

root.addEventListener("dragleave", (event) => {
  const bed = event.target.closest(".bed-card[data-bed]");
  if (bed) bed.classList.remove("drag-over");
});

root.addEventListener("drop", (event) => {
  const bed = event.target.closest(".bed-card[data-bed]");
  if (!bed) return;
  event.preventDefault();
  const cropName = event.dataTransfer.getData("text/plain");
  bed.classList.remove("drag-over");
  if (!cropName) return;
  addCropToBed(Number(bed.dataset.bed), cropName);
  render();
  startClock();
});

root.addEventListener("input", (event) => {
  if (["plant-nickname", "plant-note"].includes(event.target.id)) {
    updateSelectedPlantDetail(event.target.id, event.target.value);
    return;
  }
  if (event.target.id === "moisture") {
    state.moisture = Number(event.target.value);
    saveGardenState();
    render();
    startClock();
  }
});

function updateSelectedPlantDetail(fieldId, value) {
  if (!state.selectedPlant) return;
  const current = state.plantDetails[state.selectedPlant] || {};
  const key = fieldId === "plant-nickname" ? "nickname" : fieldId === "plant-sow-date" ? "sowDate" : "note";
  state.plantDetails[state.selectedPlant] = { ...current, [key]: value };
  saveGardenState();
}

root.addEventListener("change", (event) => {
  if (event.target.id === "pest-photo-input" && event.target.files[0]) {
    readPestUpload(event.target.files[0]);
    event.target.value = "";
    return;
  }
  if (event.target.id === "plant-sow-date") {
    updateSelectedPlantDetail(event.target.id, event.target.value);
    render();
    return;
  }
  if (event.target.id === "import-json-file" && event.target.files[0]) {
    importJsonFile(event.target.files[0]);
    event.target.value = "";
  }
  if (event.target.id?.startsWith("layout-")) {
    applyGardenLayoutFromInputs();
    render();
    startClock();
  }
});

try {
  render();
} catch (error) {
  console.error(error);
  root.innerHTML = `
    <main class="boot-error">
      <h1>Garden Twin 启动遇到数据问题</h1>
      <p>App 已阻止白屏。通常是旧本地数据结构不兼容导致。</p>
      <button type="button" onclick="localStorage.removeItem('${STORAGE_KEY}'); location.reload();">重置本地数据并重启</button>
    </main>
  `;
}
startClock();
loadWeatherForecast();
initCloudSync();

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  state.installReady = true;
  render();
});

window.addEventListener("appinstalled", () => {
  state.appMode = true;
  state.installReady = false;
  deferredInstallPrompt = null;
  render();
});
