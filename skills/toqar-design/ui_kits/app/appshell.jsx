/* Shared app chrome for Toqar UI-kit pages. Exposes AppShell + FilterChip on window. */
const LAYER_COLORS = { T: "var(--toqar-t)", O: "var(--toqar-o)", Q: "var(--toqar-q)", A: "var(--toqar-a)", R: "var(--toqar-r)" };

function Lockup() {
  const tick = { position: "absolute", bottom: 0, width: "1.5px", height: "5px", background: "var(--primary)" };
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "9px" }}>
      <svg width="24" height="24" viewBox="0 0 64 64" fill="none">
        <rect x="9" y="7" width="42" height="42" rx="9" stroke="var(--text)" strokeWidth="6"></rect>
        <rect x="42" y="40" width="16" height="16" fill="var(--primary)"></rect>
      </svg>
      <span style={{ position: "relative", fontWeight: 600, fontSize: "17px", letterSpacing: "-0.015em", lineHeight: 1, paddingBottom: "6px", display: "inline-block" }}>
        toqar
        <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "1.5px", background: "var(--border-strong)" }}>
          <span style={{ ...tick, left: 0 }} />
          <span style={{ ...tick, left: "50%" }} />
          <span style={{ ...tick, right: 0 }} />
        </span>
      </span>
    </span>
  );
}

function AppShell({ active = "Feed", tenant = "Northbeam AI", children, maxWidth = 760 }) {
  const [theme, setTheme] = React.useState(document.body.getAttribute("data-theme") || "light");
  const flip = () => {
    const next = theme === "light" ? "dark" : "light";
    document.body.setAttribute("data-theme", next);
    setTheme(next);
  };
  const NAV = ["Feed", "Registry", "Settings"];
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--text)" }}>
      <header style={{ display: "flex", alignItems: "center", gap: "20px", padding: "0 24px", height: "52px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <Lockup />
        <nav style={{ display: "flex", gap: "4px", alignSelf: "stretch" }}>
          {NAV.map(n => (
            <span key={n} style={{
              display: "inline-flex", alignItems: "center", padding: "0 10px",
              fontSize: "var(--fs-small)", fontWeight: n === active ? 600 : 400,
              color: n === active ? "var(--text)" : "var(--text-muted)",
              boxShadow: n === active ? "inset 0 -2px 0 var(--primary)" : "none",
              cursor: "default",
            }}>{n}</span>
          ))}
        </nav>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-micro)", color: "var(--text-muted)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "3px 8px", whiteSpace: "nowrap" }}>{tenant}</span>
        <button onClick={flip} title="Toggle theme" style={{ fontSize: "15px", lineHeight: 1, background: "none", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", color: "var(--text-muted)", width: "28px", height: "28px", cursor: "pointer" }}>◐</button>
      </header>
      <main style={{ maxWidth: `${maxWidth}px`, margin: "0 auto", padding: "20px 24px 48px" }}>
        {children}
      </main>
    </div>
  );
}

function FilterChip({ active, onClick, layer, mono, children }) {
  return (
    <button onClick={onClick} style={{
      display: "inline-flex", alignItems: "center", gap: "5px",
      fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
      fontSize: "var(--fs-micro)", fontWeight: 500, lineHeight: 1,
      padding: "5px 9px", borderRadius: "var(--radius-pill)", cursor: "pointer",
      background: active ? "var(--primary-soft)" : "var(--surface)",
      color: active ? "var(--primary)" : "var(--text-muted)",
      border: active ? "1px solid var(--primary)" : "1px solid var(--border)",
    }}>
      {layer ? <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: LAYER_COLORS[layer] }} /> : null}
      {children}
    </button>
  );
}

Object.assign(window, { AppShell, FilterChip, Lockup });
