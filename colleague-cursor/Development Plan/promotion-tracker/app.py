"""
Practice Lead Promotion Tracker - Streamlit Dashboard.
Run: streamlit run app.py
"""
import json
from pathlib import Path

import pandas as pd
import streamlit as st
import plotly.express as px

from data_utils import load_data, save_data, COMPETENCY_CATEGORIES

st.set_page_config(page_title="Practice Lead Promotion Tracker", layout="wide", initial_sidebar_state="expanded")

DATA_FILE = Path(__file__).resolve().parent / "promotion_data.json"


def load():
    return load_data()


def build_recent_activity_df(data):
    """Build a unified timeline of all activities for Recent Activity view."""
    rows = []
    for m in data.get("mentoring", []):
        topics = m.get("topics") or []
        topics_summary = ", ".join(topics[:3]) + ("..." if len(topics) > 3 else "") if topics else ""
        rows.append({
            "date": m.get("date") or "",
            "time": m.get("time") or "",
            "type": "Mentoring",
            "person_title": f"{m.get('person_name', '')} ({m.get('person_role', '')})".strip(" ()"),
            "topics_subjects": topics_summary or m.get("purpose", ""),
            "duration_minutes": m.get("duration_minutes"),
            "category": m.get("category", ""),
            "description": m.get("evidence") or "",
            "raw": m,
        })
    for p in data.get("product_sync", []):
        part = p.get("participants") or []
        person_title = ", ".join(part[:2]) + ("..." if len(part) > 2 else "") if part else ""
        rows.append({
            "date": p.get("date") or "",
            "time": p.get("time") or "",
            "type": "Product/Engineering",
            "person_title": person_title or p.get("topic", "")[:40],
            "topics_subjects": (p.get("topic") or "")[:80],
            "duration_minutes": p.get("duration_minutes"),
            "category": p.get("category", ""),
            "description": p.get("evidence") or "",
            "raw": p,
        })
    for s in data.get("strategic_customer", []):
        rows.append({
            "date": s.get("date") or "",
            "time": s.get("time") or "",
            "type": "Strategic Customer",
            "person_title": s.get("account_name", ""),
            "topics_subjects": (s.get("purpose") or "")[:80],
            "duration_minutes": s.get("duration_minutes"),
            "category": s.get("category", ""),
            "description": s.get("evidence") or "",
            "raw": s,
        })
    for i in data.get("innovation", []):
        rows.append({
            "date": i.get("date") or "",
            "time": "",
            "type": "Innovation",
            "person_title": i.get("title", ""),
            "topics_subjects": (i.get("description") or "")[:80],
            "duration_minutes": None,
            "category": i.get("category", ""),
            "description": i.get("evidence") or "",
            "raw": i,
        })
    for c in data.get("community", []):
        topics = c.get("topics") or []
        topics_summary = ", ".join(topics[:3]) + ("..." if len(topics) > 3 else "") if topics else c.get("title", "")
        rows.append({
            "date": c.get("date") or "",
            "time": c.get("time") or "",
            "type": "Community",
            "person_title": c.get("title", ""),
            "topics_subjects": topics_summary[:80] if isinstance(topics_summary, str) else str(topics_summary)[:80],
            "duration_minutes": c.get("duration_minutes"),
            "category": c.get("category", ""),
            "description": c.get("evidence") or "",
            "raw": c,
        })
    for d in data.get("deals", []):
        rows.append({
            "date": d.get("date") or "",
            "time": "",
            "type": "Deal",
            "person_title": d.get("customer_name", "") or d.get("deal_name", ""),
            "topics_subjects": (d.get("outcome") or "")[:80],
            "duration_minutes": None,
            "category": d.get("category", ""),
            "description": d.get("evidence") or "",
            "raw": d,
        })
    if not rows:
        return pd.DataFrame(columns=["date", "time", "type", "person_title", "topics_subjects", "duration_minutes", "category", "description"])
    df = pd.DataFrame(rows)
    df["_sort"] = pd.to_datetime(df["date"] + " " + df["time"].fillna("00:00"), errors="coerce")
    df = df.sort_values("_sort", ascending=False).drop(columns=["_sort"], errors="ignore")
    return df


