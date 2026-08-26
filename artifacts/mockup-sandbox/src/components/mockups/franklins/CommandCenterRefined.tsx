import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Filter,
  LayoutDashboard,
  Menu,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Truck,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";

type Driver = {
  initials: string;
  name: string;
  location: string;
  stage: string;
  progress: number;
  status: "On track" | "At risk" | "Ready";
  updated: string;
};

const drivers: Driver[] = [
  { initials: "JC", name: "Jalen Carter", location: "Memphis, TN", stage: "Documents", progress: 72, status: "On track", updated: "8 min ago" },
  { initials: "AM", name: "Avery Mitchell", location: "Nashville, TN", stage: "Background", progress: 46, status: "At risk", updated: "22 min ago" },
  { initials: "RS", name: "Riley Santos", location: "Jackson, MS", stage: "Orientation", progress: 91, status: "Ready", updated: "41 min ago" },
  { initials: "DK", name: "Darius King", location: "Birmingham, AL", stage: "Documents", progress: 63, status: "On track", updated: "1 hr ago" },
];

const nav = [
  { label: "Command Center", icon: LayoutDashboard },
  { label: "Work queue", icon: Activity, count: "12" },
  { label: "Drivers", icon: UsersRound },
  { label: "Compliance", icon: ShieldCheck },
];

