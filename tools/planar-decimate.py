"""Edge-preserving cleanup of a Meshy piece with Blender (bpy), for boxy pieces like the factory.

    .venv/bin/python tools/planar-decimate.py assets/meshy-raw/factory-30k.glb assets/meshy-raw/factory-planar.glb [angle_deg] [target_tris]

Meshy's own remesh and a quadric simplifier both round hard edges, because they treat a roof's fine bumps as
curvature. Blender's Decimate in Planar mode merges near-coplanar faces by angle instead, so flat walls become a
few polygons and the real edges stay. A Collapse pass then brings it under the target if it is still over.
Needs the bpy wheel in the project venv (pip install bpy). The output is a plain GLB that tools/clean-models.cjs
takes like any other source (name it <piece>-planar.glb or just <piece>.glb).
"""
import sys, math
import bpy

src, dst = sys.argv[1], sys.argv[2]
angle = float(sys.argv[3]) if len(sys.argv) > 3 else 8.0
target = int(sys.argv[4]) if len(sys.argv) > 4 else 2000
smooth_iters = int(sys.argv[5]) if len(sys.argv) > 5 else 0  # a smooth pass first flattens the bumps a remesh leaves on walls

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
if len(meshes) > 1:
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
obj = [o for o in bpy.context.scene.objects if o.type == "MESH"][0]
bpy.context.view_layer.objects.active = obj
obj.select_set(True)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def tris(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)

before = tris(obj)
# merge doubles first so planar decimate sees connected faces
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.remove_doubles(threshold=1e-5)
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode="OBJECT")

if smooth_iters:
    sm = obj.modifiers.new("smooth", "SMOOTH")
    sm.factor = 0.5
    sm.iterations = smooth_iters
    bpy.ops.object.modifier_apply(modifier="smooth")

m = obj.modifiers.new("planar", "DECIMATE")
m.decimate_type = "DISSOLVE"
m.angle_limit = math.radians(angle)
m.use_dissolve_boundaries = False
m.delimit = {"NORMAL"}
bpy.ops.object.modifier_apply(modifier="planar")
after_planar = tris(obj)

# planar dissolve leaves n-gons; triangulate so the collapse pass and the exporter see triangles
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
bpy.ops.object.mode_set(mode="OBJECT")
after_tri = tris(obj)

if after_tri > target:
    c = obj.modifiers.new("collapse", "DECIMATE")
    c.decimate_type = "COLLAPSE"
    c.ratio = target / after_tri
    c.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier="collapse")
    # the collapse ratio counts faces before triangulation in some builds; run it again if still over
    for _ in range(3):
        if tris(obj) <= target * 1.1: break
        c = obj.modifiers.new("collapse2", "DECIMATE"); c.decimate_type = "COLLAPSE"; c.ratio = target / tris(obj); c.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier="collapse2")
after = tris(obj)

bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True, export_normals=False, export_texcoords=False, export_materials="NONE", use_selection=True)
print(f"{src}: {before} -> planar {after_planar} ({angle} deg) -> triangulated {after_tri} -> {after} triangles -> {dst}")
