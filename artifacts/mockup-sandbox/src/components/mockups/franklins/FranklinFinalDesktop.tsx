import { useMemo, useState } from "react";
import {
  Activity, AlertCircle, AlertTriangle, ArrowLeft, ArrowUpRight, Bell, Check,
  CheckCircle2, ClipboardCheck, FileText, Filter, LayoutDashboard, LifeBuoy,
  Search, Settings, ShieldCheck, SlidersHorizontal, Truck, UserRound, UsersRound,
} from "lucide-react";
import "./_final.css";

type View = "login" | "operations" | "detail" | "recruiting";

const drivers = [
  { initials: "JC", name: "Jalen Carter", location: "Memphis, TN", stage: "Documents", progress: 72, status: "On track", updated: "8 min ago" },
  { initials: "AM", name: "Avery Mitchell", location: "Nashville, TN", stage: "Background", progress: 46, status: "At risk", updated: "22 min ago" },
  { initials: "RS", name: "Riley Santos", location: "Jackson, MS", stage: "Orientation", progress: 91, status: "Ready", updated: "41 min ago" },
  { initials: "DK", name: "Darius King", location: "Birmingham, AL", stage: "Documents", progress: 63, status: "Manager review", updated: "1 hr ago" },
];

export function FranklinFinalDesktop() {
  const [view, setView] = useState<View>("login");
  const [email, setEmail] = useState("demo@franklins.local");
  const [search, setSearch] = useState("");
  const [showNotice, setShowNotice] = useState(true);
  const visibleDrivers = useMemo(() => drivers.filter((driver) => `${driver.name} ${driver.location} ${driver.stage}`.toLowerCase().includes(search.toLowerCase())), [search]);
  const go = (next: View) => setView(next);

  return (
    <main className="franklin-final">
      <ViewTabs view={view} onChange={go} />
      {view === "login" ? <Login email={email} setEmail={setEmail} onSubmit={() => go("operations")} /> : (
        <AppShell view={view} onChange={go}>
          {view === "operations" && <Operations visibleDrivers={visibleDrivers} search={search} setSearch={setSearch} showNotice={showNotice} setShowNotice={setShowNotice} onDetail={() => go("detail")} />}
          {view === "detail" && <Detail onBack={() => go("operations")} />}
          {view === "recruiting" && <Recruiting />}
        </AppShell>
      )}
    </main>
  );
}

function ViewTabs({ view, onChange }: { view: View; onChange: (view: View) => void }) {
  const items: [View, string][] = [["login", "Sign in"], ["operations", "All Drivers"], ["detail", "Driver detail"], ["recruiting", "Recruiting"]];
  return <div className="ff-preview-bar"><span className="ff-preview-label">FINAL LIGHT SYSTEM · INTERACTIVE SPECIMEN</span>{items.map(([value, label]) => <button key={value} className={`ff-preview-tab ${view === value ? "active" : ""}`} onClick={() => onChange(value)}>{label}</button>)}</div>;
}

function Login({ email, setEmail, onSubmit }: { email: string; setEmail: (value: string) => void; onSubmit: () => void }) {
  return <section className="ff-login">
    <div className="ff-login-form">
      <div className="ff-login-card">
        <div className="ff-brand"><span className="ff-brand-mark">F</span>Franklins<span style={{ color: "#d0962e" }}>.</span>OS</div>
        <div className="ff-login-eyebrow">Driver operations platform</div>
        <h1 className="ff-login-title">Move every driver forward.</h1>
        <p className="ff-login-subtitle">One clear workspace for recruiting, onboarding, compliance, and dispatch readiness.</p>
        <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
          <div className="ff-field"><label htmlFor="desktop-email">Work email</label><input id="desktop-email" className="ff-input" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="ff-field"><label htmlFor="desktop-password">Password</label><input id="desktop-password" className="ff-input" autoComplete="current-password" type="password" placeholder="Enter your password" /></div>
          <button className="ff-btn ff-btn-primary ff-login-submit" type="submit">Sign in to Franklins.OS</button>
        </form>
        <p className="ff-help">DEV/DEMO workspace · Synthetic data only</p>
      </div>
    </div>
    <div className="ff-login-visual">
      <div className="ff-visual-content">
        <div className="ff-visual-kicker"><span /> Operations, in motion</div>
        <h2 className="ff-visual-title">The shortest path to dispatch starts here.</h2>
        <p className="ff-visual-copy">See ownership, progress, and blockers at a glance—then take the next right action with confidence.</p>
        <div className="ff-visual-stats"><div className="ff-visual-stat"><strong>47</strong><span>Active drivers</span></div><div className="ff-visual-stat"><strong>18</strong><span>Ready today</span></div><div className="ff-visual-stat"><strong>68%</strong><span>Avg. completion</span></div></div>
      </div>
    </div>
  </section>;
}

