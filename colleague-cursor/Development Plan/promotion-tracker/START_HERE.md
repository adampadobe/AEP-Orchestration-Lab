# Start Here – Practice Lead Promotion Tracker

This folder is your **promotion tracking system** for building a data-driven case for **Practice Lead**. Use it to log activities, see metrics, and export evidence.

---

## What’s in this system

| Item | Purpose |
|------|--------|
| **CLI tools** | Add activities from the command line (mentoring, deals, certifications, etc.) |
| **Dashboard** | View metrics, timelines, and charts in your browser |
| **JSON database** | All data lives in `promotion_data.json` (one file, no server) |
| **Docs** | Frameworks and guides for what to track and how it maps to Practice Lead |

---

## Quick start (3 steps)

1. **Install Python dependencies** (one time)  
   From this folder in a terminal:
   ```bash
   pip install -r requirements.txt
   ```

2. **Add an activity** (e.g. a mentoring session)  
   ```bash
   python add_mentoring.py
   ```
   Answer the prompts; confirm to save.

3. **Open the dashboard**  
   ```bash
   streamlit run app.py
   ```
   Or double-click `run_dashboard.bat` (Windows).  
   Browser opens at **http://localhost:8501**.

---

## CLI tools (data entry)

Run from this folder:

| Command | Use for |
|--------|---------|
| `python add_mentoring.py` | 1-2-1 mentoring, capability building |
| `python add_product_sync.py` | Product/Engineering collaboration, beta, feedback |
| `python add_strategic_customer.py` | Strategic accounts, exec meetings, complex deals |
| `python add_innovation.py` | New tools, process improvements, reusable assets |
| `python add_community.py` | Workshops, presentations, docs, office hours |
| `python add_certification.py` | Certifications (with expiry) |
| `python add_deal.py` | Deals, pipeline, revenue, your role |

Each tool asks for details and shows a preview before saving.

---

## Where to read next

- **QUICK_START.md** – Setup and first run in more detail  
- **TRACKING_GUIDE.md** – What to track and how (by activity type)  
- **PRACTICE_LEAD_PROMOTION_FRAMEWORK.md** – How activities map to Practice Lead criteria and how to assess gaps  
- **README.md** – Full system description and reference  

---

## Success in 3–6 months

- **Quantify impact**: e.g. “8 mentoring sessions, 5 unique mentees, 7.8 hours”  
- **Show sustained commitment**: e.g. “3-session enablement journey with [name]”  
- **Cover all competencies**: Evidence across the Practice Lead dimensions  
- **Show scale**: e.g. “Introduced tool X, adopted by 10+ team members”  
- **Export for promotion**: CSV/JSON from the **Combined + Export** tab  

Start by logging one activity this week, then make a habit of updating weekly.
