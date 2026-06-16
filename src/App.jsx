import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  CloudSun,
  Droplets,
  Home,
  Layers3,
  Leaf,
  Menu,
  Minus,
  NotebookPen,
  PackagePlus,
  Pause,
  Play,
  Plus,
  Settings,
  ShieldAlert,
  Sprout,
  Sun,
  ThermometerSun,
  X,
} from "lucide-react";
import { cropLibrary, initialBeds, timeline } from "./gardenData.js";

const startDate = new Date("2026-06-08T12:00:00+02:00");
const navItems = [
  ["总览", Home],
  ["菜园地图", Layers3],
  ["任务与日程", CalendarDays],
  ["播种与移栽", Sprout],
  ["浇水与施肥", Droplets],
  ["病虫害监测", ShieldAlert],
  ["收获记录", Leaf],
  ["轮作计划", BarChart3],
  ["笔记", NotebookPen],
];

const formatDate = (offset) => {
  const d = new Date(startDate);
  d.setDate(d.getDate() + offset);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
};

function App() {
  const [selectedBed, setSelectedBed] = useState(3);
  const [dayOffset, setDayOffset] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [editMode, setEditMode] = useState(true);
  const [moisture, setMoisture] = useState(58);
  const [completed, setCompleted] = useState(["辣椒侧芽修剪", "检查叶面虫害"]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    const timer = window.setInterval(() => {
      setDayOffset((value) => (value >= 30 ? 0 : value + 1));
    }, 2200 / speed);
    return () => window.clearInterval(timer);
  }, [isPlaying, speed]);

  const beds = useMemo(
    () =>
      initialBeds.map((bed) => ({
        ...bed,
        water: Math.max(28, Math.min(88, bed.water + Math.round((moisture - 58) / 5) - Math.floor(dayOffset / 7))),
      })),
    [dayOffset, moisture],
  );
  const activeBed = beds.find((bed) => bed.id === selectedBed) ?? beds[2];
  const progress = Math.min(100, Math.round((dayOffset / 30) * 100));
  const urgentCount = beds.filter((bed) => bed.status === "risk" || bed.water < 46).length;

  const toggleTask = (task) => {
    setCompleted((items) => (items.includes(task) ? items.filter((item) => item !== task) : [...items, task]));
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Leaf size={26} /></span>
          <div>
            <strong>Garden Twin</strong>
            <span>法兰克福 · 德国</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="主要导航">
          {navItems.map(([label, Icon], index) => (
            <button className={index === 0 ? "nav-item active" : "nav-item"} type="button" key={label}>
              <Icon size={20} />
              <span>{label}</span>
              {label === "任务与日程" && <b>6</b>}
              {label === "病虫害监测" && <i>2</i>}
            </button>
          ))}
        </nav>

        <section className="edit-panel" aria-label="编辑模式">
          <div className="panel-head">
            <span>编辑模式</span>
            <button className={editMode ? "switch on" : "switch"} type="button" onClick={() => setEditMode(!editMode)}>
              <span />
            </button>
          </div>
          <p>拖换作物到地块，或调整数量。长按地块可查看轮作限制。</p>
          <label className="slider-label" htmlFor="moisture">土壤湿度（整体）</label>
          <input
            id="moisture"
            className="range"
            type="range"
            min="32"
            max="82"
            value={moisture}
            onChange={(event) => setMoisture(Number(event.target.value))}
          />
          <div className="range-row"><span>干燥</span><strong>{moisture}%</strong><span>湿润</span></div>
          <button className="outline-button" type="button">手动记录数据</button>
        </section>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="date-control">
            <span>今天</span>
            <button type="button" className="date-picker">
              {formatDate(dayOffset)}
              <ChevronDown size={16} />
            </button>
            <button type="button" className="icon-button" onClick={() => setDayOffset(0)} aria-label="回到今天">
              <CalendarDays size={18} />
            </button>
          </div>
          <div className="transport" aria-label="时间模拟">
            <button type="button" className="icon-button ghost" onClick={() => setDayOffset(Math.max(0, dayOffset - 1))}>
              <Minus size={18} />
            </button>
            <button type="button" className="play-button" onClick={() => setIsPlaying(!isPlaying)} aria-label="播放或暂停时间">
              {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
            <button type="button" className="icon-button ghost" onClick={() => setDayOffset(Math.min(30, dayOffset + 1))}>
              <Plus size={18} />
            </button>
            <button type="button" className="speed-button" onClick={() => setSpeed(speed === 1 ? 2 : speed === 2 ? 4 : 1)}>
              {speed}x
              <ChevronDown size={14} />
            </button>
          </div>
          <div className="weather-strip">
            <span><CloudSun size={18} /> 18°C</span>
            <span><Droplets size={18} /> 62%</span>
            <span>西南风 8 km/h</span>
            <span><Sun size={18} /> 日照 15.8h</span>
          </div>
          <div className="top-actions">
            <button className="icon-button" type="button" aria-label="设置"><Settings size={20} /></button>
            <button className="icon-button" type="button" aria-label="菜单"><Menu size={22} /></button>
          </div>
        </header>

        <section className="content-grid">
          <div className="main-column">
            <div className="section-title">
              <div>
                <h1>菜园布局（60 m²）</h1>
                <p>7 条地块 · 南北走向 · 有机管理</p>
              </div>
              <div className="bed-selector" aria-label="地块选择">
                {beds.map((bed) => (
                  <button
                    key={bed.id}
                    type="button"
                    className={bed.id === selectedBed ? "selected" : ""}
                    onClick={() => setSelectedBed(bed.id)}
                  >
                    {bed.id}
                  </button>
                ))}
              </div>
            </div>

            <div className="garden-area">
              <aside className="crop-library">
                <div className="library-head">
                  <strong>作物库</strong>
                  <button type="button">全部 <ChevronDown size={14} /></button>
                </div>
                {cropLibrary.map((crop) => (
                  <button key={crop.id} type="button" className="crop-chip" onClick={() => setMoisture(Math.min(82, moisture + 1))}>
                    <span className="crop-dot" style={{ background: crop.color }} />
                    <span>{crop.name}</span>
                    <small>{crop.season}</small>
                  </button>
                ))}
              </aside>

              <div className="map-panel">
                <div className="compass top">南</div>
                <div className="compass right">东</div>
                <div className="measure vertical">6 m</div>
                <div className="measure horizontal">10 m</div>
                <div className="garden-map">
                  {beds.map((bed) => (
                    <button
                      type="button"
                      className={`bed-card ${bed.id === selectedBed ? "selected" : ""} ${bed.status}`}
                      key={bed.id}
                      onClick={() => setSelectedBed(bed.id)}
                    >
                      <span className="bed-number">{bed.title}</span>
                      <strong>{bed.role}</strong>
                      <div className="plant-grid">
                        {Array.from({ length: Math.min(12, bed.crops.reduce((sum, crop) => sum + Math.max(1, crop.count), 0)) }).map((_, index) => {
                          const crop = bed.crops[index % bed.crops.length];
                          return <span key={`${bed.id}-${index}`} style={{ backgroundColor: crop.color }} />;
                        })}
                      </div>
                      <div className="crop-summary">
                        {bed.crops.map((crop) => (
                          <span key={`${bed.id}-${crop.name}`}>{crop.name}{crop.count ? ` x${crop.count}` : ""}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="dashboard-row">
              <section className="metric-card harvest">
                <h2>产量预估（本季）</h2>
                <div className="donut" aria-label="预计总产量 68.4 kg"><span>68.4 kg</span></div>
                <ul>
                  <li><span className="green" />果菜类 28.7 kg</li>
                  <li><span className="blue" />叶菜类 18.5 kg</li>
                  <li><span className="yellow" />豆类 11.2 kg</li>
                </ul>
              </section>
              <section className="metric-card rotation">
                <h2>轮作计划（4年）</h2>
                <div className="rotation-grid">
                  {beds.map((bed) => (
                    <div key={`r-${bed.id}`}>
                      <strong>{bed.title}</strong>
                      <span>{bed.id % 3 === 0 ? "茄果类" : bed.id % 2 === 0 ? "豆荚类" : "叶菜类"}</span>
                      <span>根茎类</span>
                      <span>瓜类</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="metric-card shopping">
                <h2>采购计划与库存</h2>
                {["丝瓜苗 3 棵", "豇豆种子 1 包", "玉米种子 1 包", "秋葵种子 1 包"].map((item) => (
                  <div className="shopping-row" key={item}>
                    <span>{item}</span>
                    <button type="button">加入清单</button>
                  </div>
                ))}
              </section>
              <section className="metric-card risks">
                <h2>风险监测</h2>
                <Risk label="高温干旱" level="中风险" />
                <Risk label="蚜虫（豌豆尖、豆类）" level="中风险" />
                <Risk label="白粉病（瓜类）" level="低风险" low />
              </section>
            </div>
          </div>

          <aside className="detail-panel">
            <div className="detail-title">
              <div>
                <span>地块详情</span>
                <h2>{activeBed.title}</h2>
              </div>
              <button type="button" className="icon-button" aria-label="关闭详情"><X size={18} /></button>
            </div>

            <div className="tabs">
              <button type="button" className="active">作物组合</button>
              <button type="button">单株视图</button>
            </div>

            <section className="crop-combo">
              <div className="combo-preview">
                {activeBed.crops.slice(0, 3).map((crop) => <span key={crop.name} style={{ backgroundColor: crop.color }} />)}
              </div>
              <div>
                <strong>{activeBed.crops.map((crop) => `${crop.name}${crop.count ? ` x${crop.count}` : ""}`).join(" + ")}</strong>
                <button type="button">编辑组合</button>
              </div>
            </section>

            <InfoCard title="种植建议" text={activeBed.note} />
            <section className="info-card">
              <h3>水分需求</h3>
              <div className="water-meter" aria-label={`当前水分 ${activeBed.water}%`}>
                {Array.from({ length: 7 }).map((_, index) => (
                  <span key={index} className={index < Math.round(activeBed.water / 14) ? "filled" : ""}><Droplets size={16} fill="currentColor" /></span>
                ))}
              </div>
              <p>{activeBed.water < 46 ? "偏干，今晚需要深浇。" : "保持均匀湿润，避免积水。"}</p>
            </section>
            <InfoCard title="有机施肥建议" text={`${activeBed.soil}；果菜期每 2-3 周薄施堆肥茶或羊毛肥。`} />

            <section className="info-card tasks">
              <h3>当前任务（{completed.length}/{activeBed.tasks.length + 1}）</h3>
              {activeBed.tasks.map((task) => (
                <button key={task} type="button" onClick={() => toggleTask(task)} className={completed.includes(task) ? "done" : ""}>
                  <span>{completed.includes(task) && <Check size={13} />}</span>
                  {task}
                </button>
              ))}
              <button type="button" className="add-task"><Plus size={15} /> 添加任务</button>
            </section>

            <section className="info-card simulation">
              <div className="sim-head">
                <h3>未来30天模拟</h3>
                <span>{progress}%</span>
              </div>
              <div className="mini-chart">
                {timeline.map((point, index) => (
                  <div key={point.label} style={{ "--temp": point.temp, "--rain": point.rain }}>
                    <span className="bar" />
                    <span className="dot" />
                    {index % 2 === 0 && <small>{point.label}</small>}
                  </div>
                ))}
              </div>
              <p>预计：6 月下旬高温干旱风险增加；番茄快速膨果期前补钾。</p>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}

function InfoCard({ title, text }) {
  return (
    <section className="info-card">
      <h3>{title}</h3>
      <p>{text}</p>
    </section>
  );
}

function Risk({ label, level, low = false }) {
  return (
    <div className="risk-row">
      <span>{label}</span>
      <b className={low ? "low" : ""}>{level}</b>
    </div>
  );
}

export { App };
