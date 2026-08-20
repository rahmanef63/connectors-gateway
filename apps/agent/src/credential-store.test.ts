import { describe, expect, test } from "bun:test"
import { createNativeCredentialStore } from "./credential-store"

type Call = { command: string; args: readonly string[]; input?: string }

function fakeRun(responses: Array<{ status: number | null; stdout?: string }>) {
  const calls: Call[] = []
  return {
    calls,
    run(command: string, args: readonly string[], input?: string) {
      calls.push(input === undefined ? { command, args } : { command, args, input })
      const next = responses.shift() ?? { status: 0, stdout: "" }
      return { status: next.status, stdout: next.stdout ?? "" }
    },
  }
}

describe("native credential store selection", () => {
  test("headless Linux stays on the owner-only file fallback", () => {
    const fake = fakeRun([])
    expect(createNativeCredentialStore({ platform: "linux", env: {}, run: fake.run })).toBeNull()
    expect(fake.calls).toHaveLength(0)
  })

  test("Linux requires secret-tool and an actual Secret Service session", () => {
    const absent = fakeRun([{ status: null }])
    expect(createNativeCredentialStore({
      platform: "linux",
      env: { DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus" },
      run: absent.run,
    })).toBeNull()

    const present = fakeRun([{ status: 0 }])
    expect(createNativeCredentialStore({
      platform: "linux",
      env: { DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus" },
      run: present.run,
    })?.kind).toBe("linux-secret-service")
  })

  test("Linux writes the credential through stdin, never argv", () => {
    const fake = fakeRun([{ status: 0 }, { status: 0 }])
    const store = createNativeCredentialStore({
      platform: "linux",
      env: { DBUS_SESSION_BUS_ADDRESS: "session" },
      run: fake.run,
    })
    expect(store).not.toBeNull()
    const credential = "cgd_device_secret_value"
    store?.write("dev_1", credential)
    const write = fake.calls.at(-1)
    expect(write?.args.join(" ")).not.toContain(credential)
    expect(write?.input).toBe(`${credential}\n`)
  })

  test("Linux read trims only the command newline and missing entries are null", () => {
    const found = fakeRun([{ status: 0 }, { status: 0, stdout: "cgd_secret\n" }])
    const store = createNativeCredentialStore({ platform: "linux", env: { DBUS_SESSION_BUS_ADDRESS: "session" }, run: found.run })
    expect(store?.read("dev_1")).toBe("cgd_secret")

    const missing = fakeRun([{ status: 0 }, { status: 1 }])
    const empty = createNativeCredentialStore({ platform: "linux", env: { DBUS_SESSION_BUS_ADDRESS: "session" }, run: missing.run })
    expect(empty?.read("dev_1")).toBeNull()
  })

  test("Windows and macOS currently choose the safe file fallback instead of leaking secrets to a CLI argv", () => {
    expect(createNativeCredentialStore({ platform: "win32", run: fakeRun([]).run })).toBeNull()
    const mac = fakeRun([{ status: 0 }])
    expect(createNativeCredentialStore({ platform: "darwin", run: mac.run })).toBeNull()
  })
})
