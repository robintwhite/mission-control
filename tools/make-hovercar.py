"""Build the hover car from primitives with Blender (bpy), headless.

    .venv/bin/python tools/make-hovercar.py assets/meshy-raw/hovercar.glb

A wedge body with a glass canopy, two thruster pods at the back with neon exhausts, a neon underglow strip and a
headlamp. Front at +x. Roles: see heropieces.py.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import heropieces as H

dst = sys.argv[1] if len(sys.argv) > 1 else "hovercar.glb"
H.reset()
B = H.box; C = H.cyl
L, W = 2.0, 1.1
# the body: a side profile with a low nose and a raised cabin, extruded across y
prof = [(-L / 2, 0.15), (L / 2, 0.15), (L / 2, 0.3), (L / 2 - 0.5, 0.42), (-L / 2 + 0.4, 0.5), (-L / 2, 0.42)]
H.prism(prof, -W / 2, W, "body", "shell")
# the canopy: a glass wedge set on the cabin
H.prism([(-0.55, 0.5), (0.45, 0.42), (0.15, 0.72), (-0.45, 0.72)], -W / 2 + 0.12, W - 0.24, "glass", "canopy")
# fins and thruster pods
for sy in (-1, 1):
    B(-L / 2 + 0.25, sy * (W / 2 - 0.08), 0.45, 0.5, 0.06, 0.25, "body2", "fin")
    C(-L / 2 + 0.05, sy * 0.32, 0.3, 0.14, 0.5, 8, "body2", "pod", rot=(0, math.pi / 2, 0))
    C(-L / 2 - 0.2, sy * 0.32, 0.3, 0.1, 0.06, 8, "neon", "exhaust", rot=(0, math.pi / 2, 0))
B(0, 0, 0.1, L - 0.5, W - 0.5, 0.06, "neon", "underglow")
B(L / 2 - 0.02, 0, 0.2, 0.05, 0.4, 0.07, "lamp", "headlamp")
H.export(dst, "hovercar")
