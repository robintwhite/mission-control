#!/usr/bin/env python3
r"""Build Mission Control: one standalone HTML page of every project in a folder of markdown notes.

A project is any `.md` note with `type: project` in its frontmatter, anywhere under the folder
(hidden folders, node_modules and any folder named Templates are skipped). An optional
`mission-control.md` note at the folder root sets the title, which folders to read, and the links.
No Obsidian needed; any editor works.

Injects the parsed data (as a snapshot), the in-page parser and an inlined three.js into the
template, and writes `Mission Control.html` into the folder (or where the settings note's `out` says).

The page reads the folder itself once connected (Connect folder, then Refresh), using
template/vault-parser.js. That file is a port of collect() below. Keep the two in step;
tests/run_tests.cjs checks them against each other.

Standard library only. No installs needed.

    python build.py                  # the folder from MC_FOLDER, or the one remembered in .mc-folder (asks once)
    python build.py --folder PATH    # explicit folder (--vault is the same)
    python build.py --out FILE       # write somewhere else
    python build.py --check          # parse and report, write nothing
    python build.py --mirror         # snapshot-only page (no Connect or Refresh), e.g. for a phone
    python build.py --demo           # label the snapshot as a demo city (the release page)
    python build.py --dump FILE      # also write the parsed projects and warnings as JSON (tests)
    python build.py --today DATE     # pretend today is DATE (YYYY-MM-DD), for tests
"""
import argparse, json, os, re, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "template", "mission-control.template.html")
PARSER = os.path.join(HERE, "template", "vault-parser.js")
THREE = os.path.join(HERE, "vendor", "three.min.js")
GLTF = os.path.join(HERE, "vendor", "GLTFLoader.js")  # three.js r128 examples loader, same licence as three (vendor/THREE-LICENSE.txt)
MODELS_DIR = os.path.join(HERE, "assets", "models")  # the Meshy hero pieces, cleaned by tools/clean-models.cjs (art pass 3)
FONTS = [  # (family, weight, file in vendor/fonts). Latin subsets from @fontsource, SIL OFL (vendor/fonts/LICENSES.txt)
    ("Monoton", 400, "monoton-latin-400-normal.woff2"),
    ("Rajdhani", 500, "rajdhani-latin-500-normal.woff2"),
    ("Rajdhani", 600, "rajdhani-latin-600-normal.woff2"),
    ("Rajdhani", 700, "rajdhani-latin-700-normal.woff2"),
    ("Share Tech Mono", 400, "share-tech-mono-latin-400-normal.woff2"),
]
SETTINGS_NOTE = "mission-control.md"  # optional, at the folder root: title, folders, links, obsidianVault, out
REMEMBERED = os.path.join(HERE, ".mc-folder")  # the folder asked for once, per machine (git-ignored)
DEFAULT_TITLE = "MY PROJECTS"
LANES = ["ready", "waiting", "blocked", "parked", "landed"]
KINDS = {"software", "making", "hardware", "career", "athletics"}
KIND_ORDER = ["software", "making", "hardware", "career", "athletics"]  # the order the landmark stats use (same in vault-parser.js)
SIZES = {"S", "M", "L", "XL"}
SIZE_FLOORS = {"S": 6, "M": 10, "L": 16, "XL": 24}  # building height by size (v0.2)
STALE_DAYS = 30
XP_PER_LEVEL = 30  # city XP per level. XP = lit floors, plus the building's floors again when it lands
ACTIVE_DAYS = 7  # a project counts as active (traffic on the roads) when `updated` is this many days old or less


def lit_floors(progress, floors):
    """progress % of the building's floors, rounded half up. Integer maths, so Python and JS agree exactly."""
    return (2 * progress * floors + 100) // 200


def city_stats(projects):
    """City XP and level. Same formula as cityStats() in template/vault-parser.js."""
    lit = sum(p["lit"] for p in projects)
    bonus = sum(p["floors"] for p in projects if p["lane"] == "landed")
    xp = lit + bonus
    landed = sum(1 for p in projects if p["lane"] == "landed")
    active7 = sum(1 for p in projects if p["days"] is not None and p["days"] <= ACTIVE_DAYS)
    # projects landed per kind (art pass 3): a kind's first landing unlocks its landmark
    landed_kinds = {k: sum(1 for p in projects if p["lane"] == "landed" and p["kind"] == k) for k in KIND_ORDER}
    return {"lit": lit, "bonus": bonus, "xp": xp, "level": 1 + xp // XP_PER_LEVEL, "per_level": XP_PER_LEVEL,
            "landed": landed, "active7": active7, "landed_kinds": landed_kinds}


def real_date(s):
    try:
        datetime.date.fromisoformat(s)
        return True
    except ValueError:
        return False