export function CommandCenterRefined() {
  const [range, setRange] = useState("7 days");
  const [mobileNav, setMobileNav] = useState(false);
  const [alertVisible, setAlertVisible] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("09:42:18");
  const [query, setQuery] = useState("");

  const filteredDrivers = useMemo(() => {
    const matching = drivers.filter((driver) =>
      `${driver.name} ${driver.location} ${driver.stage}`.toLowerCase().includes(query.toLowerCase()),
    );
    return showAll ? matching : matching.slice(0, 3);
  }, [query, showAll]);

  return (
    <main className="franklin-shell">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        .franklin-shell { --ink:#e8eee8; --dim:#8ea295; --line:#274438; --panel:#102a20; --panel-hi:#153528; --canvas:#071812; --amber:#f4b441; --mint:#8ee6bb; min-height:100dvh; display:flex; background:var(--canvas); color:var(--ink); font-family:'Manrope',sans-serif; font-size:13px; }
        .franklin-shell * { box-sizing:border-box; }
        .franklin-shell button { font:inherit; cursor:pointer; }
        .franklin-side { width:248px; flex:none; border-right:1px solid var(--line); padding:25px 14px; display:flex; flex-direction:column; background:#0a2119; }
        .franklin-brand { display:flex; align-items:center; gap:11px; padding:0 11px 30px; letter-spacing:-.03em; font-size:18px; font-weight:800; }
        .franklin-mark { width:29px; height:29px; display:grid; place-items:center; background:var(--amber); color:#102119; font-weight:800; font-size:15px; }
        .franklin-section-label { color:#61796d; font:500 10px 'DM Mono',monospace; letter-spacing:.15em; text-transform:uppercase; padding:0 12px 9px; }
        .franklin-nav { display:grid; gap:4px; }
        .franklin-nav button { border:0; color:#9ab0a3; background:transparent; text-align:left; padding:11px 12px; display:flex; align-items:center; gap:11px; border-left:2px solid transparent; }
        .franklin-nav button:hover,.franklin-nav button.active { color:var(--ink); background:#133227; border-left-color:var(--amber); }
        .franklin-nav svg { width:16px; height:16px; }
        .franklin-count { margin-left:auto; font:10px 'DM Mono',monospace; color:#15271e; background:var(--amber); padding:2px 6px; }
        .franklin-side-bottom { margin-top:auto; border-top:1px solid var(--line); padding-top:18px; }
        .franklin-user { display:flex; align-items:center; gap:10px; padding:11px 12px; }
        .franklin-avatar { width:31px; height:31px; display:grid; place-items:center; background:#c7e6d5; color:#16372a; font-weight:800; font-size:11px; }
        .franklin-content { width:100%; min-width:0; }
        .franklin-topbar { height:69px; display:flex; align-items:center; justify-content:space-between; padding:0 34px; border-bottom:1px solid var(--line); }
        .franklin-crumb { color:var(--dim); font:11px 'DM Mono',monospace; text-transform:uppercase; letter-spacing:.08em; }
        .franklin-crumb strong { color:var(--ink); font-weight:500; }
        .franklin-tools { display:flex; align-items:center; gap:15px; }
        .franklin-icon-btn { border:0; padding:7px; background:transparent; color:#9ab0a3; }
        .franklin-icon-btn:hover { color:var(--amber); }
        .franklin-live { border-left:1px solid var(--line); padding-left:15px; display:flex; gap:7px; align-items:center; color:var(--dim); font:10px 'DM Mono',monospace; }
        .franklin-dot { width:6px; height:6px; background:var(--mint); border-radius:50%; box-shadow:0 0 0 3px #8ee6bb1c; }
        .franklin-body { max-width:1440px; padding:32px 34px 54px; margin:0 auto; }
        .franklin-heading { display:flex; align-items:flex-end; justify-content:space-between; margin-bottom:28px; }
        .franklin-kicker { color:var(--amber); font:500 10px 'DM Mono',monospace; letter-spacing:.2em; text-transform:uppercase; margin-bottom:8px; }
        .franklin-title { margin:0; font-size:32px; letter-spacing:-.06em; line-height:1; font-weight:800; }
        .franklin-subtitle { color:var(--dim); margin:9px 0 0; }
        .franklin-range { display:flex; gap:3px; border:1px solid var(--line); padding:3px; }
        .franklin-range button { border:0; background:transparent; color:var(--dim); padding:7px 11px; font-size:11px; }
        .franklin-range button.active { color:#17251d; background:var(--amber); font-weight:700; }
        .franklin-alert { display:flex; align-items:center; gap:12px; background:#302713; border:1px solid #70582a; color:#dfc788; padding:11px 13px; margin-bottom:20px; }
        .franklin-alert svg { color:var(--amber); flex:none; }
        .franklin-alert span { flex:1; }
        .franklin-alert button { border:0; color:#d9c78f; background:transparent; padding:2px; }
        .franklin-metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; margin-bottom:22px; }
        .franklin-metric { background:var(--panel); border:1px solid var(--line); padding:18px 19px 16px; position:relative; overflow:hidden; }
        .franklin-metric:after { content:''; position:absolute; width:42px; height:3px; top:0; left:0; background:var(--amber); }
        .franklin-metric-label { color:var(--dim); font:10px 'DM Mono',monospace; text-transform:uppercase; letter-spacing:.1em; }
        .franklin-metric-value { font-size:30px; letter-spacing:-.06em; font-weight:800; margin:10px 0 6px; }
        .franklin-metric-foot { color:var(--dim); display:flex; align-items:center; gap:6px; font-size:11px; }
        .trend-up { color:var(--mint); } .trend-down { color:#ed9d7e; }
        .franklin-grid { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(315px,.65fr); gap:20px; }
        .franklin-panel { background:var(--panel); border:1px solid var(--line); }
        .franklin-panel-head { display:flex; align-items:center; justify-content:space-between; padding:17px 19px; border-bottom:1px solid var(--line); }
        .franklin-panel-title { font-size:13px; font-weight:700; letter-spacing:-.02em; }
        .franklin-panel-meta { color:var(--dim); font:10px 'DM Mono',monospace; text-transform:uppercase; }
        .franklin-chart { padding:18px 19px 14px; height:245px; position:relative; }
        .franklin-gridlines { position:absolute; inset:23px 19px 37px; display:flex; flex-direction:column; justify-content:space-between; }
        .franklin-gridlines i { display:block; border-top:1px dashed #315344; opacity:.7; }
        .franklin-bars { position:absolute; inset:26px 30px 37px; display:flex; align-items:flex-end; justify-content:space-around; z-index:1; }
        .franklin-bar-wrap { height:100%; display:flex; align-items:flex-end; gap:5px; }
        .franklin-bar { width:13px; background:#3f7257; transition:height .25s ease; } .franklin-bar.hot { background:var(--amber); }
        .franklin-xlabels { position:absolute; bottom:14px; left:31px; right:28px; display:flex; justify-content:space-around; color:#728e7d; font:10px 'DM Mono',monospace; }
        .franklin-legend { display:flex; gap:15px; color:var(--dim); font:10px 'DM Mono',monospace; }
        .franklin-legend i { display:inline-block; width:7px; height:7px; margin-right:5px; background:#3f7257; } .franklin-legend i.hot { background:var(--amber); }
        .franklin-queue { margin-top:20px; }
        .franklin-queue-tools { display:flex; gap:8px; align-items:center; }
        .franklin-search { display:flex; align-items:center; gap:7px; border:1px solid var(--line); padding:6px 9px; color:var(--dim); }
        .franklin-search input { width:130px; border:0; outline:0; color:var(--ink); background:transparent; font-size:11px; }
        .franklin-table { width:100%; border-collapse:collapse; }
        .franklin-table th { color:#718c7b; font:10px 'DM Mono',monospace; text-transform:uppercase; letter-spacing:.08em; text-align:left; padding:12px 19px; border-bottom:1px solid var(--line); }
        .franklin-table td { padding:14px 19px; border-bottom:1px solid #1d3a2d; color:#bbcbc0; }
        .franklin-table tr:last-child td { border-bottom:0; } .franklin-table tr:hover td { background:#143126; }
        .franklin-driver { display:flex; align-items:center; gap:9px; color:var(--ink); font-weight:700; }
        .franklin-initials { display:grid; place-items:center; width:27px; height:27px; background:#244b3a; color:#a7d7bd; font:10px 'DM Mono',monospace; }
        .franklin-location,.franklin-stage { color:var(--dim); font-size:11px; }
        .franklin-progress { width:74px; height:4px; background:#254334; display:inline-block; vertical-align:middle; margin-right:8px; } .franklin-progress b { height:100%; display:block; background:var(--mint); }
        .franklin-status { font:10px 'DM Mono',monospace; border:1px solid; padding:4px 6px; white-space:nowrap; } .status-on { color:#a7ddbf; border-color:#386b50; } .status-risk { color:#f0c86d; border-color:#82652a; } .status-ready { color:#a9c9e0; border-color:#416176; }
        .franklin-activity { min-height:330px; }
        .franklin-activity-row { display:flex; gap:11px; padding:16px 19px; border-bottom:1px solid #1d3a2d; }
        .franklin-activity-icon { width:26px; height:26px; display:grid; place-items:center; background:#193c2d; color:var(--mint); flex:none; }
        .franklin-activity-copy { line-height:1.4; color:#b8c9be; font-size:11px; } .franklin-activity-copy strong { color:var(--ink); } .franklin-activity-time { display:block; color:#708b7a; font:10px 'DM Mono',monospace; margin-top:4px; }
        .franklin-btn-link { border:0; background:transparent; color:var(--amber); font:10px 'DM Mono',monospace; text-transform:uppercase; letter-spacing:.08em; padding:5px; } .franklin-btn-link:hover { text-decoration:underline; }
        .franklin-mobile-menu { display:none; }
        @media (max-width: 900px) { .franklin-side { width:204px; } .franklin-metrics { grid-template-columns:repeat(2,1fr); } .franklin-grid { grid-template-columns:1fr; } .franklin-table th:nth-child(3),.franklin-table td:nth-child(3) { display:none; } }
        @media (max-width: 650px) { .franklin-shell { display:block; } .franklin-side { display:none; position:absolute; z-index:5; width:245px; height:100%; } .franklin-side.open { display:flex; } .franklin-mobile-menu { display:block; } .franklin-topbar { padding:0 17px; } .franklin-body { padding:25px 17px 40px; } .franklin-heading { display:block; } .franklin-range { margin-top:19px; width:max-content; } .franklin-title { font-size:28px; } .franklin-metrics { gap:8px; } .franklin-metric { padding:14px; } .franklin-metric-value { font-size:25px; } .franklin-table { min-width:570px; } .franklin-panel { overflow:hidden; } .franklin-queue .franklin-panel { overflow-x:auto; } .franklin-queue-tools { margin-top:8px; } }
      `}</style>
      <aside className={`franklin-side ${mobileNav ? "open" : ""}`}>
        <div className="franklin-brand"><span className="franklin-mark">F</span><span>FRANKLIN<span style={{ color: "var(--amber)" }}>.</span></span></div>
        <div className="franklin-section-label">Operations</div>
        <nav className="franklin-nav">
          {nav.map(({ label, icon: Icon, count }) => <button key={label} className={label === "Command Center" ? "active" : ""} onClick={() => setMobileNav(false)}><Icon />{label}{count && <span className="franklin-count">{count}</span>}</button>)}
        </nav>
        <div className="franklin-section-label" style={{ marginTop: 27 }}>Workspace</div>
        <nav className="franklin-nav">
          <button onClick={() => setMobileNav(false)}><Truck />Fleet overview</button>
          <button onClick={() => setMobileNav(false)}><Settings2 />Settings</button>
        </nav>
        <div className="franklin-side-bottom">
          <div className="franklin-user"><span className="franklin-avatar">MC</span><span><strong style={{ display: "block", fontSize: 11 }}>Morgan Cole</strong><small style={{ color: "var(--dim)", font: "10px 'DM Mono',monospace" }}>ADMIN · FRANKLIN</small></span><MoreHorizontal style={{ marginLeft: "auto", color: "var(--dim)", width: 16 }} /></div>
        </div>
      </aside>
      <section className="franklin-content">
        <header className="franklin-topbar">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><button className="franklin-icon-btn franklin-mobile-menu" onClick={() => setMobileNav(!mobileNav)}><Menu size={19} /></button><div className="franklin-crumb"><strong>Franklin Logistics</strong> <span style={{ margin: "0 8px", color: "#456354" }}>/</span> Onboarding</div></div>
          <div className="franklin-tools"><button className="franklin-icon-btn" aria-label="Search"><Search size={16} /></button><button className="franklin-icon-btn" aria-label="Notifications"><Bell size={16} /></button><div className="franklin-live"><span className="franklin-dot" /> API LIVE</div></div>
        </header>
        <div className="franklin-body">
          <div className="franklin-heading"><div><div className="franklin-kicker">Monday · 14 October 2024</div><h1 className="franklin-title">Command center</h1><p className="franklin-subtitle">A clear view of every driver moving toward dispatch.</p></div><div className="franklin-range">{["7 days", "30 days", "Quarter"].map((item) => <button key={item} className={range === item ? "active" : ""} onClick={() => setRange(item)}>{item}</button>)}</div></div>
          {alertVisible && <div className="franklin-alert"><AlertTriangle size={16} /><span><strong>3 drivers need attention.</strong> Their background checks are approaching the 48-hour SLA.</span><button onClick={() => setAlertVisible(false)} aria-label="Dismiss alert"><X size={15} /></button></div>}
          <div className="franklin-metrics">
            <Metric label="Total active" value="47" foot="5 more than last week" trend="up" />
            <Metric label="Ready for dispatch" value="18" foot="38.3% of active" trend="up" />
            <Metric label="Critical SLA" value="03" foot="2 need action today" trend="down" warn />
            <Metric label="Avg. completion" value="68.4%" foot="Across all active" />
          </div>
          <div className="franklin-grid">
            <div className="franklin-panel"><div className="franklin-panel-head"><div><div className="franklin-panel-title">Weekly hired volume</div><div className="franklin-panel-meta" style={{ marginTop: 5 }}>New drivers by week</div></div><div className="franklin-legend"><span><i className="hot" />Hired</span><span><i />Target</span></div></div><div className="franklin-chart"><div className="franklin-gridlines"><i /><i /><i /><i /></div><div className="franklin-bars">{[42,57,47,72,63,83,55].map((height, i) => <div className="franklin-bar-wrap" key={i}><span className="franklin-bar" style={{ height: `${height}%` }} /><span className={`franklin-bar ${i === 5 ? "hot" : ""}`} style={{ height: `${Math.max(15, height - 22)}%` }} /></div>)}</div><div className="franklin-xlabels">{["Wk 38","Wk 39","Wk 40","Wk 41","Wk 42","Wk 43","Wk 44"].map(x => <span key={x}>{x}</span>)}</div></div></div>
            <div className="franklin-panel franklin-activity"><div className="franklin-panel-head"><div className="franklin-panel-title">Live activity</div><span className="franklin-panel-meta">Updated {lastUpdated}</span></div>{[{ icon: CheckCircle2, text: <><strong>Riley Santos</strong> cleared orientation</>, time: "12 minutes ago" }, { icon: UserRound, text: <><strong>Avery Mitchell</strong> was assigned to Jordan Lee</>, time: "28 minutes ago" }, { icon: ShieldCheck, text: <><strong>Background check</strong> returned for Jalen Carter</>, time: "41 minutes ago" }].map(({ icon: Icon, text, time }) => <div className="franklin-activity-row" key={time}><div className="franklin-activity-icon"><Icon size={14} /></div><div className="franklin-activity-copy">{text}<span className="franklin-activity-time">{time}</span></div></div>)}<div style={{ padding: "12px 19px" }}><button className="franklin-btn-link" onClick={() => setShowAll(!showAll)}>View full activity →</button></div></div>
          </div>
          <div className="franklin-panel franklin-queue"><div className="franklin-panel-head"><div><div className="franklin-panel-title">Onboarding queue</div><div className="franklin-panel-meta" style={{ marginTop: 5 }}>Priority view · {drivers.length} records</div></div><div className="franklin-queue-tools"><div className="franklin-search"><Search size={13} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search drivers" /></div><button className="franklin-icon-btn" aria-label="Filter queue"><Filter size={15} /></button></div></div><table className="franklin-table"><thead><tr><th>Driver</th><th>Stage</th><th>Progress</th><th>Status</th><th>Updated</th></tr></thead><tbody>{filteredDrivers.map((driver) => <tr key={driver.name}><td><div className="franklin-driver"><span className="franklin-initials">{driver.initials}</span><span><span style={{ display: "block" }}>{driver.name}</span><small className="franklin-location">{driver.location}</small></span></div></td><td className="franklin-stage">{driver.stage}</td><td><span className="franklin-progress"><b style={{ width: `${driver.progress}%` }} /></span><span style={{ color: "var(--dim)", font: "10px 'DM Mono',monospace" }}>{driver.progress}%</span></td><td><span className={`franklin-status ${driver.status === "At risk" ? "status-risk" : driver.status === "Ready" ? "status-ready" : "status-on"}`}>{driver.status}</span></td><td className="franklin-stage">{driver.updated}</td></tr>)}{filteredDrivers.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--dim)", padding: 28 }}>No drivers match “{query}”.</td></tr>}</tbody></table><div style={{ borderTop: "1px solid var(--line)", padding: "11px 19px", display: "flex", justifyContent: "space-between", alignItems: "center" }}><span className="franklin-panel-meta">Last synced just now</span><button className="franklin-btn-link" onClick={() => { setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })); setShowAll(!showAll); }}><RefreshCw size={12} style={{ verticalAlign: "middle", marginRight: 5 }} />{showAll ? "Show priority" : "View all drivers"}</button></div></div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value, foot, trend, warn }: { label: string; value: string; foot: string; trend?: "up" | "down"; warn?: boolean }) {
  return <div className="franklin-metric"><div className="franklin-metric-label">{label}</div><div className="franklin-metric-value" style={warn ? { color: "#efb25d" } : undefined}>{value}{trend && <span className={trend === "up" ? "trend-up" : "trend-down"} style={{ fontSize: 15, marginLeft: 8 }}>{trend === "up" ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}</span>}</div><div className="franklin-metric-foot">{foot}</div></div>;
}

export default CommandCenterRefined;