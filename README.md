# Mission Control

One neon city screen showing every project in Robin's personal vault: what it is building, its state, the next step, what it is waiting on, and how far along it is. It is an isometric, low-poly city builder. Each project is a building on its own lot, placed by start date: the oldest round the town square, newer ones outward block by block. A building never moves; it rises floor by floor as progress goes up, and its lights come on when it lands. The city levels up as floors get built and grows outward with no cap. Mission Control HQ stands on the town square.

The vault note for this project: `Archive/Mission Control Dashboard/Mission Control Dashboard.md`. **Status: closed 2026-10-12, in daily use.** Art passes 2a, 2b, 3 and 4 step 1 are in; the remaining look steps (signs and lettering, bevels and props, holograms, shadows) and other ideas are listed in that note's §10 for a v2.

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
template/vault-parser.js (inlined)      ─┤
vendor/three.min.js (r128, inlined)     ─┼─ build.py ─► vault/00 Home/Mission Control.html
vendor/GLTFLoader.js (r128, inlined)    ─┤
assets/models/*.glb (inlined as base64) ─┘   ◄─ tools/clean-models.cjs ◄─ assets/meshy-raw/*.glb (Meshy exports)
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
- `npm run models` (`node tools/clean-models.cjs`) rebuilds `assets/models/*.glb` from the sources in `assets/meshy-raw/` (Meshy exports and the built pieces alike). Only needed when a piece changes. The page inlines whatever is in `assets/models/` at build time; with the folder empty it falls back to its drawn look. A built piece is regenerated with its `tools/make-*.py` script first (`.venv/bin/python tools/make-factory.py assets/meshy-raw/factory.glb`); to swap any piece, drop a GLB of the same name into `assets/meshy-raw/` and run the two steps.
- The vault is auto-detected (`E:\ObsidianVaults\robin-personal`, then `D:\...`, or `MC_VAULT`).

## Tests

```
node tests/run_tests.cjs --vault "E:\ObsidianVaults\robin-personal" --python .venv\Scripts\python.exe
```

Needs Node 18+ and Playwright with its Chromium (dev only; `npm install` gets Playwright, gltf-transform and meshoptimizer from `package.json`). Writes to `tests/out/` (git-ignored), never to the vault. It checks:
1. Parity: `build.py --dump` and `vault-parser.js` give identical projects and warnings, in the same order, on the real vault and on a generated edge-case vault (BOM, CRLF, bad lanes, bad dates, lists, odd file names, invalid UTF-8).
2. In headless Chromium, on the page opened from `file://`: the snapshot fallback; Connect vault with the picker stubbed by a fake folder, and parity again in the browser; Refresh after an edit and a new note, with no reload; the warnings panel; a folder that is not the vault; a stored folder that needs one Allow click; a stored folder already allowed; IndexedDB on `file://`; a real folder handle kept in IndexedDB across a reload (over `http://127.0.0.1`, since the origin private file system is blocked on `file://`); the mirror build; a browser without folder access; no console errors.

3. City (added in v0.2 steps 2 and 3, and art pass 2a): heights from size and lit floors from progress for every building; size-weighted XP and level, the same in Python and JS; first visit; "since your last visit" with a seeded record (strip text, floors lighting one by one, the landing moment, selection, clicking a strip item, a reload in the same sitting, the next visit); the sound toggle and its memory; a project landing on Refresh (crown, XP, sting, level-up toast); no label over another label or the HUD from six camera angles and at phone width; reduced motion; floor height and roof by kind; the tarp and rust; each level's unlocks drawn, up to 10, and rising in on a level up; the draw-call budget; fonts built in; the `#fps` readout. Art pass 2b (section R): `days`, `landed` and `active7` in both parsers; blocks open by level (9, then 2 a level, no cap) and every block on a road; nothing outside the open blocks; growing never moves a block or a project (levels 1 to 40); ring 2 opens from the side middles in opposite pairs; road tiers; HQ floors and parts by level; HQ as a domed civic centre; a big board that follows the selection and faces the camera; the spotlight source off screen; Esc and an empty-ground click clear the selection, and it stays clear after a refresh; the legend collapses to the status colours; lights only on landed buildings, work lights on active sites, dark when stopped; the green ring only on landed; net on the top scaffold floor only; faint blueprints except the selected one; the blue title; cars by activity (4, 19, 48); a level 1 city; monuments at 5, 10 and 25 landed and the rocket launch; a very big city (61 XL landed, level 98) under budget; no drawing while scrolled away; reduced motion keeps the rocket on the pad. Art pass 3 (section S): the eight hero pieces are in the page and parse (Meshy pieces about 2,000 triangles, built ones under 1,100); built pieces carry parts by role; `landed_kinds` in both parsers; a landmark stands only for a kind that has landed and nothing shows for the others; the factory's block follows the edge rule; the unlocks panel lists them and the kind names fit; 45 projects keep the same lots at every level, today's lots are unchanged by the landmark, later ones skip its block; the train is one coupled train; the stacks smoke; a hardware landing adds the telescope on a block of its own and moves nothing; everything landed gives five landmarks on five blocks under budget; the fallback when a piece is missing (and when all are); a first landing of a kind builds its landmark on Refresh, with a toast, and it rises in. Art pass 4 (section T): the GLOW button next to SOUND and SPIN, HIGH by default, one click LOW, two OFF, remembered across a reload; three passes on HIGH with the glow at half resolution and MSAA on the main pass, quarter on LOW, one pass on OFF; the glow pass swaps materials (lit facades drawn by their windows alone, everything else black); draw calls and triangles over both passes under 600 and 150K on today's city and at level 10, and the big city on HIGH under 600 calls; the `#fps` readout names the quality; the six wall colours dark; the factory in its own colours; level 1 dim with no glow, today in between, level 10 full; the glow adds light; the five status rings name their lanes on OFF and on HIGH and keep their colour between the two. Art pass 2a (sections O, P, Q): lots in start-date order round a free town square, same-date projects side by side, no building moves on a progress change, a landing, parking or a new project; the build front (scaffold, frame, blueprint) on every site; cranes; status ring colours; landed sites cleared with trees; the kit varies and is seeded; zoned, parked, blocked, stale and topped-out stages; the isometric camera and drag; the sun only in the banner; street level; 600 draw calls and 150K triangles; undated notes on the outer edge.

The folder picker itself, Chrome's permission prompt and whether sound is heard cannot be automated. Those need a person: see the vault note §9.

## City rules (in the template)

- **Placement (art pass 2a).** Projects sorted by `created`, then name, then note path, take the lots in order. The centre block is the town square and stays free for Mission Control HQ. Lots go out block by block, four per block: ring 1 round the square first, then ring 2 onward from the middle of each side out to the corners, opposite sides in pairs. Status, progress and landing never move a building.
- Same start date: those projects take neighbouring lots, in name order. A new project with an older `created` than others slots in among them and moves the later ones one lot along. Give a new project today's date and nothing moves. A new project with the same date as one made the same day can sort before it by name; that moves the other one lot, once.
- **The city grows by blocks, with no cap (art pass 2b).** Levels 1 and 2: the square and ring 1 (9 blocks). From level 3, two more blocks open each level: ring 2 is full at level 10, ring 3 at level 22, and so on. A project that needs a lot in a block not open yet opens that block too. Roads run round every open block, so every building stands on a road. No skyline towers. Growing only adds blocks; nothing already there moves.
- The next three free lots stay zoned for the next projects. Ring 1 fills with infill by level. A newer block opens as empty lots and rubble and fills in over the levels after it opened. Ring 4 and out are low-rise outskirts (one or two floors), which keeps a big city light. All seeded per lot, so nothing reshuffles.
- **Construction stages (from `progress`, floor by floor).** 0%: a fenced, zoned lot with a hologram blueprint of the whole building and a site board with the code. Above 0%: a foundation; built floors are clad, with windows; the next two floors are scaffold, with green net on the top one only; the two above that a steel frame; the rest stays a hologram blueprint in the status colour. Blueprints are faint until the building is hovered or selected. Ready and waiting sites have a crane (turning when ready, still when waiting or stale) and site props (office, materials, cones, a mixer truck when ready). Topped out: the roof by kind and the roof plant go on, the site clears.
- **Lights (art pass 2b).** Only a landed building has its lights on: neon windows, lit shopfront, corner strips and roof neon. An active site (ready or waiting, not stale) shows a few warm work lights. A blocked, parked or stale site is dark. Infill keeps its dim lavender windows. HQ is always lit.
- **Status** is on the glowing base ring, the beacon on top and the sign by the door: cyan ready, orange waiting, red blocked, steel parked, green landed. The landed ring is wider, solid green, doubled, and pulses slowly. Walls use the palette (pink, violet, blue); neon is only on windows, signs, corner strips and lights.
- **Landed:** lights on, crown (spire and halo), trees planted round the base, the wide green ring, the landing moment.
- **Blocked:** fence, hazard tape and a shut red gate, no crane. **Parked:** a blue tarp over the build front, no crane. **Stale** (no update for over 30 days, not parked or landed): work lights off and the crane stops. Over 60 days the walls and steel rust.
- **The kit by kind**, seeded per project from its `project` id, so the same project gives the same building every visit: podium (shopfront with awning) + shaft + setbacks + roof + attachments (neon corner strips, balconies, pipes, roof plant). Software: glass tower, setbacks, spire; footprint square, twin or L. Making: wide workshop, sawtooth roof, chimney. Hardware: block with pipes, dish and antennas. Career: stepped office, water tank. Athletics: round arena with a dome. Height comes from `size`.
- City XP = built floors, plus a landing bonus equal to the building's floors when it lands (an XL landing is worth 24 more, an S landing 6). 30 XP per level. `cityStats()` in `vault-parser.js` and `city_stats()` in `build.py` compute it, with `landed` and `active7`; the tests check they agree.
- Levels unlock, and every level draws something: plain roads, the town square and HQ (1), streetlights round the square (2), the city starts growing two blocks a level, with lane marks, crosswalks, first ring streetlights, infill and parks (3), a monorail over the ring road (4), holo billboards on infill roofs (5), neon road edges (6), streetlights on every block (7), a second monorail on the outer road of ring 2, later the outermost full ring (8), flying traffic (9), searchlights from the HQ roof (10). Past level 10: two new blocks and an HQ floor each level, up to 18 floors. On a level up the new things rise in.
- **Roads upgrade with level:** plain (1 and 2), lane marks and crosswalks (3 to 5), neon edges, pink along x and cyan along z (6 and up).
- **Traffic follows activity:** cars = 4 + 3 per project updated in the last 7 days, up to 48. They drive the straight runs of road, two lanes each.
- **Mission Control HQ** is the town's civic centre and looks like nothing else: a round plaza with a pink neon ring and two paths, a low silver drum with bands of cyan windows under a white dome, and a needle comms tower. Always lit. Level 1: one drum floor, the dome and a short mast. 2: the needle tower starts, 1.5 higher each level, up to level 18. 3: a second drum floor and lamps round the plaza. 4: two small domed pavilions. 5: an observation pod on the tower. 6: a third drum floor and a neon ring on the dome. 7: a red aircraft light. 8: a dish on a pavilion. 10: a glowing tip.
- **The town board** sits on top of the tower (12 wide) and always turns to face you. Big and few: the selected project's code and % in its status colour, a bar, the name and the next step. With nothing selected it shows the city: level, landed, active, cars, XP.
- **Monuments, by projects landed:** 5 a plaza with a gold statue (left corner of the square from the default view), 10 a launch pad with a gantry (right corner), 25 a rocket on the pad. The rocket launches 4 s after any landing moment and every 2.5 minutes, flies out of sight, and a new one rolls out. Reduced motion: no launch. The unlocks panel lists them under MONUMENTS.
- **Spotlight:** a long cone of warm light from far above the view down onto the selected building, with a pool of light at its base. Its source is never on screen. Off while that building's landing beam is up.
- **Selection:** click a building or a card. Click empty ground or press Esc to clear it; the detail panel and the board then show the city. A cleared selection stays clear after a Refresh.
- **Legend:** only the status colours show, with an i button. Hover it or click the i for the rest.
- **Landmarks (art pass 3).** One hero piece per kind: software a data spire, hardware a radio telescope, making a factory, athletics an arena, career an art deco office tower. A landmark **appears at the first landing of its kind**, on a whole block of its own at the city's growing edge as it was on that day: lots go out in start-date order, so the edge is the first block past the lots of every project created up to the landing's date (`completed`, else `updated`, else `created`; never earlier than 2026-10-12, when landmarks began) plus the three zoned lots, and the block is a seeded pick among the next six free blocks, weighted by distance from the landmarks already standing (since art pass 4): a block that touches one, even at a corner, weighs nothing while any other is free, the rest weigh the squared distance less one, and if all six touch, the six after them are tried. With none standing the six weigh the same, which is how the factory took block 10. Projects created after that skip the block, and an earlier landmark never moves for a later one. Everything comes from the notes' dates, so each machine places it the same way and nothing moves. Nothing shows for a kind that has not landed: the landmark is the surprise. Built: the piece flat shaded on a plinth with two thin neon rings, four lamps, a beacon and the kind on a lit sign; the factory's stacks smoke. The landing that is the first of its kind makes the piece rise in after the landing moment, with a LANDMARK BUILT toast. A landmark opens its block even before the level would. The unlocks panel lists all five.
- **Pieces with parts.** Every piece is built in Blender from primitives (`tools/make-*.py`, headless `bpy`, on `tools/heropieces.py`) and carries parts by material name, which the page colours: `body` and `body2` palette walls, `glass` lit windows, `neon` a strip in the piece's neon colour, `lamp` a warm light, `blink` a red light that blinks, `dish` pale metal.
- **The train and the hover cars.** The monorail (level 4 and 8) runs one train: a head car with a nose, middle cars, and the head again turned round as the tail, coupled 0.12 apart along the rail, lit window bands, a skirt in the loop's colour. The flying traffic (level 9) is the hover car: a wedge with a glass canopy, neon exhausts and underglow. A piece that is missing or fails to parse is left out: the train and the fliers go back to their drawn boxes, a landmark block shows its sign and a garden. The page never breaks on a model.
- **Camera:** isometric (orthographic, 35.26° elevation), no orbit mode. Drag turns the city, shift-drag or right-drag pans, scroll zooms. The slow spin is off by default; the SPIN button or Space turns it on, remembered in this browser, and it then resumes 10 s after a drag. The sun is in the title banner, not in the 3D scene.

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
- **Glow (art pass 4).** ✦ GLOW HIGH / LOW / OFF next to SOUND and SPIN, remembered in this browser (`mc-quality`), HIGH by default. HIGH and LOW add post-processing: the lights (windows, neon strips, lamps, beacons, signs, the monorail rails, the landmarks' lit parts, the landing beam) bloom, the picture goes through a hue-preserving filmic curve (the ACES fit on the brightest channel, so a neon light compresses toward its own colour, never white) and a light vignette. The status rings, the selection rings, the hazard tape, the road marks and the HQ board are painted black in the glow pass, so they never bloom. Labels are HTML on top of the canvas and are untouched. HIGH computes the glow at half resolution, LOW at a quarter; the blur steps are in screen pixels, so LOW is the same glow a little softer, not a wider haze. OFF is one pass straight to the screen, as before art pass 4: use it on a slow machine.
- **The city brightens with its level.** Level 1: lit windows at 42%, neon strips and roof lights at half strength, no glow at all, few signs. Each level adds a step; by level 10 the windows, neon and glow are at full strength and half the infill roofs carry a holo billboard (from level 5). Today's level 6 city sits a bit past halfway. The walls are dark and grey (`WALLS`), so the lights carry the colour; the landmarks, the train and the hover cars keep their own colours.

## Performance

- Everything repeated is drawn from shared instance pools: one draw call per part type (a facade style and window colour, scaffold, net, frame, hologram, tarp, rings, beacons, crane parts, cars...), not per building. Each building keeps the slots it uses and switches them on as floors are built. Since art pass 2b an off slot is swapped out of the drawn range, so hidden parts cost nothing on the GPU. Roads, sidewalks, lane marks and crosswalks are merged meshes; all signs are one atlas texture and one mesh. Today's city: about 110 draw calls and 30K triangles (24K before the hero pieces). Everything landed, every piece in: about 111 and 30K. A very big city (61 XL landed, level 98, 201 blocks): about 180 and 151K, over the 150K line by the hero pieces (144K in 2b); the tests check that case against 175K and hold the real city under 600 calls and 150K triangles. Those are the scene counts with the glow off; the glow pass adds its own (next point).
- The hero pieces are inlined GLB (position only, int16 quantized, 4 to 20 KB each) parsed once at load with GLTFLoader. A piece is one mesh per part (a Meshy piece has one, a built piece up to seven), so a landmark costs a few draw calls; the smoke is 12 small spheres. Flat shading comes from `MeshPhongMaterial` with `flatShading`, so the pieces carry no normals.
- The 3D city is not drawn while it is scrolled out of view, and labels are not laid out while the page scrolls.
- Windows never stretch: a small shader patch maps the facade texture by face width and picks one of 8 window rows per floor.
- The glow pass (art pass 4) draws the city a second time, at half or quarter resolution, with every unlit part black. Draw calls and triangles roughly double on HIGH and LOW: today's city about 210 draw calls and 53K triangles over both passes (100 and 27K on OFF); level 10 about 270 and 54K; the 61-XL stress city about 330 calls and 300K triangles on HIGH (the 150K line is measured on OFF). The blur and composite passes are a handful of full-screen quads. With the glow off nothing of this runs.
- Add `#fps` to the end of the page address for a frame-rate readout (FPS, draw calls, triangles, glow quality). Use it on the laptop, on each glow setting.

## Labels

Labels are placed nearest building first. A label that would cover another moves up a row (with a thin leader line back to its building) or to the side. If there is no room it hides until you hover the building. The selected and hovered labels always show. The HUD, legend and buttons count as taken space.

## Known limits

- Fonts are built into the page (`vendor/fonts`, latin subsets from @fontsource, SIL Open Font License, see `vendor/fonts/LICENSES.txt`). Symbols outside the latin set (⟳ ♪ ■) use system fonts.
- All eight hero pieces are built from primitives (`tools/make-*.py`, Blender's `bpy` wheel in the venv), 130 to 2,500 triangles each. Art pass 3 started with Meshy text to 3D (Meshy 6, untextured, its free Remesh, `tools/clean-models.cjs`), but a remeshed Meshy surface is noise everywhere: the factory went blobby and neither its remesh nor a planar decimate (`tools/planar-decimate.py`) gives a box back, and the telescope had the dish fused to the wrong part. A built piece is crisp, carries lit parts, and takes minutes to change. `clean-models.cjs` still takes a Meshy GLB (it simplifies only pieces without role materials); the Meshy exports are in `assets/meshy-raw/archive/`.
- The bloom is selective by material swap, not by a render layer: a material marked `userData.glow = "self"` is a light; anything else is drawn black in the glow pass. A new light needs that mark (`lit(material)`), or it will not glow. The tone mapping runs in the composite shader, not in three's renderer, so materials keep their flat colours on OFF.
- The canvas asks for the high-performance GPU (`powerPreference`), which Chrome on a dual-GPU Windows laptop usually honours. If the page still runs on the integrated GPU there, Windows Settings → System → Display → Graphics lets Chrome be set to High performance. On Robin's laptop the hint did not take (Chrome stayed on the Intel Iris Xe after a restart): about 40 to 50 FPS on HIGH and 60 on OFF, which he finds fine. The desktop's 3070 holds 60 at about 30% use.
- The glow and the tone curve are tuned by eye in headless screenshots. The frame cost on the laptop is not measured yet: `#fps` on HIGH, LOW and OFF decides the default there.
- The board is readable when zoomed in; at the default zoom it shows the code and %.
- The cloud test browser renders in software (about 3 FPS), so real frame rates come from the `#fps` check on each machine.
- Live refresh needs Chrome or Edge. It does not work inside Obsidian or in Firefox; those show the snapshot.
- Links into Obsidian use `obsidian://open?vault=robin-personal&file=...`, which works on any machine that has the vault open.