def find_folder(explicit):
    """--folder, then MC_FOLDER (or MC_VAULT), then the folder remembered in .mc-folder. At a prompt, asks once and remembers."""
    clean = lambda c: os.path.expanduser(c.strip().strip('"').strip())
    if explicit:
        if os.path.isdir(clean(explicit)):
            return os.path.abspath(clean(explicit))
        sys.exit(f"Folder not found: {explicit}")
    tried = [os.environ.get("MC_FOLDER", ""), os.environ.get("MC_VAULT", "")]
    if os.path.isfile(REMEMBERED):
        with open(REMEMBERED, encoding="utf-8") as f:
            tried.append(f.read().strip())
    for c in tried:
        if c and os.path.isdir(clean(c)):
            return os.path.abspath(clean(c))
    if sys.stdin.isatty():
        c = clean(input("Folder with your project notes: "))
        if os.path.isdir(c):
            with open(REMEMBERED, "w", encoding="utf-8") as f:
                f.write(os.path.abspath(c) + "\n")
            print(f"Remembered in {os.path.basename(REMEMBERED)}. Delete that file to pick another folder.")
            return os.path.abspath(c)
        sys.exit(f"Folder not found: {c}")
    sys.exit("No folder. Pass --folder PATH or set MC_FOLDER.")


def parse_frontmatter(text):
    """Minimal YAML: `key: value` lines, quoted or bare scalars, `[a, b]` lists, `- item` lists. Enough for this vault."""
    if not text.startswith("---"):
        return None, text
    end = text.find("\n---", 3)
    if end < 0:
        return None, text
    fm, body = text[4:end], text[end + 4:]
    out, key = {}, None
    for line in fm.splitlines():
        if not line.strip():
            continue
        m = re.match(r"^([A-Za-z_][\w-]*):\s*(.*)$", line)
        if m:
            key, val = m.group(1), m.group(2).strip()
            if val == "":
                out[key] = []  # may become a `- item` list
            elif val.startswith("[") and val.endswith("]"):
                out[key] = [v.strip().strip('"\'') for v in val[1:-1].split(",") if v.strip()]
            else:
                if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                    val = val[1:-1].replace('\\"', '"')
                out[key] = val
        elif line.lstrip().startswith("- ") and key is not None and isinstance(out.get(key), list):
            out[key].append(line.lstrip()[2:].strip().strip('"\''))
    return out, body


def title_of(body, fallback):
    for line in body.splitlines():
        if line.startswith("# "):
            t = line[2:].strip()
            t = re.sub(r"^[^\w\[]+", "", t)  # drop a leading emoji
            t = re.sub(r"\s+MOC$", "", t)
            t = t.replace("Project ", "", 1) if t.startswith("Project ") else t
            return t.strip()
    return fallback


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def skip_dir(name):
    """Folders never read: hidden ones (.obsidian, .git, .trash), node_modules, and Templates (a template note is not a project)."""
    return name.startswith(".") or name == "node_modules" or name.lower() == "templates"


def norm_folder(f):
    """A folder from the settings note as a clean relative path: / for \\, no empty or "." parts. "" is the whole folder."""
    return "/".join(x for x in f.replace("\\", "/").split("/") if x.strip() not in ("", "."))


def out_path(vault, out_rel):
    """Where the page goes: the settings note's `out` when it is an .html path inside the folder, else Mission Control.html."""
    rel = norm_folder(out_rel)
    parts = rel.split("/") if rel else []
    if out_rel and (not rel.lower().endswith(".html") or ".." in parts or ":" in rel):
        print(f"warning: {SETTINGS_NOTE}: out '{out_rel}' is not an .html path inside the folder; using Mission Control.html")
        parts = []
    return os.path.join(vault, *(parts or ["Mission Control.html"]))


def read_settings(vault):
    """The optional settings note. Returns (settings shared with vault-parser.js, out path, warnings)."""
    warnings, fm = [], None
    path = os.path.join(vault, SETTINGS_NOTE)
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8-sig") as fh:
                fm, _ = parse_frontmatter(fh.read())
        except Exception:
            warnings.append(f"{SETTINGS_NOTE}: unreadable; using the defaults")
    fm = fm or {}
    folders = fm.get("folders") or []
    folders = [folders] if isinstance(folders, str) else folders
    seen = []
    for f in folders:
        f = norm_folder(f)
        if f not in seen:
            seen.append(f)
    auto = "obsidian" if os.path.isdir(os.path.join(vault, ".obsidian")) else "none"
    links = str(fm.get("links") or "").lower()
    if not links:
        links = auto
    elif links not in ("obsidian", "none"):
        warnings.append(f"{SETTINGS_NOTE}: links '{links}' is not obsidian or none; using {auto}")
        links = auto
    settings = {
        "title": str(fm.get("title") or "") or DEFAULT_TITLE,
        "folders": seen,
        "links": links,
        "vault": str(fm.get("obsidianVault") or "") or os.path.basename(os.path.normpath(os.path.abspath(vault))),
    }
    return settings, str(fm.get("out") or ""), warnings


