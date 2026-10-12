"""Build the data spire landmark from primitives with Blender (bpy), headless.

    .venv/bin/python tools/make-data-spire.py assets/meshy-raw/data-spire.glb

A tall hexagonal tower of stacked server segments, each a little narrower than the one below, with a lit glass
band between segments, six vertical fins, neon strips down three faces, a wide ring two thirds up, and a sharp
antenna spike with a blinking tip. Roles: see heropieces.py.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heropieces as H

dst = sys.argv[1] if len(sys.argv) > 1 else "data-spire.glb"
H.reset()
B = H.box; C = H.cyl

B(0, 0, 0, 4.6, 4.6, 0.15, "body2", "pad")
C(0, 0, 0.15, 2.1, 0.5, 6, "body2", "plinth")
C(0, 0, 0.65, 2.25, 0.12, 6, "neon", "base-neon")
z = 0.77
r = 1.75
for i in range(7):
    h = 2.2 - i * 0.12
    C(0, 0, z, r, h, 6, "body", f"segment{i}")
    C(0, 0, z + h, r * 0.9, 0.22, 6, "glass", f"band{i}")
    # three neon strips down alternate faces of this segment
    for k in range(3):
        a = 2 * math.pi * (2 * k + i % 2) / 6
        B((r + 0.02) * math.cos(a), (r + 0.02) * math.sin(a), z + 0.2, 0.06, 0.14, h - 0.4, "neon", "strip", rot=(0, 0, a))
    z += h + 0.22
    r *= 0.9
top = z
# six vertical fins from the plinth up most of the tower
for k in range(6):
    a = 2 * math.pi * k / 6 + math.pi / 6
    B(1.9 * math.cos(a), 1.9 * math.sin(a), 0.65, 0.5, 0.12, top * 0.62, "body2", "fin", rot=(0, 0, a))
# the wide ring two thirds up, with lamps under it
ring_z = 0.77 + 2.2 * 4.3
C(0, 0, ring_z, 2.6, 0.35, 12, "body2", "ring")
C(0, 0, ring_z + 0.35, 2.7, 0.08, 12, "neon", "ring-neon")
for k in range(6):
    a = 2 * math.pi * k / 6
    B(2.3 * math.cos(a), 2.3 * math.sin(a), ring_z - 0.14, 0.25, 0.25, 0.14, "lamp", "ring-lamp")
# the crown: a cap, the spike, a blinking tip
C(0, 0, top, r * 1.15, 0.3, 6, "body2", "cap")
C(0, 0, top + 0.3, r * 0.75, 3.2, 6, "body", "spike", r2=0.05)
C(0, 0, top + 0.3, 0.12, 4.2, 6, "body2", "antenna")
H.sphere(0, 0, top + 4.6, 0.14, "blink", "tip-light")
H.export(dst, "data-spire")
