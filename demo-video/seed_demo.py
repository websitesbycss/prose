"""Seed an isolated Prose profile for the demo video.

Creates (under DEMO_ROOT, default C:\\prose-demo):
  userData\\prose-settings.db   -> points Prose at DEMO_ROOT\\Documents, dark theme
  Documents\\*.prose            -> sample files for the dashboard

Your real %APPDATA%\\prose profile and ~\\Documents\\Prose are never touched.
Run with Prose CLOSED. Safe to re-run: it wipes and recreates DEMO_ROOT's contents.

Launch Prose against this profile with demo-video/launch_demo.ps1.
"""
import json
import os
import shutil
import sqlite3
import sys
import uuid
from datetime import datetime, timedelta, timezone

ROOT = os.environ.get("DEMO_ROOT", r"C:\prose-demo")
USER_DATA = os.path.join(ROOT, "userData")
DOCS = os.path.join(ROOT, "Documents")

NOW = datetime.now(timezone.utc)


def iso(days_ago: float) -> str:
    return (NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def para(text: str | None = None) -> dict:
    node = {"type": "paragraph", "attrs": {"textAlign": None, "indent": 0, "noIndent": False, "lineHeight": None, "role": None}}
    if text:
        node["content"] = [{"type": "text", "text": text}]
    return node


def heading(text: str, level: int = 2) -> dict:
    return {"type": "heading", "attrs": {"level": level, "textAlign": None, "indent": 0}, "content": [{"type": "text", "text": text}]}


def doc(*nodes: dict) -> dict:
    return {"type": "doc", "content": list(nodes)}


def prose_file(title: str, file_type: str, content: dict, days_ago: float, fmt: str = "none") -> dict:
    return {
        "version": 1,
        "id": str(uuid.uuid4()),
        "title": title,
        "fileType": file_type,
        "format": fmt,
        "content": content,
        "headerContent": None,
        "footerContent": None,
        "pageMargins": {"top": 1, "right": 1, "bottom": 1, "left": 1} if file_type == "document" else None,
        "wordCountGoal": None,
        "createdAt": iso(days_ago + 3),
        "updatedAt": iso(days_ago),
        "citations": [],
        "snapshots": [],
    }


# ── Documents ────────────────────────────────────────────────────────────────

# Deliberately wordy paragraph (AI rewrite target, scene 3) and two typos
# (grammar-check beat, scene 2). Keep paragraph 2 as the AI target.
# No H1 title here on purpose: the MLA template adds its own centered title, and a body
# heading would show up as a duplicate. The outline beat uses "Team Sync Notes" instead.
essay = doc(
    para(
        "Climate change is a problem that many people have talked about for a very long time, "
        "and it is generally understood by most experts in the field that it is something that "
        "needs to be dealt with in a way that is both urgent and also sustainable over the long term."
    ),
    para(
        "In the case of local governments, there is a tendency to put off making decisions that "
        "would have the effect of costing money in the short term, even though it has been shown "
        "by a number of studies that the price of waiting is in fact much higher than the price of acting now."
    ),
    para(
        "Cities that have invested early in public transit and renewable energy have seen thier "
        "economies grow faster, and residents there report a higher quality of life than in cities that did not."
    ),
    para(
        "This essay will argue that cities should adopt binding emissions targets, "
        "and it will propose a realistic timeline for doing so."
    ),
)

notes = doc(
    heading("Team Sync: Product Launch", 1),
    para("Attendees: Alex, Priya, Jordan, Sam"),
    heading("Decisions", 2),
    para("Launch date moved to the first week of November."),
    para("Priya owns the landing page copy. Jordan owns the release notes."),
    heading("Action items", 2),
    para("Finalize pricing page by Friday."),
    para("Record the demo walkthrough."),
)

reading = doc(
    heading("Reading Response: The Overstory", 1),
    para(
        "Richard Powers frames the forest not as a backdrop but as a character with its own long "
        "sense of time. The structure of the novel, moving from roots to trunk to crown, mirrors "
        "how the human stories grow out of one another."
    ),
    para("What stayed with me most was the idea that trees communicate and share resources."),
)

# ── Sheet ────────────────────────────────────────────────────────────────────

def sheet_tab() -> dict:
    header = ["Month", "Region", "Units", "Revenue"]
    rows = [
        ("July", "North", 120, 14400), ("July", "South", 95, 11400), ("July", "East", 140, 16800), ("July", "West", 80, 9600),
        ("August", "North", 135, 16200), ("August", "South", 110, 13200), ("August", "East", 150, 18000), ("August", "West", 92, 11040),
        ("September", "North", 160, 19200), ("September", "South", 125, 15000), ("September", "East", 170, 20400), ("September", "West", 105, 12600),
    ]
    cells: dict = {}
    for c, h in enumerate(header):
        cells[f"0,{c}"] = {"value": h, "format": {"bold": True}}
    for r, row in enumerate(rows, start=1):
        for c, v in enumerate(row):
            cells[f"{r},{c}"] = {"value": v}
    return {
        "id": "sheet-1",
        "name": "Q3 Sales",
        "cells": cells,
        "rowCount": 100,
        "colCount": 26,
        "colWidths": [110, 100, 80, 100],
        "rowHeights": [],
        "mergedCells": [],
    }


sheet = {"version": 1, "tabs": [sheet_tab()]}

# ── Board / Slides (start essentially blank; scenes 5 and 6 fill them live) ──

board = {"version": 2, "elements": [], "appState": {}}

slides = {
    "version": 1,
    "slides": [{"id": "slide-1", "elements": [], "notes": "", "animations": []}],
    "theme": {
        "id": "minimal", "name": "Minimal", "primaryColor": "#111827", "secondaryColor": "#374151",
        "accentColor": "#3B82F6", "backgroundColor": "#FFFFFF", "textColor": "#111827",
        "headingFontFamily": "Inter", "bodyFontFamily": "Inter",
    },
    "settings": {"aspectRatio": "16:9", "defaultFontFamily": "Inter", "defaultFontSize": 18},
}

FILES = [
    ("Climate Policy Essay", "document", essay, 0.2),
    ("Team Sync Notes", "document", notes, 1.5),
    ("Reading Response", "document", reading, 4),
    ("Q3 Sales", "sheet", sheet, 0.5),
    ("Launch Brainstorm", "board", board, 2),
    ("Quarterly Review", "slides", slides, 3),
]


def main() -> None:
    if os.path.exists(ROOT):
        shutil.rmtree(ROOT)
    os.makedirs(USER_DATA)
    os.makedirs(DOCS)

    for title, ftype, content, days in FILES:
        path = os.path.join(DOCS, f"{title}.prose")
        with open(path, "w", encoding="utf8") as f:
            json.dump(prose_file(title, ftype, content, days), f)

    db = sqlite3.connect(os.path.join(USER_DATA, "prose-settings.db"))
    db.execute("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    settings = {
        "documentsFolder": DOCS,
        "theme": "dark",
        "ollamaModel": "llama3.2:3b",
    }
    for k, v in settings.items():
        db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (k, json.dumps(v)))
    db.commit()
    db.close()

    print(f"Seeded {len(FILES)} files in {DOCS}")
    print(f"Settings DB: {os.path.join(USER_DATA, 'prose-settings.db')}")


if __name__ == "__main__":
    sys.exit(main())
