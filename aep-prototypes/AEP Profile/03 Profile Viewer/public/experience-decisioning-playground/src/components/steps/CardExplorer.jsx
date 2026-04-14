import { useState, useRef, useEffect, createContext, useContext } from "react";
import {
  ChevronDown, Info, X, Layers, Target, LayoutGrid, Box, Trophy,
  ShieldCheck, Copy, LifeBuoy, Mail, Globe, AppWindow, BellRing,
  MessageSquare, Code,
} from "lucide-react";
import styles from "./CardExplorer.module.css";

/* ── Data ── */
const COMPONENTS = {
  policy: {
    type: "Container", title: "Decision Policy",
    sub: "Embedded in a campaign or journey",
    icon: "Layers", color: "#2D3142", colorLight: "#EEEEF2",
    info: {
      what: "The Decision Policy is the outermost container that ties decisioning to a specific touchpoint. It lives inside a campaign or journey action and defines which selection strategies compete to surface the best offer.",
      does: "It evaluates all attached selection strategies, collects their top-ranked items, and returns the winning offer(s) to the channel — or falls back to a safe default if nothing qualifies.",
      example: 'A telco attaches a Decision Policy to their "Monthly Upsell" email campaign. The policy evaluates three strategies — data plans, device bundles, loyalty rewards — and returns the single best offer per customer.',
    },
  },
  strategy: {
    type: "Strategy", title: "Selection Strategy",
    sub: "Defines which items compete and how they're ranked",
    icon: "Target", color: "#3D6B5E", colorLight: "#E8F2EE",
    info: {
      what: 'A Selection Strategy is a self-contained "contest" — it pulls in a pool of decision items via a Collection, filters them through Eligibility rules, and ranks the survivors using a Ranking method.',
      does: "It narrows down the full catalog to a short list of candidates, scores them, and passes the top result up to the Decision Policy for cross-strategy comparison.",
      example: 'Strategy "Premium Data Plans" pulls all items tagged category = data-plan, filters out customers already on unlimited, and uses an AI model to rank remaining plans by predicted conversion probability.',
    },
  },
  collection: {
    type: "Item Pool", title: "Collection",
    sub: "Attribute-based filter on the item catalog",
    icon: "LayoutGrid", color: "#4A72B8", colorLight: "#EBF0FA",
    info: {
      what: "A Collection is a dynamic filter that selects decision items from the catalog based on their attributes — tags, categories, or custom properties. Think of it as a smart folder that always stays current.",
      does: "It determines the starting pool of items that can compete within this strategy. Only items matching the collection's filter criteria enter the funnel.",
      example: 'A collection defined as tag = "summer-2025" AND channel = "email" automatically pulls in all summer campaign offers with email-ready creative — no manual curation needed.',
    },
  },
  items: {
    type: "Catalog Objects", title: "Decision Items",
    sub: "Individual offers or content pieces",
    icon: "Box", color: "#6B8FD4", colorLight: "#E8EEFB",
    info: {
      what: "A Decision Item is a single offer, recommendation, or content piece. Each carries attributes (category, channel, priority), eligibility rules, content representations per channel, and optional constraints like frequency capping.",
      does: "Items are the atomic unit of decisioning — they're what the customer ultimately sees. Each item can have different creative per channel (email banner vs. push text vs. web card) all managed in one place.",
      example: '"50GB Data Boost — €9.99/mo" is one decision item with an email HTML representation, a push notification variant, and a web card variant. Capping: max 3 impressions per customer per week.',
      schema: "Every Decision Item is backed by an XDM schema — the Experience Data Model that defines its data structure. To add more context or richer content to an item, you extend the schema with custom field groups. Out of the box, an item's schema includes fields like: Start Date, End Date, Hero Image URL, Thumbnail Image, Title, Subtitle, Body Copy, Call-to-Action Label, CTA Link, Channel (email / web / push / SMS), Priority, Tags, and Capping Rules. A data architect can extend this with custom attributes — e.g. Product Category, Discount Percentage, Regional Availability, or Customer Tier — which then become available for collection filters, eligibility rules, and ranking formulas.",
    },
  },
  ranking: {
    type: "Scoring", title: "Ranking Method",
    sub: "Priority, formula, or AI model",
    icon: "Trophy", color: "#BF7B3A", colorLight: "#FBF2E8",
    info: {
      what: "The Ranking Method defines how eligible items are scored and ordered. Three modes: static priority (manual rank), formula-based (attribute math), or AI-powered (auto-optimize trained model).",
      does: "After eligibility filtering, it scores every surviving item for each individual customer and returns them best-to-worst. The top-ranked item wins the strategy.",
      example: 'An AI ranking model trained on 90 days of click data predicts conversion likelihood. A premium browser sees "Unlimited" ranked #1; a price-sensitive customer sees "Budget Saver" on top.',
    },
  },
  eligibility: {
    type: "Guardrail", title: "Eligibility",
    sub: "Decision rule or audience constraint",
    icon: "ShieldCheck", color: "#8B5C8A", colorLight: "#F5ECF3",
    info: {
      what: "Eligibility rules are boolean guardrails determining whether a specific customer is allowed to see a specific item. They can be item-level decision rules or audience-based (segment membership).",
      does: "It removes items the customer shouldn't receive — for business logic (already purchased, wrong region) or compliance (age restriction, regulatory exclusion).",
      example: 'An eligibility rule on "Student Discount" checks segment = "Verified Students" AND contract renewal within 60 days. Anyone outside never sees the offer.',
    },
  },
  strategyN: {
    type: "Strategy", title: "Strategy 2 … N",
    sub: "Same structure, different item pool and ranking",
    icon: "Copy", color: "#3D6B5E", colorLight: "#E8F2EE", dashed: true,
    info: {
      what: 'Multiple strategies let you run different "contests" in parallel — one for product offers, another for content recommendations, a third for loyalty rewards.',
      does: "Each strategy surfaces its single best item. The Decision Policy compares winners across strategies — a tournament of tournaments.",
      example: "An organization runs Strategy A (next-best-offer by AI), Strategy B (priority-ranked catalog items), Strategy C (formula-ranked bundles). The Policy picks the single best across all three.",
    },
  },
  fallback: {
    type: "Safety Net", title: "Fallback Offer",
    sub: "Shown when no strategy returns a qualifying item",
    icon: "LifeBuoy", color: "#909090", colorLight: "#F2F2F2", dashed: true,
    info: {
      what: "A Fallback Offer has no eligibility constraints and fires whenever every strategy comes up empty. It ensures no customer ever sees a blank slot.",
      does: "It catches edge cases: new customers with no behavioral data, exhausted capping limits, or unusual profiles no strategy anticipated.",
      example: '"Discover Our Latest Features" — a brand-awareness offer relevant to everyone, ensuring the email slot is never empty.',
    },
  },
};

