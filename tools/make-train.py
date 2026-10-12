"""Build the monorail train cars from primitives with Blender (bpy), headless.

    .venv/bin/python tools/make-train.py assets/meshy-raw

Writes train-head.glb (a sloped nose at +x, a windscreen) and train-mid.glb (flat ends with couplers). The page
runs a train as head, middle cars, and the head again turned round as the tail, coupled close along the rail, so
it reads as one train and not as a row of single cars. Long axis along x. Roles: see heropieces.py. Lit window
bands on both sides, a neon skirt along the bottom, a lamp at the nose, a blinking light on the roof.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heropieces as H

out = sys.argv[1] if len(sys.argv) > 1 else "."
L, W, Hh = 2.6, 0.64, 0.72   # length, width, height of a car body
B = H.box

def car(head):
    H.reset()
    # body: a side profile in x/z extruded across y. The head has a sloped nose at +x
    if head:
        prof = [(-L / 2, 0.1), (L / 2 - 0.55, 0.1), (L / 2, 0.3), (L / 2 - 0.08, 0.55), (L / 2 - 0.38, Hh), (-L / 2, Hh)]
    else:
        prof = [(-L / 2, 0.1), (L / 2, 0.1), (L / 2, Hh - 0.06), (L / 2 - 0.08, Hh), (-L / 2 + 0.08, Hh), (-L / 2, Hh - 0.06)]
    H.prism(prof, -W / 2, W, "body", "shell")
    # window bands on both sides, a windscreen on the nose
    wl = L - (1.1 if head else 0.5)
    for sy in (-1, 1):
        B(-0.25 if head else 0, sy * (W / 2 + 0.005), 0.4, wl, 0.02, 0.22, "glass", "windows")
    if head:
        B(L / 2 - 0.2, 0, 0.36, 0.36, W - 0.14, 0.26, "glass", "windscreen", rot=(0, -0.95, 0))
        B(L / 2 - 0.02, 0, 0.2, 0.06, 0.3, 0.08, "lamp", "headlamp")
    # roof: a low cap with an air unit; a blinking light on the head
    B(-0.1 if head else 0, 0, Hh, L - (0.8 if head else 0.3), W - 0.2, 0.06, "body2", "roof")
    B(-0.5, 0, Hh + 0.06, 0.5, 0.3, 0.08, "body2", "ac-unit")
    if head: H.sphere(-0.9, 0, Hh + 0.2, 0.05, "blink", "roof-light")
    # the bogie skirt that rides the rail, and a neon strip along the bottom edge of each side
    B(0, 0, 0, L - 0.3, 0.3, 0.12, "body2", "bogie")
    for sy in (-1, 1):
        B(0, sy * (W / 2 + 0.005), 0.1, L - 0.2, 0.02, 0.05, "neon", "skirt")
    if not head:
        for sx in (-1, 1):
            B(sx * (L / 2 + 0.04), 0, 0.28, 0.1, 0.16, 0.16, "body2", "coupler")

car(True);  H.export(os.path.join(out, "train-head.glb"), "train-head")
car(False); H.export(os.path.join(out, "train-mid.glb"), "train-mid")
