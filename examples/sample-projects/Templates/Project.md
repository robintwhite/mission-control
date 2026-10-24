---
type: project
code: ABC
name: ""
northstar: ""
status: active
progress: 0
lane: ready
next: ""
waiting_on: ""
kind: software
size: M
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
# Project name

Copy this note to start a project. Notes in a folder named Templates are never read, so this one never draws.

- type: always `project`
- code: three letters shown on the building
- northstar: one line on what the project is building
- progress: 0 to 100, the share of floors built
- lane: ready | waiting | blocked | parked. `status: completed` lands it, `status: parked` parks it
- next: the next concrete step
- waiting_on: what is holding it up, empty when nothing
- kind: software | making | hardware | career | athletics. Sets the building's shape
- size: S | M | L | XL. Sets the height: 6, 10, 16 or 24 floors
- created: the start date. Places the building, oldest in the middle. Set it once
- updated: the date of the last real progress. Dark after 30 days without it
- completed: the landing date, with `status: completed`. Use the day you finish: a date in the past can move newer buildings once
