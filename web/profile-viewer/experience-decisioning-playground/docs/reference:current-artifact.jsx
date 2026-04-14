import { useState, useRef } from "react";
import {
  ChevronRight, ChevronDown, ChevronLeft, Lock, Check, X, Layers, Tag, Filter, Crown,
  ShoppingCart, Monitor, RefreshCw, ArrowRight, Plus, Package, Brain, SlidersHorizontal,
  BarChart3, Sparkles, Target, Users, User, Eye, MousePointerClick, Truck, CreditCard, Award,
  Percent, Gift, Smartphone, Bell, Laptop, BadgePercent, Shirt, Headphones, Watch, Sofa,
  Image as ImgIcon, Link, FileText, Megaphone, TrendingUp, Type, Calendar,
  Plane, Car, Factory, ShieldCheck, MessageSquare, Utensils, Code, Mail
} from "lucide-react";

/* ═══ THEME ═══ */
const FONT_SERIF = "'Source Serif 4', Georgia, serif";
const FONT_SANS = "'DM Sans', 'Helvetica Neue', sans-serif";
const FONT_MONO = "'DM Mono', Consolas, monospace";

const T = {
  bg: "#FAF9F7", sf: "#FFFFFF", sa: "#F5F3EF", sw: "#FBF8F4",
  tx: "#1B1B1B", tm: "#807872", ac: "#EB1000",
  as: "#FFF0EE", bd: "#E8E4DF", gn: "#2D9D78",
  bl: "#2680EB", gl: "#E68619", pu: "#7C5CFC",
  pv: "#F9F6F1", pb: "#EDE8E0"
};

const Logo = () => (
  <svg width="28" height="27" viewBox="0 0 48 47" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
    <rect width="48" height="46.8" rx="8.5" fill="#EB1000"/>
    <path d="M37.32 35.2H31.62c-.5 0-.96-.28-1.16-.76L24.28 19.96c-.04-.14-.2-.22-.34-.18-.08.02-.16.1-.18.18L19.9 29.14c-.08.16 0 .36.18.42.04.02.08.02.12.02h4.24c.26 0 .5.16.6.4l1.86 4.14c.16.38-.02.84-.4 1-.1.04-.2.06-.3.06H10.74c-.38 0-.7-.32-.7-.7 0-.1.02-.18.06-.28L19.92 10.82c.2-.5.7-.84 1.24-.82h5.66c.54 0 1.04.32 1.24.82l9.9 23.38c.16.36-.02.78-.36.92-.1.04-.18.06-.28.08Z" fill="#fff"/>
  </svg>
);

/* ═══ DATA ═══ */
const OFFERS = [
  { id:1, name:"Free Express Delivery", desc:"For VIP members on orders over €50", type:"Loyalty", priority:100, margin:"High", category:"All", color:"#D94B3F", icon:Truck, img:"https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=400&h=240&fit=crop", channels:["web","app","code"] },
  { id:2, name:"3× Loyalty Points Weekend", desc:"Earn triple points on every purchase", type:"Loyalty", priority:85, margin:"Medium", category:"All", color:"#E68619", icon:Award, img:"https://images.unsplash.com/photo-1607082349566-187342175e2f?w=400&h=240&fit=crop", channels:["web","app","email","sms"] },
  { id:3, name:"0% BNPL on Electronics", desc:"12-month interest-free financing", type:"BNPL", priority:55, margin:"Low", category:"Electronics", color:"#2680EB", icon:CreditCard, img:"https://images.unsplash.com/photo-1498049794561-7780e7231661?w=400&h=240&fit=crop", channels:["web"] },
  { id:4, name:"20% Off Running Shoes", desc:"Summer collection — limited time", type:"Discount", priority:70, margin:"Medium", category:"Footwear", color:"#2D9D78", icon:BadgePercent, img:"https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=240&fit=crop", channels:["email","web","app","push","code"] },
  { id:5, name:"Back-to-School Bundle", desc:"Stationery + backpack combo deal", type:"Bundle", priority:40, margin:"Low", category:"Stationery", color:"#7C5CFC", icon:Gift, img:"https://images.unsplash.com/photo-1452860606245-08f30b022f4f?w=400&h=240&fit=crop", channels:["web","email","sms"] },
  { id:6, name:"Premium Headphones €30 Off", desc:"Noise-cancelling, top rated", type:"Discount", priority:65, margin:"High", category:"Electronics", color:"#0D918C", icon:Headphones, img:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=240&fit=crop", channels:["web","app","code"] },
  { id:7, name:"New Collection Preview", desc:"Early access for loyalty members", type:"Exclusive", priority:50, margin:"Medium", category:"Fashion", color:"#C45BAA", icon:Shirt, img:"https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=400&h=240&fit=crop", channels:["app","push"] },
  { id:8, name:"Smart Watch Trade-In", desc:"€100 off when you trade your old device", type:"Trade-In", priority:45, margin:"High", category:"Electronics", color:"#5B7FFF", icon:Watch, img:"https://images.unsplash.com/photo-1546868871-af0de0ae72be?w=400&h=240&fit=crop", channels:["web","app","code"] },
  { id:9, name:"Home — Free Assembly", desc:"Free furniture assembly over €200", type:"Service", priority:35, margin:"Low", category:"Home", color:"#8B6914", icon:Sofa, img:"https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400&h=240&fit=crop", channels:["web","email","sms"] },
  { id:10, name:"Grocery Flash Sale — 15% Off", desc:"Fresh produce & pantry essentials today only", type:"Discount", priority:75, margin:"Medium", category:"Grocery", color:"#D4793A", icon:Utensils, img:"https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&h=240&fit=crop", channels:["email","app","push","sms"] },
];

const COLLECTIONS = [
  { name:"High-Margin Offers", rule:'margin = "High"', items:[1,6,8], info:"High profit margin offers — prioritized to maximize revenue per impression." },
  { name:"Loyalty Rewards", rule:'type IN ("Loyalty","Exclusive")', items:[1,2,7], info:"For loyalty members — builds retention and lifetime value." },
  { name:"Electronics Deals", rule:'category = "Electronics"', items:[3,6,8], info:"Electronics category — targets tech-interested shoppers." },
  { name:"Discount & Bundles", rule:'type IN ("Discount","Bundle")', items:[4,5,6,10], info:"Price-led promotions for price-sensitive segments." },
  { name:"All Active Offers", rule:"endDate > now()", items:[1,2,3,4,5,6,7,8,9,10], info:"Every offer within its validity window — broadest selection." },
];

const PROFILES = [
  { name:"Jordan", age:34, tier:"Platinum", detail:"App-first · 3-4×/mo · Electronics & Beauty", avatar:"J", cartValue:120, purchases:8, browsed:["Electronics"] },
  { name:"Riley", age:27, tier:"None", detail:"Cart abandons · Converts on promo", avatar:"R", cartValue:35, purchases:1, browsed:["Fashion"] },
  { name:"The Parkers", age:null, tier:"Silver", detail:"Weekly family shop · School list + home", avatar:"P", cartValue:95, purchases:12, browsed:["Stationery","Grocery"] },
];

const RESULTS = {
  0: [
    { oi:0, score:96, reason:"Platinum VIP + high AOV → loyalty delivery perk." },
    { oi:5, score:84, reason:"Electronics browse + high margin." },
    { oi:1, score:78, reason:"Triple points matches loyalty engagement." },
    { oi:7, score:65, reason:"Trade-in leverages electronics affinity." },
    { oi:6, score:52, reason:"Exclusive preview — relevant but lower priority." },
  ],
  1: [
    { oi:3, score:91, reason:"Footwear browse + price sensitivity → shoe discount." },
    { oi:9, score:83, reason:"Grocery flash sale — app-first promo matches deal-seeking." },
    { oi:4, score:79, reason:"Bundle triggers value-seeking behavior." },
    { oi:8, score:68, reason:"Home assembly — broad appeal." },
    { oi:2, score:61, reason:"BNPL available but low cart value." },
  ],
  2: [
    { oi:4, score:93, reason:"Back-to-school matches family shopping mission exactly." },
    { oi:9, score:86, reason:"Grocery flash sale — weekly family shop + grocery browse." },
    { oi:8, score:82, reason:"Home furniture + free assembly → household need." },
    { oi:1, score:71, reason:"Triple points for Silver-tier families." },
    { oi:3, score:58, reason:"Shoe discount — broad appeal, less targeted." },
  ],
};

const SCHEMA_TREE = [
  { id:"s3", name:"Standard Fields", group:true, standard:true, locked:true, children:[
    { id:"f15", name:"itemName", type:"String", standard:true, icon:Type, previewLabel:"Name" },
    { id:"f16", name:"priority", type:"Integer", standard:true, icon:BarChart3, previewLabel:"Priority", previewVal:"70" },
    { id:"f17", name:"startDate", type:"DateTime", standard:true, icon:Calendar, previewLabel:"Start", previewVal:"2026-04-01" },
    { id:"f18", name:"endDate", type:"DateTime", standard:true, icon:Calendar, previewLabel:"End", previewVal:"2026-08-31" },
  ]},
  { id:"s1", name:"Offer Content", group:true, custom:true, children:[
    { id:"s1a", name:"Media Assets", group:true, custom:true, children:[
      { id:"f1", name:"heroImage", type:"Asset", custom:true, icon:ImgIcon, previewLabel:"Hero Image", previewVal:"banner.jpg", visual:true },
      { id:"f2", name:"thumbnail", type:"Asset", custom:true, icon:ImgIcon, previewLabel:"Thumbnail", previewVal:"thumb.png", visual:true },
    ]},
    { id:"s1b", name:"Text Content", group:true, custom:true, children:[
      { id:"f3", name:"title", type:"String", custom:true, icon:Type, previewLabel:"Title", visual:true },
      { id:"f4", name:"description", type:"String", custom:true, icon:FileText, previewLabel:"Description", visual:true },
      { id:"f5", name:"callToAction", type:"String", custom:true, icon:MousePointerClick, previewLabel:"CTA", previewVal:"Shop Now →", visual:true },
    ]},
    { id:"s1c", name:"Navigation", group:true, custom:true, children:[
      { id:"f6", name:"webUrl", type:"String", custom:true, icon:Link, previewLabel:"Web URL", previewVal:"shop.example.com/promo", nav:true },
      { id:"f7", name:"deepLink", type:"String", custom:true, icon:Smartphone, previewLabel:"Deep Link", previewVal:"app://promo/offer", nav:true },
      { id:"f19", name:"channelType", type:"Enum", custom:true, icon:Laptop, previewLabel:"Channel", previewVal:"Web, App, Push", nav:true },
    ]},
    { id:"s1d", name:"Promo Elements", group:true, custom:true, children:[
      { id:"f8", name:"promoCode", type:"String", custom:true, icon:Tag, previewLabel:"Promo Code", previewVal:"SUMMER26", nav:true },
    ]},
  ]},
  { id:"s2", name:"Offer Metadata", group:true, custom:true, children:[
    { id:"f9", name:"contentType", type:"Enum", custom:true, icon:Megaphone, previewLabel:"Content Type", previewVal:"Promotional", meta:true },
    { id:"f10", name:"salesStage", type:"Enum", custom:true, icon:TrendingUp, previewLabel:"Sales Stage", previewVal:"Cross-sell", meta:true },
    { id:"f11", name:"journeyStage", type:"Enum", custom:true, icon:Target, previewLabel:"Journey Stage", previewVal:"Retention", meta:true },
    { id:"f12", name:"targetSegment", type:"Enum", custom:true, icon:Users, previewLabel:"Target", previewVal:"High-value", meta:true },
    { id:"f13", name:"category", type:"String", custom:true, icon:Layers, previewLabel:"Category", previewVal:"Footwear", meta:true },
    { id:"f14", name:"margin", type:"Enum", custom:true, icon:BarChart3, previewLabel:"Margin", previewVal:"Medium", meta:true },
  ]},
];

const DECISION_RULES = [
  { name:"VIP Customers Only", condition:'loyaltyTier IN ("Platinum","Gold")', icon:Crown, source:"Profile" },
  { name:"Cart Value > €80", condition:"cart.value > 80", icon:ShoppingCart, source:"Context" },
  { name:"Category Browsers", condition:'browsedCategories CONTAINS "…"', icon:Monitor, source:"Event" },
  { name:"Repeat Purchasers", condition:"purchaseCount ≥ 3 in 90d", icon:RefreshCw, source:"Computed" },
];

const RANKING_METHODS = [
  { id:"priority", name:"Item Priority", desc:"Fixed score per offer. Same for everyone.", effort:1, icon:BarChart3 },
  { id:"formula", name:"Ranking Formula", desc:"Dynamic score from item + profile + context.", effort:2, icon:SlidersHorizontal },
  { id:"ai", name:"AI Model", desc:"ML model. Per-individual propensity. Learns continuously.", effort:3, icon:Brain },
];

const STEPS = [
  { id:"intro", short:"Start" }, { id:"schema", short:"Schema" }, { id:"items", short:"Items" },
  { id:"collections", short:"Collections" }, { id:"rules", short:"Rules" }, { id:"ranking", short:"Ranking" },
  { id:"strategy", short:"Strategy" }, { id:"policy", short:"Policy" }, { id:"result", short:"Result" },
];

const INDUSTRIES = [
  { key:"retail", label:"Retail", icon:ShoppingCart },
  { key:"automotive", label:"Automotive", icon:Car },
  { key:"travel", label:"Travel", icon:Plane },
  { key:"manufacturing", label:"B2B Mfg", icon:Factory },
  { key:"insurance", label:"Insurance", icon:ShieldCheck },
];

/* ═══ SHARED UI ═══ */
const Badge = ({ children, color = T.ac }) => (
  <span style={{ display:"inline-block", padding:"2px 9px", borderRadius:20, fontSize:10, fontFamily:FONT_SANS,
    fontWeight:600, letterSpacing:"0.03em", textTransform:"uppercase", background:color+"12", color,
    border:`1px solid ${color}22`, whiteSpace:"nowrap" }}>{children}</span>
);

const Card = ({ children, style = {}, onClick, hoverable }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background:T.sf, border:`1px solid ${T.bd}`, borderRadius:12, padding:20,
        transition:"all 0.25s", cursor:onClick?"pointer":"default",
        transform:hoverable&&hovered?"translateY(-2px)":"none",
        boxShadow:hoverable&&hovered?"0 6px 20px rgba(0,0,0,0.07)":"0 1px 2px rgba(0,0,0,0.03)", ...style }}>
      {children}
    </div>
  );
};

