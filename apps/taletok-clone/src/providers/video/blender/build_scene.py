"""
Blender scene builder for the explainer/story formats.

Runs headless:  blender --background --python build_scene.py -- spec.json

Reads a JSON spec written by the TypeScript provider, constructs the scene
procedurally, and renders a PNG sequence. Nothing is imported from an asset
library -- every object is generated from parameters here, so the repository
carries no model files and the geometry is original.

Design notes:
  * Cycles on CPU is the only engine guaranteed to work in a headless container
    with no GPU, so it is the default; sample counts are kept low and the
    OpenImageDenoise pass does the rest of the work.
  * Objects get a bevel modifier. Perfectly sharp edges are the single biggest
    reason a procedural render reads as "computer shapes" -- real objects catch
    a highlight on every edge.
"""

import json
import math
import os
import sys

import bpy
from mathutils import Vector


# --------------------------------------------------------------------- setup

def clear_scene():
    """Blender starts with a cube, camera and light; none of them are wanted."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights):
        for item in list(block):
            if item.users == 0:
                block.remove(item)


def make_material(name, color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def add_object(obj, material, bevel=0.02, shade_smooth=False):
    """
    Bevel width is clamped against the object's own smallest dimension: a bevel
    wider than half the thinnest side consumes the face entirely and turns a
    thin box into a lozenge.
    """
    obj.data.materials.append(material)

    if bevel > 0:
        smallest = min(abs(d) for d in obj.dimensions) if max(obj.dimensions) > 0 else bevel
        mod = obj.modifiers.new("Bevel", "BEVEL")
        mod.width = min(bevel, smallest * 0.22)
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)

    if shade_smooth:
        # Angle-based smoothing only. Smoothing every polygon rounds the flat
        # caps and rim of a cylinder too, which makes it read as a sphere.
        for poly in obj.data.polygons:
            poly.use_smooth = True
        obj.data.use_auto_smooth = True
        obj.data.auto_smooth_angle = math.radians(35)
    return obj


def cube(size, location, material, bevel=0.02):
    """`size` is the full edge length on each axis, not a half-extent."""
    # primitive_cube_add(size=1) already gives a unit cube, so the scale factor
    # is the edge length itself. Halving it here made every box half-sized,
    # which detached the wheels from a body that had silently shrunk.
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.active_object
    obj.scale = (size[0], size[1], size[2])
    bpy.ops.object.transform_apply(scale=True)
    return add_object(obj, material, bevel)


def cylinder(radius, depth, location, material, rotation=(0, 0, 0), verts=32, bevel=0.01):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, location=location, rotation=rotation, vertices=verts
    )
    return add_object(bpy.context.active_object, material, bevel, shade_smooth=True)


def uv_sphere(radius, location, material, segments=32):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location, segments=segments)
    return add_object(bpy.context.active_object, material, bevel=0, shade_smooth=True)


def cone(radius, depth, location, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(radius1=radius, depth=depth, location=location, rotation=rotation)
    return add_object(bpy.context.active_object, material, bevel=0.01, shade_smooth=True)


# ------------------------------------------------------------------- lighting

def setup_world(sky_top, sky_bottom):
    """Vertical gradient world so the sky lights the scene as well as backing it."""
    world = bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    gradient = nodes.new("ShaderNodeTexGradient")
    mapping = nodes.new("ShaderNodeMapping")
    coord = nodes.new("ShaderNodeTexCoord")
    ramp = nodes.new("ShaderNodeValToRGB")

    # Rotate the gradient so it runs vertically in world space.
    mapping.inputs["Rotation"].default_value = (math.radians(90), 0, 0)
    ramp.color_ramp.elements[0].color = (*sky_bottom, 1.0)
    ramp.color_ramp.elements[1].color = (*sky_top, 1.0)
    background.inputs["Strength"].default_value = 1.1

    links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], gradient.inputs["Vector"])
    links.new(gradient.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])


def setup_sky(turbidity=3.4, elevation_deg=48, rotation_deg=38, strength=0.32):
    """
    Physical sky rather than a flat gradient.

    A gradient world lights everything with one flat colour. A sky model gives
    a real horizon falloff, warm light near the sun and cool light away from
    it, and -- most visibly -- something with structure for glossy surfaces to
    reflect. Reflections are most of what sells a painted or metal surface.
    """
    world = bpy.data.worlds.new("Sky")
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()

    output = nodes.new("ShaderNodeOutputWorld")
    background = nodes.new("ShaderNodeBackground")
    background.inputs["Strength"].default_value = strength

    sky = nodes.new("ShaderNodeTexSky")
    try:
        sky.sky_type = "NISHITA"
        sky.turbidity = turbidity
        sky.sun_elevation = math.radians(elevation_deg)
        sky.sun_rotation = math.radians(rotation_deg)
        sky.sun_intensity = 0.6
    except (AttributeError, TypeError):
        # Older builds expose a different sky model; the gradient still works.
        pass

    links.new(sky.outputs["Color"], background.inputs["Color"])
    links.new(background.outputs["Background"], output.inputs["Surface"])
    return world


def setup_three_point(key_angle=38, key_elevation=48, key_energy=2.6, fill=0.32, rim=0.9):
    """
    Key, fill and rim.

    A single sun leaves the shadow side dead flat and the silhouette merging
    into the background. The fill lifts the shadow side without killing the
    form, and the rim separates the subject from whatever is behind it.
    """
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 24))
    key = bpy.context.active_object
    key.data.energy = key_energy
    key.data.angle = math.radians(2.5)
    key.rotation_euler = (math.radians(90 - key_elevation), 0, math.radians(key_angle))

    bpy.ops.object.light_add(type="AREA", location=(-9, -7, 7))
    fill_light = bpy.context.active_object
    fill_light.data.energy = fill * 260
    fill_light.data.size = 12.0
    fill_light.data.color = (0.74, 0.82, 1.0)
    fill_light.rotation_euler = (math.radians(62), 0, math.radians(-38))

    bpy.ops.object.light_add(type="AREA", location=(7, 10, 6))
    rim_light = bpy.context.active_object
    rim_light.data.energy = rim * 260
    rim_light.data.size = 7.0
    rim_light.data.color = (1.0, 0.93, 0.84)
    rim_light.rotation_euler = (math.radians(74), 0, math.radians(206))

    return key, fill_light, rim_light


def setup_sun(angle_deg, elevation_deg, energy):
    bpy.ops.object.light_add(type="SUN", location=(0, 0, 20))
    sun = bpy.context.active_object
    sun.data.energy = energy
    # A visible disc size gives soft shadow edges instead of hard stencils.
    sun.data.angle = math.radians(3.0)
    sun.rotation_euler = (
        math.radians(90 - elevation_deg),
        0,
        math.radians(angle_deg),
    )
    return sun



# ------------------------------------------------------- lofted bodywork

def loft(stations, name, materials, crease_bottom=True, face_material=None):
    """
    Builds a closed mesh by bridging cross-sections along X.

    Each station is (x, half_width, deck_z, roof_z). The cross-section is a
    twelve-point loop: up one flank to the centreline and back down the other.
    Every station carries the same point count, so consecutive stations bridge
    into quads without any triangulation.

    This is how the body gets curvature. Stacking bevelled boxes can only ever
    produce stacked bevelled boxes; a lofted surface under a subdivision
    modifier produces an actual shoulder line and roof fall-away.
    """
    verts = []
    faces = []
    ring = 12

    for (x, w, deck, roof) in stations:
        half = [
            (0.0, 0.0),
            (w * 0.92, 0.0),
            (w, deck * 0.34),
            (w, deck * 0.82),
            (w * 0.95, deck),
            (w * 0.60, roof),
            (0.0, roof),
        ]
        # Up the +Y flank, across the centreline, back down the -Y flank.
        loop = [(x, y, z) for (y, z) in half]
        loop += [(x, -y, z) for (y, z) in reversed(half[1:-1])]
        verts.extend(loop)

    stations_count = len(stations)
    for s in range(stations_count - 1):
        a = s * ring
        b = (s + 1) * ring
        for i in range(ring):
            j = (i + 1) % ring
            faces.append((a + i, a + j, b + j, b + i))

    # Flat caps at each end, fanned from the first vertex of the ring.
    first = list(range(ring))
    last = [(stations_count - 1) * ring + i for i in range(ring)]
    faces.append(tuple(reversed(first)))
    faces.append(tuple(last))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)

    for mat in (materials if isinstance(materials, (list, tuple)) else [materials]):
        obj.data.materials.append(mat)

    # Glazing is assigned per face rather than modelled as separate panels:
    # separate panels sit proud of a curved body and read as floating slabs,
    # whereas a material slot follows the surface exactly.
    if face_material is not None:
        for poly in mesh.polygons:
            c = poly.center
            n = poly.normal
            poly.material_index = face_material(c.x, c.y, c.z, n.x, n.y, n.z)

    # Crease the lowest ring so subdivision does not round the sill away.
    if crease_bottom:
        def is_bottom(edge):
            za = obj.data.vertices[edge.vertices[0]].co.z
            zb = obj.data.vertices[edge.vertices[1]].co.z
            return abs(za) < 1e-4 and abs(zb) < 1e-4

        set_edge_creases(obj, is_bottom, 0.9)

    mod = obj.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = 1
    mod.render_levels = 2
    mod.use_limit_surface = False

    for poly in obj.data.polygons:
        poly.use_smooth = True
    obj.data.use_auto_smooth = True
    obj.data.auto_smooth_angle = math.radians(50)
    return obj


def set_edge_creases(obj, predicate, value=0.9):
    """
    Creases the edges matching `predicate`.

    Blender 4.0 moved edge crease off MeshEdge and into a generic "crease_edge"
    attribute, so writing edge.crease raises AttributeError there. Try the
    attribute first and fall back to the old property.
    """
    mesh = obj.data
    layer = mesh.attributes.get("crease_edge")
    if layer is None:
        try:
            layer = mesh.attributes.new("crease_edge", "FLOAT", "EDGE")
        except (RuntimeError, TypeError):
            layer = None

    if layer is not None:
        for index, edge in enumerate(mesh.edges):
            if predicate(edge):
                layer.data[index].value = value
        return

    for edge in mesh.edges:
        if predicate(edge):
            edge.crease = value


def boolean_cut(target, cutter):
    """Subtracts `cutter` from `target`, then removes the cutter object."""
    mod = target.modifiers.new("Cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.object = cutter
    mod.solver = "FAST"
    cutter.hide_render = True
    cutter.hide_viewport = True
    return mod


def wheel_arch_cutter(location, radius, width):
    """A cylinder used to carve a wheel well out of the bodyside."""
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=width, location=location,
        rotation=(math.radians(90), 0, 0), vertices=24,
    )
    return bpy.context.active_object


# --------------------------------------------------------- panel materials

def _band(tree, value_socket, position, width):
    """Returns a 0..1 factor that peaks in a narrow band around `position`."""
    offset = tree.nodes.new("ShaderNodeMath")
    offset.operation = "SUBTRACT"
    offset.inputs[1].default_value = position
    tree.links.new(value_socket, offset.inputs[0])

    absolute = tree.nodes.new("ShaderNodeMath")
    absolute.operation = "ABSOLUTE"
    tree.links.new(offset.outputs[0], absolute.inputs[0])

    ramp = tree.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.0
    ramp.inputs["From Max"].default_value = width
    ramp.inputs["To Min"].default_value = 1.0
    ramp.inputs["To Max"].default_value = 0.0
    ramp.clamp = True
    tree.links.new(absolute.outputs[0], ramp.inputs["Value"])
    return ramp.outputs[0]


def make_panelled_material(name, color, panel_positions, roughness=0.26, metallic=0.45):
    """
    Body paint with shut lines.

    The lines are shaded rather than modelled: thin bands in object space that
    darken the base colour and raise roughness. Modelling every panel gap would
    multiply the geometry for detail that only ever reads as a dark line.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]

    coord = tree.nodes.new("ShaderNodeTexCoord")
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coord.outputs["Object"], separate.inputs["Vector"])

    combined = None
    for position in panel_positions:
        band = _band(tree, separate.outputs["X"], position, 0.035)
        if combined is None:
            combined = band
        else:
            maximum = tree.nodes.new("ShaderNodeMath")
            maximum.operation = "MAXIMUM"
            tree.links.new(combined, maximum.inputs[0])
            tree.links.new(band, maximum.inputs[1])
            combined = maximum.outputs[0]

    base = tree.nodes.new("ShaderNodeMixRGB")
    base.blend_type = "MIX"
    base.inputs["Color1"].default_value = (*color, 1.0)
    # Shut lines read as shadow, not as a different paint colour.
    base.inputs["Color2"].default_value = (color[0] * 0.18, color[1] * 0.18, color[2] * 0.18, 1.0)
    if combined is not None:
        tree.links.new(combined, base.inputs["Fac"])
    tree.links.new(base.outputs["Color"], bsdf.inputs["Base Color"])

    rough = tree.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = roughness
    rough.inputs["To Max"].default_value = min(1.0, roughness + 0.45)
    if combined is not None:
        tree.links.new(combined, rough.inputs["Value"])
    tree.links.new(rough.outputs[0], bsdf.inputs["Roughness"])

    bsdf.inputs["Metallic"].default_value = metallic
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.4
    return mat


