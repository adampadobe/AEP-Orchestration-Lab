import os
import shutil
import sqlite3
import time

import config


def _get_conn():
    os.makedirs(config.DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    conn = _get_conn()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            brand_name TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'analyzing',
            favicon_path TEXT,
            pages_scanned INTEGER DEFAULT 0,
            total_urls INTEGER DEFAULT 0,
            business_type TEXT NOT NULL DEFAULT 'b2c',
            persona_country TEXT NOT NULL DEFAULT 'Germany',
            analysis_data TEXT,
            created_at REAL,
            updated_at REAL
        );
        CREATE TABLE IF NOT EXISTS assets (
            id TEXT PRIMARY KEY,
            project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            category TEXT NOT NULL,
            original_url TEXT,
            local_path TEXT,
            format TEXT,
            width INTEGER,
            height INTEGER,
            file_size INTEGER,
            source_page TEXT,
            selected INTEGER DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_assets_project ON assets(project_id);
    """)
    # Migrate existing DBs that lack the new columns
    for col, default in [("business_type", "b2c"), ("persona_country", "Germany")]:
        try:
            conn.execute(f"ALTER TABLE projects ADD COLUMN {col} TEXT NOT NULL DEFAULT '{default}'")
        except Exception:
            pass
    conn.commit()
    conn.close()


def create_project(project_id, url, business_type="b2c", persona_country="Germany"):
    conn = _get_conn()
    now = time.time()
    conn.execute(
        "INSERT INTO projects (id, url, business_type, persona_country, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        (project_id, url, business_type, persona_country, now, now),
    )
    conn.commit()
    conn.close()
    project_dir = os.path.join(config.PROJECTS_DIR, project_id)
    os.makedirs(project_dir, exist_ok=True)
    for cat in config.ASSET_CATEGORIES:
        os.makedirs(os.path.join(project_dir, cat), exist_ok=True)


def get_project(project_id):
    conn = _get_conn()
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def get_all_projects():
    conn = _get_conn()
    rows = conn.execute("SELECT * FROM projects ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_project(project_id, **kwargs):
    if not kwargs:
        return
    kwargs["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = ?" for k in kwargs)
    values = list(kwargs.values()) + [project_id]
    conn = _get_conn()
    conn.execute(f"UPDATE projects SET {set_clause} WHERE id = ?", values)
    conn.commit()
    conn.close()


def delete_project(project_id):
    conn = _get_conn()
    conn.execute("DELETE FROM assets WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    conn.commit()
    conn.close()
    project_dir = os.path.join(config.PROJECTS_DIR, project_id)
    if os.path.isdir(project_dir):
        shutil.rmtree(project_dir, ignore_errors=True)


def save_asset(asset_id, project_id, category, original_url, local_path=None,
               fmt=None, width=None, height=None, file_size=None, source_page=None):
    conn = _get_conn()
    conn.execute(
        """INSERT OR REPLACE INTO assets
           (id, project_id, category, original_url, local_path, format, width, height, file_size, source_page)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (asset_id, project_id, category, original_url, local_path, fmt, width, height, file_size, source_page),
    )
    conn.commit()
    conn.close()


def get_project_assets(project_id):
    conn = _get_conn()
    rows = conn.execute(
        "SELECT * FROM assets WHERE project_id = ? ORDER BY category, id", (project_id,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
