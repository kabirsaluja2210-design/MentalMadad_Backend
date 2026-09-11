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
            centre = poly.center
            poly.material_index = face_material(centre.x, centre.y, centre.z)

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
    body_mat = make_panelled_material(
        "Body", palette["primary"], panel_positions=(-1.02, 0.22, 1.30, -1.74),
    )
    glass_mat = make_material("Glass", (0.03, 0.04, 0.055), roughness=0.05, metallic=0.25)
    tyre_mat = make_material("Tyre", (0.028, 0.028, 0.032), roughness=0.9)
    rim_mat = make_material("Rim", (0.6, 0.62, 0.65), roughness=0.2, metallic=0.95)
    lamp_mat = make_material("Lamp", (0.95, 0.93, 0.84), roughness=0.08)
    trim_mat = make_material("Trim", (0.055, 0.055, 0.065), roughness=0.55)

    # (x, half width, deck height, roof height). Roof equals deck wherever
    # there is no cabin, which flattens the section into a bonnet or boot.
    # The end stations taper gently: a hard drop at the last station lofts into
    # a flat wedge that reads as a snowplough rather than a nose.
    stations = [
        (-2.34, 0.80, 0.70, 0.70),
        (-2.18, 0.90, 0.84, 0.84),
        (-1.70, 0.95, 0.90, 0.90),
        (-1.20, 0.96, 0.93, 1.44),
        (-0.60, 0.97, 0.94, 1.66),
        (0.16, 0.97, 0.94, 1.68),
        (0.76, 0.96, 0.93, 1.48),
        (1.30, 0.95, 0.90, 0.90),
        (1.94, 0.92, 0.86, 0.86),
        (2.28, 0.84, 0.78, 0.78),
        (2.42, 0.74, 0.68, 0.68),
    ]

    def face_material(x, y, z):
        """Slot 1 is glass: the greenhouse sides and the two screens."""
        if z < 1.02:
            return 0
        in_cabin = -1.24 < x < 0.82
        # Flanks of the cabin, plus the raked screens at either end.
        if in_cabin and abs(y) > 0.55:
            return 1
        if in_cabin and z < 1.55 and (x < -1.02 or x > 0.6):
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
        objects.append(cube((0.22, 1.78, 0.24), (sx * 2.24, 0, 0.58), trim_mat, bevel=0.06))
        for sy in (0.54, -0.54):
            objects.append(cube((0.1, 0.44, 0.16), (sx * 2.3, sy, 0.82), lamp_mat, bevel=0.03))

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

    scene.view_settings.view_transform = spec.get("view_transform", "Filmic")
    scene.view_settings.look = spec.get("look", "Medium Contrast")

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

    setup_world(tuple(palette["sky_top"]), tuple(palette["sky_bottom"]))
    setup_sun(spec.get("sun_angle", 38), spec.get("sun_elevation", 48), spec.get("sun_energy", 3.0))

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
        height = distance * 0.3
    elif kind == "machine":
        build_ground(120, palette["ground"], roughness=0.8)
        build_machine(palette)
        focus = (0, 0, 1.25)
        distance = framing_distance(2.1, spec["fov"], aspect_ratio)
        height = distance * 0.42
    else:
        build_landscape(palette, rng)
        focus = (0, -10, 1.5)
        distance = framing_distance(14.0, spec["fov"], aspect_ratio, margin=1.0)
        height = distance * 0.35

    configure_render(spec)
    setup_camera(
        spec, focus, distance, height,
        spec.get("sweep", 0.55), spec["fov"], distance * spec.get("push", 0.14),
    )

    bpy.ops.render.render(animation=True)
    print(f"[build_scene] rendered {spec['frames']} frames of '{kind}' to {spec['out_dir']}")


if __name__ == "__main__":
    main()
