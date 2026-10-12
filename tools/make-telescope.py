"""Build the radio telescope landmark from primitives with Blender (bpy), headless.

    .venv/bin/python tools/make-telescope.py assets/meshy-raw/telescope.glb

Meshy's telescope had its dish fused to the wrong part of the mount. This one is a lathe-made paraboloid on a yoke
and turret over an octagonal base building, tilted 45 degrees, with a three-strut receiver, a window band and a lit
door on the base, a neon rim on the dish and a blinking light at the feed. Roles: see heropieces.py.
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, mathutils
import heropieces as H

dst = sys.argv[1] if len(sys.argv) > 1 else "telescope.glb"
H.reset()
B = H.box; C = H.cyl

# a square pad, then the octagonal base building with a window band, a door and a service ring on top
B(0, 0, 0, 8.4, 8.4, 0.15, "body2", "pad")
C(0, 0, 0.15, 2.6, 0.5, 8, "body2", "plinth")
C(0, 0, 0.65, 2.3, 2.4, 8, "body", "drum")
C(0, 0, 1.55, 2.33, 0.45, 8, "glass", "window-band")
B(0, -2.3, 0.65, 0.9, 0.12, 1.5, "glass", "door")
B(0, -2.36, 2.15, 1.3, 0.2, 0.2, "lamp", "door-lamp")
C(0, 0, 3.05, 2.45, 0.25, 8, "body2", "service-ring")
for k in range(4):   # four lamps round the service ring
    a = k * math.pi / 2 + math.pi / 4
    B(2.2 * math.cos(a), 2.2 * math.sin(a), 3.3, 0.22, 0.22, 0.14, "lamp", "ring-lamp")
# turret and yoke
C(0, 0, 3.3, 1.1, 1.1, 12, "body2", "turret")
B(0, 0, 4.4, 1.9, 1.9, 0.3, "body", "turret-cap")
for sx in (-1, 1):
    B(sx * 1.05, 0, 4.7, 0.3, 1.2, 2.0, "body", "yoke-arm")
C(0, 0, 6.2, 0.26, 2.7, 10, "body2", "axle", rot=(0, math.pi / 2, 0))
# the dish: a paraboloid of 16 segments, two shells for a rim thickness, a hub and a counterweight
pivot = (0, 0, 6.2)
rim = 3.2
prof = [(0.4, 0.0)] + [(r, 0.9 * (r / rim) ** 2) for r in (1.0, 1.7, 2.4, 3.0, rim)]
inner = [(r, h + 0.06) for r, h in prof]
outer = [(r, h - 0.06) for r, h in prof]
# lift the dish so its vertex sits a little above the axle, then tilt the whole assembly about the axle
dish_z = 6.55
H.lathe(outer, 0, 0, dish_z, 16, "body2", "dish-back")
H.lathe(inner, 0, 0, dish_z, 16, "dish", "dish-face")
H.lathe([(rim - 0.02, 0.9 - 0.08), (rim + 0.08, 0.9 - 0.08), (rim + 0.08, 0.9 + 0.08), (rim - 0.02, 0.9 + 0.08)], 0, 0, dish_z, 16, "neon", "dish-rim")
C(0, 0, dish_z - 0.35, 0.55, 0.45, 10, "body2", "hub")
B(0, 0, dish_z - 1.3, 0.5, 0.5, 1.0, "body2", "hub-post")
B(0, -1.2, dish_z - 1.0, 1.2, 0.7, 0.7, "body2", "counterweight")
# the receiver: three struts from the rim up to the focus, a feed box and a blinking light
focus_z = dish_z + 2.9
for k in range(3):
    a = 2 * math.pi * k / 3 + math.pi / 2
    x0, y0, z0 = (rim - 0.2) * math.cos(a), (rim - 0.2) * math.sin(a), dish_z + 0.85
    dx, dy, dz = -x0, -y0, focus_z - z0
    L = math.sqrt(dx * dx + dy * dy + dz * dz)
    o = C(0, 0, 0, 0.07, L, 6, "body2", f"strut{k}")
    # point the strut from the rim to the focus
    o.rotation_euler = mathutils.Vector((dx, dy, dz)).to_track_quat("Z", "Y").to_euler()
    o.location = (x0 + dx / 2, y0 + dy / 2, z0 + dz / 2)
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True)
B(0, 0, focus_z - 0.25, 0.5, 0.5, 0.5, "body", "feed")
H.sphere(0, 0, focus_z + 0.4, 0.14, "blink", "feed-light")
# tilt the dish assembly 45 degrees about the axle (the x axis through the pivot), toward -y
for o in list(H.parts):
    if o.name.startswith(("dish", "hub", "counterweight", "strut", "feed")):
        H.rotate_about(o, pivot, "X", -45)
H.export(dst, "telescope")
