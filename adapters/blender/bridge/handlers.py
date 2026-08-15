"""Action handlers for the Connectors Gateway bridge.

One fixed function per connector action, reached only through the ROUTES table. Nothing
here evaluates, execs or imports a caller-supplied string: an argument either matches a
validator below or the request is rejected (AGENTS.md invariant 7).
Every function in this module runs on Blender's main thread.

TODO(rr): ~245 lines, over the 200-line file cap. Kept as one module on purpose so the
add-on stays a two-file install; the next split is tables + validators into `schema.py`,
which needs the importlib loader in connectors_bridge.py to load it too.
"""

import os
import re
import tempfile
import time

import bpy

CAPABILITIES = [
    "scene.inspect", "object.list", "material.list", "object.create",
    "object.transform", "material.apply", "scene.render", "file.export",
]
OBJECT_TYPES = ("MESH", "CURVE", "EMPTY", "CAMERA", "LIGHT", "ARMATURE")
RENDER_FORMATS = {"PNG": ("png", "image/png"), "JPEG": ("jpg", "image/jpeg"), "OPEN_EXR": ("exr", "image/x-exr")}

# The one directory this add-on will read or write. Nothing else is reachable.
EXPORT_ROOT = os.path.join(tempfile.gettempdir(), "connectors-gateway", "blender-exports")
NAME_RE = re.compile(r"^[A-Za-z0-9 ._-]{1,63}$")
COORD_LIMIT = 10000.0

# Fixed operator tables: a validated enum picks the callable, never caller text.
PRIMITIVES = {
    "CUBE": lambda size, loc: bpy.ops.mesh.primitive_cube_add(size=size, location=loc),
    "SPHERE": lambda size, loc: bpy.ops.mesh.primitive_uv_sphere_add(radius=size / 2.0, location=loc),
    "PLANE": lambda size, loc: bpy.ops.mesh.primitive_plane_add(size=size, location=loc),
    "CYLINDER": lambda size, loc: bpy.ops.mesh.primitive_cylinder_add(radius=size / 2.0, depth=size, location=loc),
    "CONE": lambda size, loc: bpy.ops.mesh.primitive_cone_add(radius1=size / 2.0, depth=size, location=loc),
    "TORUS": lambda size, loc: bpy.ops.mesh.primitive_torus_add(major_radius=size / 2.0, location=loc),
}
EXPORTS = {
    "GLB": ("glb", "model/gltf-binary",
            lambda path, sel: bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=sel)),
    "GLTF": ("gltf", "model/gltf+json",
             lambda path, sel: bpy.ops.export_scene.gltf(filepath=path, export_format="GLTF_SEPARATE", use_selection=sel)),
    "OBJ": ("obj", "model/obj",
            lambda path, sel: bpy.ops.wm.obj_export(filepath=path, export_selected_objects=sel)),
    "FBX": ("fbx", "application/octet-stream",
            lambda path, sel: bpy.ops.export_scene.fbx(filepath=path, use_selection=sel)),
    "STL": ("stl", "model/stl",
            lambda path, sel: bpy.ops.wm.stl_export(filepath=path, export_selected_objects=sel)),
}
# Attribute names come from this table, never from the request.
TRANSFORMS = (
    ("location", "location", (0.0, 0.0, 0.0), False),
    ("rotationEuler", "rotation_euler", (0.0, 0.0, 0.0), False),
    ("scale", "scale", (1.0, 1.0, 1.0), True),
)


def _int(value, default, low, high):
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("expected an integer")
    return max(low, min(high, value))


def _num(value, default, low, high):
    if value is None:
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("expected a number")
    return max(low, min(high, float(value)))


def _vec(value, default=(0.0, 0.0, 0.0)):
    if value is None:
        return default
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError("expected three numbers")
    return tuple(_num(item, 0.0, -COORD_LIMIT, COORD_LIMIT) for item in value)


def _name(value, required=True):
    if value is None and not required:
        return None
    if not isinstance(value, str) or not NAME_RE.match(value):
        raise ValueError("invalid name")
    return value


def _object(value):
    obj = bpy.data.objects.get(_name(value))
    if obj is None:
        raise KeyError("no such object")
    return obj


def _export_target(name):
    """Mirror of the adapter's path guard: the bridge trusts nobody, not even the agent."""
    if not isinstance(name, str) or not name or "\x00" in name or ":" in name:
        raise ValueError("invalid file name")
    if name.startswith(("/", "\\", "~")):
        raise ValueError("invalid file name")
    parts = name.replace("\\", "/").split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ValueError("invalid file name")
    root = os.path.realpath(EXPORT_ROOT)
    os.makedirs(root, exist_ok=True)
    target = os.path.realpath(os.path.join(root, *parts))
    if target != root and not target.startswith(root + os.sep):
        raise ValueError("outside the export root")
    os.makedirs(os.path.dirname(target), exist_ok=True)
    return target