function AppShell({ view, onChange, children }: { view: View; onChange: (view: View) => void; children: React.ReactNode }) {
  return <section className="ff-app">
    <aside className="ff-sidebar">
      <div className="ff-brand"><span className="ff-brand-mark">F</span>Franklins<span style={{ color: "#d0962e" }}>.</span>OS</div>
      <div className="ff-nav-label">Workspace</div>
      <nav className="ff-nav">
        <button className={view === "operations" ? "active" : ""} onClick={() => onChange("operations")}><LayoutDashboard /> All Drivers <span className="ff-nav-count">47</span></button>
        <button className={view === "recruiting" ? "active" : ""} onClick={() => onChange("recruiting")}><UsersRound /> Recruiting <span className="ff-nav-count">12</span></button>
        <button onClick={() => onChange("detail")}><ClipboardCheck /> Compliance</button>
        <button onClick={() => onChange("operations")}><Truck /> Dispatch readiness</button>
      </nav>
      <div className="ff-nav-label">Manage</div>
      <nav className="ff-nav"><button><Activity /> Activity</button><button><Settings /> Settings</button></nav>
      <div className="ff-sidebar-user"><span className="ff-avatar">DA</span><div className="ff-user-copy"><strong>Demo Admin</strong><span>Owner · Franklin</span></div></div>
    </aside>
    <div className="ff-main">
      <header className="ff-topbar"><div className="ff-breadcrumb"><strong>Franklin Logistics</strong> <span> / </span> {view === "recruiting" ? "Recruiting" : view === "detail" ? "Driver detail" : "All Drivers"}</div><div className="ff-top-actions"><button className="ff-icon-btn" aria-label="Search"><Search size={17} /></button><button className="ff-icon-btn" aria-label="Notifications"><Bell size={17} /></button><span className="ff-live"><i /> Workspace live</span></div></header>
      {children}
    </div>
  </section>;
}

