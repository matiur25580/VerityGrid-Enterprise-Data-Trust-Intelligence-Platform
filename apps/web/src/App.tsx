import {
  Activity, ArrowDownRight, ArrowUpRight, Bell, Boxes, CheckCircle2, CircleHelp,
  Database, GitBranch, LayoutDashboard, LoaderCircle, LogOut, Search, ShieldCheck,
  Workflow, Eye, EyeOff, Building2, ChevronDown,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode, type ChangeEvent } from "react";

type Membership = {
  role: string;
  organization: { id: string; name: string; slug: string };
};
type User = { id: string; email: string; displayName: string; memberships: Membership[] };
type AuthMode = "login" | "register";

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Data Catalog", icon: Database },
  { label: "Data Lineage", icon: GitBranch },
  { label: "Quality Center", icon: ShieldCheck },
  { label: "Pipelines", icon: Workflow },
  { label: "Incidents", icon: Activity },
];

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message ?? "Something went wrong. Please try again.";
    throw new Error(message);
  }
  return payload as T;
}

function App() {
  const today = new Intl.DateTimeFormat("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  }).format(new Date());
  const [apiStatus, setApiStatus] = useState<"checking" | "online" | "offline">("checking");
  const [user, setUser] = useState<User | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [activePage, setActivePage] = useState("Overview");

  const selectedMembership = useMemo(
    () => user?.memberships.find((item) => item.organization.id === selectedOrganizationId) ?? user?.memberships[0],
    [user, selectedOrganizationId],
  );

  const loadSession = useCallback(async () => {
    try {
      const health = await api<{ status: string }>("/api/health");
      setApiStatus(health.status === "ok" ? "online" : "offline");
    } catch {
      setApiStatus("offline");
    }

    try {
      const result = await api<{ data: { user: User | null } }>("/api/auth/me");
      const nextUser = result.data.user;
      if (nextUser) {
        setUser(nextUser);
        setSelectedOrganizationId((current) =>
          nextUser.memberships.some((item) => item.organization.id === current)
            ? current
            : nextUser.memberships[0]?.organization.id ?? "",
        );
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => { void loadSession(); }, [loadSession]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const body: Record<string, string> = {
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };
    if (authMode === "register") {
      body.displayName = String(form.get("displayName") ?? "").trim();
      body.organizationName = String(form.get("organizationName") ?? "").trim();
    }

    setAuthSubmitting(true);
    try {
      await api(authMode === "register" ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const result = await api<{ data: { user: User | null } }>("/api/auth/me");
      if (!result.data.user) throw new Error("Your session could not be loaded. Please sign in again.");
      setUser(result.data.user);
      setSelectedOrganizationId(result.data.user.memberships[0]?.organization.id ?? "");
      setNotice(authMode === "register" ? "Your workspace is ready. Welcome to VerityGrid." : "You are securely signed in.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed.");
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleLogout() {
    setAuthError("");
    try {
      await api("/api/auth/logout", { method: "POST", body: "{}" });
      setUser(null);
      setSelectedOrganizationId("");
      setNotice("You have been signed out.");
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Unable to sign out.");
    }
  }

  async function selectWorkspace(organizationId: string) {
    setSelectedOrganizationId(organizationId);
    setShowWorkspaceMenu(false);
    try {
      await api("/api/organizations/current", {
        headers: { "x-organization-id": organizationId },
      });
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Workspace access could not be verified.");
    }
  }

  if (authLoading) {
    return <div className="auth-loading"><div className="brand-mark"><Boxes size={22} /></div><LoaderCircle className="spin" size={19} /><span>Securing your workspace…</span></div>;
  }

  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        setMode={(mode) => { setAuthMode(mode); setAuthError(""); }}
        onSubmit={handleAuth}
        error={authError}
        notice={notice}
        apiStatus={apiStatus}
        busy={authSubmitting}
      />
    );
  }

  const activeWorkspace = selectedMembership?.organization;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Boxes size={21} /></div>
          <div><strong>veritygrid</strong><span>DATA TRUST PLATFORM</span></div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-menu-wrap">
          <button className="workspace-switch" onClick={() => setShowWorkspaceMenu((value) => !value)}>
            <span className="workspace-avatar">{activeWorkspace?.name.slice(0, 1).toUpperCase() ?? "W"}</span>
            <span><b>{activeWorkspace?.name ?? "Select workspace"}</b><small>{selectedMembership?.role.replace("_", " ") ?? "No membership"}</small></span>
            <ChevronDown className="chevron" size={15} />
          </button>
          {showWorkspaceMenu && (
            <div className="workspace-dropdown">
              {user.memberships.map((membership) => (
                <button key={membership.organization.id} onClick={() => void selectWorkspace(membership.organization.id)}>
                  <Building2 size={15} />
                  <span><b>{membership.organization.name}</b><small>{membership.role.replace("_", " ")}</small></span>
                  {membership.organization.id === activeWorkspace?.id && <CheckCircle2 size={15} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="nav-label">PLATFORM</div>
        <nav>{navigation.map(({ label, icon: Icon }) => (
          <button key={label} className={activePage === label ? "nav-item active" : "nav-item"} onClick={() => setActivePage(label)}>
            <Icon size={17} /><span>{label}</span>
          </button>
        ))}</nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="https://github.com/matiur25580/VerityGrid-Enterprise-Data-Trust-Intelligence-Platform/blob/main/docs/API_AUTHENTICATION.md" target="_blank" rel="noreferrer"><CircleHelp size={17}/><span>Documentation</span></a>
          <div className="user-card">
            <div className="user-avatar">{user.displayName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div>
            <div><b>{user.displayName}</b><small>{user.email}</small></div>
            <button className="logout-button" onClick={() => void handleLogout()} aria-label="Sign out" title="Sign out"><LogOut size={15}/></button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">{activeWorkspace?.name ?? "Workspace"} <span>/</span> <b>{activePage}</b></div>
          <div className="top-actions"><div className="search-box"><Search size={15}/><span>Search anything...</span><kbd>⌘ K</kbd></div><button className="icon-button" aria-label="Notifications"><Bell size={18}/></button><div className="top-avatar">{user.displayName.split(" ").map((part) => part[0]).slice(0, 2).join("").toUpperCase()}</div></div>
        </header>

        <section className="content">
          {notice && <div className="inline-notice"><CheckCircle2 size={16}/>{notice}<button onClick={() => setNotice("")}>Dismiss</button></div>}
          {authError && <div className="inline-error">{authError}<button onClick={() => setAuthError("")}>Dismiss</button></div>}
          <div className="page-heading"><div><div className="eyebrow">{today.toUpperCase()}</div><h1>{activePage === "Overview" ? "Data command center" : activePage}</h1><p>A live view of {activeWorkspace?.name ?? "your organization's"} data trust and reliability.</p></div><span className="role-pill">{selectedMembership?.role.replace("_", " ")}</span></div>

          <div className="welcome-strip"><div className="welcome-icon"><ShieldCheck size={21}/></div><div><b>Your data trust workspace</b><p>Your account is authenticated and your organization membership has been verified.</p></div><span className="strip-status"><i/> Secure session</span></div>

          {activePage === "Data Catalog" ? <DataCatalogPage organizationId={activeWorkspace?.id ?? ""} /> : <>
          <div className="section-heading"><div><h2>Platform health</h2><p>Operational indicators from your workspace</p></div><span className="updated">API {apiStatus === "online" ? "connected" : apiStatus === "offline" ? "unavailable" : "checking"} <i className={apiStatus}/></span></div>

          <div className="metrics-grid">
            <Metric title="Registered data assets" value="—" detail="Awaiting first source" icon={<Database size={18}/>} />
            <Metric title="Quality score" value="—" detail="No checks executed yet" icon={<ShieldCheck size={18}/>} />
            <Metric title="Active pipelines" value="—" detail="No pipelines configured" icon={<Workflow size={18}/>} />
            <Metric title="Open incidents" value="—" detail="No incident data yet" icon={<Activity size={18}/>} />
          </div>

          <div className="dashboard-grid">
            <section className="panel quality-panel"><div className="panel-heading"><div><h3>Data trust overview</h3><p>Quality dimensions will appear after your first validation run.</p></div><span className="panel-menu">···</span></div><div className="empty-chart"><div className="chart-ring"><div><ShieldCheck size={27}/><b>—</b><small>NO DATA</small></div></div><div className="empty-copy"><b>Build your first quality baseline</b><p>Register a dataset and define validation rules to generate evidence-backed trust scores.</p><button className="primary-button" onClick={() => setActivePage("Data Catalog")}>Explore data catalog <span>→</span></button></div></div></section>
            <section className="panel activity-panel"><div className="panel-heading"><div><h3>Recent activity</h3><p>Latest events across your workspace</p></div><button className="text-button">View all</button></div><div className="activity-empty"><div className="activity-empty-icon"><Activity size={22}/></div><b>No activity recorded</b><p>Ingestion runs, quality checks and governance events will be listed here.</p></div></section>
          </div>

          <section className="panel onboarding-panel"><div><div className="eyebrow">GETTING STARTED</div><h3>Bring your first dataset into focus</h3><p>Follow the initial setup path to establish a measurable data reliability baseline.</p></div><div className="setup-steps"><div className="setup-step"><span>01</span><div><b>Register a data source</b><small>Connect PostgreSQL or import a CSV file.</small></div><ArrowUpRight size={16}/></div><div className="setup-step"><span>02</span><div><b>Catalog your first asset</b><small>Document ownership, schema and purpose.</small></div><ArrowUpRight size={16}/></div><div className="setup-step"><span>03</span><div><b>Run quality checks</b><small>Validate completeness, uniqueness and freshness.</small></div><ArrowUpRight size={16}/></div></div></section>
          </>}
          <footer>VERITYGRID <span>·</span> Enterprise Data Trust Platform <span className="footer-right">Signed in as {user.email}</span></footer>
        </section>
      </main>
    </div>
  );
}


function DataCatalogPage({ organizationId }: { organizationId: string }) {
  const [assets, setAssets] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [classification, setClassification] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadCatalog = useCallback(async () => {
    if (!organizationId) return;
    const headers = { "x-organization-id": organizationId };
    const [assetResult, sourceResult] = await Promise.all([
      api<{ data: { assets: any[] } }>(`/api/catalog/assets?q=${encodeURIComponent(search)}${classification ? `&classification=${classification}` : ""}`, { headers }),
      api<{ data: { sources: any[] } }>("/api/catalog/sources", { headers }),
    ]);
    setAssets(assetResult.data.assets);
    setSources(sourceResult.data.sources);
  }, [organizationId, search, classification]);

  useEffect(() => {
    let active = true;
    void loadCatalog().catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Catalog could not be loaded."); });
    return () => { active = false; };
  }, [loadCatalog]);

  async function createSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true); setError(""); setMessage("");
    const form = new FormData(formElement);
    try {
      await api("/api/catalog/sources", {
        method: "POST",
        headers: { "x-organization-id": organizationId },
        body: JSON.stringify({ name: String(form.get("sourceName") ?? "").trim(), sourceType: String(form.get("sourceType") ?? "POSTGRESQL"), description: String(form.get("sourceDescription") ?? "").trim() }),
      });
      formElement.reset();
      setMessage("Data source registered.");
      await loadCatalog();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not register source."); }
    finally { setBusy(false); }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const inputElement = event.currentTarget;
    const file = inputElement.files?.[0];
    if (!file) return;
    setBusy(true); setError(""); setMessage("");
    try {
      if (file.size > 900_000) throw new Error("Choose a file smaller than 900 KB.");
      const content = await file.text();
      const format = file.name.toLowerCase().endsWith(".csv") ? "CSV" : file.name.toLowerCase().endsWith(".json") ? "JSON" : "";
      if (!format) throw new Error("Only .csv and .json files are supported.");
      await api("/api/catalog/assets/import", {
        method: "POST",
        headers: { "x-organization-id": organizationId },
        body: JSON.stringify({ name: file.name.replace(/\.(csv|json)$/i, ""), format, content }),
      });
      setMessage(`${file.name} imported successfully.`);
      await loadCatalog();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Import failed."); }
    finally { setBusy(false); inputElement.value = ""; }
  }

  return (
    <div className="catalog-page">
      <div className="catalog-intro"><div><div className="eyebrow">DISCOVER & GOVERN</div><h2>Data catalog</h2><p>Register sources, import structured files and explore automatically discovered dataset schemas.</p></div><div className="catalog-import-controls"><input aria-label="Dataset owner" value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Dataset owner (optional)"/><select aria-label="Import classification" value={importClassification} onChange={(event) => setImportClassification(event.target.value)}><option value="PUBLIC">Public</option><option value="INTERNAL">Internal</option><option value="CONFIDENTIAL">Confidential</option><option value="RESTRICTED">Restricted</option></select><label className="catalog-import-button">{busy ? "Working…" : "Import CSV / JSON"}<input type="file" accept=".csv,.json,application/json,text/csv" onChange={(event) => void importFile(event)} disabled={busy}/></label></div></div>
      {message && <div className="inline-notice"><CheckCircle2 size={15}/>{message}</div>}
      {error && <div className="inline-error">{error}<button onClick={() => setError("")}>Dismiss</button></div>}
      <div className="catalog-stats"><div className="panel"><span>REGISTERED ASSETS</span><b>{assets.length}</b></div><div className="panel"><span>DATA SOURCES</span><b>{sources.length}</b></div><div className="panel"><span>CLASSIFIED DATASETS</span><b>{assets.filter((asset) => asset.classification !== "INTERNAL").length}</b></div></div>
      <section className="panel catalog-register"><div className="panel-heading"><div><h3>Register a data source</h3><p>Save a source in this workspace. Credentials are intentionally not collected in this registry form.</p></div></div><form onSubmit={createSource}><input name="sourceName" placeholder="Source name (e.g. Finance Warehouse)" minLength={2} maxLength={160} required/><select name="sourceType" defaultValue="POSTGRESQL"><option value="POSTGRESQL">PostgreSQL</option><option value="CSV">CSV collection</option><option value="JSON">JSON collection</option></select><input name="sourceDescription" placeholder="Description (optional)" maxLength={2000}/><button type="submit" disabled={busy}>{busy ? "Saving…" : "Register source"}</button></form></section>
      <section className="panel catalog-assets"><div className="panel-heading"><div><h3>Cataloged datasets</h3><p>Search by dataset name, fully qualified name or owner.</p></div><span className="catalog-count">{assets.length} shown · max 100</span></div><div className="catalog-filters"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search datasets…"/><select value={classification} onChange={(event) => setClassification(event.target.value)}><option value="">All classifications</option><option value="PUBLIC">Public</option><option value="INTERNAL">Internal</option><option value="CONFIDENTIAL">Confidential</option><option value="RESTRICTED">Restricted</option></select></div>
        {assets.length ? <div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>DATASET</th><th>SOURCE</th><th>ROWS</th><th>FIELDS</th><th>CLASSIFICATION</th><th>OWNER</th></tr></thead><tbody>{assets.map((asset) => <tr key={asset.id}><td><b>{asset.name}</b><small>{asset.fullyQualifiedName}</small></td><td>{asset.source?.name ?? "Manual"}</td><td>{asset.rowCount ?? "—"}</td><td>{Array.isArray(asset.schema) ? asset.schema.length : 0}</td><td><span className={`classification-tag ${String(asset.classification).toLowerCase()}`}>{asset.classification}</span></td><td>{asset.ownerName ?? "Unassigned"}</td></tr>)}</tbody></table></div> : <div className="catalog-empty"><Database size={24}/><b>No datasets cataloged yet</b><p>Register a source or import a CSV/JSON file to create your first dataset and discover its schema.</p></div>}
      </section>
      <section className="panel catalog-sources"><div className="panel-heading"><div><h3>Registered sources</h3><p>Organization-scoped source registry</p></div></div>{sources.length ? sources.map((source) => <div className="source-row" key={source.id}><div className="source-icon"><Database size={17}/></div><div><b>{source.name}</b><small>{source.description || source.sourceType}</small></div><span>{source._count?.assets ?? 0} assets</span></div>) : <p className="catalog-source-empty">No source connections registered.</p>}</section>
    </div>
  );
}

function AuthScreen({
  mode, setMode, onSubmit, error, notice, apiStatus, busy,
}: {
  mode: AuthMode;
  setMode: (mode: AuthMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  error: string;
  notice: string;
  apiStatus: "checking" | "online" | "offline";
  busy: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const registering = mode === "register";
  return (
    <main className="auth-page">
      <div className="auth-decoration auth-decoration-one"/><div className="auth-decoration auth-decoration-two"/>
      <section className="auth-card">
        <div className="auth-brand"><div className="brand-mark"><Boxes size={22}/></div><div><strong>veritygrid</strong><span>DATA TRUST PLATFORM</span></div></div>
        <div className="auth-eyebrow">{registering ? "CREATE YOUR WORKSPACE" : "ENTERPRISE DATA INTELLIGENCE"}</div>
        <h1>{registering ? "Start with trusted data." : "Welcome back."}</h1>
        <p className="auth-subtitle">{registering ? "Create your organization and invite your data operations journey to begin." : "Sign in to your organization's data trust command center."}</p>

        <div className="auth-tabs"><button className={!registering ? "selected" : ""} onClick={() => setMode("login")} type="button">Sign in</button><button className={registering ? "selected" : ""} onClick={() => setMode("register")} type="button">Create workspace</button></div>

        {notice && <div className="auth-success"><CheckCircle2 size={16}/>{notice}</div>}
        {error && <div className="auth-error" role="alert">{error}</div>}

        <form className="auth-form" onSubmit={onSubmit}>
          {registering && <>
            <label htmlFor="displayName">Your full name</label>
            <input id="displayName" name="displayName" type="text" placeholder="e.g. Alex Morgan" autoComplete="name" minLength={2} maxLength={120} required/>
            <label htmlFor="organizationName">Organization name</label>
            <input id="organizationName" name="organizationName" type="text" placeholder="e.g. Northstar Analytics" minLength={2} maxLength={160} required/>
          </>}
          <label htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" placeholder="you@company.com" autoComplete="email" maxLength={254} required/>
          <div className="password-label"><label htmlFor="password">Password</label>{registering && <span>At least 12 characters</span>}</div>
          <div className="password-input"><input id="password" name="password" type={showPassword ? "text" : "password"} placeholder={registering ? "Create a strong password" : "Enter your password"} autoComplete={registering ? "new-password" : "current-password"} minLength={registering ? 12 : 1} maxLength={72} required/><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17}/> : <Eye size={17}/>}</button></div>
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? "Please wait…" : registering ? "Create secure workspace" : "Sign in securely"} {busy ? <LoaderCircle className="spin" size={16}/> : <ArrowUpRight size={17}/>}</button>
        </form>

        <div className="auth-footer"><span><ShieldCheck size={14}/> Protected with secure sessions</span><span className="api-indicator"><i className={apiStatus}/> API {apiStatus}</span></div>
        <p className="auth-legal">By continuing, you agree to use VerityGrid in accordance with your organization's security policies.</p>
      </section>
      <div className="auth-side-note"><span>01 / TRUST</span><b>Reliable data starts with a clear view of what you can trust.</b><p>Catalog. Validate. Govern. Operate with confidence.</p></div>
    </main>
  );
}

function Metric({ title, value, detail, icon }: { title: string; value: string; detail: string; icon: ReactNode }) {
  return <article className="metric-card"><div className="metric-top"><span>{title}</span><i>{icon}</i></div><strong>{value}</strong><div className="metric-detail">{detail}</div><div className="metric-foot"><span>Awaiting data</span><ArrowDownRight size={14}/></div></article>;
}

export default App;
