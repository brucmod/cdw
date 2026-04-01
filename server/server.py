"""
CDW Directory API
-----------------
A minimal FastAPI service that accepts JSON updates from the CDW Directory
browser app and writes them atomically to the data files on disk.

Environment variables (set in cdw-api.service):
  CDW_API_KEY   – shared secret; the browser sends this as X-Admin-Key header
  CDW_DATA_DIR  – absolute path to the web root where JSON files live
                  (default: /var/www/html/cdw)

Endpoints:
  GET  /api/ping    – key validation (returns 200 OK or 401)
  POST /api/update  – write JSON data for an org to disk

Apache reverse-proxy snippet (add inside your VirtualHost block):
  ProxyPass        /api/ http://127.0.0.1:8000/api/
  ProxyPassReverse /api/ http://127.0.0.1:8000/api/
"""

import os
import json
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR = Path(os.environ.get("CDW_DATA_DIR", "/var/www/html/cdw"))
API_KEY  = os.environ.get("CDW_API_KEY", "")

ORG_FILES = {
    "cdw":    "CDW_data_.json",
    "dcs":    "dcs_data.json",
    "canada": "canada_data.json",
}

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="CDW Directory API",
    docs_url=None,   # disable /docs
    redoc_url=None,  # disable /redoc
)

# Allow same-origin requests; Apache handles the real CORS boundary.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Auth helper ───────────────────────────────────────────────────────────────
def _check_key(x_admin_key: Optional[str]) -> None:
    """Raise 401 if the provided key doesn't match CDW_API_KEY."""
    if not API_KEY:
        raise HTTPException(
            status_code=500,
            detail="CDW_API_KEY is not configured on the server."
        )
    if x_admin_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid admin key.")

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/ping")
def ping(x_admin_key: Optional[str] = Header(default=None)):
    """
    Key-validation endpoint. The browser calls this before enabling the
    Apply Update button. Returns 200 {"ok": true} on success, 401 on failure.
    """
    _check_key(x_admin_key)
    return {"ok": True}


@app.post("/api/update")
async def update_org(
    request: Request,
    x_admin_key: Optional[str] = Header(default=None),
):
    """
    Receive processed JSON for one org and write it to disk atomically.

    Request body (JSON):
        {
          "org":  "cdw" | "dcs" | "canada",
          "data": [ { ...person record... }, ... ]
        }

    Response:
        { "ok": true, "count": <int>, "file": "<filename>" }
    """
    _check_key(x_admin_key)

    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body.")

    org  = payload.get("org")
    data = payload.get("data")

    if org not in ORG_FILES:
        raise HTTPException(status_code=400, detail=f"Unknown org: {org!r}. "
                            f"Must be one of: {', '.join(ORG_FILES)}")
    if not isinstance(data, list):
        raise HTTPException(status_code=400, detail="'data' must be a JSON array.")
    if len(data) == 0:
        raise HTTPException(status_code=400, detail="'data' array is empty.")

    filepath = DATA_DIR / ORG_FILES[org]

    # Write to a temp file then rename — atomic on POSIX, avoids partial writes.
    tmp = filepath.with_suffix(".tmp")
    try:
        tmp.write_text(
            json.dumps(data, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
        tmp.replace(filepath)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Write failed: {exc}")

    return {"ok": True, "count": len(data), "file": ORG_FILES[org]}