function Operations({ visibleDrivers, search, setSearch, showNotice, setShowNotice, onDetail }: { visibleDrivers: typeof drivers; search: string; setSearch: (value: string) => void; showNotice: boolean; setShowNotice: (value: boolean) => void; onDetail: () => void }) {
  return <div className="ff-page">
    <div className="ff-page-heading"><div><h1>All Drivers</h1><p>Operational view of every driver moving toward dispatch.</p></div><div className="ff-heading-actions"><button className="ff-btn ff-btn-secondary"><SlidersHorizontal size={14} /> Filters</button><button className="ff-btn ff-btn-primary"><Truck size={14} /> Add driver</button></div></div>
    {showNotice && <div className="ff-alert"><AlertTriangle size={16} /><span><strong>3 drivers need attention.</strong> Background checks are approaching the 48-hour SLA.</span><button className="ff-icon-btn" aria-label="Dismiss alert" onClick={() => setShowNotice(false)}><Check size={15} /></button></div>}
    <div className="ff-metrics"><Metric icon={UsersRound} label="Active drivers" value="47" foot="5 more than last week" trend="up" /><Metric icon={CheckCircle2} label="Ready for dispatch" value="18" foot="38.3% of active" trend="up" /><Metric icon={AlertCircle} label="Critical SLA" value="03" foot="2 need action today" trend="warn" warn /><Metric icon={Activity} label="Avg. completion" value="68.4%" foot="Across all active" /></div>
    <div className="ff-two-col"><div className="ff-card"><div className="ff-panel-head"><div><h2>Weekly hired volume</h2><span>New drivers by week</span></div><span className="ff-up">● Hired &nbsp; ○ Target</span></div><div className="ff-chart"><div className="ff-chart-grid"><i /><i /><i /><i /></div><div className="ff-bars">{[42,57,47,72,63,83,55].map((height, index) => <div className="ff-bar-set" key={index}><i className="ff-bar" style={{ height: `${height}%` }} /><i className={`ff-bar ${index === 5 ? "highlight" : ""}`} style={{ height: `${Math.max(19, height - 22)}%` }} /></div>)}</div><div className="ff-chart-labels">{["W38", "W39", "W40", "W41", "W42", "W43", "W44"].map((label) => <span key={label}>{label}</span>)}</div></div></div><div className="ff-card"><div className="ff-panel-head"><h2>Live activity</h2><span>Updated just now</span></div><div className="ff-activity-list"><ActivityRow icon={CheckCircle2} text={<><strong>Riley Santos</strong> cleared orientation</>} time="12 minutes ago" /><ActivityRow icon={UserRound} text={<><strong>Avery Mitchell</strong> assigned to Hardy</>} time="28 minutes ago" /><ActivityRow icon={ShieldCheck} text={<><strong>Background check</strong> returned</>} time="41 minutes ago" /></div></div></div>
    <div className="ff-card ff-queue"><div className="ff-panel-head"><div><h2>Priority queue</h2><span>4 of 47 active drivers</span></div><div className="ff-queue-tools"><div className="ff-search"><Search size={14} /><input aria-label="Search drivers" placeholder="Search drivers" value={search} onChange={(event) => setSearch(event.target.value)} /></div><button className="ff-filter-chip"><Filter size={13} /> Owner <span>⌄</span></button></div></div><div className="ff-table-wrap"><table className="ff-table"><thead><tr><th>Driver</th><th>Current step</th><th>Progress</th><th>Status</th><th>Updated</th></tr></thead><tbody>{visibleDrivers.map((driver) => <tr key={driver.name} onClick={onDetail}><td><div className="ff-driver"><span className="ff-avatar">{driver.initials}</span><span className="ff-driver-name"><strong>{driver.name}</strong><span>{driver.location}</span></span></div></td><td>{driver.stage}</td><td><div className="ff-progress"><span className="ff-progress-track"><i style={{ width: `${driver.progress}%` }} /></span><span>{driver.progress}%</span></div></td><td><Status status={driver.status} /></td><td>{driver.updated}</td></tr>)}</tbody></table></div><div className="ff-queue-foot"><span>Showing 1–4 of 47 drivers</span><div className="ff-pagination"><button aria-label="Previous page">‹</button><span>Page 1 of 12</span><button aria-label="Next page">›</button></div></div></div>
    <div className="ff-state-strip"><div className="ff-card ff-state"><span className="ff-state-icon"><CheckCircle2 size={17} /></span><div><strong>Empty state</strong><span>No unassigned drivers in this workspace.</span></div></div><div className="ff-card ff-state"><span className="ff-state-icon"><Activity size={17} /></span><div><strong>Loading state</strong><span className="ff-skeleton-lines"><i /><i /></span></div></div><div className="ff-card ff-state"><span className="ff-state-icon error"><AlertCircle size={17} /></span><div><strong>Sync needs attention</strong><span>Review the latest DEV/DEMO sync result.</span></div></div></div>
    <div className="ff-toast" role="status"><CheckCircle2 size={15} /> Queue refreshed · no data changes</div>
  </div>;
}

function Detail({ onBack }: { onBack: () => void }) {
  return <div className="ff-page"><button className="ff-back" onClick={onBack}><ArrowLeft size={14} /> Back to All Drivers</button><div className="ff-page-heading" style={{ marginTop: 20 }}><div><h1>Driver detail</h1><p>Operational profile and dispatch readiness.</p></div><span className="ff-demo-badge"><ShieldCheck size={12} /> DEV/DEMO · masked contact</span></div><div className="ff-detail-grid"><div><div className="ff-card"><div className="ff-detail-hero"><div className="ff-detail-person"><span className="ff-avatar">JC</span><div><h2>Jalen Carter</h2><p>Memphis, TN · Owner operator · Onboarding</p></div></div><Status status="On track" /></div><div className="ff-detail-content"><h3 className="ff-section-title">Onboarding progress</h3><div className="ff-steps">{["Application", "Clearing House", "Drug Test", "Contract", "Med Card", "Title"].map((step, index) => <div className={`ff-step ${index < 4 ? "done" : index === 4 ? "current" : ""}`} key={step}><div className="ff-step-dot">{index < 4 ? <Check size={12} /> : index + 1}</div><span>{step}</span></div>)}</div><div className="ff-detail-facts"><div className="ff-fact"><span>Phone</span><strong>•••• 4821</strong></div><div className="ff-fact"><span>Owner</span><strong>Mason</strong></div><div className="ff-fact"><span>Next action</span><strong>Verify medical card</strong></div></div></div></div><div className="ff-card ff-timeline"><h3 className="ff-section-title">Recent activity</h3><Timeline text={<><strong>Mason</strong> completed Drug Test</>} time="Today, 9:20 AM" /><Timeline text={<><strong>System</strong> received Clearing House result</>} time="Yesterday, 4:18 PM" /><Timeline text={<><strong>Jalen Carter</strong> submitted application</>} time="Oct 14, 2024" /></div></div><div className="ff-card ff-action-card"><h3>Next best action</h3><p>Keep this driver moving by completing the current operational step.</p><ul className="ff-action-list"><li><CheckCircle2 size={15} /> Review medical card</li><li><FileText size={15} /> Record approval outcome</li><li><ArrowUpRight size={15} /> Hand off to Hardy at Step 6</li></ul><button className="ff-btn ff-btn-primary">Open checklist</button></div></div></div>;
}

