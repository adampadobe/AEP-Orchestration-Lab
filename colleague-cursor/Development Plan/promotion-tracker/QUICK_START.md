# Quick Start – Practice Lead Promotion Tracker

Get the tracker running in a few minutes.

---

## 1. Prerequisites

- **Python 3.8+** installed and on your PATH.  
  Check: `python --version` or `py -3 --version`.

---

## 2. Install dependencies

Open a terminal in the **promotion-tracker** folder and run:

```bash
pip install -r requirements.txt
```

This installs: `streamlit`, `pandas`, `plotly`.

---

## 3. Add your first activity

Example – log a mentoring session:

```bash
python add_mentoring.py
```

You’ll be prompted for:

- Mentee name (required)  
- Role, topics, duration, purpose  
- Competency category (e.g. PROFESSIONAL DEVELOPMENT)  
- Evidence and impact (for your promotion story)  
- Optional follow-up  

Press Enter to accept defaults where shown. At the end, confirm **Save? (y/n)** to write to `promotion_data.json`.

---

## 4. Start the dashboard

From the same folder:

```bash
streamlit run app.py
```

Or on Windows:

- Double-click **run_dashboard.bat**, or  
- In PowerShell: `.\run_dashboard.ps1`

Your browser should open at **http://localhost:8501**. If not, open that URL manually.

---

## 5. What you’ll see

- **Overview** – Metrics (sessions, mentees, hours, sustained relationships), activity-by-type chart, recent activity timeline, activity over time, competency breakdown.  
- **Mentoring** – All mentoring sessions and sustained relationships.  
- **Product/Engineering** – Collaboration entries.  
- **Certifications** – Certifications and status.  
- **Deals** – Deals and business impact.  
- **Combined + Export** – Full timeline plus **Download as CSV** and **Download as JSON** for your promotion package.

---

## 6. After adding more data

- Data is stored in **promotion_data.json**.  
- The dashboard reads this file when the app loads.  
- After using the CLI to add activities, **refresh the browser** (or restart `streamlit run app.py`) to see updates.

---

## 7. Weekly habit

- **~10–15 minutes per week**: Review your calendar, add mentoring sessions, strategic customer work, innovations, community events, deals.  
- Use **TRACKING_GUIDE.md** for what to capture.  
- Use **PRACTICE_LEAD_PROMOTION_FRAMEWORK.md** to check coverage and gaps.

You’re set. For full details, see **README.md**.
