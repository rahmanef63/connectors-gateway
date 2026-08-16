"""Package shim so this folder can be dropped straight into Blender's `scripts/addons/`.

Blender reads `bl_info` from the module it loads — this one. The real add-on (server,
routes, registration) lives in `connectors_bridge.py`.
"""

bl_info = {
    "name": "Connectors Gateway Bridge",
    "author": "connectors-gateway",
    "version": (0, 1, 0),
    "blender": (4, 0, 0),
    "location": "Edit > Preferences > Add-ons",
    "description": "Loopback-only JSON bridge for the Connectors Gateway local agent.",
    "warning": "Serves on 127.0.0.1 only. Never expose this port.",
    "category": "System",
}

from .connectors_bridge import register, unregister  # noqa: E402,F401