const CHANNELS = [
  { id: "email", label: "Email", icon: "Mail", color: "#2D3142",
    info: { what: "Personalized offer blocks inside AJO email campaigns.", does: "The decisioning engine fills a template placeholder at send time — each recipient gets the offer most relevant to them.", example: 'A weekly newsletter has an "Offer of the Week" block. Each recipient sees a different offer — one gets a data plan upgrade, another a loyalty reward.' } },
  { id: "web", label: "Web", icon: "Globe", color: "#2D3142",
    info: { what: "Real-time decisions delivered via Adobe Web SDK.", does: "Offers are injected into the page as the customer browses — hero banners, inline cards, or modal overlays.", example: 'A returning telco customer sees "Welcome Back — Upgrade to 5G" as the homepage hero instead of the generic banner.' } },
  { id: "app", label: "App", icon: "AppWindow", color: "#2D3142",
    info: { what: "In-app messages and content cards within mobile applications.", does: "The decisioning engine delivers personalized offers directly inside the app experience — banners, interstitials, or native content cards triggered by user behavior.", example: 'A banking app customer who just completed a transfer sees an in-app card: "You qualify for our Premium Cashback Card" — surfaced by the Decision Policy based on their transaction patterns.' } },
  { id: "push", label: "Push", icon: "BellRing", color: "#2D3142",
    info: { what: "Mobile push notifications with personalized offers.", does: "Push campaigns in AJO include a decisioning action. The winning item's push representation is assembled and delivered to the device.", example: 'A customer who abandoned their cart 2 hours ago gets a push: "Free Express Shipping" — selected by the Decision Policy in real time.' } },
  { id: "sms", label: "SMS", icon: "MessageSquare", color: "#2D3142",
    info: { what: "Personalized text messages with offer deep links.", does: "SMS campaigns deliver the winning offer as a short message with a deep link to convert.", example: 'A high-value customer receives: "Hi Alex, your exclusive 30% upgrade offer expires tonight" with a link to the upgrade page.' } },
  { id: "code", label: "Code", icon: "Code", color: "#2D3142",
    info: { what: "Structured JSON via Edge Decisioning API for any custom channel.", does: "Any downstream system — kiosk, call center, IoT device, or custom app — can consume and render the winning offer.", example: "A call center agent's screen makes an API call when a customer dials in. The response surfaces the best retention offer as a talking-point card." } },
];

