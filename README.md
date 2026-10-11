# Mission Control

One neon city screen showing every project in Robin's personal vault: what it is building, its state, the next step, what it is waiting on, and how far along it is. Finished projects form the downtown core; the city levels up as floors get built.

The vault note for this project: `Projects/Mission Control Dashboard/Mission Control Dashboard.md`.

## How it works

The page reads the vault itself. No Python, server, Claude or scheduled run is needed to keep it current. Obsidian Sync only has to carry the notes.

```
vault/Projects/**/*.md, vault/Archive/**/*.md  (type: project)
        │
        ├─ in the page: Connect vault (once) → Refresh → template/vault-parser.js → city redrawn, no reload
        │
        └─ build.py → snapshot embedded in the page (shown until the vault is connected)
                      and --check for the weekly sweep

template/mission-control.template.html ─┐
template/vault-parser.js (inlined)      ─┼─ build.py ─► vault/00 Home/Mission Control.html
vendor/three.min.js (r128, inlined)     ─┘
```

**Live refresh (Chrome or Edge).** Open `00 Home/Mission Control.html`. Click **CONNECT VAULT** and pick the vault folder once. The page keeps that folder handle in the browser (IndexedDB) and reads every `type: project` note under `Projects/` and `Archive/` with the File System Access API. **REFRESH** re-reads them and redraws the city, cards, counts and HUD. It also refreshes by itself when the tab comes back into view after 30 s or more. The status line shows **LIVE** and the time of the last refresh.

- Each machine connects once, to its own path (`E:` on the desktop, `D:` on the laptop).
- Chrome may ask once per browser session before the page can read the folder again. The button then reads **ALLOW VAULT ACCESS**: one click. Chrome 122+ can offer "Allow on every visit", which removes that click; whether it does for a page opened from disk (`file://`) is untested.
- Before the vault is connected, or in a browser without folder access (Firefox, Obsidian's own viewer), the page shows the data embedded at the last build and labels it **SNAPSHOT FROM** that date.
- Warnings (missing or invalid fields) show in the small **WARNINGS** panel at the top right.

**`build.py`** is standard library only. It has two jobs now: assembling the page when the template changes, and `--check` for the weekly sweep. Its parser and `template/vault-parser.js` must give the same result; `tests/run_tests.cjs` checks that on the real vault and on an edge-case vault.

## The fields it reads

Every project note carries these in its frontmatter:

```yaml
code: EDG                 # 3-letter call sign shown on the building
name: "Edge AI Home Lab"  # optional short display name; the note title is used when absent
northstar: "One line on what the project is building."
progress: 60              # 0 to 100. One floor per 10%.
lane: ready               # ready | waiting | blocked | parked   (landed from status: completed; status: parked also gives parked)
kind: hardware            # software | making | hardware | career | athletics. Sets the building shape (v0.2)
size: XL                  # S | M | L | XL. Sets the building height (v0.2): 6, 10, 16, 24 floors
next: "The next concrete step."
waiting_on: ""            # what Robin has to do or what is blocking; empty when nothing
```

Also used if present: `status`, `completed`, `updated`, `created`, `project` (slug), `area`.

Rules (the same in `build.py` and `template/vault-parser.js`):
- `status: completed` (or `complete`) forces `lane: landed` and `progress: 100`. `status: parked` forces `lane: parked`.
- A project with no valid `lane` is skipped, with a warning.
- `progress` that is not a number (including `60 # comment`) counts as 0, with a warning. It is clamped to 0 to 100.
- STALE: `updated` (or, if the note has none, the note file's modified date) more than 30 days old. Not for parked or landed projects. An `updated` that is not a real date is a warning.
- `kind` and `size` are passed to the page; a missing or invalid one is a warning (size falls back to M). The page does not draw them yet (v0.2).
- An empty `northstar` or `next` on a project that has not landed is a warning.
- `name` falls back to the note's `# ` heading (leading emoji, "Project " and " MOC" removed), then the file name. `code` falls back to the first three letters of the name.

## Running it

- **Robin**: open the page and press **REFRESH** after editing notes. Rebuild only when the template changes: double-click `build.bat` (it creates a project-local `.venv` on first run; nothing is installed).
- **Claude**: rebuilds after a template change, and republishes the artifact mirror (`--mirror`).
- `python build.py --check` parses and reports warnings without writing. The weekly sweep uses this.
- `python build.py --mirror --out FILE` writes a snapshot-only page (no Connect or Refresh) for the artifact mirror, which cannot read the vault.
- The vault is auto-detected (`E:\ObsidianVaults\robin-personal`, then `D:\...`, or `MC_VAULT`).

## Tests

```
node tests/run_tests.cjs --vault "E:\ObsidianVaults\robin-personal" --python .venv\Scripts\python.exe
```

Needs Node 18+ and Playwright with its Chromium (dev only). Writes to `tests/out/` (git-ignored), never to the vault. It checks:
1. Parity: `build.py --dump` and `vault-parser.js` give identical projects and warnings, in the same order, on the real vault and on a generated edge-case vault (BOM, CRLF, bad lanes, bad dates, lists, odd file names, invalid UTF-8).
2. In headless Chromium, on the page opened from `file://`: the snapshot fallback; Connect vault with the picker stubbed by a fake folder, and parity again in the browser; Refresh after an edit and a new note, with no reload; the warnings panel; a folder that is not the vault; a stored folder that needs one Allow click; a stored folder already allowed; IndexedDB on `file://`; a real folder handle kept in IndexedDB across a reload (over `http://127.0.0.1`, since the origin private file system is blocked on `file://`); the mirror build; a browser without folder access; no console errors.

The folder picker itself and Chrome's permission prompt cannot be automated. Those need a person: see the vault note §9.

## City rules (in the template)

- Downtown core: landed. Inner ring: ready. Outer ring: waiting on me. Far corners: blocked.
- City XP = floors built (one floor per 10% of a project). 30 floors per level.
- Levels unlock: roads and core (1), streetlights (2), inner-ring infill and parks (3), monorail (4), outer-ring infill and billboards (5), skyline towers (6), far-corner lights (7), second monorail (8). Levels 5 to 8 are declared but not all drawn yet; see the vault note's Phase 5.
- Infill placement is seeded, so the city does not reshuffle between refreshes.
- A lane whose zone is full (the core has 4 lots) spills to the nearest free lot, so a fifth landed project still gets a building.

## Known limits

- Fonts load from Google Fonts. Offline, the page falls back to system fonts and still works. Inlining the fonts is a Phase 4 item.
- No post-processing bloom; glow is faked with emissive materials.
- Live refresh needs Chrome or Edge. It does not work inside Obsidian or in Firefox; those show the snapshot.
- Links into Obsidian use `obsidian://open?vault=robin-personal&file=...`, which works on any machine that has the vault open.
