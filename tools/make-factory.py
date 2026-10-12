"""Build the factory landmark from primitives with Blender (bpy), headless.

    .venv/bin/python tools/make-factory.py assets/meshy-raw/factory.glb

Meshy's factory came out blobby at 2,000 triangles: its surface is noise everywhere, so neither a remesh nor a
planar decimate gives back a box. A boxy building is quicker to build than to clean. Boxes, cylinders and a
sawtooth profile, about 1,200 triangles, hard edges, with parts by role (see heropieces.py): lit clerestory glass on
the steep roof faces, a neon strip on the dock parapet, dock lamps, a blinking light on the tallest stack. The page
adds smoke from the three stacks (their tops are listed in LANDMARKS). Units are arbitrary: the cleaner scales the
footprint to 1 and the page sets the real size. Blender Z up becomes glTF Y up: (x, y, z) -> (x, z, -y).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heropieces as H

dst = sys.argv[1] if len(sys.argv) > 1 else "factory.glb"
H.reset()
B = H.box; C = H.cyl

# ground slab and yard
B(0, 0, 0, 10, 8, 0.15, "body2", "slab")
# main hall (left two thirds) with a sawtooth roof: steep faces are glass
B(-1.3, 0, 0.15, 7.2, 6.2, 3.0, "body", "hall")
teeth, pitch, rise, x0 = 4, 1.8, 0.9, -4.9
prof = [(0, 0)]
for t in range(teeth):
    a = t * pitch
    prof += [(a, rise), (a + pitch * 0.82, 0.08)]
prof.append((teeth * pitch, 0))
H.prism([(x0 + px, 3.15 + pz) for px, pz in prof], -3.1, 6.2, "body", "roof")
for t in range(teeth):
    B(x0 + t * pitch + 0.04, 0, 3.27, 0.06, 5.6, rise - 0.22, "glass", f"clerestory{t}")   # the steep face, lit
B(-1.3, 0, 3.15, 7.3, 0.2, 0.25, "body2", "roof-edge-s"); B(-1.3, 0, 3.15, 0.2, 6.3, 0.25, "body2", "roof-edge-mid")
# a window band along the front and back of the hall
for yy in (3.12, -3.12):
    B(-1.3, yy, 1.9, 6.4, 0.06, 0.55, "glass", "hall-windows")
# annex on the right: the loading dock, three bay doors, a platform, a neon strip on the parapet, lamps over the doors
B(3.4, 0, 0.15, 2.8, 6.2, 2.2, "body", "annex")
B(3.4, 0, 2.35, 2.9, 6.3, 0.18, "body2", "annex-parapet")
B(4.86, 0, 2.2, 0.06, 5.8, 0.14, "neon", "sign-strip")
for i, yy in enumerate((-1.9, 0, 1.9)):
    B(4.82, yy, 0.55, 0.12, 1.25, 1.35, "body2", f"door{i}")
    B(4.9, yy, 1.95, 0.25, 1.45, 0.12, "body2", f"lintel{i}")
    B(4.84, yy, 1.62, 0.08, 0.5, 0.1, "lamp", f"doorlamp{i}")
B(5.25, 0, 0.15, 0.7, 6.0, 0.45, "body2", "dock")
# three stacks behind the hall, each with a base and a collar; a blinking light on the tallest
for i, (xx, h) in enumerate(((-3.6, 4.6), (-2.3, 4.2), (-1.0, 3.8))):
    C(xx, -2.2, 3.15, 0.32, h, 12, "body2", f"stack{i}")
    C(xx, -2.2, 3.15 + h - 0.05, 0.42, 0.3, 12, "body", f"collar{i}")
    C(xx, -2.2, 3.15, 0.5, 0.35, 12, "body", f"stack-base{i}")
H.sphere(-3.6, -2.2, 3.15 + 4.6 + 0.4, 0.14, "blink", "stack-light")
# water tank on the annex roof: four legs, a tank, a conical lid
for dx in (-0.55, 0.55):
    for dy in (-0.55, 0.55):
        B(3.4 + dx, -1.6 + dy, 2.53, 0.12, 0.12, 1.0, "body2", "leg")
B(3.4, -1.6, 3.45, 1.5, 1.5, 0.1, "body2", "tank-floor")
C(3.4, -1.6, 3.55, 0.75, 1.1, 14, "dish", "tank")
C(3.4, -1.6, 4.65, 0.78, 0.35, 14, "body2", "tank-lid", r2=0.15)
# pipes along the back wall with risers; vents; a gantry over the yard on the right
for i, zz in enumerate((1.0, 1.5)):
    C(-1.3, -3.25, zz, 0.11, 7.0, 8, "body2", f"pipe{i}", rot=(0, 1.5707963, 0))
    C(-4.6, -3.25, 0.15, 0.11, zz - 0.15, 8, "body2", f"riser{i}")
B(-1.3, 3.0, 3.15, 1.2, 0.5, 0.5, "body2", "vent-a"); B(0.6, 2.5, 3.15, 0.8, 0.8, 0.6, "body2", "vent-b")
for yy in (-2.6, 2.6):
    B(4.7, yy, 0.15, 0.18, 0.18, 3.4, "body2", "gantry-post")
B(4.7, 0, 3.4, 0.22, 5.4, 0.22, "body2", "gantry-beam")
B(4.7, 0.8, 2.95, 0.5, 0.5, 0.45, "lamp", "gantry-hoist")
H.export(dst, "factory")
