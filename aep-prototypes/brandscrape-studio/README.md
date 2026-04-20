# BrandScrape Studio v2

A local-first brand intelligence tool that extracts brand assets, generates guidelines, detects campaigns, creates customer personas, and recommends Adobe Real-Time CDP audience segments -- all from a single URL.

## Quick Start

### 1. Install dependencies

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your AI provider API key
```

### 3. Run the app

```bash
python app.py
```

Open http://127.0.0.1:5000 in your browser.

## Configuration

Edit `.env` to set:

- **AI_PROVIDER** -- `openai`, `anthropic`, `gemini`, or `ollama`
- **AI_API_KEY** -- your API key (not needed for Ollama)
- **AI_MODEL** -- model name (e.g., `gpt-4o`, `claude-sonnet-4-20250514`, `gemini-2.0-flash`)
- **MAX_PAGES** -- max pages to crawl per analysis (default: 30)
- Image category limits (logos, banners, product images, etc.)

## Features

- Paste any brand URL to start analysis
- Crawls all pages and subdomains automatically
- Extracts and categorizes images (logos, banners, product images, hero images, etc.)
- Extracts brand colors and fonts
- AI-generated brand voice guidelines
- Campaign detection and demo campaign recommendations
- 5 AI-generated customer personas
- 8-12 Adobe Real-Time CDP audience segments
- Export everything as ZIP, DOC, CSV, or JSON