const Label = ({ children }) => (
  <div style={{ fontFamily:FONT_MONO, fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:T.tm, marginBottom:10 }}>{children}</div>
);
const Title = ({ children }) => (
  <h1 style={{ fontFamily:FONT_SERIF, fontSize:"clamp(24px,3.5vw,36px)", fontWeight:700, color:T.tx, lineHeight:1.15, margin:"0 0 10px", letterSpacing:"-0.02em" }}>{children}</h1>
);
const Desc = ({ children }) => (
  <p style={{ fontFamily:FONT_SANS, fontSize:14.5, color:T.tm, lineHeight:1.65, margin:"0 0 24px", maxWidth:580 }}>{children}</p>
);
const Pill = ({ children, active, onClick, color = T.ac }) => (
  <button onClick={onClick} style={{ padding:"5px 13px", borderRadius:8, border:`1.5px solid ${active?color:T.bd}`,
    background:active?color+"10":"transparent", color:active?color:T.tm,
    fontFamily:FONT_SANS, fontSize:11.5, fontWeight:500, cursor:"pointer" }}>{children}</button>
);
const Tip = ({ children, title }) => (
  <div style={{ marginTop:18, padding:"13px 16px", background:T.sa, borderRadius:10, border:`1px solid ${T.bd}` }}>
    <p style={{ fontFamily:FONT_SANS, fontSize:12.5, color:T.tm, margin:0, lineHeight:1.6 }}>
      {title && <strong style={{ color:T.tx }}>{title} </strong>}{children}
    </p>
  </div>
);

/* ═══ STEP: INTRO ═══ */
const IntroStep = () => (
  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"66vh", textAlign:"center", padding:"32px 20px" }}>
    <div style={{ fontFamily:FONT_MONO, fontSize:13, letterSpacing:"0.1em", textTransform:"uppercase", color:T.tm, marginBottom:8 }}>
      A module of Adobe Journey Optimizer
    </div>
    <h1 style={{ fontFamily:FONT_SERIF, fontSize:"clamp(32px,4.5vw,48px)", fontWeight:700, color:T.tx, lineHeight:1.1, margin:"0 0 16px", letterSpacing:"-0.03em", maxWidth:640 }}>Experience Decisioning</h1>
    <p style={{ fontFamily:FONT_SANS, fontSize:16, color:T.tm, lineHeight:1.6, maxWidth:520, margin:"0 0 24px" }}>
      Your online shop runs 10 different promotions at the same time. A customer lands on your homepage — which offer should they see? Experience Decisioning answers that question automatically, for every visitor, in real time.
    </p>

    {/* Visual story: the problem → the engine → the result */}
    <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:28, flexWrap:"wrap", justifyContent:"center" }}>
      {[
        { title:"10 offers compete", sub:"for the same slot" },
        { title:"The engine evaluates", sub:"rules, ranking, context" },
        { title:"1 personalized winner", sub:"per customer, per visit" },
      ].map((box, i) => (
        <React.Fragment key={i}>
          {i > 0 && <ArrowRight size={18} color={T.tm} />}
          <div style={{ padding:"20px 28px", borderRadius:10, background:T.sf, border:`1px solid ${T.bd}`, textAlign:"center", width:200, height:90, display:"flex", flexDirection:"column", justifyContent:"center", flexShrink:0 }}>
            <div style={{ fontFamily:FONT_SANS, fontSize:14, fontWeight:600, color:T.tx }}>{box.title}</div>
            <div style={{ fontFamily:FONT_SANS, fontSize:12, color:T.tm, marginTop:4 }}>{box.sub}</div>
          </div>
        </React.Fragment>
      ))}
    </div>

    <p style={{ fontFamily:FONT_SANS, fontSize:13.5, color:T.tm, lineHeight:1.6, maxWidth:480, margin:"0 0 28px" }}>
      This interactive tutorial walks you through the full pipeline — from defining your offer schema to watching the engine rank offers differently for each customer. Everything is clickable. Explore at your own pace.
    </p>
    <div style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"center" }}>
      {STEPS.slice(1).map((s, i) => (
        <span key={s.id} style={{ padding:"4px 11px", borderRadius:7, fontFamily:FONT_MONO, fontSize:10.5, color:T.tm, background:T.sa, border:`1px solid ${T.bd}` }}>
          {String(i+1).padStart(2,"0")} {s.short}
        </span>
      ))}
    </div>
  </div>
);

