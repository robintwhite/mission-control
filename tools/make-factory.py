"""Build the factory landmark from primitives with Blender (bpy), headless.

    .venv/bin/python tools/make-factory.py assets/meshy-raw/factory.glb

Meshy's factory came out blobby at 2,000 triangles: its surface is noise everywhere, so neither a remesh nor a
planar decimate gives back a box. A boxy building is quicker to build than to clean. This makes one from boxes,
cylinders and a sawtooth profile, about 1,000 triangles, flat faces and hard edges, and exports a plain GLB that
tools/clean-models.cjs takes like any other source. Y up (Blender's Z up is converted by the glTF exporter).
Units are arbitrary: the cleaner scales the footprint to 1 and the page sets the real size.
"""
import sys, math
import bpy, bmesh

dst = sys.argv[1] if len(sys.argv) > 1 else "factory.glb"
bpy.ops.wm.read_factory_settings(use_empty=True)
parts = []

def box(x, y, z, sx, sy, sz, name="box"):
    """a box centred at x, y with its base at z (Blender Z up)"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2))
    o = bpy.context.active_object; o.scale = (sx, sy, sz); o.name = name
    bpy.ops.object.transform_apply(scale=True); parts.append(o); return o

def cyl(x, y, z, r, h, seg=12, name="cyl", r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=h, location=(x, y, z + h / 2))
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r2, depth=h, location=(x, y, z + h / 2))
    o = bpy.context.active_object; o.name = name; parts.append(o); return o

def sawtooth(x0, y0, z0, teeth, pitch, rise, depth, name="roof"):
    """a sawtooth roof profile in x/z, extruded along y: steep face toward -x, slope toward +x"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    prof = [(0, 0)]
    for t in range(teeth):
        a = t * pitch
        prof += [(a, rise), (a + pitch * 0.82, 0.08)]
    prof.append((teeth * pitch, 0))
    front = [bm.verts.new((x0 + px, y0, z0 + pz)) for px, pz in prof]
    back = [bm.verts.new((x0 + px, y0 + depth, z0 + pz)) for px, pz in prof]
    bm.faces.new(front[::-1]); bm.faces.new(back)
    for i in range(len(prof) - 1):
        bm.faces.new((front[i], front[i + 1], back[i + 1], back[i]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o); parts.append(o); return o

# ground slab and a yard
box(0, 0, 0, 10, 8, 0.15, "slab")
# main hall (left two thirds) with a sawtooth roof and a clerestory band
box(-1.3, 0, 0.15, 7.2, 6.2, 3.0, "hall")
sawtooth(-4.9, -3.1, 3.15, 4, 1.8, 0.9, 6.2)
box(-1.3, 0, 3.15, 7.3, 0.2, 0.25, "roof-edge-s"); box(-1.3, 0, 3.15, 0.2, 6.3, 0.25, "roof-edge-mid")
# annex on the right: the loading dock with three bay doors and a platform
box(3.4, 0, 0.15, 2.8, 6.2, 2.2, "annex")
box(3.4, 0, 2.35, 2.9, 6.3, 0.18, "annex-parapet")
for i, yy in enumerate((-1.9, 0, 1.9)):
    box(4.82, yy, 0.55, 0.12, 1.25, 1.35, f"door{i}")        # recessed-looking door panel standing proud of the wall
    box(4.9, yy, 1.95, 0.25, 1.45, 0.12, f"lintel{i}")
box(5.25, 0, 0.15, 0.7, 6.0, 0.45, "dock")
# three stacks behind the hall, each with a collar and a cap
for i, xx in enumerate((-3.6, -2.3, -1.0)):
    cyl(xx, -2.2, 3.15, 0.32, 4.6, 12, f"stack{i}")
    cyl(xx, -2.2, 7.55, 0.42, 0.3, 12, f"collar{i}")
    cyl(xx, -2.2, 3.15, 0.5, 0.35, 12, f"stack-base{i}")
# water tank on the annex roof: four legs, a tank, a conical lid
for dx in (-0.55, 0.55):
    for dy in (-0.55, 0.55):
        box(3.4 + dx, -1.6 + dy, 2.53, 0.12, 0.12, 1.0, "leg")
box(3.4, -1.6, 3.45, 1.5, 1.5, 0.1, "tank-floor")
cyl(3.4, -1.6, 3.55, 0.75, 1.1, 14, "tank")
cyl(3.4, -1.6, 4.65, 0.78, 0.35, 14, "tank-lid", r2=0.15)
# pipes along the back wall with risers, and a gantry over the yard on the far right
for i, zz in enumerate((1.0, 1.5)):
    cyl(0, 0, 0, 0.11, 7.0, 8, f"pipe{i}")
    o = parts[-1]; o.rotation_euler = (0, math.pi / 2, 0); o.location = (-1.3, -3.25 + 0.0, zz); bpy.ops.object.transform_apply(rotation=True)
    cyl(-4.6, -3.25, 0.15, 0.11, zz - 0.15, 8, f"riser{i}")
box(-1.3, 3.0, 3.15, 1.2, 0.5, 0.5, "vent-a"); box(0.6, 2.5, 3.15, 0.8, 0.8, 0.6, "vent-b")
for yy in (-2.6, 2.6):
    box(4.7, yy, 0.15, 0.18, 0.18, 3.4, "gantry-post")
box(4.7, 0, 3.4, 0.22, 5.4, 0.22, "gantry-beam")
box(4.7, 0.8, 2.95, 0.5, 0.5, 0.45, "gantry-hoist")

# join, merge doubles, flat shading, export
bpy.ops.object.select_all(action="DESELECT")
for o in parts: o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
obj = bpy.context.active_object; obj.name = "factory"
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-4)
bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.shade_flat()
tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True, export_normals=False, export_texcoords=False, export_materials="NONE", use_selection=True)
print(f"factory: {tris} triangles -> {dst}")