const ICON_MAP = { Layers, Target, LayoutGrid, Box, Trophy, ShieldCheck, Copy, LifeBuoy, Mail, Globe, AppWindow, BellRing, MessageSquare, Code };
function Ico({ name, size = 16, ...props }) {
  const C = ICON_MAP[name];
  return C ? <C size={size} {...props} /> : null;
}

/* ── Panel Context ── */
const PanelCtx = createContext({ activeId: null, openPanel: () => {}, closePanel: () => {} });

/* ── Detail Panel ── */
function DetailPanel({ activeId, data, onClose, isMobile }) {
  const panelRef = useRef(null);
  const isOpen = !!data;

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape" && isOpen) onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const panelContent = data ? (
    <div style={{
      width: "100%", background: "var(--surface)", borderRadius: 14,
      border: "1.5px solid var(--border)", overflow: "hidden",
      animation: "edpCardSlideIn 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
      ...(!isMobile ? { position: "sticky", top: 32 } : {}),
    }}>
      <div style={{ height: 3, background: data.color || "#2D3142" }} />

      <div style={{ padding: "18px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: data.color || "#2D3142", marginBottom: 3 }}>
            {data.type || "Channel"}
          </div>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
            {data.title || data.label}
          </div>
          {data.sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{data.sub}</div>}
        </div>
        <button onClick={onClose} className={styles.closeBtn}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-surface)"; e.currentTarget.style.borderColor = "var(--text-muted)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "var(--border)"; }}>
          <X size={13} />
        </button>
      </div>

      <div style={{ padding: "16px 18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
        {[
          { label: "What it is", text: data.info.what },
          { label: "What it does", text: data.info.does },
          { label: "Example", text: data.info.example, isEx: true },
          ...(data.info.schema ? [{ label: "Data Model · XDM Schema", text: data.info.schema, isSchema: true }] : []),
        ].map((s, i) => (
          <div key={i}>
            <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: s.isSchema ? data.color || "#6B8FD4" : "var(--text-muted)", marginBottom: 5 }}>
              {s.label}
            </div>
            <div style={{
              fontSize: 13, lineHeight: 1.65, color: "var(--text-dim)",
              ...(s.isEx ? { background: "var(--bg)", borderRadius: 8, padding: "11px 13px", borderLeft: `3px solid ${(data.color || "#2D3142")}25`, fontStyle: "italic" } : {}),
              ...(s.isSchema ? { background: "var(--surface-alt)", borderRadius: 8, padding: "11px 13px", borderLeft: `3px solid ${(data.color || "#6B8FD4")}40`, fontSize: 12.5 } : {}),
            }}>
              {s.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  if (isMobile) {
    return (
      <div style={{
        width: "100%", maxHeight: isOpen ? 800 : 0, opacity: isOpen ? 1 : 0,
        overflow: "hidden", transition: "all 0.4s cubic-bezier(0.25,0.46,0.45,0.94)",
        padding: isOpen ? "8px 0" : "0",
      }}>
        {panelContent}
      </div>
    );
  }

  return (
    <div ref={panelRef} style={{
      width: isOpen ? 340 : 0, minWidth: isOpen ? 340 : 0,
      opacity: isOpen ? 1 : 0, overflow: "hidden",
      transition: "all 0.4s cubic-bezier(0.25,0.46,0.45,0.94)", flexShrink: 0,
    }}>
      {panelContent}
    </div>
  );
}

/* ── Node Card ── */
function NodeCard({ id, children, isStrategy }) {
  const [open, setOpen] = useState(false);
  const { activeId, openPanel } = useContext(PanelCtx);
  const data = COMPONENTS[id];
  if (!data) return null;

  const hasChildren = !!children;
  const isDashed = data.dashed;
  const isActive = activeId === id;
  const bg = isStrategy ? "var(--surface-warm)" : "var(--surface)";
  const borderColor = isActive ? data.color : (isStrategy ? "var(--border-warm)" : "var(--border)");

  return (
    <div style={{
      width: "100%", background: bg,
      border: `1.5px ${isDashed ? "dashed" : "solid"} ${borderColor}`,
      borderRadius: 12, overflow: "hidden",
      opacity: isDashed ? 0.78 : 1, transition: "all 0.3s ease",
      boxShadow: isActive ? `0 0 0 2px ${data.color}18` : "none",
    }}>
      <div
        onClick={() => hasChildren && setOpen(!open)}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 13px", cursor: hasChildren ? "pointer" : "default",
          userSelect: "none", transition: "background 0.2s",
        }}
        onMouseEnter={(e) => { if (hasChildren) e.currentTarget.style.background = isStrategy ? "var(--surface-alt)" : "var(--hover-surface)"; }}
        onMouseLeave={(e) => { if (hasChildren) e.currentTarget.style.background = "transparent"; }}
      >
        <div style={{ width: 3.5, minHeight: 28, borderRadius: 3, background: data.color, opacity: isDashed ? 0.4 : 1, flexShrink: 0 }} />

        <div style={{
          width: 28, height: 28, borderRadius: 7,
          background: isStrategy ? "var(--surface-alt)" : data.colorLight,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: data.color, flexShrink: 0,
        }}>
          <Ico name={data.icon} size={14} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: data.color }}>
            {data.type}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.3, marginTop: 1 }}>
            {data.title}
          </div>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); openPanel(id, data); }}
          style={{
            width: 26, height: 26, borderRadius: "50%",
            border: `1.5px solid ${isActive ? data.color : (isStrategy ? "var(--border-warm)" : "var(--border)")}`,
            background: isActive ? data.color : "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            color: isActive ? "#ffffff" : "var(--text-muted)", fontFamily: "inherit", transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            if (!isActive) { e.currentTarget.style.background = data.color; e.currentTarget.style.borderColor = data.color; e.currentTarget.style.color = "#ffffff"; }
          }}
          onMouseLeave={(e) => {
            if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = isStrategy ? "var(--border-warm)" : "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }
          }}
        >
          <Info size={11} />
        </button>

        {hasChildren && (
          <div style={{
            color: "var(--text-muted)",
            transition: "transform 0.3s cubic-bezier(0.25,0.46,0.45,0.94)",
            transform: open ? "rotate(0deg)" : "rotate(-90deg)", flexShrink: 0,
          }}>
            <ChevronDown size={16} />
          </div>
        )}
      </div>

      {hasChildren && (
        <div style={{ maxHeight: open ? 2200 : 0, overflow: "hidden", transition: "max-height 0.5s cubic-bezier(0.25,0.46,0.45,0.94)" }}>
          <div style={{
            padding: "0 9px 9px", display: "flex", flexDirection: "column", gap: 6,
            borderTop: `1px solid ${isStrategy ? "var(--border-warm)" : "var(--border-row)"}`, paddingTop: 9,
          }}>
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Items Row ── */
function ItemsRow() {
  const { openPanel } = useContext(PanelCtx);
  return (
    <div style={{ display: "flex", gap: 5, width: "100%", padding: "2px 0" }}>
      {["Item 1", "Item 2", "Item 3", "…"].map((label, i) => (
        <div key={i}
          onClick={i < 3 ? () => openPanel("items", COMPONENTS.items) : undefined}
          style={{
            flex: 1, padding: "7px 4px", borderRadius: 7,
            border: "1px solid var(--mix-blue-18)", background: "var(--mix-blue-03)",
            fontSize: 11, fontWeight: 500, color: "var(--blue)",
            textAlign: "center", cursor: i < 3 ? "pointer" : "default", transition: "all 0.2s",
          }}
          onMouseEnter={(e) => { if (i < 3) { e.currentTarget.style.background = "var(--mix-blue-09)"; e.currentTarget.style.borderColor = "var(--blue)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--mix-blue-03)"; e.currentTarget.style.borderColor = "var(--mix-blue-18)"; }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

/* ── Connectors & layout helpers ── */
function MiniConnector() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "1px 0" }}>
      <div style={{ width: 2, height: 10, background: "var(--border)", borderRadius: 2 }} />
    </div>
  );
}

function Connector({ label }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "3px 0" }}>
      <div style={{ width: 2, height: 14, background: "var(--border)", borderRadius: 2 }} />
      {label && (
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--text-muted)", padding: "2px 0" }}>
          {label}
        </div>
      )}
      <div style={{ width: 0, height: 0, borderLeft: "4px solid transparent", borderRight: "4px solid transparent", borderTop: "5px solid var(--border)" }} />
    </div>
  );
}

function StrategyDivider() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0", width: "100%" }}>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
      <span style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, whiteSpace: "nowrap" }}>
        Parallel strategies
      </span>
      <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
    </div>
  );
}