/* ═══ STEP: SCHEMA ═══ */
const SchemaStep = () => {
  const offer = OFFERS[3]; // 20% off running shoes
  const [openGroups, setOpenGroups] = useState(new Set(["s3"]));
  const [enabledFields, setEnabledFields] = useState(new Set(["f15","f16","f17","f18"]));

  const toggleGroup = (id) => setOpenGroups(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const toggleField = (id) => setEnabledFields(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const expandCustom = () => {
    setOpenGroups(new Set(["s1","s1a","s1b","s1c","s1d","s2"]));
    const e = new Set(enabledFields);
    const walk = (items) => items.forEach(n => { if (n.children) walk(n.children); else if (n.custom) e.add(n.id); });
    walk(SCHEMA_TREE); setEnabledFields(e);
  };
  const expandAll = () => {
    const o = new Set(); const e = new Set(enabledFields);
    const walk = (items) => items.forEach(n => { if (n.group) o.add(n.id); if (n.children) walk(n.children); else e.add(n.id); });
    walk(SCHEMA_TREE); setOpenGroups(o); setEnabledFields(e);
  };
  const reset = () => { setOpenGroups(new Set(["s3"])); setEnabledFields(new Set(["f15","f16","f17","f18"])); };

  // Collect all leaf fields
  const allFields = [];
  const walkCollect = (items) => items.forEach(n => { if (n.children) walkCollect(n.children); else allFields.push(n); });
  walkCollect(SCHEMA_TREE);

  const activeFields = allFields.filter(f => enabledFields.has(f.id));
  const hasImage = activeFields.some(f => f.id === "f1" || f.id === "f2");
  const hasTitle = activeFields.some(f => f.id === "f3" || f.id === "f15");
  const hasDesc = activeFields.some(f => f.id === "f4");
  const hasCTA = activeFields.some(f => f.id === "f5");
  const metaFields = activeFields.filter(f => f.meta);
  const navFields = activeFields.filter(f => f.nav);
  const stdFields = activeFields.filter(f => !f.visual && !f.meta && !f.nav);

  const renderTree = (items, depth = 0) => items.map(node => {
    if (node.group) {
      const isOpen = openGroups.has(node.id);
      return (
        <div key={node.id}>
          <div onClick={() => toggleGroup(node.id)} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 6px", marginLeft:depth*16, borderRadius:6, cursor:"pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = T.sa} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {isOpen ? <ChevronDown size={11} color={T.tm}/> : <ChevronRight size={11} color={T.tm}/>}
            {node.locked && <Lock size={9} color={T.tm}/>}
            <span style={{ fontFamily:FONT_SANS, fontSize:11.5, fontWeight:600, color:T.tx }}>{node.name}</span>
            {node.custom && <span style={{ fontFamily:FONT_MONO, fontSize:8, color:T.ac, background:T.as, padding:"0 4px", borderRadius:3 }}>custom</span>}
          </div>
          {isOpen && <div style={{ borderLeft:`1px solid ${T.bd}`, marginLeft:depth*16+14 }}>{renderTree(node.children, depth+1)}</div>}
        </div>
      );
    }
    const Icon = node.icon;
    const isOn = enabledFields.has(node.id);
    const fieldColor = isOn ? T.tx : T.bd;
    return (
      <div key={node.id} onClick={() => toggleField(node.id)}
        style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 6px", marginLeft:depth*16, borderRadius:5, cursor:"pointer", opacity:isOn?1:0.4 }}
        onMouseEnter={e => e.currentTarget.style.background = T.sa} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{ width:15, height:15, borderRadius:3, border:`1.5px solid ${isOn?T.tx:T.bd}`,
          background:isOn?T.tx:"transparent", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
          {isOn && <Check size={9} color="#fff" strokeWidth={3}/>}
        </div>
        <Icon size={11} color={isOn ? T.tx : T.tm}/>
        <span style={{ fontFamily:FONT_MONO, fontSize:11, color:T.tx }}>{node.name}</span>
        <span style={{ fontFamily:FONT_MONO, fontSize:8.5, padding:"0 4px", borderRadius:3, background:T.sa, color:T.tm }}>{node.type}</span>
      </div>
    );
  });

  return (
    <div>
      <Label>Step 01 — The Blueprint</Label>
      <Title>Offer Schema</Title>
      <Desc>Toggle fields on and off — watch the offer preview build up on the right. Fields marked "custom" are attributes you define for your business needs.</Desc>
      <div style={{ display:"flex", gap:7, marginBottom:16, flexWrap:"wrap" }}>
        <Pill onClick={reset} color={T.tm}>Reset</Pill>
        <Pill onClick={expandCustom} color={T.ac}>Enable Custom</Pill>
        <Pill onClick={expandAll} color={T.bl}>Enable All</Pill>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1.1fr 1fr", gap:20, alignItems:"start" }}>
        <Card style={{ padding:14, maxHeight:520, overflow:"auto" }}>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:10, paddingBottom:8, borderBottom:`1px solid ${T.bd}` }}>
            <Layers size={13} color={T.tm}/><span style={{ fontFamily:FONT_SANS, fontSize:11, fontWeight:600, color:T.tx }}>XDM Schema</span>
            <span style={{ fontFamily:FONT_MONO, fontSize:8, color:T.tm, marginLeft:"auto" }}>Toggle fields</span>
          </div>
          {renderTree(SCHEMA_TREE)}
        </Card>
        <div style={{ position:"sticky", top:128 }}>
          {/* Offer visual preview */}
          <Card style={{ background:T.pv, borderColor:T.pb, padding:0, overflow:"hidden" }}>
            <div style={{ padding:"10px 14px 6px", display:"flex", justifyContent:"space-between" }}>
              <Label>Offer Preview</Label>
              <span style={{ fontFamily:FONT_MONO, fontSize:9, color:T.tm }}>{activeFields.length}/{allFields.length}</span>
            </div>
            {activeFields.length === 0 ? (
              <div style={{ textAlign:"center", padding:"36px 20px" }}>
                <Eye size={22} color={T.bd}/><p style={{ fontFamily:FONT_SANS, fontSize:11, color:T.tm, marginTop:6 }}>Toggle fields to build the preview</p>
              </div>
            ) : (
              <div>
                {hasImage && <div style={{ height:130, overflow:"hidden" }}><img src={offer.img} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }}/></div>}
                <div style={{ padding:"12px 14px" }}>
                  {hasTitle && <div style={{ fontFamily:FONT_SANS, fontSize:15, fontWeight:700, color:T.tx, marginBottom:3 }}>{offer.name}</div>}
                  {hasDesc && <div style={{ fontFamily:FONT_SANS, fontSize:12, color:T.tm, marginBottom:8 }}>{offer.desc}</div>}
                  {hasCTA && <div style={{ display:"inline-block", padding:"6px 16px", borderRadius:8, background:offer.color, color:"#fff", fontFamily:FONT_SANS, fontSize:11, fontWeight:600 }}>Shop Now →</div>}
                </div>
              </div>
            )}
          </Card>
          {/* Standard fields widget */}
          {stdFields.length > 0 && (
            <Card style={{ marginTop:8, padding:"12px 14px", background:T.sf, borderColor:T.pb }}>
              <Label>Standard Attributes</Label>
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                {stdFields.map(f => { const Icon = f.icon; return (
                  <div key={f.id} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 7px", borderRadius:5, background:T.sa, border:`1px solid ${T.bd}` }}>
                    <Icon size={10} color={T.tm}/><span style={{ fontFamily:FONT_MONO, fontSize:9.5, color:T.tm }}>{f.previewLabel}</span>
                    <span style={{ fontFamily:FONT_SANS, fontSize:10, color:T.tx, marginLeft:"auto" }}>{f.previewVal || offer.name}</span>
                  </div>
                ); })}
              </div>
            </Card>
          )}
          {/* Navigation & Delivery widget */}
          {navFields.length > 0 && (
            <Card style={{ marginTop:8, padding:"12px 14px", background:T.sf, borderColor:T.pb }}>
              <Label>Navigation & Delivery</Label>
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                {navFields.map(f => { const Icon = f.icon; return (
                  <div key={f.id} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 7px", borderRadius:5, background:T.sa, border:`1px solid ${T.bd}` }}>
                    <Icon size={10} color={T.tm}/><span style={{ fontFamily:FONT_MONO, fontSize:9.5, color:T.tm }}>{f.previewLabel}</span>
                    <span style={{ fontFamily:FONT_SANS, fontSize:10, color:T.tx, marginLeft:"auto" }}>{f.previewVal}</span>
                  </div>
                ); })}
              </div>
            </Card>
          )}
          {/* Metadata section */}
          {metaFields.length > 0 && (
            <Card style={{ marginTop:8, padding:"12px 14px", background:T.sw, borderColor:T.pb }}>
              <Label>Metadata & Classification</Label>
              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                {metaFields.map(f => { const Icon = f.icon; return (
                  <div key={f.id} style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 7px", borderRadius:5, background:T.sa, border:`1px solid ${T.bd}` }}>
                    <Icon size={10} color={T.tm}/><span style={{ fontFamily:FONT_MONO, fontSize:9.5, color:T.tm }}>{f.previewLabel}</span>
                    <span style={{ fontFamily:FONT_SANS, fontSize:10, color:T.tx, marginLeft:"auto" }}>{f.previewVal}</span>
                  </div>
                ); })}
              </div>
            </Card>
          )}
          <div style={{ marginTop:6, display:"flex", alignItems:"center", gap:6 }}>
            <div style={{ flex:1, height:3, borderRadius:2, background:T.pb, overflow:"hidden" }}>
              <div style={{ height:"100%", width:`${(activeFields.length/allFields.length)*100}%`, background:`linear-gradient(90deg,${T.ac},${T.gl})`, transition:"width 0.4s" }}/>
            </div>
            <span style={{ fontFamily:FONT_MONO, fontSize:9, color:T.tm }}>{Math.round((activeFields.length/allFields.length)*100)}%</span>
          </div>
          <Tip title="Why this matters:">Every field you enable becomes available in ranking formulas, eligibility rules, and collections. Richer schema = smarter engine.</Tip>
        </div>
      </div>
    </div>
  );
};

