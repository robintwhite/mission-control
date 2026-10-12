"""Build the arena landmark from primitives with Blender (bpy), headless.

    .venv/bin/python tools/make-arena.py assets/meshy-raw/arena.glb

A round stadium: a stepped bowl of three tiers, a ring of columns under a shallow domed roof, a lit glass band
under the roof edge with a neon ring on it, four light masts with lamp heads and blinking tips, a wide entrance
with steps and a lit canopy. Roles: see heropieces.py.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heropieces as H

dst = sys.argv[1] if len(sys.argv) > 1 else "arena.glb"
H.reset()
B = H.box; C = H.cyl

B(0, 0, 0, 9.6, 9.6, 0.15, "body2", "pad")
# the bowl: three tiers stepping in, each with a dark band under its lip
for i, (r, h) in enumerate(((4.5, 1.0), (4.1, 0.9), (3.7, 0.9))):
    z = 0.15 + sum(hh for _, hh in ((4.5, 1.0), (4.1, 0.9), (3.7, 0.9))[:i])
    C(0, 0, z, r, h, 24, "body", f"tier{i}")
    C(0, 0, z + h - 0.12, r + 0.08, 0.12, 24, "body2", f"lip{i}")
top = 0.15 + 2.8
# a ring of columns, a lit glass band behind them, and a neon ring on the roof edge
for k in range(16):
    a = 2 * math.pi * k / 16
    B(3.55 * math.cos(a), 3.55 * math.sin(a), top, 0.22, 0.22, 1.1, "body2", "column", rot=(0, 0, a))
C(0, 0, top + 0.1, 3.45, 0.75, 24, "glass", "concourse-glass")
C(0, 0, top + 1.1, 3.85, 0.22, 24, "body2", "roof-ring")
H.lathe([(3.93, top + 1.32), (3.93, top + 1.42), (3.8, top + 1.42), (3.8, top + 1.32)], 0, 0, 0, 24, "neon", "roof-neon")
# the shallow dome: a lathe from the roof ring to a flat cap
dome = [(3.85, top + 1.3), (3.2, top + 1.75), (2.2, top + 2.15), (1.0, top + 2.4), (0.0, top + 2.45)]
H.lathe(dome, 0, 0, 0, 24, "body", "dome")
H.lathe([(r, h - 0.1) for r, h in dome][::-1] + [(3.85, top + 1.3)], 0, 0, 0, 24, "body2", "dome-under")
C(0, 0, top + 2.4, 0.5, 0.2, 12, "body2", "dome-cap")
# four light masts at the corners, each with a lamp head and a blinking tip
for sx in (-1, 1):
    for sy in (-1, 1):
        x, y = sx * 3.9, sy * 3.9
        B(x, y, 0.15, 0.22, 0.22, 5.4, "body2", "mast")
        B(x - sx * 0.35, y - sy * 0.35, 5.0, 0.9, 0.9, 0.3, "lamp", "mast-lamp", rot=(0, 0, math.pi / 4))
        H.sphere(x, y, 5.75, 0.1, "blink", "mast-light")
# the entrance on the -y side: steps, a canopy with a lit sign strip, two doors
for i in range(3):
    B(0, -4.6 - i * 0.35, 0.15, 2.6 - i * 0.3, 0.35, 0.18 * (3 - i), "body2", f"step{i}")
B(0, -4.55, 0.65, 2.4, 0.5, 1.5, "body", "entrance")
for sx in (-0.55, 0.55):
    B(sx, -4.81, 0.7, 0.6, 0.04, 1.1, "glass", "door")
B(0, -4.9, 2.1, 2.9, 0.9, 0.12, "body2", "canopy")
B(0, -5.33, 2.0, 2.9, 0.05, 0.14, "neon", "canopy-neon")
H.export(dst, "arena")