def make_asphalt_material(color):
    """Road surface with noise-driven roughness and a fine bump."""
    mat = bpy.data.materials.new("Asphalt")
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)

    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 260.0
    noise.inputs["Detail"].default_value = 6.0

    rough = tree.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.62
    rough.inputs["To Max"].default_value = 0.95
    tree.links.new(noise.outputs["Fac"], rough.inputs["Value"])
    tree.links.new(rough.outputs[0], bsdf.inputs["Roughness"])

    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.12
    tree.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat



# ------------------------------------------------- detailed shading

def _shading_detail(tree, bsdf):
    """
    Shared surface detail: a shading-only bevel and cavity dirt.

    Both are enormously cheaper than modelling the same thing. A Bevel node
    rounds edges for the shader alone, so every edge catches a highlight
    without adding a single polygon, and that highlight is most of what
    separates a render from a diagram. Ambient occlusion drives grime into
    crevices, which is what stops a surface reading as freshly extruded.
    """
    bevel = tree.nodes.new("ShaderNodeBevel")
    bevel.samples = 4
    bevel.inputs["Radius"].default_value = 0.012
    tree.links.new(bevel.outputs["Normal"], bsdf.inputs["Normal"])

    cavity = tree.nodes.new("ShaderNodeAmbientOcclusion")
    cavity.samples = 8
    cavity.inside = True
    cavity.inputs["Distance"].default_value = 0.035

    # The occlusion socket is "AO" on current builds and "Fac" on older ones.
    occlusion = cavity.outputs.get("AO") or cavity.outputs.get("Fac")
    return bevel, occlusion


