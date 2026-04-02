# Practice Lead Promotion Tracker

A **promotion tracking system** to document and visualize your progress toward **Practice Lead**, with a JSON-backed database, CLI tools for data entry, and a Streamlit dashboard for metrics and export.

---

## Purpose

- **Track** all activities that demonstrate Practice Lead readiness (mentoring, product collaboration, strategic customer work, innovation, community, certifications, deals).  
- **Map** each activity to promotion competencies (Scope, Influence, Strategic Direction, Functional Knowledge, Customer Engagement, Project Management, Team Contribution, Professional Development).  
- **Quantify** impact (sessions, unique people, hours, sustained relationships, adoption, pipeline/revenue).  
- **Export** CSV and JSON for your promotion package.

---

## What’s included

| Component | Description |
|-----------|--------------|
| **promotion_data.json** | Single JSON database: arrays per activity type + metadata (totals, unique mentees, hours, sustained relationships). |
| **data_utils.py** | Load/save JSON; update metadata; competency list. |
| **CLI tools** | Seven Python scripts for interactive data entry with preview-before-save. |
| **app.py** | Streamlit dashboard: Overview, Mentoring, Product/Engineering, Certifications, Deals, Combined + Export. |
| **Launchers** | `run_dashboard.bat`, `run_dashboard.ps1` to start the dashboard. |
| **Docs** | START_HERE.md, QUICK_START.md, TRACKING_GUIDE.md, PRACTICE_LEAD_PROMOTION_FRAMEWORK.md. |

---

## File layout

```
promotion-tracker/
├── promotion_data.json      # Data store (edit only via CLI or code)
├── data_utils.py            # Shared data layer
├── add_mentoring.py         # CLI: mentoring sessions
├── add_product_sync.py      # CLI: product/engineering collaboration
├── add_strategic_customer.py
├── add_innovation.py
├── add_community.py
├── add_certification.py
├── add_deal.py
├── app.py                   # Streamlit dashboard
├── run_dashboard.bat
├── run_dashboard.ps1
├── requirements.txt
├── .gitignore
├── START_HERE.md
├── QUICK_START.md
├── TRACKING_GUIDE.md
├── PRACTICE_LEAD_PROMOTION_FRAMEWORK.md
└── README.md
```

---

## Setup

1. **Python 3.8+** required.  
2. From the `promotion-tracker` folder:
   ```bash
   pip install -r requirements.txt
   ```
3. Add activities via the CLI (e.g. `python add_mentoring.py`).  
4. View data: `streamlit run app.py` (or use the launcher scripts).  
5. Open **http://localhost:8501** in your browser.

See **QUICK_START.md** for step-by-step setup.

---

## CLI tools (summary)

| Script | Activity type |
|--------|----------------|
| add_mentoring.py | 1-2-1 mentoring; topics, duration, follow-up, category, evidence, impact. |
| add_product_sync.py | Product/Engineering syncs; beta, SDK, field feedback; participants, topic, type. |
| add_strategic_customer.py | Strategic accounts; exec meetings; complex deals; revenue/pipeline impact. |
| add_innovation.py | New tools/techniques; process improvements; reusable assets; adoption count. |
| add_community.py | Workshops; presentations; documentation; office hours; lunch & learn; Summit; webinars. |
| add_certification.py | Certifications; issuer; date earned; expiry; status; relevance. |
| add_deal.py | Deals; your role; pipeline/revenue; outcome; evidence; impact. |

Each tool writes to `promotion_data.json` and updates metadata (totals, unique mentees, mentoring hours, sustained relationships).

---

## Dashboard tabs

- **Overview** – Metric cards (sessions, unique mentees, hours, sustained relationships, total activities); bar chart by activity type; recent activity timeline; activity-over-time chart; by competency category.  
- **Mentoring** – All sessions; sustained relationships; by category.  
- **Product/Engineering** – All collaboration entries; by type.  
- **Certifications** – All certs; by status.  
- **Deals** – All deals; by outcome.  
- **Combined + Export** – Full recent-activity table; **Download as CSV**; **Download as JSON**.

---

## Data and promotion mapping

- Every activity can store **category** (one of the eight Practice Lead competencies), **evidence**, **impact**, and optional **sc_leveling_criteria**.  
- The dashboard computes: total activities by type, unique mentees, mentoring hours, sustained relationships (people with 2+ mentoring sessions).  
- Use **TRACKING_GUIDE.md** for what to capture; **PRACTICE_LEAD_PROMOTION_FRAMEWORK.md** for competency definitions and gap assessment.

---

## Success in 3–6 months

- Quantified impact (e.g. “8 mentoring sessions, 5 unique mentees, 7.8 hours”).  
- Sustained commitment (e.g. “3-session enablement journey with [name]”).  
- Evidence across all promotion competencies.  
- Scale (e.g. “Introduced tool X, adopted by 10+ team members”).  
- Exportable data (CSV/JSON) for your promotion package.

---

## Customization

- **Competency list** – Edit `COMPETENCY_CATEGORIES` in `data_utils.py` if your org uses different names.  
- **Activity fields** – Extend the record dict in each `add_*.py` and adjust `app.py` / `build_recent_activity_df` if you add new fields.  
- **Sensitive data** – Do not commit credentials; use `.gitignore` (e.g. `.env`, `secrets.json`). Back up `promotion_data.json` regularly.

---

## Licence and use

This is a personal productivity tool. Use and modify as needed for your promotion tracking. No warranty.