/* ═══ STEP: ITEMS ═══ */
const ItemsStep = () => {
  const [selected, setSelected] = useState(null);
  const [channel, setChannel] = useState("web");
  const selOffer = OFFERS.find(o => o.id === selected);

  return (
    <div>
      <Label>Step 02 — Your Offers</Label><Title>Decision Items</Title>
      <Desc>Click any offer card. Use the channel toggle to preview how it renders on web, app, or push.</Desc>
      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        {[{k:"email",ic:Mail,l:"Email"},{k:"web",ic:Laptop,l:"Web"},{k:"app",ic:Smartphone,l:"App"},{k:"push",ic:Bell,l:"Push"},{k:"sms",ic:MessageSquare,l:"SMS"},{k:"code",ic:Code,l:"Code"}].map(c => (
          <Pill key={c.k} active={channel===c.k} onClick={() => setChannel(c.k)} color={T.bl}>
            <c.ic size={12} style={{ marginRight:3, verticalAlign:"middle" }}/>{c.l}
          </Pill>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:8 }}>
          {OFFERS.map(item => {
            const Icon = item.icon; const active = selected === item.id; const hasChannel = item.channels.includes(channel);
            return (
              <Card key={item.id} hoverable onClick={() => setSelected(active ? null : item.id)}
                style={{ padding:12, borderLeft:`3px solid ${item.color}`, opacity:hasChannel?1:0.3, background:active?item.color+"05":T.sf }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                  <div style={{ width:26, height:26, borderRadius:6, background:item.color+"10", display:"flex", alignItems:"center", justifyContent:"center" }}><Icon size={13} color={item.color}/></div>
                  <div style={{ fontFamily:FONT_MONO, fontSize:13, fontWeight:700, color:item.color }}>{item.priority}</div>
                </div>
                <h3 style={{ fontFamily:FONT_SANS, fontSize:11, fontWeight:600, color:T.tx, margin:"0 0 3px", lineHeight:1.3 }}>{item.name}</h3>
                <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                  <Badge color={item.color}>{item.type}</Badge>
                  {!hasChannel && <Badge color={T.tm}>No {channel}</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
        <div style={{ position:"sticky", top:128 }}>
          {selOffer ? (
            <Card style={{ padding:0, overflow:"hidden" }}>
              <div style={{ background:(channel==="push"||channel==="sms"||channel==="code")?"#1B1B1B":T.sa, padding:(channel==="push"||channel==="sms"||channel==="code")?16:channel==="email"?0:channel==="app"?"12px 36px 0":0 }}>
                {channel === "email" ? (
                  <div style={{ background:T.sf, overflow:"hidden" }}>
                    <div style={{ background:selOffer.color, padding:"12px 16px", display:"flex", alignItems:"center", gap:6 }}>
                      <div style={{ width:16, height:16, borderRadius:3, background:"#ffffff30", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {(() => { const I = selOffer.icon; return <I size={10} color="#fff"/>; })()}
                      </div>
                      <span style={{ fontFamily:FONT_SANS, fontSize:10, fontWeight:600, color:"#fff" }}>Your Store</span>
                    </div>
                    <div style={{ padding:"16px" }}>
                      <div style={{ fontFamily:FONT_SANS, fontSize:10, color:T.tm, marginBottom:8 }}>Subject: {selOffer.name} — Just for you</div>
                      <div style={{ fontFamily:FONT_SERIF, fontSize:18, fontWeight:700, color:T.tx, marginBottom:6 }}>{selOffer.name}</div>
                      <div style={{ fontFamily:FONT_SANS, fontSize:12, color:T.tm, marginBottom:12, lineHeight:1.5 }}>{selOffer.desc}. Don't miss out — this offer is available for a limited time only.</div>
                      <div style={{ display:"inline-block", padding:"8px 20px", borderRadius:6, background:selOffer.color, color:"#fff", fontFamily:FONT_SANS, fontSize:11, fontWeight:600 }}>Shop Now →</div>
                      <div style={{ marginTop:14, paddingTop:10, borderTop:`1px solid ${T.bd}`, fontFamily:FONT_SANS, fontSize:8, color:T.tm }}>You're receiving this because you opted into marketing emails. Unsubscribe</div>
                    </div>
                  </div>
                ) : channel === "push" ? (
                  <div style={{ background:"#2a2a2a", borderRadius:6, padding:"12px 14px", border:"1px solid #333" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                      <div style={{ width:18, height:18, borderRadius:4, background:selOffer.color+"20", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {(() => { const I = selOffer.icon; return <I size={10} color={selOffer.color}/>; })()}
                      </div>
                      <span style={{ fontFamily:FONT_SANS, fontSize:9, color:"#999" }}>Your Store · now</span>
                    </div>
                    <div style={{ fontFamily:FONT_SANS, fontSize:12, fontWeight:600, color:"#fff" }}>{selOffer.name}</div>
                    <div style={{ fontFamily:FONT_SANS, fontSize:10, color:"#aaa", marginTop:2 }}>{selOffer.desc}</div>
                  </div>
                ) : channel === "sms" ? (
                  <div style={{ background:"#2a2a2a", borderRadius:6, padding:"14px 16px", border:"1px solid #333", maxWidth:280 }}>
                    <div style={{ background:"#363636", borderRadius:12, padding:"10px 14px", marginBottom:6 }}>
                      <div style={{ fontFamily:FONT_SANS, fontSize:11.5, color:"#eee", lineHeight:1.5 }}>
                        {selOffer.name}: {selOffer.desc}. Reply STOP to opt out.
                      </div>
                    </div>
                    <div style={{ fontFamily:FONT_MONO, fontSize:9, color:"#666", textAlign:"center" }}>SMS · Your Store</div>
                  </div>
                ) : channel === "code" ? (
                  <div style={{ background:"#1e1e1e", borderRadius:4, padding:"16px", border:"1px solid #333" }}>
                    <div style={{ fontFamily:FONT_MONO, fontSize:9, color:"#666", marginBottom:10 }}>// JSON payload — Code-Based Experience</div>
                    <pre style={{ fontFamily:FONT_MONO, fontSize:10.5, color:"#d4d4d4", lineHeight:1.8, margin:0, whiteSpace:"pre-wrap" }}>{
`{
  "name": "${selOffer.name}",
  "description": "${selOffer.desc}",
  "type": "${selOffer.type}",
  "priority": ${selOffer.priority},
  "cta": "Shop Now →",
  "imageUrl": "https://cdn.store.com/...",
  "surface": "web://store.com/#hero-banner"
}`
                    }</pre>
                  </div>
                ) : (
                  <div style={{ borderRadius:channel==="app"?"4px 4px 0 0":0, overflow:"hidden", border:channel==="app"?`1px solid ${T.bd}`:"none" }}>
                    <img src={selOffer.img} alt="" style={{ width:"100%", height:150, objectFit:"cover", display:"block" }}/>
                    <div style={{ padding:"12px 14px", background:T.sf }}>
                      <div style={{ fontFamily:FONT_SANS, fontSize:14, fontWeight:700, color:T.tx }}>{selOffer.name}</div>
                      <div style={{ fontFamily:FONT_SANS, fontSize:11, color:T.tm, margin:"3px 0 8px" }}>{selOffer.desc}</div>
                      <div style={{ display:"inline-block", padding:"6px 14px", borderRadius:7, background:selOffer.color, color:"#fff", fontFamily:FONT_SANS, fontSize:10, fontWeight:600 }}>Shop Now →</div>
                    </div>
                  </div>
                )}
              </div>
              <div style={{ padding:"10px 14px", borderTop:`1px solid ${T.bd}` }}>
                <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                  <Badge color={selOffer.color}>{selOffer.type}</Badge>
                  <Badge color={T.tm}>{selOffer.margin} margin</Badge>
                  <Badge color={T.tm}>{selOffer.category}</Badge>
                </div>
              </div>
            </Card>
          ) : (
            <Card style={{ background:T.sa, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:280 }}>
              <MousePointerClick size={22} color={T.bd}/>
              <p style={{ fontFamily:FONT_SANS, fontSize:11, color:T.tm, textAlign:"center", marginTop:6 }}>Click an offer to preview</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

/* ═══ STEP: COLLECTIONS ═══ */
const CollectionsStep = () => {
  const [active, setActive] = useState(4);
  const col = COLLECTIONS[active];
  return (
    <div>
      <Label>Step 03 — Organize</Label><Title>Collections</Title>
      <Desc>Collections group items using schema attribute filters — like smart folders. Switch between them to see which offers match.</Desc>
      <div style={{ display:"flex", gap:7, marginBottom:18, flexWrap:"wrap" }}>
        {COLLECTIONS.map((c, i) => <Pill key={c.name} active={active===i} onClick={() => setActive(i)}>{c.name}</Pill>)}
      </div>
      <Card>
        <div style={{ marginBottom:12, paddingBottom:10, borderBottom:`1px solid ${T.bd}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:5 }}>
            <Filter size={13} color={T.ac}/>
            <code style={{ fontFamily:FONT_MONO, fontSize:11.5, color:T.ac, background:T.as, padding:"2px 9px", borderRadius:5 }}>{col.rule}</code>
          </div>
          <p style={{ fontFamily:FONT_SANS, fontSize:11.5, color:T.tm, margin:0 }}>{col.info}</p>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
          {OFFERS.map(item => {
            const match = col.items.includes(item.id); const Icon = item.icon;
            return (
              <div key={item.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"7px 9px", borderRadius:7,
                background:match?item.color+"06":T.sa, border:`1px solid ${match?item.color+"18":T.bd}`, opacity:match?1:0.25 }}>
                <Icon size={13} color={match?item.color:T.tm}/>
                <span style={{ fontFamily:FONT_SANS, fontSize:11, fontWeight:500, color:T.tx, flex:1 }}>{item.name}</span>
                {match && <Badge color={T.gn}>Match</Badge>}
              </div>
            );
          })}
        </div>
      </Card>
      <Tip title="How filters work:">The rule uses schema attributes (margin, category, type) to decide membership. New offers matching the rule are included automatically.</Tip>
    </div>
  );
};

/* ═══ STEP: RULES ═══ */
const PEOPLE_TOTAL = 30;
// Each rule's pass-through rate (percentage of audience that qualifies)
const RULE_RATES = [0.20, 0.50, 0.70, 0.40]; // VIP:20%, Cart:50%, Browsers:70%, Repeat:40%

const RulesStep = () => {
  const [activeRules, setActiveRules] = useState([]);
  const toggleRule = (i) => setActiveRules(v => v.includes(i) ? v.filter(x => x !== i) : [...v, i]);

  // Multiply pass-through rates for all active rules
  const combinedRate = activeRules.length === 0 ? 1 : activeRules.reduce((acc, i) => acc * RULE_RATES[i], 1);
  const eligibleCount = Math.max(1, Math.round(PEOPLE_TOTAL * combinedRate));
  const pct = Math.round((eligibleCount / PEOPLE_TOTAL) * 100);

  // Profile evaluation
  const profileEval = (p) => DECISION_RULES.map((rule, i) => {
    if (!activeRules.includes(i)) return null;
    let pass;
    switch(i) {
      case 0: pass = p.tier === "Platinum" || p.tier === "Gold"; break;
      case 1: pass = p.cartValue > 80; break;
      case 2: pass = p.browsed.length > 0; break;
      case 3: pass = p.purchases >= 3; break;
      default: pass = false;
    }
    return { name: rule.name, pass };
  }).filter(Boolean);

  return (
    <div>
      <Label>Step 04 — Who Qualifies</Label>
      <Title>Decision Rules</Title>
      <Desc>Rules are reusable eligibility conditions. You define them once, then plug them into your selection strategies. Each rule narrows the audience — toggle them on and watch who's left.</Desc>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1.2fr", gap:24 }}>
        {/* Left: Rules */}
        <div>
          <Label>Toggle rules to narrow the audience</Label>
          {DECISION_RULES.map((rule, i) => {
            const on = activeRules.includes(i); const Icon = rule.icon;
            const rulePercent = Math.round(RULE_RATES[i] * 100);
            return (
              <Card key={rule.name} hoverable onClick={() => toggleRule(i)}
                style={{ padding:"12px 14px", marginBottom:6, borderLeft:`3px solid ${on ? T.gn : T.bd}` }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <Icon size={15} color={on ? T.gn : T.tm}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontFamily:FONT_SANS, fontSize:12.5, fontWeight:600, color:T.tx }}>
                      {rule.name}
                      <span style={{ fontFamily:FONT_MONO, fontSize:9, color:T.tm, marginLeft:6 }}>keeps ~{rulePercent}%</span>
                    </div>
                    <div style={{ fontFamily:FONT_MONO, fontSize:9, color:T.tm, marginTop:2 }}>{rule.source} · {rule.condition}</div>
                  </div>
                  <div style={{ width:22, height:22, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", background:on ? T.gn : T.bd, transition:"all 0.2s" }}>
                    {on && <Check size={12} color="#fff" strokeWidth={3}/>}
                  </div>
                </div>
              </Card>
            );
          })}
          <Tip title="Reusable:">Define a rule once, then attach it to any selection strategy. The same rule can power multiple strategies across different campaigns.</Tip>
        </div>

        {/* Right: People grid + profile check */}
        <div>
          <Label>Your audience — {eligibleCount} of {PEOPLE_TOTAL} eligible ({pct}%)</Label>
          <Card style={{ padding:16, marginBottom:12 }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(10, 1fr)", gap:6, marginBottom:14 }}>
              {Array.from({ length: PEOPLE_TOTAL }, (_, i) => {
                const isEligible = i < eligibleCount;
                return (
                  <div key={i} style={{ display:"flex", justifyContent:"center", transition:"all 0.4s ease", transitionDelay:`${i * 15}ms` }}>
                    <User size={20} color={isEligible ? T.gn : T.bd} style={{ transition:"color 0.4s ease", transitionDelay:`${i * 15}ms` }} />
                  </div>
                );
              })}
            </div>
            {/* Progress bar */}
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, height:6, borderRadius:3, background:T.bd, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:activeRules.length === 0 ? T.tx : T.gn, borderRadius:3, transition:"width 0.5s ease" }} />
              </div>
              <span style={{ fontFamily:FONT_MONO, fontSize:11, fontWeight:600, color:activeRules.length === 0 ? T.tx : T.gn, transition:"color 0.3s" }}>{pct}%</span>
            </div>
            {activeRules.length === 0 && (
              <p style={{ fontFamily:FONT_SANS, fontSize:11, color:T.tm, textAlign:"center", marginTop:8, marginBottom:0 }}>No rules active — everyone qualifies. Toggle rules on the left to narrow the audience.</p>
            )}
            {activeRules.length > 0 && eligibleCount <= 3 && (
              <p style={{ fontFamily:FONT_SANS, fontSize:11, color:T.gl, textAlign:"center", marginTop:8, marginBottom:0 }}>Very narrow audience — only the most qualified customers remain.</p>
            )}
          </Card>

          {/* Profile check */}
          <Label>How does this affect real customers?</Label>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {PROFILES.map(p => {
              const evals = profileEval(p);
              const allPass = evals.length > 0 && evals.every(e => e.pass);
              const noRules = evals.length === 0;
              return (
                <Card key={p.name} style={{ padding:"10px 14px", background:noRules ? T.sf : allPass ? T.gn+"06" : T.ac+"06", borderColor:noRules ? T.bd : allPass ? T.gn+"25" : T.ac+"25", transition:"background 0.3s, border-color 0.3s" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:28, height:28, borderRadius:"50%", background:T.bl+"14", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FONT_SANS, fontSize:11, fontWeight:700, color:T.bl, flexShrink:0 }}>{p.avatar}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontFamily:FONT_SANS, fontSize:12, fontWeight:600, color:T.tx }}>{p.name}{p.age ? `, ${p.age}` : ""} <span style={{ fontWeight:400, color:T.tm }}>· {p.tier !== "None" ? p.tier : "No tier"}</span></div>
                      {evals.length > 0 && (
                        <div style={{ display:"flex", gap:8, marginTop:3, flexWrap:"wrap" }}>
                          {evals.map(e => (
                            <span key={e.name} style={{ fontFamily:FONT_MONO, fontSize:9, color:e.pass ? T.gn : T.ac, display:"flex", alignItems:"center", gap:2 }}>
                              {e.pass ? <Check size={10} strokeWidth={3}/> : <X size={10} strokeWidth={3}/>}{e.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ fontFamily:FONT_SANS, fontSize:10, fontWeight:600, color:noRules ? T.tm : allPass ? T.gn : T.ac, flexShrink:0 }}>
                      {noRules ? "—" : allPass ? "Eligible" : "Excluded"}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ═══ STEP: RANKING ═══ */
const RankingStep = () => {
  const [method, setMethod] = useState("priority");
  const [sliders, setSliders] = useState(Object.fromEntries(OFFERS.map(o => [o.id, o.priority])));
  const [boost, setBoost] = useState(30);
  const [aiSeed, setAiSeed] = useState(0);

  const ranked = [...OFFERS].map(item => {
    let score;
    if (method === "priority") score = sliders[item.id] || item.priority;
    else if (method === "formula") score = item.priority + (item.margin === "High" ? boost : item.margin === "Medium" ? Math.round(boost * 0.5) : 0);
    else { const seeds = [[96,78,51,91,42,84,60,65,38,73],[88,55,92,71,79,60,45,82,63,86],[72,81,45,58,93,68,50,44,82,77]]; score = seeds[aiSeed % 3][(item.id - 1) % 10]; }
    return { ...item, score };
  }).sort((a, b) => b.score - a.score);

  return (
    <div>
      <Label>Step 05 — The Engine</Label><Title>Ranking Methods</Title>
      <Desc>Pick a method and see all 10 offers re-rank live.</Desc>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:20 }}>
        {RANKING_METHODS.map(m => {
          const Icon = m.icon;
          return (
            <Card key={m.id} hoverable onClick={() => setMethod(m.id)}
              style={{ padding:14, borderTop:`3px solid ${method===m.id?T.ac:"transparent"}`, background:method===m.id?T.as:T.sf }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                <Icon size={15} color={method===m.id?T.ac:T.tm}/>
                <div style={{ display:"flex", gap:2 }}>{[1,2,3].map(n => <div key={n} style={{ width:5, height:5, borderRadius:"50%", background:n<=m.effort?(method===m.id?T.ac:T.tm):T.bd }}/>)}</div>
              </div>
              <h3 style={{ fontFamily:FONT_SANS, fontSize:12, fontWeight:600, color:T.tx, margin:"0 0 2px" }}>{m.name}</h3>
              <p style={{ fontFamily:FONT_SANS, fontSize:10, color:T.tm, margin:0, lineHeight:1.5 }}>{m.desc}</p>
            </Card>
          );
        })}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:18, alignItems:"stretch" }}>
        <Card style={{ overflow:"auto" }}>
          {method === "priority" && <>
            {OFFERS.map(item => {
            const Icon = item.icon;
            return (
              <div key={item.id} style={{ marginBottom:9 }}>
                <div style={{ display:"flex", alignItems:"center", gap:4, marginBottom:2 }}>
                  <Icon size={11} color={item.color}/>
                  <span style={{ fontFamily:FONT_SANS, fontSize:10.5, color:T.tx, flex:1 }}>{item.name.length > 24 ? item.name.slice(0,24) + "…" : item.name}</span>
                  <span style={{ fontFamily:FONT_MONO, fontSize:12, fontWeight:700, color:item.color }}>{sliders[item.id]}</span>
                </div>
                <input type="range" min={0} max={100} value={sliders[item.id]} onChange={e => setSliders(p => ({...p, [item.id]: +e.target.value}))} style={{ width:"100%", accentColor:item.color }}/>
              </div>
            );
          })}
          </>}
          {method === "formula" && <>
            <Label>Formula</Label>
            <div style={{ padding:10, background:T.sa, borderRadius:7, marginBottom:10, fontFamily:FONT_MONO, fontSize:11, lineHeight:2 }}>
              <span style={{ color:T.ac, fontWeight:600 }}>SCORE</span> = priority<br/>
              &nbsp;&nbsp;+ <span style={{ color:T.gn }}>IF</span> margin="High" → <span style={{ color:T.gl }}>+{boost}</span><br/>
              &nbsp;&nbsp;+ <span style={{ color:T.gn }}>IF</span> margin="Med" → <span style={{ color:T.gl }}>+{Math.round(boost*0.5)}</span>
            </div>
            <div style={{ fontFamily:FONT_SANS, fontSize:11, marginBottom:3 }}>Boost: <strong>{boost}</strong></div>
            <input type="range" min={0} max={60} value={boost} onChange={e => setBoost(+e.target.value)} style={{ width:"100%", accentColor:T.gl }}/>
          </>}
          {method === "ai" && <>
            <Label>AI — Personalized Optimization</Label>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:6, marginBottom:10 }}>
              {[{v:"9",l:"variants"},{v:"6mo",l:"training"},{v:"conv.",l:"goal"}].map(s => (
                <div key={s.l} style={{ textAlign:"center", padding:10, background:T.sa, borderRadius:7 }}>
                  <div style={{ fontFamily:FONT_SERIF, fontSize:18, fontWeight:700 }}>{s.v}</div>
                  <div style={{ fontFamily:FONT_MONO, fontSize:8, color:T.tm }}>{s.l}</div>
                </div>
              ))}
            </div>
            <button onClick={() => setAiSeed(s => s+1)} style={{ width:"100%", padding:10, borderRadius:7, background:T.ac, fontFamily:FONT_SANS, fontSize:11, fontWeight:600, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
              <Sparkles size={13}/>Simulate Visitor
            </button>
          </>}
        </Card>
        <Card style={{ overflow:"hidden" }}>
          <Label>Ranking</Label>
          <div style={{ position:"relative", height: ranked.length * 40 }}>
            {ranked.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={item.id} style={{
                  position:"absolute", left:0, right:0, height:36,
                  transform:`translateY(${i * 40}px)`,
                  transition:"transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease",
                  zIndex: i === 0 ? 2 : 1,
                  display:"flex", alignItems:"center", gap:7, padding:"6px 9px", borderRadius:7,
                  background: i === 0 ? item.color+"08" : T.sf,
                  borderLeft:`3px solid ${i < 3 ? item.color : T.bd}`,
                  border:`1px solid ${i === 0 ? item.color+"25" : T.bd}`,
                  boxShadow: i === 0 ? `0 2px 8px ${item.color}15` : "none",
                }}>
                  <div style={{
                    width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                    background:i===0?item.color:T.sa, color:i===0?"#fff":T.tm,
                    fontFamily:FONT_MONO, fontSize:10, fontWeight:700, flexShrink:0,
                    transition:"background 0.4s ease, color 0.4s ease",
                  }}>{item.score}</div>
                  <Icon size={11} color={i<3?item.color:T.tm} style={{ transition:"color 0.3s" }}/>
                  <span style={{ fontFamily:FONT_SANS, fontSize:10.5, fontWeight:i<3?600:400, color:i<3?T.tx:T.tm, flex:1, transition:"color 0.3s, font-weight 0.3s" }}>
                    {item.name.length > 20 ? item.name.slice(0,20) + "…" : item.name}
                  </span>
                  {i === 0 && <Badge color={T.gn}>Win</Badge>}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
      {method === "priority" && (
        <Tip title="Schema priority vs. Priority ranking — what's the difference?">
          The <strong>schema priority</strong> is a default score you set once per offer — it's the item's baseline importance. The <strong>priority ranking method</strong> uses that score at decision time to pick the highest-priority offer. When you choose a Formula or AI model instead, the schema priority can still be an input — but it's combined with other signals rather than being the sole decider. <strong>What if both exist?</strong> The ranking method always wins. If you set schema priority to 100 on an offer but the Formula computes a score of 40 (because of low margin or poor context fit), the offer ranks at 40 — not 100. The schema priority only acts as the sole decider when "Item Priority" is explicitly selected as the ranking method.
        </Tip>
      )}
    </div>
  );
};

/* ═══ STEP: STRATEGY ═══ */
const AUDIENCES = [
  { name:"High-Value Shoppers", icon:Crown, desc:"LTV > €500" },
  { name:"Newsletter Subscribers", icon:Megaphone, desc:"Opted-in to email" },
  { name:"Mobile App Users", icon:Smartphone, desc:"Active in last 30d" },
];

const StrategyStep = () => {
  const [colIdx, setColIdx] = useState(4);
  const [eligType, setEligType] = useState("rule"); // "rule" or "audience"
  const [ruleIdx, setRuleIdx] = useState(0);
  const [audIdx, setAudIdx] = useState(0);
  const [rankId, setRankId] = useState("priority");

  const eligLabel = eligType === "rule" ? DECISION_RULES[ruleIdx].name : AUDIENCES[audIdx].name;

  return (
    <div>
      <Label>Step 06 — Assemble</Label><Title>Selection Strategy</Title>
      <Desc>Combine a collection, eligibility constraint, and ranking method into one reusable strategy.</Desc>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
        {/* Column 1: Collection */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:6 }}>
            <div style={{ width:18, height:18, borderRadius:"50%", background:T.ac, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FONT_MONO, fontSize:9, fontWeight:700 }}>1</div>
            <span style={{ fontFamily:FONT_SANS, fontSize:11, fontWeight:600 }}>Collection</span>
          </div>
          {COLLECTIONS.map((c, i) => (
            <div key={c.name} onClick={() => setColIdx(i)} style={{ padding:"7px 9px", marginBottom:3, borderRadius:6, cursor:"pointer",
              background:colIdx===i?T.ac+"10":T.sf, border:`1.5px solid ${colIdx===i?T.ac:T.bd}`,
              fontFamily:FONT_SANS, fontSize:11, color:colIdx===i?T.ac:T.tx, fontWeight:colIdx===i?600:400 }}>
              {c.name}
            </div>
          ))}
        </div>

        {/* Column 2: Eligibility — rules OR audiences */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:6 }}>
            <div style={{ width:18, height:18, borderRadius:"50%", background:T.gl, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FONT_MONO, fontSize:9, fontWeight:700 }}>2</div>
            <span style={{ fontFamily:FONT_SANS, fontSize:11, fontWeight:600 }}>Eligibility</span>
          </div>
          <div style={{ display:"flex", gap:4, marginBottom:6 }}>
            <Pill active={eligType==="rule"} onClick={() => setEligType("rule")} color={T.gl}>Rules</Pill>
            <Pill active={eligType==="audience"} onClick={() => setEligType("audience")} color={T.gl}>Audiences</Pill>
          </div>
          {eligType === "rule" ? DECISION_RULES.map((r, i) => {
            const Icon = r.icon;
            return (
              <div key={r.name} onClick={() => setRuleIdx(i)} style={{ padding:"7px 9px", marginBottom:3, borderRadius:6, cursor:"pointer",
                background:ruleIdx===i?T.gl+"10":T.sf, border:`1.5px solid ${ruleIdx===i?T.gl:T.bd}`,
                fontFamily:FONT_SANS, fontSize:11, color:ruleIdx===i?T.gl:T.tx, fontWeight:ruleIdx===i?600:400, display:"flex", alignItems:"center", gap:5 }}>
                <Icon size={11} color={ruleIdx===i?T.gl:T.tm}/>{r.name}
              </div>
            );
          }) : AUDIENCES.map((a, i) => {
            const Icon = a.icon;
            return (
              <div key={a.name} onClick={() => setAudIdx(i)} style={{ padding:"7px 9px", marginBottom:3, borderRadius:6, cursor:"pointer",
                background:audIdx===i?T.gl+"10":T.sf, border:`1.5px solid ${audIdx===i?T.gl:T.bd}`,
                fontFamily:FONT_SANS, fontSize:11, color:audIdx===i?T.gl:T.tx, fontWeight:audIdx===i?600:400, display:"flex", alignItems:"center", gap:5 }}>
                <Icon size={11} color={audIdx===i?T.gl:T.tm}/>{a.name}
                <span style={{ fontFamily:FONT_MONO, fontSize:8, color:T.tm, marginLeft:"auto" }}>{a.desc}</span>
              </div>
            );
          })}
        </div>

        {/* Column 3: Ranking */}
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:6 }}>
            <div style={{ width:18, height:18, borderRadius:"50%", background:T.gn, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FONT_MONO, fontSize:9, fontWeight:700 }}>3</div>
            <span style={{ fontFamily:FONT_SANS, fontSize:11, fontWeight:600 }}>Ranking</span>
          </div>
          {RANKING_METHODS.map(m => {
            const Icon = m.icon;
            return (
              <div key={m.name} onClick={() => setRankId(m.id)} style={{ padding:"7px 9px", marginBottom:3, borderRadius:6, cursor:"pointer",
                background:rankId===m.id?T.gn+"10":T.sf, border:`1.5px solid ${rankId===m.id?T.gn:T.bd}`,
                fontFamily:FONT_SANS, fontSize:11, color:rankId===m.id?T.gn:T.tx, fontWeight:rankId===m.id?600:400, display:"flex", alignItems:"center", gap:5 }}>
                <Icon size={11} color={rankId===m.id?T.gn:T.tm}/>{m.name}
              </div>
            );
          })}
        </div>
      </div>
      <Card style={{ background:T.sa, padding:"12px 14px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
          <Badge color={T.ac}>{COLLECTIONS[colIdx].name}</Badge>
          <ArrowRight size={12} color={T.bd}/>
          <Badge color={T.gl}>{eligLabel}</Badge>
          <ArrowRight size={12} color={T.bd}/>
          <Badge color={T.gn}>{RANKING_METHODS.find(m => m.id === rankId).name}</Badge>
        </div>
      </Card>
      <Tip title="Rules vs. Audiences:">A rule evaluates conditions in real time for each individual (e.g. cart value right now). An audience is a pre-built segment from Adobe Experience Platform (e.g. all high-value shoppers). Both achieve the same goal — controlling who's eligible.</Tip>
    </div>
  );
};

/* ═══ STEP: POLICY ═══ */
const PolicyStep = () => {
  const [strategies, setStrategies] = useState([{ name:"Primary Strategy", rank:"Formula" }]);
  const [numItems, setNumItems] = useState(3);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <Label>Step 07 — Bring It Together</Label><Title>Decision Policy</Title>
      <Desc>The policy is embedded in a campaign or journey. It sequences strategies, sets return count, and defines a fallback.</Desc>
      <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:18 }}>
        <div>
          <Label>Strategy sequence</Label>
          {strategies.map((s, i) => (
            <Card key={i} style={{ marginBottom:5, borderLeft:`3px solid ${i===0?T.ac:T.bl}`, padding:"12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <div style={{ width:18, height:18, borderRadius:"50%", background:i===0?T.ac:T.bl, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FONT_MONO, fontSize:9, fontWeight:700 }}>{i+1}</div>
                <span style={{ fontFamily:FONT_SANS, fontSize:12, fontWeight:600 }}>{s.name}</span>
                <Badge color={T.gn}>{s.rank}</Badge>
              </div>
            </Card>
          ))}
          {strategies.length < 2 && !showAdd && (
            <button onClick={() => setShowAdd(true)} style={{ width:"100%", padding:10, borderRadius:8, border:`2px dashed ${T.bd}`, background:"transparent", fontFamily:FONT_SANS, fontSize:11, color:T.tm, display:"flex", alignItems:"center", justifyContent:"center", gap:3 }}>
              <Plus size={12}/>Add strategy
            </button>
          )}
          {showAdd && (
            <button onClick={() => { setStrategies(p => [...p, {name:"Secondary", rank:"AI Model"}]); setShowAdd(false); }}
              style={{ width:"100%", padding:10, borderRadius:8, border:`2px dashed ${T.bl}`, background:T.bl+"06", fontFamily:FONT_SANS, fontSize:11, fontWeight:600, color:T.bl }}>
              Add Secondary Strategy
            </button>
          )}
          <Card style={{ marginTop:5, background:T.sa, borderStyle:"dashed", padding:"10px 14px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:5 }}>
              <Package size={12} color={T.tm}/>
              <div>
                <div style={{ fontFamily:FONT_MONO, fontSize:8, color:T.tm }}>FALLBACK</div>
                <div style={{ fontFamily:FONT_SANS, fontSize:11, color:T.tx }}>Generic offer — always available</div>
              </div>
            </div>
          </Card>
        </div>
        <div>
          <Label>Items to return</Label>
          <Card>
            <div style={{ display:"flex", gap:5 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={() => setNumItems(n)} style={{ width:36, height:36, borderRadius:8, border:`2px solid ${numItems===n?T.ac:T.bd}`,
                  background:numItems===n?T.as:"transparent", fontFamily:FONT_MONO, fontSize:14, fontWeight:700, color:numItems===n?T.ac:T.tm }}>{n}</button>
              ))}
            </div>
            <p style={{ fontFamily:FONT_SANS, fontSize:11, color:T.tm, marginTop:8 }}>Return top <strong style={{ color:T.tx }}>{numItems}</strong> offer{numItems > 1 ? "s" : ""}.</p>
          </Card>
          <Tip title="Why this matters:">A homepage hero banner needs 1 offer. A recommendation carousel might need 4. The engine ranks all eligible offers but only returns the number you specify — the rest are ready as fallbacks.</Tip>
        </div>
      </div>
    </div>
  );
};

/* ═══ STEP: RESULT ═══ */
const ResultStep = () => {
  const [profileIdx, setProfileIdx] = useState(0);
  const profile = PROFILES[profileIdx];
  const results = RESULTS[profileIdx];

  return (
    <div>
      <Label>Step 08 — See It Work</Label><Title>The Engine Decides</Title>
      <Desc>Same 10 offers, same policy. Different customer — different result. Select a profile to see the top 5.</Desc>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:18 }}>
        {PROFILES.map((p, i) => (
          <Card key={p.name} hoverable onClick={() => setProfileIdx(i)}
            style={{ borderTop:`3px solid ${profileIdx===i?T.ac:"transparent"}`, background:profileIdx===i?T.as:T.sf, padding:12 }}>
            <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
              <div style={{ width:26, height:26, borderRadius:"50%", background:T.bl+"14", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:FONT_SANS, fontSize:11, fontWeight:700, color:T.bl }}>{p.avatar}</div>
              <div>
                <div style={{ fontFamily:FONT_SANS, fontSize:11, fontWeight:600, color:T.tx }}>{p.name}</div>
                <div style={{ fontFamily:FONT_SANS, fontSize:9, color:T.tm }}>{p.tier}</div>
              </div>
            </div>
            <p style={{ fontFamily:FONT_SANS, fontSize:9, color:T.tm, margin:0 }}>{p.detail}</p>
          </Card>
        ))}
      </div>
      <Card style={{ background:T.sa, padding:20, borderColor:T.bd }}>
        <Label><span style={{ color:T.tm }}>Top 5 for {profile.name}</span></Label>
        {results.map((r, i) => {
          const offer = OFFERS[r.oi]; const Icon = offer.icon;
          const isTop = i === 0; const isMid = i < 3;
          return (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:isTop?"14px":"8px 12px", marginBottom:4, borderRadius:10,
              background:isTop?offer.color+"10":T.sf, border:`1px solid ${isTop?offer.color+"25":T.bd}` }}>
              <div style={{ width:isTop?44:32, height:isTop?44:32, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center",
                background:isTop?offer.color:isMid?T.bd+"80":T.bd+"50", flexShrink:0 }}>
                <Icon size={isTop?20:14} color={isTop?"#fff":T.tm}/>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontFamily:FONT_SANS, fontSize:isTop?14:11.5, fontWeight:600, color:isTop?T.tx:isMid?T.tx:T.tm }}>{offer.name}</div>
                <div style={{ fontFamily:FONT_SANS, fontSize:isTop?10.5:9.5, color:T.tm, marginTop:1 }}>{r.reason}</div>
              </div>
              <div style={{ fontFamily:FONT_MONO, fontSize:isTop?18:13, fontWeight:700, color:isTop?offer.color:isMid?T.tx:T.tm, flexShrink:0 }}>{r.score}</div>
            </div>
          );
        })}
      </Card>
      <div style={{ marginTop:18, textAlign:"center", padding:16, background:T.sa, borderRadius:12, border:`1px solid ${T.bd}` }}>
        <p style={{ fontFamily:FONT_SERIF, fontSize:16, fontWeight:600, color:T.tx, margin:"0 0 4px" }}>That's Experience Decisioning.</p>
        <p style={{ fontFamily:FONT_SANS, fontSize:11.5, color:T.tm, margin:0 }}>Schema → Items → Collections → Rules → Ranking → Strategy → Policy → Result.</p>
      </div>
    </div>
  );
};

/* ═══ APP SHELL ═══ */
const STEP_COMPONENTS = {
  intro: IntroStep, schema: SchemaStep, items: ItemsStep, collections: CollectionsStep,
  rules: RulesStep, ranking: RankingStep, strategy: StrategyStep, policy: PolicyStep, result: ResultStep,
};

export default function App() {
  const [step, setStep] = useState(0);
  const [fadeKey, setFadeKey] = useState(0);
  const [industry, setIndustry] = useState("retail");
  const [showIndustry, setShowIndustry] = useState(false);
  const contentRef = useRef(null);

  const goToStep = (i) => { setFadeKey(k => k + 1); setStep(i); contentRef.current?.scrollTo({ top: 0, behavior: "smooth" }); };

  const CurrentStep = STEP_COMPONENTS[STEPS[step].id];
  const currentIndustry = INDUSTRIES.find(x => x.key === industry);
  const IndustryIcon = currentIndustry.icon;

  return (
    <div style={{ minHeight:"100vh", background:T.bg, fontFamily:FONT_SANS, display:"flex", flexDirection:"column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        * { box-sizing: border-box; }
        input[type="range"] { height: 4px; border-radius: 2px; outline: none; -webkit-appearance: none; appearance: none; background: ${T.bd}; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: currentColor; cursor: pointer; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
        button { cursor: pointer; border: none; outline: none; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${T.bd}; border-radius: 2px; }
      `}</style>

      {/* HEADER */}
      <div style={{ position:"sticky", top:0, zIndex:100, background:T.sf+"F0", backdropFilter:"blur(12px)", borderBottom:`1px solid ${T.bd}` }}>

        <div style={{ maxWidth:1060, margin:"0 auto", padding:"0 20px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, height:42 }}>
            <Logo />
            <div style={{ width:1, height:16, background:T.bd }} />
            <span style={{ fontFamily:FONT_SANS, fontSize:11.5, color:T.tm }}>Experience Decisioning</span>
            {/* Industry dropdown */}
            <div style={{ marginLeft:"auto", position:"relative" }}>
              <button onClick={() => setShowIndustry(!showIndustry)}
                style={{ display:"flex", alignItems:"center", gap:4, padding:"4px 10px", borderRadius:6, background:T.sa, border:`1px solid ${T.bd}`, fontFamily:FONT_SANS, fontSize:10.5, fontWeight:600, color:T.tx }}>
                <IndustryIcon size={12} color={T.ac} />{currentIndustry.label}<ChevronDown size={11} color={T.tm} />
              </button>
              {showIndustry && (
                <div style={{ position:"absolute", top:"100%", right:0, marginTop:3, background:T.sf, border:`1px solid ${T.bd}`, borderRadius:9, padding:3, boxShadow:"0 6px 20px rgba(0,0,0,0.1)", minWidth:160, zIndex:200 }}>
                  {INDUSTRIES.map(({ key, label, icon: Icon }) => (
                    <div key={key} onClick={() => { setIndustry(key); setShowIndustry(false); }}
                      style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 10px", borderRadius:6, cursor:"pointer",
                        background:industry===key?T.as:"transparent", fontFamily:FONT_SANS, fontSize:11, color:industry===key?T.ac:T.tx, fontWeight:industry===key?600:400 }}
                      onMouseEnter={e => { if (industry !== key) e.currentTarget.style.background = T.sa; }}
                      onMouseLeave={e => { if (industry !== key) e.currentTarget.style.background = "transparent"; }}>
                      <Icon size={12} color={industry===key?T.ac:T.tm} />{label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ height:2, background:T.bd }}>
          <div style={{ height:"100%", width:`${((step+1)/STEPS.length)*100}%`, background:T.ac, transition:"width 0.4s" }} />
        </div>
        {/* Step tabs */}
        <div style={{ maxWidth:1060, margin:"0 auto", padding:"0 20px", overflowX:"auto" }}>
          <div style={{ display:"flex" }}>
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={() => goToStep(i)}
                style={{ padding:"10px 16px", background:"transparent", fontFamily:FONT_SANS, fontSize:12.5, fontWeight:step===i?600:400,
                  whiteSpace:"nowrap", color:step===i?T.ac:i<step?T.tx:T.tm, borderBottom:`2px solid ${step===i?T.ac:"transparent"}` }}>
                {s.short}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div ref={contentRef} style={{ flex:1, overflowY:"auto" }} onClick={() => showIndustry && setShowIndustry(false)}>
        <div key={fadeKey} style={{ maxWidth:1060, margin:"0 auto", padding:"28px 20px 70px", animation:"fadeIn 0.3s" }}>
          <CurrentStep />
        </div>
      </div>

      {/* FOOTER NAV */}
      <div style={{ position:"sticky", bottom:0, background:T.sf+"F0", backdropFilter:"blur(12px)", borderTop:`1px solid ${T.bd}`, padding:"8px 20px" }}>
        <div style={{ maxWidth:1060, margin:"0 auto", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <button onClick={() => step > 0 && goToStep(step - 1)} disabled={step === 0}
            style={{ padding:"6px 14px", borderRadius:6, background:"transparent", border:`1px solid ${step===0?T.bd:T.tx}`,
              fontFamily:FONT_SANS, fontSize:11, fontWeight:500, color:step===0?T.tm:T.tx, opacity:step===0?0.4:1,
              display:"flex", alignItems:"center", gap:3 }}>
            <ChevronLeft size={13} />Back
          </button>
          <span style={{ fontFamily:FONT_MONO, fontSize:10, color:T.tm }}>{step + 1}/{STEPS.length}</span>
          <button onClick={() => step < STEPS.length - 1 && goToStep(step + 1)} disabled={step === STEPS.length - 1}
            style={{ padding:"6px 14px", borderRadius:6, background:step===STEPS.length-1?T.bd:T.ac,
              fontFamily:FONT_SANS, fontSize:11, fontWeight:600, color:step===STEPS.length-1?T.tm:"#fff",
              opacity:step===STEPS.length-1?0.4:1, display:"flex", alignItems:"center", gap:3 }}>
            Next<ChevronRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