def make_car_paint(name, color, panel_positions):
    """
    Automotive paint: metallic base, clearcoat, flake, shut lines and grime.

    Layered the way real paint is: a metallic base carrying fine flake noise,
    a clearcoat over the top for the deep wet highlight, shut lines darkening
    both colour and roughness, and dirt gathering in the cavities.
    """
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]

    coord = tree.nodes.new("ShaderNodeTexCoord")
    separate = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coord.outputs["Object"], separate.inputs["Vector"])

    # Shut lines.
    seams = None
    for position in panel_positions:
        band = _band(tree, separate.outputs["X"], position, 0.03)
        if seams is None:
            seams = band
        else:
            maximum = tree.nodes.new("ShaderNodeMath")
            maximum.operation = "MAXIMUM"
            tree.links.new(seams, maximum.inputs[0])
            tree.links.new(band, maximum.inputs[1])
            seams = maximum.outputs[0]

    painted = tree.nodes.new("ShaderNodeMixRGB")
    painted.inputs["Color1"].default_value = (*color, 1.0)
    painted.inputs["Color2"].default_value = (color[0] * 0.14, color[1] * 0.14, color[2] * 0.14, 1.0)
    if seams is not None:
        tree.links.new(seams, painted.inputs["Fac"])

    _, cavity = _shading_detail(tree, bsdf)

    # Road grime settles in the cavities and low on the body.
    grime = tree.nodes.new("ShaderNodeMixRGB")
    grime.inputs["Color2"].default_value = (0.055, 0.05, 0.045, 1.0)
    tree.links.new(painted.outputs["Color"], grime.inputs["Color1"])

    dirt_amount = tree.nodes.new("ShaderNodeMath")
    dirt_amount.operation = "MULTIPLY"
    dirt_amount.inputs[1].default_value = 0.18
    tree.links.new(cavity, dirt_amount.inputs[0])
    tree.links.new(dirt_amount.outputs[0], grime.inputs["Fac"])
    tree.links.new(grime.outputs["Color"], bsdf.inputs["Base Color"])

    # Metallic flake: fine noise lifting roughness a little, unevenly.
    flake = tree.nodes.new("ShaderNodeTexNoise")
    flake.inputs["Scale"].default_value = 900.0
    flake.inputs["Detail"].default_value = 2.0

    rough = tree.nodes.new("ShaderNodeMapRange")
    rough.inputs["To Min"].default_value = 0.16
    rough.inputs["To Max"].default_value = 0.30
    tree.links.new(flake.outputs["Fac"], rough.inputs["Value"])

    # Shut lines are matte next to the gloss around them.
    seam_rough = tree.nodes.new("ShaderNodeMixRGB")
    tree.links.new(rough.outputs[0], seam_rough.inputs["Color1"])
    seam_rough.inputs["Color2"].default_value = (0.72, 0.72, 0.72, 1.0)
    if seams is not None:
        tree.links.new(seams, seam_rough.inputs["Fac"])
    tree.links.new(seam_rough.outputs["Color"], bsdf.inputs["Roughness"])

    bsdf.inputs["Metallic"].default_value = 0.72
    for coat, value in (("Coat Weight", 1.0), ("Coat Roughness", 0.04), ("Coat IOR", 1.5)):
        if coat in bsdf.inputs:
            bsdf.inputs[coat].default_value = value
    return mat