function Recruiting() {
  return <div className="ff-page"><div className="ff-page-heading"><div><h1>Recruiting</h1><p>Move qualified leads into onboarding with clear ownership.</p></div><button className="ff-btn ff-btn-primary"><UsersRound size={14} /> New lead</button></div><div className="ff-recruiting-metrics"><Metric icon={UsersRound} label="Active leads" value="28" foot="7 new this week" trend="up" /><Metric icon={ClipboardCheck} label="Manager review" value="04" foot="2 due today" trend="warn" warn /><Metric icon={ArrowUpRight} label="Hired this month" value="16" foot="12% above target" trend="up" /></div><div className="ff-pipeline">{[["New lead", "08", "Marcus Bell"], ["Screening", "07", "Nia Walker"], ["Manager review", "04", "Owen Price"], ["Future follow-up", "05", "Tara Green"], ["Ready to hire", "04", "Drew Collins"]].map(([label, count, person]) => <div className="ff-pipeline-col" key={label}><header><span>{label}</span><b>{count}</b></header><div className="ff-case"><strong>{person}</strong><span>{label === "Manager review" ? "Due today · Hardy" : "Case owner · Recruiter"}</span></div></div>)}</div><div className="ff-card"><div className="ff-panel-head"><div><h2>Recent recruiting activity</h2><span>Case owner and task owner stay distinct</span></div><button className="ff-filter-chip"><Filter size={13} /> Filter</button></div><div className="ff-table-wrap"><table className="ff-table"><thead><tr><th>Lead</th><th>Stage</th><th>Case owner</th><th>Next action</th><th>Due</th></tr></thead><tbody>{[["Maya Thompson", "Screening", "Wayne", "Schedule call", "Today"], ["Derrick Holt", "Manager review", "Hardy", "Approve / return", "Today"], ["Tara Green", "Future follow-up", "Mason", "Return on due date", "Oct 18"]].map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={cell}>{index === 0 ? <div className="ff-driver"><span className="ff-avatar">{cell.split(" ").map((part) => part[0]).join("")}</span><span className="ff-driver-name"><strong>{cell}</strong><span>Franklin lead</span></span></div> : cell}</td>)}</tr>)}</tbody></table></div></div></div>;
}

function Metric({ icon: Icon, label, value, foot, trend, warn }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string; foot: string; trend?: "up" | "warn"; warn?: boolean }) {
  return <div className="ff-card ff-metric"><div className="ff-metric-top"><span>{label}</span><span className={`ff-metric-icon ${warn ? "warn" : ""}`}><Icon size={15} /></span></div><div className="ff-metric-value">{value}</div><div className={`ff-metric-foot ${trend === "up" ? "ff-up" : trend === "warn" ? "ff-warn" : ""}`}>{trend === "up" && <ArrowUpRight size={13} />}{foot}</div></div>;
}
function ActivityRow({ icon: Icon, text, time }: { icon: React.ComponentType<{ size?: number }>; text: React.ReactNode; time: string }) { return <div className="ff-activity"><span className="ff-activity-icon"><Icon size={14} /></span><div className="ff-activity-copy">{text}<small>{time}</small></div></div>; }
function Timeline({ text, time }: { text: React.ReactNode; time: string }) { return <div className="ff-timeline-row"><span className="ff-timeline-dot" /><div><p>{text}</p><small>{time}</small></div></div>; }
function Status({ status }: { status: string }) { const risk = status === "At risk"; const review = status === "Manager review"; return <span className={`ff-status ${risk ? "risk" : review ? "review" : "ready"}`}>{risk || review ? <AlertCircle size={12} /> : <CheckCircle2 size={12} />}{status}</span>; }

export default FranklinFinalDesktop;