# Icons and colors per activity type for the timeline table
_TIMELINE_TYPE_ICON = {
    "Mentoring": "🎓",
    "Product/Engineering": "⚙️",
    "Strategic Customer": "🤝",
    "Innovation": "💡",
    "Community": "📢",
    "Deal": "💰",
}
_TIMELINE_TYPE_COLOR = {
    "Mentoring": ("#e3f2fd", "#1565c0"),
    "Product/Engineering": ("#e0f2f1", "#00695c"),
    "Strategic Customer": ("#fce4ec", "#c2185b"),
    "Innovation": ("#fff3e0", "#e65100"),
    "Community": ("#f3e5f5", "#7b1fa2"),
    "Deal": ("#e8f5e9", "#2e7d32"),
}


def _escape_html(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _render_timeline_table(df):
    """Render the recent activity timeline styled like the reference: solid header colors, dark blue first column, alternating rows, no grid lines."""
    # Ensure sorted by date descending (newest first)
    if not df.empty and "date" in df.columns:
        df = df.copy()
        df["_sort"] = pd.to_datetime(df["date"].astype(str) + " " + df["time"].fillna("00:00").astype(str), errors="coerce")
        df = df.sort_values("_sort", ascending=False).drop(columns=["_sort"], errors="ignore")
    # Reference style: solid header colors (blue, teal, green, orange, purple, dark teal), first column dark blue #284A74
    header_colors = ["#00A3DA", "#00B2B2", "#7AC24D", "#F7931E", "#8E298F", "#016F6D"]
    first_col_bg = "#284A74"
    rows_html = []
    for i, (_, r) in enumerate(df.iterrows()):
        bg = "#F7F7F7" if i % 2 == 0 else "#ffffff"
        date_val = _escape_html(str(r.get("date") or ""))
        time_val = _escape_html(str(r.get("time") or ""))
        person_val = _escape_html(str(r.get("person_title") or ""))[:60]
        topics_val = _escape_html(str(r.get("topics_subjects") or ""))[:80]
        cat_val = _escape_html(str(r.get("category") or ""))
        desc_val = _escape_html(str(r.get("description") or ""))
        rows_html.append(
            f'<tr style="background:{bg}; min-height:52px;">'
            f'<td style="padding:12px 16px; background:{first_col_bg}; color:#fff; font-weight:700; vertical-align:middle; text-align:left; border:none;">{date_val}</td>'
            f'<td style="padding:12px 16px; vertical-align:middle; text-align:left; border:none;">{time_val}</td>'
            f'<td style="padding:12px 16px; vertical-align:middle; text-align:left; border:none;">{person_val}</td>'
            f'<td style="padding:12px 16px; vertical-align:middle; text-align:left; border:none;">{topics_val}</td>'
            f'<td style="padding:12px 16px; vertical-align:middle; text-align:left; border:none;">{cat_val}</td>'
            f'<td style="padding:12px 16px; vertical-align:middle; text-align:left; border:none; max-width:320px;">{desc_val}</td>'
            "</tr>"
        )
    th_styles = [
        ('📅 Date', header_colors[0]),
        ('🕐 Time', header_colors[1]),
        ('👤 Person/Title', header_colors[2]),
        ('Topics/Subjects', header_colors[3]),
        ('Category', header_colors[4]),
        ('📝 Description (evidence)', header_colors[5]),
    ]
    header_cells = "".join(
        f'<th style="padding:12px 16px; background:{c}; color:#fff; font-weight:600; vertical-align:middle; text-align:center; border:none;">{label}</th>'
        for label, c in th_styles
    )
    table_html = (
        '<div style="overflow-x: auto; border-radius:8px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin-bottom:1rem;">'
        '<table style="width:100%; border-collapse: collapse; font-size: 0.9rem; border: none;">'
        f'<thead><tr style="border:none;">{header_cells}</tr></thead><tbody>'
        + "".join(rows_html)
        + "</tbody></table></div>"
    )
    st.markdown(table_html, unsafe_allow_html=True)


def main():
    data = load()
    meta = data.get("metadata", {})

    # Adobe logo at top of left pane
    app_dir = Path(__file__).resolve().parent
    local_logo = app_dir / "adobe_logo.png"
    if local_logo.exists():
        st.sidebar.image(str(local_logo), use_container_width=True)
    else:
        st.sidebar.image("https://upload.wikimedia.org/wikipedia/commons/8/8d/Adobe_Corporate_Logo.png", use_container_width=True)
    st.sidebar.markdown("---")
    st.sidebar.title("Practice Lead Tracker")
    st.sidebar.markdown("---")
    if meta.get("last_updated"):
        st.sidebar.caption(f"Last updated: {meta['last_updated'][:19].replace('T', ' ')}")
    st.sidebar.markdown("---")

    with st.sidebar.expander("**Practice Lead criteria**", expanded=False):
        st.markdown("""
        **1. SCOPE OF RESPONSIBILITY**  
        SME for a problem/challenge/deal type; reputation in BU for influencing and closing big deals; trusted advisor to all customer levels.

        **2. INFLUENCE**  
        Owns day-to-day client communication; trusted advisor to all levels of the customer.

        **3. STRATEGIC DIRECTION**  
        Credibility in leading meetings, driving conversations across broad network (internal & external); PM ownership for own focus area.

        **4. FUNCTIONAL KNOWLEDGE**  
        Leads complex, multi-solution deals; discovery & scoping; coaches others; escalates to leadership.

        **5. CUSTOMER ENGAGEMENT**  
        Leads discussions with/without extensive prep; ad-hoc & future-focused questions; knows when to probe or challenge.

        **6. PROJECT MANAGEMENT SKILLS**  
        Supports 1–2 team members to effectively project manage their deals.

        **7. TEAM CONTRIBUTION**  
        Leading, mentoring, managing projects and team; shapes peers; Summit sessions, quarterly blog or webinars.

        **8. PROFESSIONAL DEVELOPMENT**  
        Leads enablement sessions; dedicated mentor to 1–2; mentors 1–2 on presentation skills.
        """)

    st.sidebar.markdown("---")

    st.title("Practice Lead Promotion Tracker")

    tab_overview, tab_mentoring, tab_product, tab_certs, tab_deals, tab_combined, tab_how_to_achieve = st.tabs([
        "Overview",
        "Mentoring",
        "Product/Engineering",
        "Certifications",
        "Deals",
        "Combined + Export",
        "How to achieve",
    ])

    with tab_overview:
        st.header("Overview")
        totals = meta.get("totals", {})
        c1, c2, c3, c4, c5 = st.columns(5)
        c1.metric("Mentoring sessions", totals.get("mentoring", 0))
        c2.metric("Unique mentees", meta.get("unique_mentees", 0))
        c3.metric("Mentoring hours", meta.get("mentoring_hours", 0))
        c4.metric("Sustained relationships (2+ sessions)", meta.get("sustained_relationships_count", 0))
        c5.metric("Total activities", sum(totals.values()))

        st.subheader("Activities by Practice Lead criteria")
        criteria_order = [
            "SCOPE OF RESPONSIBILITY",
            "INFLUENCE",
            "STRATEGIC DIRECTION",
            "FUNCTIONAL KNOWLEDGE",
            "CUSTOMER ENGAGEMENT",
            "PROJECT MANAGEMENT SKILLS",
            "TEAM CONTRIBUTION",
            "PROFESSIONAL DEVELOPMENT",
        ]
        criteria_counts = {c: 0 for c in criteria_order}
        criteria_counts["Unset"] = 0
        for key in ["mentoring", "product_sync", "strategic_customer", "innovation", "community", "certifications", "deals"]:
            for r in data.get(key, []):
                cat = r.get("category") or "Unset"
                criteria_counts[cat] = criteria_counts.get(cat, 0) + 1
        order = criteria_order + (["Unset"] if criteria_counts.get("Unset", 0) > 0 else [])
        chart_df = pd.DataFrame([{"Criteria": c, "Count": int(criteria_counts.get(c, 0))} for c in order])
        fig_bar = px.bar(chart_df, x="Criteria", y="Count", color="Count", color_continuous_scale="Blues", title="Activities by Practice Lead criteria")
        fig_bar.update_xaxes(tickangle=-45)
        st.plotly_chart(fig_bar, use_container_width=True)

        st.subheader("Recent Activity Timeline")
        recent_df = build_recent_activity_df(data)
        if recent_df.empty:
            st.info("No activities yet. Use the CLI tools to add mentoring, deals, etc.")
        else:
            _render_timeline_table(recent_df.head(50))

        st.subheader("Activity over time")
        if not recent_df.empty and "date" in recent_df.columns:
            ts_df = recent_df.copy()
            ts_df["date"] = pd.to_datetime(ts_df["date"], errors="coerce")
            ts_df2 = ts_df.dropna(subset=["date"])
            ts_df2["week"] = ts_df2["date"].dt.to_period("W").astype(str)
            by_week = ts_df2.groupby("week", as_index=False).size()
            by_week.columns = ["week", "count"]
            if not by_week.empty:
                st.plotly_chart(px.line(by_week, x="week", y="count", markers=True, title="Activities per week"), use_container_width=True)
        else:
            st.caption("Add activities to see trend over time.")

        st.subheader("By competency category")
        all_cats = []
        for key, label in [
            ("mentoring", "Mentoring"),
            ("product_sync", "Product/Eng"),
            ("strategic_customer", "Strategic Customer"),
            ("innovation", "Innovation"),
            ("community", "Community"),
            ("certifications", "Certifications"),
            ("deals", "Deals"),
        ]:
            for r in data.get(key, []):
                all_cats.append({"Category": r.get("category") or "Unset", "Activity": label})
        if all_cats:
            cat_df = pd.DataFrame(all_cats)
            cat_counts = cat_df.groupby("Category").size().reset_index(name="Count")
            fig_cat = px.bar(cat_counts, x="Category", y="Count", color="Count", color_continuous_scale="Greens")
            st.plotly_chart(fig_cat, use_container_width=True)
        else:
            st.caption("No activities with category set yet.")

    with tab_mentoring:
        st.header("Mentoring")
        mentoring = data.get("mentoring", [])
        if not mentoring:
            st.info("No mentoring sessions yet. Run: `python add_mentoring.py`")
        else:
            m1, m2 = st.columns(2)
            m1.metric("Total sessions", len(mentoring))
            m2.metric("Total hours", meta.get("mentoring_hours", 0))
            m2.metric("Sustained relationships (2+ sessions)", meta.get("sustained_relationships_count", 0))

            from collections import Counter
            counts = Counter((r.get("person_name") or "").strip() for r in mentoring if (r.get("person_name") or "").strip())
            sustained = [name for name, c in counts.items() if c >= 2]
            if sustained:
                st.caption("Sustained relationships: " + ", ".join(sustained))

            ment_df = pd.DataFrame(mentoring)
            if "date" in ment_df.columns:
                ment_df["_dt"] = pd.to_datetime(ment_df["date"], errors="coerce")
                ment_df = ment_df.sort_values("_dt", ascending=False).drop(columns=["_dt"], errors="ignore")
            st.dataframe(ment_df, use_container_width=True, hide_index=True)

            st.subheader("Mentoring by category")
            if "category" in ment_df.columns:
                mc = ment_df["category"].value_counts()
                fig_m = px.bar(x=mc.index, y=mc.values, labels={"x": "Category", "y": "Count"})
                st.plotly_chart(fig_m, use_container_width=True)

    with tab_product:
        st.header("Product / Engineering Collaboration")
        product = data.get("product_sync", [])
        if not product:
            st.info("No product/engineering activities yet. Run: `python add_product_sync.py`")
        else:
            st.metric("Total", len(product))
            prod_df = pd.DataFrame(product)
            if "date" in prod_df.columns:
                prod_df["_dt"] = pd.to_datetime(prod_df["date"], errors="coerce")
                prod_df = prod_df.sort_values("_dt", ascending=False).drop(columns=["_dt"], errors="ignore")
            st.dataframe(prod_df, use_container_width=True, hide_index=True)
            if "type" in prod_df.columns:
                st.subheader("By type")
                pt = prod_df["type"].value_counts()
                st.plotly_chart(px.pie(values=pt.values, names=pt.index, title="Collaboration type"), use_container_width=True)

    with tab_certs:
        st.header("Certifications")
        certs = data.get("certifications", [])
        if not certs:
            st.info("No certifications yet. Run: `python add_certification.py`")
        else:
            st.metric("Total", len(certs))
            cert_df = pd.DataFrame(certs)
            st.dataframe(cert_df, use_container_width=True, hide_index=True)
            if "status" in cert_df.columns:
                st.subheader("By status")
                cs = cert_df["status"].value_counts()
                st.plotly_chart(px.pie(values=cs.values, names=cs.index, title="Certification status"), use_container_width=True)

    with tab_deals:
        st.header("Deals & Business Impact")
        deals = data.get("deals", [])
        if not deals:
            st.info("No deals yet. Run: `python add_deal.py`")
        else:
            st.metric("Total deals", len(deals))
            deal_df = pd.DataFrame(deals)
            if "date" in deal_df.columns:
                deal_df["_dt"] = pd.to_datetime(deal_df["date"], errors="coerce")
                deal_df = deal_df.sort_values("_dt", ascending=False).drop(columns=["_dt"], errors="ignore")
            st.dataframe(deal_df, use_container_width=True, hide_index=True)
            if "outcome" in deal_df.columns:
                st.subheader("By outcome")
                do = deal_df["outcome"].value_counts()
                st.plotly_chart(px.bar(x=do.index, y=do.values, labels={"x": "Outcome", "y": "Count"}), use_container_width=True)

    with tab_how_to_achieve:
        st.header("How to achieve Practice Lead")
        st.markdown("Use this table to focus your efforts. Track activities in each area and tag them with the matching criterion in the tracker.")
        recommendations_df = pd.DataFrame([
            {
                "Practice Lead criteria": "1. SCOPE OF RESPONSIBILITY",
                "What it means": "SME for a problem/challenge/deal type; reputation in BU for influencing and closing big deals; trusted advisor to all customer levels.",
                "How to achieve": "Log every deal you lead or materially influence (add_deal.py). Capture strategic customer work where you are the go-to (add_strategic_customer.py). Build a clear ‘deal type’ or solution area where you are known; document wins and reputation in evidence/impact fields.",
            },
            {
                "Practice Lead criteria": "2. INFLUENCE",
                "What it means": "Owns day-to-day client communication; trusted advisor to all levels of the customer.",
                "How to achieve": "Log strategic customer engagements with the level you work with (C-level, VP, etc.). In mentoring, note when you influence internal stakeholders. Show progression: more exec-level and day-to-day ownership over time.",
            },
            {
                "Practice Lead criteria": "3. STRATEGIC DIRECTION",
                "What it means": "Credibility in leading meetings; drives conversations across broad network (internal & external); PM ownership for own focus area.",
                "How to achieve": "Add product/engineering syncs and cross-functional initiatives (add_product_sync.py). Log community or cross-team work where you lead. Take ownership of a focus area and document meetings you lead and decisions you drive.",
            },
            {
                "Practice Lead criteria": "4. FUNCTIONAL KNOWLEDGE",
                "What it means": "Leads complex, multi-solution deals; discovery and scoping; coaches others; escalates to leadership.",
                "How to achieve": "Log complex deals and discovery work (deals, strategic_customer). Add innovations with team adoption count (add_innovation.py). In mentoring, describe how you coached on scope, approach, or escalation. Quantify adoption and impact.",
            },
            {
                "Practice Lead criteria": "5. CUSTOMER ENGAGEMENT",
                "What it means": "Leads discussions with/without extensive prep; ad-hoc and future-focused questions; knows when to probe or challenge.",
                "How to achieve": "Log strategic customer and deal activities. In evidence/impact, describe how you led the discussion, asked future-state questions, or challenged assumptions. Aim for examples with and without heavy prep.",
            },
            {
                "Practice Lead criteria": "6. PROJECT MANAGEMENT SKILLS",
                "What it means": "Supports 1–2 team members to effectively project manage their deals.",
                "How to achieve": "Use add_mentoring.py for sessions where you help someone run their deal (timeline, stakeholders, escalation). In purpose/impact, state explicitly that you supported their PM. Aim for 1–2 people you support consistently.",
            },
            {
                "Practice Lead criteria": "7. TEAM CONTRIBUTION",
                "What it means": "Leading, mentoring, managing projects and team; shapes peers; Summit sessions, quarterly blog or webinars.",
                "How to achieve": "Log workshops, presentations, and team sessions (add_community.py). Plan at least one Summit session, blog post, or webinar and log it. Link innovations to team adoption; document how you shape peers.",
            },
            {
                "Practice Lead criteria": "8. PROFESSIONAL DEVELOPMENT",
                "What it means": "Leads enablement sessions; dedicated mentor to 1–2; mentors 1–2 on presentation skills.",
                "How to achieve": "Run add_mentoring.py for every 1:1 and enablement session. Build 2 sustained relationships (2+ sessions each). Log enablement in community. Add at least one entry where you mentored presentation skills; log certifications (add_certification.py).",
            },
        ])
        # Use static table with colour and shading (no ghost row)
        def _escape(s):
            return (s or "").replace("<", "&lt;").replace(">", "&gt;").replace("&", "&amp;")
        row_styles = ["background:#f5f5f5;", "background:#e8e8e8;"]
        rows_html = "".join(
            f'<tr style="{row_styles[i % 2]}">'
            f'<td style="vertical-align:top; min-height:70px; padding:10px 12px; border:1px solid #ddd; background:#e3f2fd; font-weight:600;">{_escape(r["Practice Lead criteria"])}</td>'
            f'<td style="vertical-align:top; min-height:70px; padding:10px 12px; border:1px solid #ddd;">{_escape(r["What it means"])}</td>'
            f'<td style="vertical-align:top; min-height:70px; padding:10px 12px; border:1px solid #ddd;">{_escape(r["How to achieve"])}</td></tr>'
            for i, (_, r) in enumerate(recommendations_df.iterrows())
        )
        st.markdown(
            '<div style="overflow-x: auto; border-radius:8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">'
            '<table style="width:100%; border-collapse: collapse; font-size: 0.95rem;">'
            '<thead><tr>'
            '<th style="text-align:left; padding:12px 14px; background:#1565c0; color:#fff; border:1px solid #0d47a1;">Practice Lead criteria</th>'
            '<th style="text-align:left; padding:12px 14px; background:#00695c; color:#fff; border:1px solid #004d40;">What it means</th>'
            '<th style="text-align:left; padding:12px 14px; background:#2e7d32; color:#fff; border:1px solid #1b5e20;">How to achieve</th>'
            '</tr></thead>'
            f'<tbody>{rows_html}</tbody></table></div>',
            unsafe_allow_html=True,
        )

        st.subheader("Plan")
        st.markdown("Calendar planning: what you are going to do for each criterion.")
        criteria_labels = recommendations_df["Practice Lead criteria"].tolist()
        criteria_plans = data.get("criteria_plans") or {}
        plan_rows_html = "".join(
            f'<tr style="{row_styles[i % 2]}">'
            f'<td style="vertical-align:middle; min-height:56px; padding:10px 12px; border:1px solid #ddd; background:#e3f2fd; font-weight:600;">{_escape(criteria_labels[i])}</td>'
            f'<td style="vertical-align:middle; min-height:56px; padding:10px 12px; border:1px solid #ddd; white-space:pre-wrap;">{_escape(criteria_plans.get(criteria_labels[i], ""))}</td></tr>'
            for i in range(len(criteria_labels))
        )
        st.markdown(
            '<div style="overflow-x: auto; border-radius:8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom:1rem;">'
            '<table style="width:100%; border-collapse: collapse; font-size: 0.95rem;">'
            '<thead><tr>'
            '<th style="text-align:left; padding:12px 14px; background:#1565c0; color:#fff; border:1px solid #0d47a1;">Practice Lead criteria</th>'
            '<th style="text-align:left; padding:12px 14px; background:#2e7d32; color:#fff; border:1px solid #1b5e20;">Plan</th>'
            '</tr></thead>'
            f'<tbody>{plan_rows_html}</tbody></table></div>',
            unsafe_allow_html=True,
        )
        with st.expander("Edit your plan"):
            with st.form("plan_form"):
                plan_inputs = {}
                for i, label in enumerate(criteria_labels):
                    plan_inputs[label] = st.text_area(
                        label,
                        value=criteria_plans.get(label, ""),
                        height=100,
                        key=f"plan_{i}",
                    )
                if st.form_submit_button("Save plan"):
                    data = load()
                    data["criteria_plans"] = {k: (v or "").strip() for k, v in plan_inputs.items()}
                    save_data(data)
                    st.success("Plan saved. Refresh the page to see it in the table above.")
                    st.rerun()

    with tab_combined:
        st.header("All activities & export")
        recent_df = build_recent_activity_df(data)
        if recent_df.empty:
            st.info("No activities to show or export.")
        else:
            _render_timeline_table(recent_df)
            display_df = recent_df[["date", "time", "type", "person_title", "topics_subjects", "duration_minutes", "category", "description"]].copy()
            display_df.columns = ["Date", "Time", "Type", "Person/Title", "Topics/Subjects", "Duration (min)", "Category", "Description (evidence)"]

            st.subheader("Export")
            col1, col2 = st.columns(2)
            with col1:
                csv = display_df.to_csv(index=False)
                st.download_button("Download as CSV", csv, file_name="promotion_activities.csv", mime="text/csv")
            with col2:
                full_export = {k: v for k, v in data.items() if k != "metadata"}
                st.download_button(
                    "Download as JSON",
                    json.dumps(full_export, indent=2, ensure_ascii=False),
                    file_name="promotion_export.json",
                    mime="application/json",
                )

    # Auto-reload hint
    st.sidebar.caption("Data is loaded from promotion_data.json. Re-run the app or refresh the page after adding data via CLI.")


if __name__ == "__main__":
    main()