def make_glass(tint=(0.05, 0.06, 0.07)):
    """Automotive glazing: dark tint, real IOR, a touch of transmission."""
    mat = bpy.data.materials.new("Glazing")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*tint, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.04
    bsdf.inputs["Metallic"].default_value = 0.0
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.45
    # Kept low: full transmission would demand far more samples to resolve.
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = 0.22
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = 0.6
    return mat


def make_tyre():
    """Rubber with a sidewall pattern and tread, both as bump rather than mesh."""
    mat = bpy.data.materials.new("Tyre")
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (0.018, 0.018, 0.021, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.82

    coord = tree.nodes.new("ShaderNodeTexCoord")
    # Wave texture rings the sidewall and reads as tread on the crown.
    wave = tree.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "RINGS"
    wave.inputs["Scale"].default_value = 26.0
    wave.inputs["Distortion"].default_value = 3.0
    tree.links.new(coord.outputs["Object"], wave.inputs["Vector"])

    bump = tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.28
    tree.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_brushed_metal(color, roughness=0.28):
    """Metal with cavity dirt — bare metal with no grime reads as plastic."""
    mat = bpy.data.materials.new("Metal")
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = tree.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = 0.95
    bsdf.inputs["Roughness"].default_value = roughness

    _, cavity = _shading_detail(tree, bsdf)

    grime = tree.nodes.new("ShaderNodeMixRGB")
    grime.inputs["Color1"].default_value = (*color, 1.0)
    grime.inputs["Color2"].default_value = (0.03, 0.028, 0.026, 1.0)
    scaled = tree.nodes.new("ShaderNodeMath")
    scaled.operation = "MULTIPLY"
    scaled.inputs[1].default_value = 0.7
    tree.links.new(cavity, scaled.inputs[0])
    tree.links.new(scaled.outputs[0], grime.inputs["Fac"])
    tree.links.new(grime.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def make_emissive(color, strength=12.0):
    """Lamp lenses that actually emit, so they read as lit rather than painted."""
    mat = bpy.data.materials.new("Lamp")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.1
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = (*color, 1.0)
        bsdf.inputs["Emission Strength"].default_value = strength
    return mat


# --------------------------------------------------------------------- sets

def build_ground(size, color, roughness=0.9, subdivide=0):
    bpy.ops.mesh.primitive_plane_add(size=size, location=(0, 0, 0))
    ground = bpy.context.active_object
    if subdivide:
        mod = ground.modifiers.new("Subsurf", "SUBSURF")
        mod.subdivision_type = "SIMPLE"
        mod.levels = subdivide
        mod.render_levels = subdivide
    return add_object(ground, make_material("Ground", color, roughness), bevel=0)


def build_vehicle(palette):
    """
    A generic road vehicle built as a lofted surface.

    Cross-sections along the length describe a bonnet, a greenhouse and a boot;
    subdivision turns them into a continuous body with a real shoulder line.
    Wheel arches are cut with booleans so the wheels sit inside the bodyside
    rather than protruding from a slab, and the paint carries shaded shut lines.

    An archetype only -- no marque, badge, grille pattern or model-specific
    shaping.
    """
    body_mat = make_car_paint("Body", palette["primary"], (-1.02, 0.22, 1.30, -1.74))
    glass_mat = make_glass()
    tyre_mat = make_tyre()
    rim_mat = make_brushed_metal((0.62, 0.64, 0.67), roughness=0.18)
    lamp_mat = make_emissive((0.96, 0.94, 0.86), strength=9.0)
    tail_mat = make_emissive((0.95, 0.12, 0.08), strength=7.0)
    trim_mat = make_brushed_metal((0.05, 0.05, 0.056), roughness=0.52)

    # (x, half width, deck height, roof height). Roof equals deck wherever
    # there is no cabin, which flattens the section into a bonnet or boot.
    # The end stations taper gently: a hard drop at the last station lofts into
    # a flat wedge that reads as a snowplough rather than a nose.
    stations = [
        (-2.58, 0.56, 0.40, 0.40),
        (-2.46, 0.70, 0.52, 0.52),
        (-2.26, 0.84, 0.66, 0.66),
        (-2.00, 0.92, 0.78, 0.78),
        (-1.62, 0.95, 0.88, 0.88),
        (-1.20, 0.96, 0.93, 1.44),
        (-0.60, 0.97, 0.94, 1.66),
        (0.16, 0.97, 0.94, 1.68),
        (0.76, 0.96, 0.92, 1.48),
        (1.28, 0.95, 0.88, 0.88),
        (1.86, 0.93, 0.78, 0.78),
        (2.18, 0.89, 0.68, 0.68),
        (2.40, 0.82, 0.57, 0.57),
        (2.54, 0.70, 0.47, 0.47),
        (2.64, 0.54, 0.38, 0.38),
    ]

    def face_material(x, y, z, nx, ny, nz):
        """
        Slot 1 is glass: the greenhouse sides and the two screens.

        Position alone is not enough -- the roof panel and the side windows
        both sit above the belt line, so a height test claims the roof too and
        the car renders as a glass dome. The face normal separates them: roof
        faces point up, glazing faces point outward or fore-and-aft.
        """
        if z < 1.04 or not (-1.26 < x < 0.84):
            return 0
        # Anything facing substantially upward is roof, not glazing.
        if nz > 0.55:
            return 0
        # Side glass faces outward; the screens face fore and aft.
        if abs(ny) > 0.5 or abs(nx) > 0.45:
            return 1
        return 0

    body = loft(stations, "Body", [body_mat, glass_mat], face_material=face_material)

    for x in (1.48, -1.48):
        cutter = wheel_arch_cutter((x, 0, 0.46), 0.63, 2.4)
        boolean_cut(body, cutter)

    objects = [body]

    # Sill, bumpers and lamps.
    objects.append(cube((3.7, 1.96, 0.12), (0, 0, 0.22), trim_mat, bevel=0.03))
    for sx in (1, -1):
        objects.append(cube((0.16, 1.52, 0.2), (sx * 2.3, 0, 0.5), trim_mat, bevel=0.05))
        for sy in (0.54, -0.54):
            lens = lamp_mat if sx > 0 else tail_mat
            objects.append(cube((0.07, 0.38, 0.13), (sx * 2.3, sy * 0.92, 0.78), lens, bevel=0.025))

    # Detail that carries scale: mirrors, a grille, exhaust and door handles.
    for sy in (0.98, -0.98):
        objects.append(cube((0.14, 0.22, 0.12), (0.52, sy * 1.02, 1.16), trim_mat, bevel=0.03))
        objects.append(cube((0.3, 0.06, 0.07), (-0.5, sy * 0.99, 1.0), rim_mat, bevel=0.02))
    # Grille slats, recessed into the nose rather than floating in front of it.
    for i in range(7):
        objects.append(cube((0.05, 0.06, 0.15), (2.4, -0.36 + i * 0.12, 0.62), trim_mat, bevel=0.01))
    objects.append(cylinder(0.07, 0.26, (-2.4, -0.56, 0.33), rim_mat,
                            rotation=(0, math.radians(90), 0), verts=16, bevel=0.015))

    for x in (1.48, -1.48):
        for y in (0.8, -0.8):
            objects.append(cylinder(0.47, 0.28, (x, y, 0.47), tyre_mat,
                                    rotation=(math.radians(90), 0, 0), verts=48, bevel=0.035))
            objects.append(cylinder(0.27, 0.3, (x, y, 0.47), rim_mat,
                                    rotation=(math.radians(90), 0, 0), verts=28, bevel=0.012))
            objects.append(cylinder(0.1, 0.32, (x, y, 0.47), trim_mat,
                                    rotation=(math.radians(90), 0, 0), verts=16, bevel=0.008))
    return objects


def build_machine(palette):
    """A generic mechanical assembly: block, cylinder bank, pulley, pipework."""
    case_mat = make_material("Case", (0.42, 0.44, 0.48), roughness=0.42, metallic=0.7)
    dark_mat = make_material("Dark", (0.07, 0.075, 0.09), roughness=0.55, metallic=0.4)
    accent_mat = make_material("Accent", palette["primary"], roughness=0.3, metallic=0.5)
    steel_mat = make_material("Steel", (0.62, 0.64, 0.67), roughness=0.22, metallic=0.95)

    objects = [
        cube((2.6, 1.9, 1.6), (0, 0, 0.8), case_mat, bevel=0.06),
        cube((2.3, 1.7, 0.42), (0, 0, 1.78), dark_mat, bevel=0.05),
        cube((2.8, 2.1, 0.22), (0, 0, 0.11), dark_mat, bevel=0.04),
    ]

    # Cylinder bank, spaced wider than its own diameter so the bank reads as
    # separate cylinders rather than one merged slab.
    for i in range(4):
        x = -0.86 + i * 0.58
        objects.append(cylinder(0.22, 0.78, (x, 0, 2.35), accent_mat, verts=24, bevel=0.02))
        objects.append(cylinder(0.26, 0.1, (x, 0, 2.76), steel_mat, verts=24, bevel=0.01))

    # Pulley on the front face, mounted clear of the housing.
    objects.append(cylinder(0.46, 0.16, (1.42, 0, 0.85), dark_mat,
                            rotation=(0, math.radians(90), 0), verts=40, bevel=0.02))
    objects.append(cylinder(0.5, 0.1, (1.55, 0, 0.85), steel_mat,
                            rotation=(0, math.radians(90), 0), verts=40, bevel=0.02))
    # Pipework along the side.
    objects.append(cylinder(0.11, 2.2, (-0.1, 1.05, 1.2), steel_mat,
                            rotation=(0, math.radians(90), 0), verts=20, bevel=0.01))
    objects.append(cylinder(0.09, 1.1, (-1.2, 0.6, 1.7), steel_mat,
                            rotation=(math.radians(90), 0, 0), verts=20, bevel=0.01))

    # Bolt heads: small details do most of the work in selling scale.
    for y in (0.98, -0.98):
        for x in (-1.0, -0.35, 0.35, 1.0):
            objects.append(cylinder(0.055, 0.05, (x, y, 1.58), steel_mat, verts=6, bevel=0.005))
    return objects


def build_landscape(palette, rng):
    """Rolling ground with conifers — the outdoor fallback set."""
    ground = build_ground(160, palette["ground"], roughness=0.95, subdivide=6)

    # Displace the plane with procedural noise for real relief.
    tex = bpy.data.textures.new("Relief", type="CLOUDS")
    tex.noise_scale = 12.0
    mod = ground.modifiers.new("Displace", "DISPLACE")
    mod.texture = tex
    mod.strength = 3.2
    mod.mid_level = 0.5

    trunk_mat = make_material("Trunk", (0.16, 0.1, 0.06), roughness=0.9)
    leaf_mat = make_material("Leaf", palette["primary"], roughness=0.8)

    objects = [ground]
    for i in range(26):
        x = (rng() - 0.5) * 46
        y = -6 - rng() * 40
        h = 3.2 + rng() * 2.6
        objects.append(cylinder(0.13, h * 0.34, (x, y, h * 0.17), trunk_mat, verts=10))
        objects.append(cone(h * 0.34, h * 0.62, (x, y, h * 0.5), leaf_mat))
        objects.append(cone(h * 0.25, h * 0.5, (x, y, h * 0.82), leaf_mat))
    return objects



# ----------------------------------------------------------------- shots

# Camera treatment per narrative role.
#
# Every scene using the same slow orbit is what makes a sequence read as
# cheap, however good the materials are. A piece that cuts between a wide
# establishing shot, a detail push and a low angle reads as directed. Each
# entry scales the framing distance, the camera height, how far it arcs, the
# lens and how much it pushes in over the clip.
#
#   distance: multiplier on the computed framing distance
#   elevation: multiplier on that distance, giving the camera height.
#              Deliberately not called "height": the spec carries an image
#              height, and the override merge below would silently adopt it.
#   sweep:    radians of arc across the clip
#   fov:      vertical field of view; lower is longer and flatter
#   push:     fraction of the distance travelled inward and back
#   angle:    starting angle around the subject
SHOTS = {
    "hook":        {"distance": 1.35, "elevation": 0.30, "sweep": 0.30, "fov": 0.95, "push": 0.16, "angle": 0.80},
    "premise":     {"distance": 1.05, "elevation": 0.26, "sweep": 0.50, "fov": 0.90, "push": 0.12, "angle": 1.10},
    "context":     {"distance": 1.15, "elevation": 0.62, "sweep": 0.40, "fov": 0.85, "push": 0.10, "angle": -0.70},
    # Development is where the mechanism is explained, so it goes in close.
    "development": {"distance": 0.62, "elevation": 0.16, "sweep": 0.34, "fov": 0.72, "push": 0.20, "angle": 0.45},
    # The turn drops low and moves faster; it is the beat with the most force.
    "turn":        {"distance": 0.72, "elevation": 0.07, "sweep": 0.70, "fov": 1.05, "push": 0.22, "angle": -1.25},
    "consequence": {"distance": 1.30, "elevation": 0.34, "sweep": 0.46, "fov": 0.95, "push": -0.18, "angle": 1.45},
    "resolution":  {"distance": 1.00, "elevation": 0.30, "sweep": 0.52, "fov": 0.88, "push": 0.10, "angle": -0.95},
    "close":       {"distance": 1.10, "elevation": 0.24, "sweep": 0.16, "fov": 0.80, "push": 0.06, "angle": 0.65},
    "auto":        {"distance": 1.00, "elevation": 0.28, "sweep": 0.50, "fov": 0.90, "push": 0.14, "angle": 0.70},
}


def shot_for(spec):
    """Treatment for this beat, with any explicit spec value taking priority."""
    shot = SHOTS.get(spec.get("shot", "auto"), SHOTS["auto"])
    return {**shot, **{k: v for k, v in spec.items() if k in shot}}


# -------------------------------------------------------------------- camera

def setup_camera(spec, focus_point, radius, height, sweep, fov, push):
    """
    Animates a slow arc that eases out and back to exactly where it started, so
    a short clip can be looped to fill a longer scene without a visible snap.
    """
    start = spec.get("start_angle", 0.7)
    bpy.ops.object.camera_add(
        location=(math.sin(start) * radius, -math.cos(start) * radius, height)
    )
    camera = bpy.context.active_object
    bpy.context.scene.camera = camera
    camera.data.lens_unit = "FOV"
    # Pin the FOV to the vertical axis. Under the default AUTO sensor fit,
    # `angle` describes whichever render dimension is larger, so the same value
    # means vertical in portrait and horizontal in landscape -- and the framing
    # calculation silently computes for the wrong axis.
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle_y = fov

    # Depth of field: the reference genre leans on a shallow plane heavily.
    camera.data.dof.use_dof = True
    camera.data.dof.focus_distance = radius
    camera.data.dof.aperture_fstop = spec.get("fstop", 3.2)

    target = bpy.data.objects.new("FocusTarget", None)
    bpy.context.collection.objects.link(target)
    target.location = focus_point
    constraint = camera.constraints.new("TRACK_TO")
    constraint.target = target
    constraint.track_axis = "TRACK_NEGATIVE_Z"
    constraint.up_axis = "UP_Y"

    frames = spec["frames"]
    for frame in range(frames + 1):
        t = frame / frames
        # Offset so the shot opens on a three-quarter view; a head-on start
        # foreshortens the subject's length to nothing.
        angle = spec.get("start_angle", 0.7) + (sweep / 2) * math.sin(2 * math.pi * t)
        distance = radius - push * (0.5 - 0.5 * math.cos(2 * math.pi * t))
        camera.location = (
            focus_point[0] + math.sin(angle) * distance,
            focus_point[1] - math.cos(angle) * distance,
            height,
        )
        camera.keyframe_insert(data_path="location", frame=frame + 1)
        camera.data.dof.focus_distance = distance
        camera.data.dof.keyframe_insert(data_path="focus_distance", frame=frame + 1)

    for fcurve in camera.animation_data.action.fcurves:
        for kp in fcurve.keyframe_points:
            kp.interpolation = "LINEAR"
    return camera


def framing_distance(bounding_radius, fov, aspect_ratio, margin=1.15):
    """
    Distance at which a subject fits the frame.

    In a portrait frame the horizontal field is the binding constraint -- at
    9:16 it is only ~56% of the vertical -- so framing by vertical FOV alone
    crops the subject badly.
    """
    half_vertical = math.tan(fov / 2)
    half_horizontal = half_vertical * aspect_ratio
    return (bounding_radius * margin) / max(1e-3, min(half_vertical, half_horizontal))


# -------------------------------------------------------------------- render

# Resolution scale, samples and source frame rate per tier. Shading and
# lighting cost almost nothing next to these three, which is why the detail
# work above is shared by every tier and only these numbers move.
QUALITY_TIERS = {
    "draft":    {"scale": 0.45, "samples": 24,  "fps": 8},
    "standard": {"scale": 0.62, "samples": 48,  "fps": 8},
    "high":     {"scale": 0.80, "samples": 96,  "fps": 10},
    "max":      {"scale": 1.00, "samples": 160, "fps": 12},
}


def resolve_quality(spec):
    """Applies a named tier, leaving any explicitly-set value untouched."""
    tier = QUALITY_TIERS.get(spec.get("quality", "standard"), QUALITY_TIERS["standard"])
    return {**tier, **{k: v for k, v in spec.items() if k in tier}}


def configure_render(spec):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    # CPU is the only device guaranteed in a headless container with no GPU.
    scene.cycles.device = "CPU"
    scene.cycles.samples = spec.get("samples", 24)

    # Distribution builds of Blender are frequently compiled without
    # OpenImageDenoise, and asking for it then hard-fails the render. Probe for
    # it and fall back to raw sampling rather than dying.
    scene.cycles.use_denoising = False
    if spec.get("denoise", True):
        try:
            scene.cycles.denoiser = "OPENIMAGEDENOISE"
            scene.cycles.use_denoising = True
        except (TypeError, AttributeError):
            print("[build_scene] no denoiser in this build; using raw samples")
    scene.cycles.max_bounces = 4
    scene.cycles.diffuse_bounces = 2
    scene.cycles.glossy_bounces = 2
    scene.cycles.transmission_bounces = 2
    # Caustics are expensive and contribute nothing to these scenes.
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False

    scene.render.resolution_x = spec["width"]
    scene.render.resolution_y = spec["height"]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.film_transparent = False

    # Filmic/AgX lift shadows and desaturate, which washes a dark road out to
    # pale grey. Standard keeps the contrast the palette asks for.
    try:
        scene.view_settings.view_transform = spec.get("view_transform", "Standard")
        scene.view_settings.look = spec.get("look", "None")
    except TypeError:
        scene.view_settings.view_transform = "Standard"
    scene.view_settings.exposure = spec.get("exposure", -0.9)

    # Motion blur costs little here because the camera move is slow, and a
    # perfectly crisp frame on a moving shot is a giveaway that it is synthetic.
    scene.render.use_motion_blur = bool(spec.get("motion_blur", True))
    scene.render.motion_blur_shutter = spec.get("shutter", 0.35)

    scene.frame_start = 1
    scene.frame_end = spec["frames"]
    scene.render.filepath = os.path.join(spec["out_dir"], "frame-")
    scene.render.use_file_extension = True


def seeded_random(seed):
    """Mulberry32, matching the TypeScript side so seeds line up."""
    state = seed & 0xFFFFFFFF

    def next_value():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t = (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t ^= t
        t = (state ^ (state >> 16)) * 0x45D9F3B & 0xFFFFFFFF
        return ((t ^ (t >> 16)) & 0xFFFFFFFF) / 4294967296

    return next_value


# ---------------------------------------------------------------------- main

def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    if not argv:
        raise SystemExit("usage: blender --background --python build_scene.py -- <spec.json>")

    with open(argv[0]) as handle:
        spec = json.load(handle)

    clear_scene()
    palette = spec["palette"]
    rng = seeded_random(spec.get("seed", 1))
    aspect_ratio = spec["width"] / spec["height"]

    if spec.get("sky", True):
        setup_sky(elevation_deg=spec.get("sun_elevation", 48),
                  rotation_deg=spec.get("sun_angle", 38))
    else:
        setup_world(tuple(palette["sky_top"]), tuple(palette["sky_bottom"]))

    setup_three_point(
        key_angle=spec.get("sun_angle", 38),
        key_elevation=spec.get("sun_elevation", 48),
        key_energy=spec.get("sun_energy", 3.0),
    )

    kind = spec["kind"]
    if kind == "vehicle":
        road = build_ground(200, palette["ground"], roughness=0.75)
        road.data.materials.clear()
        road.data.materials.append(make_asphalt_material(tuple(palette["ground"])))
        # Lane markings and a barrier give the shot depth cues.
        # The road runs along X, matching the vehicle's length.
        line_mat = make_material("Line", (0.78, 0.78, 0.76), roughness=0.6)
        for i in range(-14, 15):
            cube((2.6, 0.16, 0.01), (i * 5.2, 3.4, 0.012), line_mat, bevel=0)
            cube((2.6, 0.16, 0.01), (i * 5.2, -3.4, 0.012), line_mat, bevel=0)
        rail_mat = make_material("Rail", (0.5, 0.52, 0.55), roughness=0.35, metallic=0.8)
        for i in range(-12, 13):
            cube((4.0, 0.12, 0.34), (i * 4.4, 6.6, 0.7), rail_mat, bevel=0.03)
            cube((0.14, 0.14, 0.7), (i * 4.4, 6.6, 0.35), rail_mat, bevel=0.02)
        build_vehicle(palette)
        focus = (0, 0, 0.95)
        distance = framing_distance(2.4, spec["fov"], aspect_ratio)
    elif kind == "machine":
        build_ground(120, palette["ground"], roughness=0.8)
        build_machine(palette)
        focus = (0, 0, 1.25)
        distance = framing_distance(2.1, spec["fov"], aspect_ratio)
    else:
        build_landscape(palette, rng)
        focus = (0, -10, 1.5)
        distance = framing_distance(14.0, spec["fov"], aspect_ratio, margin=1.0)

    configure_render(spec)

    shot = shot_for(spec)
    # The set computed a distance that frames the subject; the shot scales it.
    framed = distance * shot["distance"]
    setup_camera(
        {**spec, "start_angle": shot["angle"], "fov": shot["fov"]},
        focus, framed, framed * shot["elevation"],
        shot["sweep"], shot["fov"], framed * shot["push"],
    )

    bpy.ops.render.render(animation=True)
    print(f"[build_scene] rendered {spec['frames']} frames of '{kind}' to {spec['out_dir']}")


if __name__ == "__main__":
    main()