function SideRow({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, width: "100%" }}>{children}</div>;
}

/* ── CardExplorer — the assembled interactive map ── */
export const CardExplorer = () => {
  const [panelData, setPanelData] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 780);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const openPanel = (id, data) => {
    if (activeId === id) { setPanelData(null); setActiveId(null); }
    else { setPanelData(data || COMPONENTS[id]); setActiveId(id); }
  };

  const closePanel = () => { setPanelData(null); setActiveId(null); };

  const openChannelPanel = (ch) => {
    if (activeId === ch.id) { closePanel(); }
    else { setPanelData(ch); setActiveId(ch.id); }
  };

  return (
    <PanelCtx.Provider value={{ activeId, openPanel, closePanel }}>
      <div className={styles.root}>
        {/* Hint */}
        <p className={styles.hint}>
          Click to expand layers · press{" "}
          <span className={styles.hintIcon}><Info size={9} /></span>
          {" "}to explore details
        </p>

        {/* Two-panel layout */}
        <div className={styles.layout} style={{ flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "center" : "flex-start" }}>

          {/* Left: architecture map + (mobile: panel) + channels */}
          <div className={styles.mapCol}>
            <div style={{ width: "100%", maxWidth: 560 }}>
              <NodeCard id="policy" isStrategy={false}>
                <NodeCard id="strategy" isStrategy={true}>
                  <NodeCard id="collection" />
                  <ItemsRow />
                  <MiniConnector />
                  <SideRow>
                    <NodeCard id="ranking" />
                    <NodeCard id="eligibility" />
                  </SideRow>
                </NodeCard>
                <StrategyDivider />
                <NodeCard id="strategyN" isStrategy={true} />
                <MiniConnector />
                <NodeCard id="fallback" />
              </NodeCard>
            </div>

            {isMobile && (
              <div style={{ width: "100%", maxWidth: 560 }}>
                <DetailPanel activeId={activeId} data={panelData} onClose={closePanel} isMobile={true} />
              </div>
            )}

            <Connector label="Winning offer delivered to" />

            <div className={styles.channels}>
              {CHANNELS.map((ch) => {
                const isChActive = activeId === ch.id;
                return (
                  <button key={ch.id} onClick={() => openChannelPanel(ch)} className={styles.channelBtn}
                    style={{
                      border: `1.5px solid ${isChActive ? "var(--text)" : "var(--border)"}`,
                      background: isChActive ? "var(--surface-alt)" : "var(--surface)",
                    }}
                    onMouseEnter={(e) => { if (!isChActive) { e.currentTarget.style.borderColor = "var(--text)"; e.currentTarget.style.background = "var(--surface-alt)"; } }}
                    onMouseLeave={(e) => { if (!isChActive) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--surface)"; } }}
                  >
                    <Ico name={ch.icon} size={14} strokeWidth={1.5} />
                    {ch.label}
                  </button>
                );
              })}
            </div>
          </div>

          {!isMobile && (
            <DetailPanel activeId={activeId} data={panelData} onClose={closePanel} isMobile={false} />
          )}
        </div>
      </div>
    </PanelCtx.Provider>
  );
};
