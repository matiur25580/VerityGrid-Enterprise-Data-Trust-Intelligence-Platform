import { Activity, ArrowDownRight, ArrowUpRight, Bell, Boxes, CircleHelp, Database, GitBranch, LayoutDashboard, Search, ShieldCheck, Workflow } from "lucide-react";
import { useEffect, useState } from "react";

const navigation = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Data Catalog", icon: Database },
  { label: "Data Lineage", icon: GitBranch },
  { label: "Quality Center", icon: ShieldCheck },
  { label: "Pipelines", icon: Workflow },
  { label: "Incidents", icon: Activity },
];

function App() {
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => {
        if (!response.ok) throw new Error("API unavailable");
        return response.json();
      })
      .then(() => setApiStatus("online"))
      .catch(() => setApiStatus("offline"));
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Boxes size={21} /></div>
          <div><strong>veritygrid</strong><span>DATA TRUST PLATFORM</span></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switch"><span className="workspace-avatar">N</span><span><b>Northstar Analytics</b><small>Enterprise workspace</small></span><span className="chevron">⌄</span></button>
        <div className="nav-label">PLATFORM</div>
        <nav>{navigation.map(({ label, icon: Icon, active }) => <a key={label} className={active ? "nav-item active" : "nav-item"} href="#"><Icon size={17} /><span>{label}</span>{label === "Incidents" && <i className="nav-count">3</i>}</a>)}</nav>
        <div className="sidebar-bottom"><a className="nav-item" href="#"><CircleHelp size={17}/><span>Documentation</span></a><div className="user-card"><div className="user-avatar">MA</div><div><b>Workspace Admin</b><small>Platform administrator</small></div><span className="online-dot"/></div></div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">Workspace <span>/</span> <b>Overview</b></div>
          <div className="top-actions"><div className="search-box"><Search size={15}/><span>Search anything...</span><kbd>⌘ K</kbd></div><button className="icon-button" aria-label="Notifications"><Bell size={18}/><i/></button><div className="top-avatar">MA</div></div>
        </header>

        <section className="content">
          <div className="page-heading"><div><div className="eyebrow">MONDAY, NOVEMBER 23, 2026</div><h1>Data command center</h1><p>A live view of your organization's data trust and reliability.</p></div><button className="date-button">Last 30 days <span>⌄</span></button></div>

          <div className="welcome-strip"><div className="welcome-icon"><ShieldCheck size={21}/></div><div><b>Your data trust workspace</b><p>Connect a source to begin cataloging assets and measuring data quality.</p></div><span className="strip-status"><i/> Foundation preview</span></div>

          <div className="section-heading"><div><h2>Platform health</h2><p>Operational indicators from your workspace</p></div><span className="updated">API {apiStatus === "online" ? "connected" : apiStatus === "offline" ? "unavailable" : "checking"} <i className={apiStatus}/></span></div>

          <div className="metrics-grid">
            <Metric title="Registered data assets" value="—" detail="Awaiting first source" icon={<Database size={18}/>} />
            <Metric title="Quality score" value="—" detail="No checks executed yet" icon={<ShieldCheck size={18}/>} />
            <Metric title="Active pipelines" value="—" detail="No pipelines configured" icon={<Workflow size={18}/>} />
            <Metric title="Open incidents" value="—" detail="No incident data yet" icon={<Activity size={18}/>} />
          </div>

          <div className="dashboard-grid">
            <section className="panel quality-panel"><div className="panel-heading"><div><h3>Data trust overview</h3><p>Quality dimensions will appear after your first validation run.</p></div><span className="panel-menu">···</span></div><div className="empty-chart"><div className="chart-ring"><div><ShieldCheck size={27}/><b>—</b><small>NO DATA</small></div></div><div className="empty-copy"><b>Build your first quality baseline</b><p>Register a dataset and define validation rules to generate evidence-backed trust scores.</p><button className="primary-button">Explore data catalog <span>→</span></button></div></div></section>
            <section className="panel activity-panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Latest events across your workspace</p></div><button className="text-button">View all</button></div><div className="activity-empty"><div className="activity-empty-icon"><Activity size={22}/></div><b>No activity recorded</b><p>Ingestion runs, quality checks and governance events will be listed here.</p></div></section>
          </div>

          <section className="panel onboarding-panel"><div><div className="eyebrow">GETTING STARTED</div><h3>Bring your first dataset into focus</h3><p>Follow the initial setup path to establish a measurable data reliability baseline.</p></div><div className="setup-steps"><div className="setup-step"><span>01</span><div><b>Register a data source</b><small>Connect PostgreSQL or import a CSV file.</small></div><ArrowUpRight size={16}/></div><div className="setup-step"><span>02</span><div><b>Catalog your first asset</b><small>Document ownership, schema and purpose.</small></div><ArrowUpRight size={16}/></div><div className="setup-step"><span>03</span><div><b>Run quality checks</b><small>Validate completeness, uniqueness and freshness.</small></div><ArrowUpRight size={16}/></div></div></section>
          <footer>VERITYGRID <span>·</span> Enterprise Data Trust Platform <span className="footer-right">Built for trustworthy data operations</span></footer>
        </section>
      </main>
    </div>
  );
}

function Metric({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: React.ReactNode }) {
  return <article className="metric-card"><div className="metric-top"><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><div className="metric-detail">{detail}</div><div className="metric-foot"><span>Awaiting data</span><ArrowDownRight size={14}/></div></article>;
}

export default App;
