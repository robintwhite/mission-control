#!/usr/bin/env python3
r"""Build Mission Control: one standalone HTML page of every project in Robin's vault.

Reads the frontmatter of every `type: project` note under Projects/ and Archive/,
injects that data (as a snapshot), the in-page vault parser and an inlined three.js
into the template, and writes `<vault>/00 Home/Mission Control.html`.

The page reads the vault itself once connected (Connect vault, then Refresh), using
template/vault-parser.js. That file is a port of collect() below. Keep the two in step;
tests/run_tests.cjs checks them against each other.

Standard library only. No installs needed.

    python build.py                 # auto-detects the vault (E:\ or D:\, or MC_VAULT)
    python build.py --vault PATH    # explicit vault
    python build.py --out FILE      # write somewhere else
    python build.py --check         # parse and report, write nothing (the weekly sweep uses this)
    python build.py --mirror        # snapshot-only page for the artifact mirror (no Connect or Refresh)
    python build.py --dump FILE     # also write the parsed projects and warnings as JSON (tests)
    python build.py --today DATE    # pretend today is DATE (YYYY-MM-DD), for tests
"""
import argparse, json, os, re, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
TEMPLATE = os.path.join(HERE, "template", "mission-control.template.html")
PARSER = os.path.join(HERE, "template", "vault-parser.js")
THREE = os.path.join(HERE, "vendor", "three.min.js")
FONTS = [  # (family, weight, file in vendor/fonts). Latin subsets from @fontsource, SIL OFL (vendor/fonts/LICENSES.txt)
    ("Monoton", 400, "monoton-latin-400-normal.woff2"),
    ("Rajdhani", 500, "rajdhani-latin-500-normal.woff2"),
    ("Rajdhani", 600, "rajdhani-latin-600-normal.woff2"),
    ("Rajdhani", 700, "rajdhani-latin-700-normal.woff2"),
    ("Share Tech Mono", 400, "share-tech-mono-latin-400-normal.woff2"),
]
VAULT_NAME = "robin-personal"
CANDIDATES = [os.environ.get("MC_VAULT", ""), r"E:\ObsidianVaults\robin-personal", r"D:\ObsidianVaults\robin-personal",
              os.path.expanduser("~/mnt/robin-personal")]
LANES = ["ready", "waiting", "blocked", "parked", "landed"]
KINDS = {"software", "making", "hardware", "career", "athletics"}
SIZES = {"S", "M", "L", "XL"}
SIZE_FLOORS = {"S": 6, "M": 10, "L": 16, "XL": 24}  # building height by size (v0.2)
STALE_DAYS = 30
XP_PER_LEVEL = 30  # city XP per level. XP = lit floors, plus the building's floors again when it lands


def lit_floors(progress, floors):
    """progress % of the building's floors, rounded half up. Integer maths, so Python and JS agree exactly."""
    return (2 * progress * floors + 100) // 200


def city_stats(projects):
    """City XP and level. Same formula as cityStats() in template/vault-parser.js."""
    lit = sum(p["lit"] for p in projects)
    bonus = sum(p["floors"] for p in projects if p["lane"] == "landed")
    xp = lit + bonus
    return {"lit": lit, "bonus": bonus, "xp": xp, "level": 1 + xp // XP_PER_LEVEL, "per_level": XP_PER_LEVEL}


def find_vault(explicit):
    for c in ([explicit] if explicit else []) + CANDIDATES:
        if c and os.path.isdir(os.path.join(c, "Projects")):
            return os.path.abspath(c)
    sys.exit("Vault not found. Pass --vault or set MC_VAULT.")


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


def collect(vault, today):
    projects, warnings = [], []
    for top in ("Projects", "Archive"):
        root = os.path.join(vault, top)
        if not os.path.isdir(root):
            continue
        for dirpath, _, files in os.walk(root):
            for fn in files:
                if not fn.endswith(".md"):
                    continue
                path = os.path.join(dirpath, fn)
                rel = os.path.relpath(path, vault).replace(os.sep, "/")[:-3]
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
                    "wait": str(fm.get("waiting_on") or ""), "updated": updated,
                    "completed": str(fm.get("completed") or ""), "stale": stale,
                    "area": str(fm.get("area") or ""), "kind": kind, "size": size,
                    "floors": SIZE_FLOORS[size], "lit": lit_floors(progress, SIZE_FLOORS[size]), "note": rel,
                    "link": "obsidian://open?vault=" + VAULT_NAME + "&file=" + quote(rel),
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


def script_json(obj):
    """JSON that is safe inside a <script> block (a note containing </script> cannot end it)."""
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault")
    ap.add_argument("--out")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--mirror", action="store_true", help="snapshot-only page for the artifact mirror")
    ap.add_argument("--dump", help="write the parsed projects and warnings as JSON to this file")
    ap.add_argument("--today", help="YYYY-MM-DD, for tests")
    a = ap.parse_args()
    vault = find_vault(a.vault)
    today = datetime.date.fromisoformat(a.today) if a.today else datetime.date.today()
    projects, warnings = collect(vault, today)
    for w in warnings:
        print("warning:", w)
    counts = {l: sum(p["lane"] == l for p in projects) for l in LANES}
    st = city_stats(projects)
    print(f"{len(projects)} projects: {counts}; {st['lit']} floors lit + {st['bonus']} landing bonus = {st['xp']} XP, "
          f"city level {st['level']}; {len(warnings)} warnings")
    if a.dump:
        with open(a.dump, "w", encoding="utf-8") as f:
            json.dump({"projects": projects, "warnings": warnings, "stats": st}, f, ensure_ascii=False, indent=1)
    if a.check:
        return
    tpl = open(TEMPLATE, encoding="utf-8").read()
    three = open(THREE, encoding="utf-8").read()
    parser = open(PARSER, encoding="utf-8").read()
    snapshot = {"built": today.isoformat(), "projects": projects, "warnings": warnings}
    build = {"live": not a.mirror, "vault": VAULT_NAME}
    data = "const SNAPSHOT=" + script_json(snapshot) + ";\nconst BUILD=" + script_json(build) + ";"
    html = tpl.replace("/*FONTS*/", font_css(), 1).replace("/*THREE*/", three, 1).replace("/*DATA*/", data, 1).replace("/*PARSER*/", parser, 1)
    out = a.out or os.path.join(vault, "00 Home", "Mission Control.html")
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)
    print("wrote", out, f"({os.path.getsize(out) // 1024} KB)")


if __name__ == "__main__":
    main()
