# Mission Control

One neon city screen showing every project in Robin's personal vault: what it is building, its state, the next step, what it is waiting on, and how far along it is. It is an isometric, low-poly city builder. Each project is a building on its own lot, placed by start date: the oldest round the town square, newer ones outward block by block. A building never moves; it rises floor by floor as progress goes up, and its lights come on when it lands. The city levels up as floors get built and grows outward with no cap. Mission Control HQ stands on the town square.

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
created: 2026-10-04       # start date. Places the building (oldest at the centre). Set once, never change it
updated: 2026-10-11       # last real progress. Drives stale (dark at 30 days, rust at 60) and the traffic (active = 7 days or less)
```

Also used if present: `status`, `completed`, `project` (slug), `area`.

Only the one note per project with `type: project` is read. The other notes in the project folder are ignored, even if they have `created` or `updated` lines. The detail panel shows that note's path.

Rules (the same in `build.py` and `template/vault-parser.js`):
- `status: completed` (or `complete`) forces `lane: landed` and `progress: 100`. `status: parked` forces `lane: parked`.
- A project with no valid `lane` is skipped, with a warning.
- `progress` that is not a number (including `60 # comment`) counts as 0, with a warning. It is clamped to 0 to 100.
- STALE: `updated` (or, if the note has none, the note file's modified date) more than 30 days old. Not for parked or landed projects. An `updated` that is not a real date is a warning.
- `days`: days since `updated` (for a landed project, since `completed`), worked out by both parsers. `null` when it is not a real date, negative for a future date. A project with `days` of 7 or less counts as active this week.
- `size` sets the floors: S 6, M 10, L 16, XL 24. Lit floors = `progress` % of those, rounded half up (50% of S = 3, 25% of S = 2). Both parsers add `floors` and `lit` to each project, with integer maths so they agree exactly.
- `kind` sets the building shape (see City rules). A missing or invalid `kind` or `size` is a warning (size falls back to M; a missing kind draws as software).
- An empty `northstar` or `next` on a project that has not landed is a warning.
- `created` must be a real `YYYY-MM-DD` date. Missing or not a date is a warning, and the building goes on the outer edge after every dated one.
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

3. City (added in v0.2 steps 2 and 3, and art pass 2a): heights from size and lit floors from progress for every building; size-weighted XP and level, the same in Python and JS; first visit; "since your last visit" with a seeded record (strip text, floors lighting one by one, the landing moment, selection, clicking a strip item, a reload in the same sitting, the next visit); the sound toggle and its memory; a project landing on Refresh (crown, XP, sting, level-up toast); no label over another label or the HUD from six camera angles and at phone width; reduced motion; floor height and roof by kind; the tarp and rust; each level's unlocks drawn, up to 10, and rising in on a level up; the draw-call budget; fonts built in; the `#fps` readout. Art pass 2b (section R): `days`, `landed` and `active7` in both parsers; blocks open by level (9, then 2 a level, no cap) and every block on a road; nothing outside the open blocks; growing never moves a block or a project (levels 1 to 40); ring 2 opens from the side middles in opposite pairs; road tiers; HQ floors and parts by level; the board follows the selection and faces the camera; the spotlight; lights only on landed buildings, work lights on active sites, dark when stopped; the gold ring only on landed; net on the top scaffold floor only; faint blueprints except the selected one; the blue title; cars by activity (4, 19, 48); a level 1 city; monuments at 5, 10 and 25 landed and the rocket launch; a very big city (61 XL landed, level 98) under budget; no drawing while scrolled away; reduced motion keeps the rocket on the pad. Art pass 2a (sections O, P, Q): lots in start-date order round a free town square, same-date projects side by side, no building moves on a progress change, a landing, parking or a new project; the build front (scaffold, frame, blueprint) on every site; cranes; status ring colours; landed sites cleared with trees; the kit varies and is seeded; zoned, parked, blocked, stale and topped-out stages; the isometric camera and drag; the sun only in the banner; street level; 600 draw calls and 150K triangles; undated notes on the outer edge.

The folder picker itself, Chrome's permission prompt and whether sound is heard cannot be automated. Those need a person: see the vault note §9.

## City rules (in the template)

- **Placement (art pass 2a).** Projects sorted by `created`, then name, then note path, take the lots in order. The centre block is the town square and stays free for Mission Control HQ. Lots go out block by block, four per block: ring 1 round the square first, then ring 2 onward from the middle of each side out to the corners, opposite sides in pairs. Status, progress and landing never move a building.
- Same start date: those projects take neighbouring lots, in name order. A new project with an older `created` than others slots in among them and moves the later ones one lot along. Give a new project today's date and nothing moves. A new project with the same date as one made the same day can sort before it by name; that moves the other one lot, once.
- **The city grows by blocks, with no cap (art pass 2b).** Levels 1 and 2: the square and ring 1 (9 blocks). From level 3, two more blocks open each level: ring 2 is full at level 10, ring 3 at level 22, and so on. A project that needs a lot in a block not open yet opens that block too. Roads run round every open block, so every building stands on a road. No skyline towers. Growing only adds blocks; nothing already there moves.
- The next three free lots stay zoned for the next projects. Ring 1 fills with infill by level. A newer block opens as empty lots and rubble and fills in over the levels after it opened. Ring 4 and out are low-rise outskirts (one or two floors), which keeps a big city light. All seeded per lot, so nothing reshuffles.
- **Construction stages (from `progress`, floor by floor).** 0%: a fenced, zoned lot with a hologram blueprint of the whole building and a site board with the code. Above 0%: a foundation; built floors are clad, with windows; the next two floors are scaffold, with green net on the top one only; the two above that a steel frame; the rest stays a hologram blueprint in the status colour. Blueprints are faint until the building is hovered or selected. Ready and waiting sites have a crane (turning when ready, still when waiting or stale) and site props (office, materials, cones, a mixer truck when ready). Topped out: the roof by kind and the roof plant go on, the site clears.
- **Lights (art pass 2b).** Only a landed building has its lights on: neon windows, lit shopfront, corner strips and roof neon. An active site (ready or waiting, not stale) shows a few warm work lights. A blocked, parked or stale site is dark. Infill keeps its dim lavender windows. HQ is always lit.
- **Status** is on the glowing base ring, the beacon on top and the sign by the door: cyan ready, orange waiting, red blocked, steel parked, gold landed. The landed ring is wider, solid gold, doubled, and pulses slowly. Walls use the palette (pink, violet, blue); neon is only on windows, signs, corner strips and lights.
- **Landed:** lights on, crown (spire and halo), trees planted round the base, the gold ring, the landing moment.
- **Blocked:** fence, hazard tape and a shut red gate, no crane. **Parked:** a blue tarp over the build front, no crane. **Stale** (no update for over 30 days, not parked or landed): work lights off and the crane stops. Over 60 days the walls and steel rust.
- **The kit by kind**, seeded per project from its `project` id, so the same project gives the same building every visit: podium (shopfront with awning) + shaft + setbacks + roof + attachments (neon corner strips, balconies, pipes, roof plant). Software: glass tower, setbacks, spire; footprint square, twin or L. Making: wide workshop, sawtooth roof, chimney. Hardware: block with pipes, dish and antennas. Career: stepped office, water tank. Athletics: round arena with a dome. Height comes from `size`.
- City XP = built floors, plus a landing bonus equal to the building's floors when it lands (an XL landing is worth 24 more, an S landing 6). 30 XP per level. `cityStats()` in `vault-parser.js` and `city_stats()` in `build.py` compute it, with `landed` and `active7`; the tests check they agree.
- Levels unlock, and every level draws something: plain roads, the town square and HQ (1), streetlights round the square (2), the city starts growing two blocks a level, with lane marks, crosswalks, first ring streetlights, infill and parks (3), a monorail over the ring road (4), holo billboards on infill roofs (5), neon road edges (6), streetlights on every block (7), a second monorail on the outer road of ring 2, later the outermost full ring (8), flying traffic (9), searchlights from the HQ roof (10). Past level 10: two new blocks and an HQ floor each level, up to 18 floors. On a level up the new things rise in.
- **Roads upgrade with level:** plain (1 and 2), lane marks and crosswalks (3 to 5), neon edges, pink along x and cyan along z (6 and up).
- **Traffic follows activity:** cars = 4 + 3 per project updated in the last 7 days, up to 48. They drive the straight runs of road, two lanes each.
- **Mission Control HQ** on the town square, always lit. Floors = 3 + level, up to 18. Level 1: podium, glass tower, roof dish. 2: pink neon corners. 4: side wings. 5: an observation ring. 6: roof neon. 7: an antenna with a red light. 8: a second dish. 10: a glowing spire.
- **The town board** stands on a mast above HQ and always turns to face you. It shows the selected project's code and % in its status colour, a progress bar, the name and the next step, and on the bottom line the city: level, landed, active this week, cars.
- **Monuments, by projects landed:** 5 a plaza with a gold statue (left corner of the square from the default view), 10 a launch pad with a gantry (right corner), 25 a rocket on the pad. The rocket launches 4 s after any landing moment and every 2.5 minutes, flies out of sight, and a new one rolls out. Reduced motion: no launch. The unlocks panel lists them under MONUMENTS.
- **Spotlight:** a cone of warm light down onto the selected building, with a pool of light at its base. Off while that building's landing beam is up.
- **Camera:** isometric (orthographic, 35.26° elevation), no orbit mode. Drag turns the city, shift-drag or right-drag pans, scroll zooms, Space toggles the slow spin. The sun is in the title banner, not in the 3D scene.

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

- Everything repeated is drawn from shared instance pools: one draw call per part type (a facade style and window colour, scaffold, net, frame, hologram, tarp, rings, beacons, crane parts, cars...), not per building. Each building keeps the slots it uses and switches them on as floors are built. Since art pass 2b an off slot is swapped out of the drawn range, so hidden parts cost nothing on the GPU. Roads, sidewalks, lane marks and crosswalks are merged meshes; all signs are one atlas texture and one mesh. Today's city: about 70 draw calls and 24K triangles (62K in 2a). Everything landed: about 83 and 42K. A very big city (61 XL landed, level 98, 201 blocks): about 85 and 144K. The tests hold it under 600 calls and 150K triangles.
- The 3D city is not drawn while it is scrolled out of view, and labels are not laid out while the page scrolls.
- Windows never stretch: a small shader patch maps the facade texture by face width and picks one of 8 window rows per floor.
- Add `#fps` to the end of the page address for a frame-rate readout (FPS, draw calls, triangles). Use it on the laptop.

## Labels

Labels are placed nearest building first. A label that would cover another moves up a row (with a thin leader line back to its building) or to the side. If there is no room it hides until you hover the building. The selected and hovered labels always show. The HUD, legend and buttons count as taken space.

## Known limits

- Fonts are built into the page (`vendor/fonts`, latin subsets from @fontsource, SIL Open Font License, see `vendor/fonts/LICENSES.txt`). Symbols outside the latin set (⟳ ♪ ■) use system fonts.
- No post-processing bloom; glow is faked with emissive materials. Bloom is art pass step 4 (the laptop holds about 60 FPS, so it is now an option).
- The board is readable when zoomed in; at the default zoom it shows the code and %.
- The cloud test browser renders in software (about 3 FPS), so real frame rates come from the `#fps` check on each machine.
- Live refresh needs Chrome or Edge. It does not work inside Obsidian or in Firefox; those show the snapshot.
- Links into Obsidian use `obsidian://open?vault=robin-personal&file=...`, which works on any machine that has the vault open.
