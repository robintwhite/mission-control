# Mission Control

One neon city screen showing every project in Robin's personal vault: what it is building, its state, the next step, what it is waiting on, and how far along it is. Finished projects form the downtown core; the city levels up as floors get built.

The vault note for this project: `Projects/Mission Control Dashboard/Mission Control Dashboard.md`.

## How it works

```
vault/Projects/**/*.md  (type: project)  ─┐
vault/Archive/**/*.md   (type: project)  ─┼─ build.py ─► vault/00 Home/Mission Control.html
template/mission-control.template.html   ─┤
vendor/three.min.js (r128, inlined)      ─┘
```

`build.py` is standard library only. It reads the frontmatter of every `type: project` note, injects the data and three.js into the template, and writes one self-contained HTML file into the vault. Obsidian Sync carries that file to the other machines.

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

Rules the build applies:
- `status: completed` (or `complete`) forces `lane: landed` and `progress: 100`.
- A project whose `updated` date is more than 30 days old gets a STALE marker (not parked or landed ones).
- `kind` and `size` are passed to the page; a missing or invalid one is a warning (size falls back to M). The page does not draw them yet (v0.2).
- A project with no valid `lane` is skipped, with a warning.

## Running it

- **Claude**: runs `build.py` at the end of any session that changes a project's state, and in the weekly sweep.
- **Robin**: double-click `build.bat`. It creates a project-local `.venv` on first run (nothing installed, so it is instant) and builds.
- `python build.py --check` parses and reports without writing.
- The vault is auto-detected (`E:\ObsidianVaults\robin-personal`, then `D:\...`, or `MC_VAULT`).

## City rules (in the template)

- Downtown core: landed. Inner ring: ready. Outer ring: waiting on me. Far corners: blocked.
- City XP = floors built (one floor per 10% of a project). 30 floors per level.
- Levels unlock: roads and core (1), streetlights (2), inner-ring infill and parks (3), monorail (4), outer-ring infill and billboards (5), skyline towers (6), far-corner lights (7), second monorail (8). Levels 5 to 8 are declared but not all drawn yet; see the vault note's Phase 5.
- Infill placement is seeded, so the city does not reshuffle between builds.

## Known limits

- Fonts load from Google Fonts. Offline, the page falls back to system fonts and still works. Inlining the fonts is a Phase 4 item.
- No post-processing bloom; glow is faked with emissive materials.
- Links into Obsidian use `obsidian://open?vault=robin-personal&file=...`, which works on any machine that has the vault open.
