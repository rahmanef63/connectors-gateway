"""Connectors Gateway bridge — a minimal Blender add-on.

Serves a tiny JSON API on 127.0.0.1 ONLY (AGENTS.md invariant 3, docs/11 "Critical rule").
The bind address is a constant, not a preference: there is no supported way to widen it.
Actions live in handlers.py; this file is transport, threading and registration only.
"""

import json
import os
import queue
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import bpy

from . import handlers

BRIDGE_VERSION = "0.1.0"
# Hard-coded on purpose. Never 0.0.0.0, never a preference.
HOST = "127.0.0.1"
DEFAULT_PORT = 8787
MAX_BODY_BYTES = 64 * 1024
MAIN_THREAD_TIMEOUT_S = 300.0
TIMER_INTERVAL_S = 0.05
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")

_JOBS = queue.Queue()
_server = None
_thread = None


def _pump():
    """Timer on Blender's main thread: bpy must never be touched from a socket thread."""
    while True:
        try:
            call, box, done = _JOBS.get_nowait()
        except queue.Empty:
            break
        try:
            box["value"] = call()
        except BaseException as exc:  # noqa: BLE001 - returned to the caller as a structured error
            box["error"] = exc
        done.set()
    return TIMER_INTERVAL_S


def _run_on_main(call):
    box, done = {}, threading.Event()
    _JOBS.put((call, box, done))
    if not done.wait(MAIN_THREAD_TIMEOUT_S):
        raise TimeoutError("blender did not respond")
    if "error" in box:
        raise box["error"]
    return box["value"]


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "ConnectorsBridge/" + BRIDGE_VERSION

    def log_message(self, fmt, *args):
        return  # request lines can contain file names; keep them out of the console

    def _authorized(self):
        """Second lock after the loopback bind: refuse anything not addressed to loopback."""
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
        if host in LOOPBACK_HOSTS:
            return True
        self._send(403, {"error": "loopback only"})
        return False

    def _send(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length < 0 or length > MAX_BODY_BYTES:
            raise ValueError("body too large")
        payload = json.loads(self.rfile.read(length) or b"{}")
        if not isinstance(payload, dict):
            raise ValueError("body must be a JSON object")
        return payload

    def do_GET(self):  # noqa: N802 - http.server API
        if not self._authorized():
            return
        if self.path.split("?")[0] != "/health":
            self._send(404, {"error": "unknown endpoint"})
            return
        self._send(200, {
            "status": "ok",
            "version": bpy.app.version_string,
            "bridgeVersion": BRIDGE_VERSION,
            "capabilities": handlers.CAPABILITIES,
        })

    def do_POST(self):  # noqa: N802 - http.server API
        if not self._authorized():
            return
        handler = handlers.ROUTES.get(self.path.split("?")[0])
        if handler is None:
            self._send(404, {"error": "unknown endpoint"})
            return
        try:
            payload = self._read_json()
        except (ValueError, json.JSONDecodeError):
            self._send(400, {"error": "invalid request body"})
            return
        try:
            self._send(200, _run_on_main(lambda: handler(payload)))
        except (ValueError, KeyError) as exc:
            # Only messages raised by handlers.py are echoed; they never contain a path.
            self._send(400, {"error": str(exc)})
        except TimeoutError:
            self._send(504, {"error": "blender did not respond"})
        except BaseException:  # noqa: BLE001 - a Blender error can embed local paths
            self._send(500, {"error": "blender could not complete the action"})


class ConnectorsBridgePreferences(bpy.types.AddonPreferences):
    bl_idname = __name__

    port: bpy.props.IntProperty(
        name="Loopback port", default=DEFAULT_PORT, min=1024, max=65535,
        description="Port on 127.0.0.1 the local agent connects to",
    )

    def draw(self, context):
        self.layout.prop(self, "port")
        self.layout.label(text="Bound to 127.0.0.1 only - never reachable from the network.")


def _port():
    """The env var is untrusted input, so it is range-checked before it is believed."""
    raw = os.environ.get("CG_BLENDER_BRIDGE_PORT", "")
    if raw.isdigit() and 1024 <= int(raw) <= 65535:
        return int(raw)
    entry = bpy.context.preferences.addons.get(__name__)
    if entry is not None and hasattr(entry.preferences, "port"):
        return int(entry.preferences.port)
    return DEFAULT_PORT


def register():
    global _server, _thread
    bpy.utils.register_class(ConnectorsBridgePreferences)
    if not bpy.app.timers.is_registered(_pump):
        bpy.app.timers.register(_pump, persistent=True)
    _server = ThreadingHTTPServer((HOST, _port()), _Handler)
    _server.daemon_threads = True
    _thread = threading.Thread(target=_server.serve_forever, name="connectors-bridge", daemon=True)
    _thread.start()


def unregister():
    global _server, _thread
    if _server is not None:
        _server.shutdown()
        _server.server_close()
        _server = None
    _thread = None
    if bpy.app.timers.is_registered(_pump):
        bpy.app.timers.unregister(_pump)
    bpy.utils.unregister_class(ConnectorsBridgePreferences)
