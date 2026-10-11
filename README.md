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
progress: 60              # 0 to 100. The lit share of the building's floors.
lane: ready               # ready | waiting | blocked | parked   (landed from status: completed; status: parked also gives parked)
kind: hardware            # software | making | hardware | career | athletics. Sets the building shape
size: XL                  # S | M | L | XL. Sets the building height: 6, 10, 16, 24 floors
next: "The next concrete step."
waiting_on: ""            # what Robin has to do or what is blocking; empty when nothing
```

Also used if present: `status`, `completed`, `updated`, `created`, `project` (slug), `area`.

Rules (the same in `build.py` and `template/vault-parser.js`):
- `status: completed` (or `complete`) forces `lane: landed` and `progress: 100`. `status: parked` forces `lane: parked`.
- A project with no valid `lane` is skipped, with a warning.
- `progress` that is not a number (including `60 # comment`) counts as 0, with a warning. It is clamped to 0 to 100.
- STALE: `updated` (or, if the note has none, the note file's modified date) more than 30 days old. Not for parked or landed projects. An `updated` that is not a real date is a warning.
- `size` sets the floors: S 6, M 10, L 16, XL 24. Lit floors = `progress` % of those, rounded half up (50% of S = 3, 25% of S = 2). Both parsers add `floors` and `lit` to each project, with integer maths so they agree exactly.
- `kind` sets the building shape (see City rules). A missing or invalid `kind` or `size` is a warning (size falls back to M; a missing kind draws as software).
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

3. City (added in v0.2 steps 2 and 3): heights from size and lit floors from progress for every building; size-weighted XP and level, the same in Python and JS; first visit; "since your last visit" with a seeded record (strip text, floors lighting one by one, the landing moment, selection, clicking a strip item, a reload in the same sitting, the next visit); the sound toggle and its memory; a project landing on Refresh (crown, XP, sting, level-up toast); no label over another label or the HUD from six camera angles and at phone width; reduced motion; floor height and roof by kind; the tarp and rust; each level's unlocks drawn, up to 10, and rising in on a level up; the draw-call budget; fonts built in; the `#fps` readout.

The folder picker itself, Chrome's permission prompt and whether sound is heard cannot be automated. Those need a person: see the vault note §9.

## City rules (in the template)

- Downtown core: landed. Inner ring: ready. Outer ring: waiting on me. Far corners: blocked.
- City XP = lit floors, plus a landing bonus equal to the building's floors when it lands (an XL landing is worth 24 more, an S landing 6). 30 XP per level. `cityStats()` in `vault-parser.js` and `city_stats()` in `build.py` compute it; the tests check they agree.
- Height comes from `size`. Within each zone the tallest buildings take the lots nearest the centre.
- Levels unlock, and every level draws something: roads and core (1), streetlights (2), inner-ring infill and parks (3), a monorail over the ring road (4), outer-ring infill and holo billboards on the roofs (5), skyline towers around the city (6), far-corner streetlights (7), a second monorail on the outer road (8), flying traffic (9), searchlights (10). On a level up the new things rise in. Past level 10 nothing new is drawn yet.
- Both monorails follow roads, so they never cut through a building.
- **Shape by kind:** software is a glass tower with setbacks; making a low, wide workshop with a sawtooth roof and chimney; hardware an industrial block with pipes, a dish and antennas; career a stepped office with a rooftop sign; athletics a round arena tower with a dome. The roof shows as a wire outline until the building tops out, then goes solid.
- **Parked:** the unbuilt floors sit under a tarp and the beacon is steady.
- **Stale** (no update for over 30 days, not parked or landed): the lights dim and the crane stops. Over 60 days it rusts.
- Infill placement is seeded, so the city does not reshuffle between refreshes.
- A lane whose zone is full (the core has 4 lots) spills to the nearest free lot, so a fifth landed project still gets a building.

## Since your last visit, and the landing moment

- The page remembers what it last showed, in this browser (`localStorage`, one record per machine). Nothing is written to the vault.
- On open it compares with that record. A strip under the status line lists what changed (`HKY +2 FLOORS`, `MCD LANDED`, `NEW · WEB`, a rescope, a lane change) and the XP gained. Click an item to select that building. New floors light up one by one in the city.
- The connected page compares its first live read. If Chrome needs the ALLOW VAULT ACCESS click, the strip waits for it. A page that cannot go live (the phone mirror, Firefox, a vault not connected yet) compares the snapshot.
- A reload within 30 minutes keeps the same comparison, so the strip does not vanish on F5. After 30 minutes away, the next open compares with what you last saw.
- The first open on a browser has nothing to compare with; the strip says so.
- After a Refresh, whatever changed since the previous read plays the same way.
- **Landing:** the crown (spire, halo, beacon) grows on top, a ring bursts out and a beam of light goes up, the building is selected, a toast shows the landing bonus, and a short synth sting plays (longer for L and XL). A level up gets its own toast.
- **Sound** is on by default. ♪ SOUND ON / OFF at the bottom right of the city, remembered in this browser. Chrome only plays sound after a click or key press on the page; a sting asked for before that waits up to 20 s for the first click, then is dropped. The light show runs either way.
- Reduced motion: no floor-by-floor show, floors appear at once; landings still toast.

## Performance

- Each building is a few draw calls, not one per floor: floors with the same footprint are one instanced mesh, and their edges and scaffold one line set each, shown by draw range. Streetlights, trees, rubble, pylons, infill and skyline towers are instanced too. About 365 draw calls for today's city, about 415 with everything unlocked. The tests hold it under 600.
- Add `#fps` to the end of the page address for a frame-rate readout (FPS, draw calls, triangles). Use it on the laptop.

## Labels

Labels are placed nearest building first. A label that would cover another moves up a row (with a thin leader line back to its building) or to the side. If there is no room it hides until you hover the building. The selected and hovered labels always show. The HUD, legend and buttons count as taken space.

## Known limits

- Fonts are built into the page (`vendor/fonts`, latin subsets from @fontsource, SIL Open Font License, see `vendor/fonts/LICENSES.txt`). Symbols outside the latin set (⟳ ♪ ■) use system fonts.
- No post-processing bloom; glow is faked with emissive materials.
- Live refresh needs Chrome or Edge. It does not work inside Obsidian or in Firefox; those show the snapshot.
- Links into Obsidian use `obsidian://open?vault=robin-personal&file=...`, which works on any machine that has the vault open.
