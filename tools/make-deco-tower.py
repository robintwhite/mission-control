"""Build the art deco office tower landmark from primitives with Blender (bpy), headless.

    .venv/bin/python tools/make-deco-tower.py assets/meshy-raw/deco-tower.glb

A 1930s skyscraper: a wide base with a grand lit entrance, four stepped setbacks, strong vertical ribs with lit
window strips between them on every face, a stacked crown with neon on its tiers, a short spire and a blinking
light. Roles: see heropieces.py.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heropieces as H

dst = sys.argv[1] if len(sys.argv) > 1 else "deco-tower.glb"
H.reset()
B = H.box; C = H.cyl

def block(z, w, h, ribs):
    """a square block of width w and height h at z, with ribs on each face and lit strips between them"""
    B(0, 0, z, w, w, h, "body", "block")
    step = w / (ribs + 1)
    for face in range(4):
        rot = (0, 0, face * 1.5707963)
        for i in range(ribs + 2):
            u = -w / 2 + i * step
            # a rib: a thin box standing proud of the face
            x, y = (u, -w / 2 - 0.05) if face == 0 else (w / 2 + 0.05, u) if face == 1 else (-u, w / 2 + 0.05) if face == 2 else (-w / 2 - 0.05, -u)
            B(x, y, z, 0.12 if face % 2 == 0 else 0.1, 0.1 if face % 2 == 0 else 0.12, h, "body2", "rib")
            if i <= ribs:
                # the lit strip between this rib and the next, set a little into the face
                um = u + step / 2
                gx, gy = (um, -w / 2 - 0.01) if face == 0 else (w / 2 + 0.01, um) if face == 1 else (-um, w / 2 + 0.01) if face == 2 else (-w / 2 - 0.01, -um)
                B(gx, gy, z + 0.25, step * 0.42 if face % 2 == 0 else 0.03, 0.03 if face % 2 == 0 else step * 0.42, h - 0.5, "glass", "windows")

B(0, 0, 0, 6.2, 6.2, 0.15, "body2", "pad")
z = 0.15
# base and entrance
block(z, 5.0, 3.2, 5); z += 3.2
B(0, -2.65, 0.15, 1.6, 0.3, 2.4, "body2", "portal")
B(0, -2.72, 0.15, 1.0, 0.06, 2.0, "glass", "entrance-glass")
B(0, -2.95, 2.55, 2.0, 0.5, 0.15, "body2", "marquee")
B(0, -3.2, 2.5, 2.0, 0.04, 0.12, "neon", "marquee-neon")
B(0, -2.9, 2.75, 0.8, 0.3, 0.1, "lamp", "marquee-lamp")
# setbacks
for w, h, ribs in ((4.2, 4.0, 4), (3.4, 4.0, 3), (2.6, 3.4, 2), (1.9, 2.6, 1)):
    B(0, 0, z, w + 0.5, w + 0.5, 0.18, "body2", "ledge")
    z += 0.18
    block(z, w, h, ribs); z += h
# the crown: three stacked tiers with neon edges, a spire and a blinking light
for i, (w, h) in enumerate(((1.6, 0.6), (1.2, 0.5), (0.8, 0.5))):
    B(0, 0, z, w, w, h, "body2", f"crown{i}")
    B(0, 0, z + h - 0.08, w + 0.08, w + 0.08, 0.08, "neon", f"crown-neon{i}")
    z += h
C(0, 0, z, 0.3, 1.6, 8, "body", "spire", r2=0.03)
C(0, 0, z + 1.6, 0.05, 0.8, 6, "body2", "mast")
H.sphere(0, 0, z + 2.5, 0.11, "blink", "spire-light")
H.export(dst, "deco-tower")