def note_files(vault, settings, warnings):
    """(path, rel without .md, file name) for every .md note to read: the whole folder, or only the settings' folders."""
    out, seen = [], set()
    for top in (settings["folders"] or [""]):
        parts = top.split("/") if top else []
        root = os.path.join(vault, *parts)
        if ".." in parts or ":" in top or not os.path.isdir(root):  # only folders inside this one
            warnings.append(f"{SETTINGS_NOTE}: folder '{top}' not found")
            continue
        for dirpath, dirnames, files in os.walk(root):
            dirnames[:] = [d for d in dirnames if not skip_dir(d)]
            for fn in files:
                if not fn.endswith(".md"):
                    continue
                path = os.path.join(dirpath, fn)
                rel = (top + "/" if top else "") + os.path.relpath(path, root).replace(os.sep, "/")
                if rel == SETTINGS_NOTE or rel in seen:
                    continue
                seen.add(rel)
                out.append((path, rel[:-3], fn))
    return out


def collect(vault, today, settings=None):
    if settings is None:
        settings, _, warnings = read_settings(vault)
    else:
        warnings = []
    projects = []
    for path, rel, fn in note_files(vault, settings, warnings):
        try:
            with open(path, encoding="utf-8-sig") as fh:  # -sig drops a BOM, as the browser does
                text = fh.read()
        except Exception:
            warnings.append(f"{rel}.md: unreadable, skipped")
            continue
        fm, body = parse_frontmatter(text)
        if not fm or fm.get("type") != "project":
            continue
        name = str(fm.get("name") or "") or title_of(body, re.sub(r"\s+MOC$", "", fn[:-3]))
        status = str(fm.get("status", "")).lower()
        if status == "complete":
            status = "completed"
        lane = str(fm.get("lane", "")).lower() or ("landed" if status == "completed" else "")
        if status == "completed":
            lane = "landed"
        elif status == "parked":
            lane = "parked"
        if lane not in LANES:
            warnings.append(f"{rel}: lane '{lane}' missing or invalid (ready|waiting|blocked|parked|landed); skipped")
            continue
        try:
            progress = int(float(fm.get("progress", 100 if lane == "landed" else 0)))
        except Exception:  # ValueError, TypeError (an empty `progress:`), OverflowError (inf)
            warnings.append(f"{rel}: progress not a number; using 0")
            progress = 0
        progress = max(0, min(100, progress))
        if lane == "landed":
            progress = 100
        code = str(fm.get("code") or "").upper() or slug(name)[:3].upper()
        # `updated` if the note has it, else the note file's last-modified date (a fair proxy for activity)
        updated = str(fm.get("updated") or "")
        if not updated:
            updated = datetime.date.fromtimestamp(os.path.getmtime(path)).isoformat()
        if lane == "landed":
            updated = str(fm.get("completed") or updated)
        stale = 0
        if lane not in ("landed", "parked") and re.match(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", updated):
            try:
                d = (today - datetime.date.fromisoformat(updated)).days
                stale = d if d > STALE_DAYS else 0
            except ValueError:
                warnings.append(f"{rel}: updated '{updated}' is not a real date")
        # days since `updated` (for landed: since `completed`), for the traffic. None when it is not a real date
        days = None
        if re.match(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", updated) and real_date(updated):
            days = (today - datetime.date.fromisoformat(updated)).days
        # `created` places the building: oldest at the centre, newer ones outward. It never moves after that
        created = str(fm.get("created") or "")
        if not created:
            warnings.append(f"{rel}: 'created' is empty; placed on the outer edge")
        elif not re.match(r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$", created) or not real_date(created):
            warnings.append(f"{rel}: created '{created}' is not a date (YYYY-MM-DD); placed on the outer edge")
            created = ""
        kind = str(fm.get("kind") or "").lower()
        if kind not in KINDS:
            warnings.append(f"{rel}: kind '{kind}' missing or invalid (software|making|hardware|career|athletics)")
        size = str(fm.get("size") or "").upper()
        if size not in SIZES:
            warnings.append(f"{rel}: size '{size}' missing or invalid (S|M|L|XL); using M")
            size = "M"
        for k in ("northstar", "next"):
            if lane != "landed" and not fm.get(k):
                warnings.append(f"{rel}: '{k}' is empty")
        projects.append({
            "id": str(fm.get("project") or slug(name)),
            "code": code, "name": name, "lane": lane, "progress": progress,
            "north": str(fm.get("northstar") or ""), "next": str(fm.get("next") or ""),
            "wait": str(fm.get("waiting_on") or ""), "updated": updated, "created": created,
            "completed": str(fm.get("completed") or ""), "stale": stale, "days": days,
            "area": str(fm.get("area") or ""), "kind": kind, "size": size,
            "floors": SIZE_FLOORS[size], "lit": lit_floors(progress, SIZE_FLOORS[size]), "note": rel,
            "link": "obsidian://open?vault=" + quote(settings["vault"]) + "&file=" + quote(rel) if settings["links"] == "obsidian" else "",
        })
    projects.sort(key=lambda p: (LANES.index(p["lane"]), -p["progress"], p["name"], p["note"]))
    return projects, sorted(warnings)


def quote(s):
    from urllib.parse import quote as q
    return q(s, safe="")


def font_css():
    """@font-face rules with the fonts inlined, so the page needs no network."""
    import base64
    out = []
    for family, weight, fn in FONTS:
        with open(os.path.join(HERE, "vendor", "fonts", fn), "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        out.append(f"@font-face{{font-family:'{family}';font-style:normal;font-weight:{weight};font-display:swap;"
                   f"src:url(data:font/woff2;base64,{b64}) format('woff2')}}")
    return "\n".join(out)


def models_js():
    """The hero pieces (assets/models/*.glb) inlined as base64, so the page needs no files next to it.
    A missing folder or file gives an empty table and the page falls back to its drawn look."""
    import base64
    out = {}
    if os.path.isdir(MODELS_DIR):
        for fn in sorted(os.listdir(MODELS_DIR)):
            if fn.endswith(".glb"):
                with open(os.path.join(MODELS_DIR, fn), "rb") as f:
                    out[fn[:-4]] = base64.b64encode(f.read()).decode("ascii")
    return "const MODELS=" + json.dumps(out) + ";"


def script_json(obj):
    """JSON that is safe inside a <script> block: every "<" escaped, so no note text (</script>, <!--) can end or bend it."""
    return json.dumps(obj, ensure_ascii=False).replace("<", "\\u003c")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--folder", "--vault", dest="folder", help="the folder of project notes")
    ap.add_argument("--out")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--mirror", action="store_true", help="snapshot-only page (no Connect or Refresh)")
    ap.add_argument("--demo", action="store_true", help="label the snapshot as a demo city")
    ap.add_argument("--dump", help="write the parsed projects and warnings as JSON to this file")
    ap.add_argument("--today", help="YYYY-MM-DD, for tests")
    a = ap.parse_args()
    vault = find_folder(a.folder)
    today = datetime.date.fromisoformat(a.today) if a.today else datetime.date.today()
    settings, out_rel, swarn = read_settings(vault)
    projects, warnings = collect(vault, today, settings)
    warnings = sorted(swarn + warnings)
    for w in warnings:
        print("warning:", w)
    counts = {l: sum(p["lane"] == l for p in projects) for l in LANES}
    st = city_stats(projects)
    print(f"{len(projects)} projects: {counts}; {st['lit']} floors lit + {st['bonus']} landing bonus = {st['xp']} XP, "
          f"city level {st['level']}; {len(warnings)} warnings")
    if a.dump:
        with open(a.dump, "w", encoding="utf-8") as f:
            json.dump({"projects": projects, "warnings": warnings, "stats": st, "settings": settings}, f, ensure_ascii=False, indent=1)
    if a.check:
        return
    tpl = open(TEMPLATE, encoding="utf-8").read()
    three = open(THREE, encoding="utf-8").read()
    gltf = open(GLTF, encoding="utf-8").read() if os.path.exists(GLTF) else ""
    parser = open(PARSER, encoding="utf-8").read()
    snapshot = {"built": today.isoformat(), "projects": projects, "warnings": warnings, "settings": settings}
    build = {"live": not a.mirror, "demo": a.demo}
    data = "const SNAPSHOT=" + script_json(snapshot) + ";\nconst BUILD=" + script_json(build) + ";"
    # one pass, so text put in by one placeholder (a note that says /*PARSER*/) is never read as another
    parts = {"FONTS": font_css(), "THREE": three, "GLTF": gltf, "MODELS": models_js(), "DATA": data, "PARSER": parser}
    html = re.sub(r"/\*(FONTS|THREE|GLTF|MODELS|DATA|PARSER)\*/", lambda m: parts[m.group(1)], tpl)
    out = a.out or out_path(vault, out_rel)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("wrote", out, f"({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main()
