"""Shared helpers for the built hero pieces (bpy, headless). See make-factory.py, make-telescope.py, make-train.py.

Each part gets a material by ROLE. The page maps roles to looks: body and body2 are flat palette walls (body2 a
shade darker), glass is a lit window, neon a strip in the piece's neon colour, lamp a warm light, blink a red
aircraft light that blinks, dish a pale metal. Materials carry no textures; only their names matter.
"""
import math
import bpy, bmesh

ROLES = ("body", "body2", "glass", "neon", "lamp", "blink", "dish")
_mats = {}
parts = []

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _mats.clear(); parts.clear()
    for r in ROLES:
        m = bpy.data.materials.new(r); m.use_nodes = False; _mats[r] = m

def _finish(o, role, name):
    o.name = name
    o.data.materials.clear(); o.data.materials.append(_mats[role])
    parts.append(o); return o

def box(x, y, z, sx, sy, sz, role="body", name="box", rot=(0, 0, 0)):
    """a box centred at x, y with its base at z (Blender Z up)"""
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z + sz / 2), rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True, rotation=True)
    return _finish(o, role, name)

def cyl(x, y, z, r, h, seg=12, role="body", name="cyl", r2=None, rot=(0, 0, 0)):
    """a cylinder (or a cone with r2) standing on z; with a rotation, centred at x, y, z instead"""
    loc = (x, y, z) if any(rot) else (x, y, z + h / 2)
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=seg, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object
    bpy.ops.object.transform_apply(rotation=True)
    return _finish(o, role, name)

def sphere(x, y, z, r, role="blink", name="sphere"):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=r, location=(x, y, z))
    return _finish(bpy.context.active_object, role, name)

def prism(profile, y0, depth, role="body", name="prism", axis="y"):
    """a closed profile in the x/z plane (list of (x, z)), extruded along y from y0 by depth"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    a = [bm.verts.new((px, y0, pz)) for px, pz in profile]
    b = [bm.verts.new((px, y0 + depth, pz)) for px, pz in profile]
    bm.faces.new(a[::-1]); bm.faces.new(b)
    n = len(profile)
    for i in range(n):
        bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return _finish(o, role, name)

def lathe(profile, x, y, z, seg=16, role="dish", name="lathe", caps=False):
    """spin a profile (list of (radius, height)) about a vertical axis at x, y, base z. caps closes the first and last ring"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    rings = []
    for r, h in profile:
        ring = []
        for k in range(seg):
            a = 2 * math.pi * k / seg
            ring.append(bm.verts.new((x + r * math.cos(a), y + r * math.sin(a), z + h)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    if caps and profile[0][0] > 1e-6: bm.faces.new(rings[0][::-1])
    if caps and profile[-1][0] > 1e-6: bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return _finish(o, role, name)

def rotate_about(o, pivot, axis, deg):
    """rotate an object about a world point (bakes the rotation into the mesh)"""
    import mathutils
    R = mathutils.Matrix.Rotation(math.radians(deg), 4, axis)
    T = mathutils.Matrix.Translation(mathutils.Vector(pivot))
    o.matrix_world = T @ R @ T.inverted() @ o.matrix_world
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

def export(dst, name):
    """join every part into one object (one primitive per role), triangulate, flat shade, export GLB"""
    bpy.ops.object.select_all(action="DESELECT")
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object; obj.name = name
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.remove_doubles(threshold=1e-4)
    bpy.ops.mesh.quads_convert_to_tris(quad_method="BEAUTY", ngon_method="BEAUTY")
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_flat()
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    roles = sorted({obj.data.materials[p.material_index].name for p in obj.data.polygons})
    bpy.ops.export_scene.gltf(filepath=dst, export_format="GLB", export_apply=True, export_normals=False, export_texcoords=False, export_materials="EXPORT", use_selection=True)
    print(f"{name}: {tris} triangles, roles {', '.join(roles)} -> {dst}")
