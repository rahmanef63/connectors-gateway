import { afterEach, describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { createBlenderAdapter } from "./adapter"

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})

type Call = { url: string; body: unknown }

function stubFetch(handler: (url: string) => Response | Promise<Response>): Call[] {
  const calls: Call[] = []
  globalThis.fetch = ((input: unknown, init?: RequestInit) => {
    const raw = init?.body
    calls.push({ url: String(input), body: typeof raw === "string" ? JSON.parse(raw) : undefined })
    return Promise.resolve(handler(String(input)))
  }) as unknown as typeof fetch
  return calls
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

const context = { requestId: "req_test", signal: new AbortController().signal }

describe("createBlenderAdapter", () => {
  test("refuses a non-loopback bridge URL at construction", () => {
    for (const url of ["http://evil.com", "http://192.168.1.5:8787", "http://0.0.0.0:8787"]) {
      let caught: unknown
      try {
        createBlenderAdapter({ bridgeUrl: url })
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(GatewayError)
      expect((caught as GatewayError).code).toBe("NOT_AUTHORIZED")
      expect((caught as GatewayError).message).toBe("Blender bridge must be loopback.")
    }
  })

  test("accepts every loopback spelling", () => {
    for (const url of ["http://127.0.0.1:8787", "http://localhost:8787", "http://[::1]:8787"]) {
      expect(createBlenderAdapter({ bridgeUrl: url }).manifest.id).toBe("blender")
    }
  })
})

describe("detect", () => {
  test("reports available and keeps only declared capabilities", async () => {
    stubFetch(() =>
      jsonResponse({
        status: "ok",
        version: "4.2.1",
        capabilities: ["scene.inspect", "scene.render", "python.execute", 42],
      }),
    )
    const report = await createBlenderAdapter().detect()

    expect(report.connector).toBe("blender")
    expect(report.status).toBe("available")
    expect(report.version).toBe("4.2.1")
    expect(report.adapterVersion).toBe("0.1.0")
    expect(report.capabilities).toEqual(["scene.inspect", "scene.render"])
  })

  test("an unreachable bridge yields status unavailable with no capabilities, never a throw", async () => {
    stubFetch(() => {
      throw new TypeError("connect ECONNREFUSED")
    })
    const report = await createBlenderAdapter().detect()

    expect(report.status).toBe("unavailable")
    expect(report.capabilities).toEqual([])
    expect(report.version).toBeUndefined()
  })

  test("a garbage health body still yields a usable report", async () => {
    stubFetch(() => new Response("not json", { status: 200 }))
    const report = await createBlenderAdapter().detect()
    expect(report.status).toBe("unavailable")
    expect(report.capabilities).toEqual([])
  })
})

describe("execute", () => {
  test("an unknown action id is ACTION_NOT_FOUND", async () => {
    stubFetch(() => jsonResponse({}))
    const adapter = createBlenderAdapter()
    for (const actionId of ["blender.python.execute", "blender.shell.execute", "blender.filesystem.raw", "nope"]) {
      await expect(adapter.execute(actionId, {}, context)).rejects.toMatchObject({ code: "ACTION_NOT_FOUND" })
    }
  })

  test("maps an action to its bridge endpoint and passes the input through", async () => {
    const calls = stubFetch(() => jsonResponse({ sceneName: "Scene", objectCount: 2, objects: [] }))
    const result = await createBlenderAdapter().execute(
      "blender.scene.inspect",
      { includeObjects: true, maxObjects: 10 },
      context,
    )

    expect(calls[0]?.url).toBe("http://127.0.0.1:8787/scene/inspect")
    expect(calls[0]?.body).toEqual({ includeObjects: true, maxObjects: 10 })
    expect(result.output).toEqual({ sceneName: "Scene", objectCount: 2, objects: [] })
  })

  test("scrubs path-shaped fields out of an ordinary response", async () => {
    stubFetch(() =>
      jsonResponse({
        objectCount: 1,
        blendFile: "/home/artist/secret/project.blend",
        objects: [{ name: "Cube", type: "MESH", sourcePath: "/home/artist/x.blend", note: "/home/artist/leak.txt" }],
      }),
    )
    const result = await createBlenderAdapter().execute("blender.object.list", {}, context)
    const text = JSON.stringify(result.output)

    expect(text).not.toContain("/home/artist")
    expect(text).not.toContain("blendFile")
    expect(result.output).toMatchObject({ objectCount: 1 })
  })

  test("render returns file metadata and nothing path-shaped", async () => {
    stubFetch(() =>
      jsonResponse({
        path: "/home/artist/renders/frame_0001.png",
        name: "/home/artist/renders/frame_0001.png",
        mimeType: "image/png",
        sizeBytes: 20_481,
        renderedFrame: 1,
        durationMs: 932,
        outputDirectory: "/home/artist/renders",
      }),
    )
    const result = await createBlenderAdapter().execute(
      "blender.scene.render",
      { resolutionX: 640, resolutionY: 480 },
      context,
    )

    expect(result.output).toEqual({
      file: { name: "frame_0001.png", mimeType: "image/png", sizeBytes: 20_481 },
      renderedFrame: 1,
      durationMs: 932,
    })
    expect(JSON.stringify(result.output)).not.toContain("/home/artist")
  })

  test("export sends a root-relative name and refuses traversal", async () => {
    const calls = stubFetch(() => jsonResponse({ name: "shot.glb", mimeType: "model/gltf-binary", sizeBytes: 12 }))
    const adapter = createBlenderAdapter({ exportRoot: "/var/tmp/cg-exports" })

    const result = await adapter.execute("blender.file.export", { fileName: "renders/shot.glb", format: "GLB" }, context)
    expect(calls[0]?.url).toBe("http://127.0.0.1:8787/file/export")
    expect(calls[0]?.body).toEqual({ fileName: "renders/shot.glb", format: "GLB" })
    expect(result.output).toEqual({
      file: { name: "shot.glb", mimeType: "model/gltf-binary", sizeBytes: 12 },
    })

    await expect(
      adapter.execute("blender.file.export", { fileName: "../../etc/passwd", format: "GLB" }, context),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(
      adapter.execute("blender.file.export", { fileName: "/etc/passwd", format: "GLB" }, context),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
    await expect(
      adapter.execute("blender.file.export", { fileName: "shot.glb", format: "EXE" }, context),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" })
  })

  test("non-object input is refused", async () => {
    stubFetch(() => jsonResponse({}))
    await expect(createBlenderAdapter().execute("blender.object.list", "give me everything", context)).rejects.toMatchObject(
      { code: "INVALID_INPUT" },
    )
  })
})
