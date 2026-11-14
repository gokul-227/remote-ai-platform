import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import { pushState, pushSupported } from "./push";

const CONFIG = JSON.stringify({ apiKey: "k", projectId: "p", messagingSenderId: "1", appId: "a" });

describe("browser push state", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
    Object.defineProperty(window, "Notification", { value: { permission: "default" }, configurable: true });
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_CONFIG", CONFIG);
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(api.get).mockReset();
  });

  it("is unconfigured without a Firebase web config", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_CONFIG", "");
    expect(await pushState()).toBe("unconfigured");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("is unconfigured when the API has push disabled or is unreachable", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({ data: { enabled: false } } as never);
    expect(await pushState()).toBe("unconfigured");
    vi.mocked(api.get).mockRejectedValueOnce(new Error("down"));
    expect(await pushState()).toBe("unconfigured");
  });

  it("reports denied, off and on from browser permission and the stored token", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { enabled: true } } as never);
    Object.defineProperty(window, "Notification", { value: { permission: "denied" }, configurable: true });
    expect(await pushState()).toBe("denied");
    Object.defineProperty(window, "Notification", { value: { permission: "granted" }, configurable: true });
    expect(await pushState()).toBe("off");
    localStorage.setItem("rap-push-token", "t");
    expect(await pushState()).toBe("on");
  });

  it("is unsupported where the browser lacks push", async () => {
    // @ts-expect-error simulate a browser without the Push API
    delete window.PushManager;
    expect(pushSupported()).toBe(false);
    expect(await pushState()).toBe("unsupported");
  });
});