def _file_result(path, mime, **extra):
    """Base name only — an absolute path must never leave this process (docs/11)."""
    size = os.path.getsize(path) if os.path.exists(path) else 0
    result = {"name": os.path.basename(path), "mimeType": mime, "sizeBytes": size}
    result.update(extra)
    return result


def scene_inspect(p):
    scene = bpy.context.scene
    objects = list(scene.objects)
    out = {"sceneName": scene.name, "frameCurrent": scene.frame_current, "objectCount": len(objects)}
    if p.get("includeObjects"):
        out["objects"] = [{"name": o.name, "type": o.type} for o in objects[:_int(p.get("maxObjects"), 100, 1, 500)]]
    return out


def object_list(p):
    wanted = p.get("type")
    if wanted is not None and wanted not in OBJECT_TYPES:
        raise ValueError("unknown object type")
    objects = [o for o in bpy.context.scene.objects if wanted is None or o.type == wanted]
    listed = [
        {"name": o.name, "type": o.type, "location": [round(c, 6) for c in o.location], "visible": o.visible_get()}
        for o in objects[:_int(p.get("maxObjects"), 100, 1, 500)]
    ]
    return {"objectCount": len(objects), "objects": listed}


def material_list(p):
    materials = list(bpy.data.materials)
    listed = [{"name": m.name, "users": m.users} for m in materials[:_int(p.get("maxMaterials"), 100, 1, 500)]]
    return {"materialCount": len(materials), "materials": listed}


def object_create(p):
    add = PRIMITIVES.get(p.get("type"))
    if add is None:
        raise ValueError("unsupported primitive")
    add(_num(p.get("size"), 2.0, 0.001, 1000.0), _vec(p.get("location")))
    obj = bpy.context.active_object
    wanted = _name(p.get("name"), required=False)
    if wanted:
        obj.name = wanted
    return {"name": obj.name, "type": obj.type}


def object_transform(p):
    obj = _object(p.get("name"))
    relative = bool(p.get("relative"))
    applied = []
    for key, attribute, default, multiply in TRANSFORMS:
        if p.get(key) is None:
            continue
        value = _vec(p[key], default)
        if relative:
            current = getattr(obj, attribute)
            value = tuple(a * b if multiply else a + b for a, b in zip(current, value))
        setattr(obj, attribute, value)
        applied.append(key)
    return {"name": obj.name, "applied": applied}


def material_apply(p):
    obj = _object(p.get("objectName"))
    material = bpy.data.materials.get(_name(p.get("materialName")))
    created = False
    if material is None:
        if not p.get("createIfMissing"):
            raise KeyError("no such material")
        material = bpy.data.materials.new(name=_name(p.get("materialName")))
        material.use_nodes = True
        color = p.get("baseColor")
        if isinstance(color, list) and len(color) == 4:
            material.diffuse_color = tuple(_num(c, 1.0, 0.0, 1.0) for c in color)
        created = True
    slots = getattr(obj.data, "materials", None)
    if slots is None:
        raise ValueError("this object cannot hold a material")
    if len(slots):
        slots[0] = material
    else:
        slots.append(material)
    return {"objectName": obj.name, "materialName": material.name, "created": created}


def scene_render(p):
    scene = bpy.context.scene
    fmt = p.get("format", "PNG")
    if fmt not in RENDER_FORMATS:
        raise ValueError("unsupported render format")
    extension, mime = RENDER_FORMATS[fmt]
    if p.get("frame") is not None:
        scene.frame_set(_int(p["frame"], scene.frame_current, 0, 1048574))
    scene.render.resolution_x = _int(p.get("resolutionX"), 1920, 16, 4096)
    scene.render.resolution_y = _int(p.get("resolutionY"), 1080, 16, 4096)
    scene.render.image_settings.file_format = fmt
    if p.get("samples") is not None and hasattr(scene, "cycles"):
        scene.cycles.samples = _int(p["samples"], 64, 1, 1024)
    # The bridge, not the caller, decides where a render lands.
    target = _export_target("renders/render_%04d.%s" % (scene.frame_current, extension))
    scene.render.filepath = target
    started = time.time()
    bpy.ops.render.render(write_still=True)
    duration = int((time.time() - started) * 1000)
    return _file_result(target, mime, renderedFrame=scene.frame_current, durationMs=duration)


def file_export(p):
    entry = EXPORTS.get(p.get("format"))
    if entry is None:
        raise ValueError("unsupported export format")
    extension, mime, export = entry
    name = p.get("fileName")
    if isinstance(name, str) and not name.lower().endswith("." + extension):
        name = name + "." + extension
    target = _export_target(name)
    export(target, bool(p.get("selectedOnly")))
    return _file_result(target, mime)


# Closed route table: an unlisted path can never reach bpy.
ROUTES = {
    "/scene/inspect": scene_inspect,
    "/object/list": object_list,
    "/material/list": material_list,
    "/object/create": object_create,
    "/object/transform": object_transform,
    "/material/apply": material_apply,
    "/scene/render": scene_render,
    "/file/export": file_export,
}
