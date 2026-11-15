import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));
import api from "@/lib/api";
import { disablePush, enablePush, pushState, pushSupported, vapidKeyBytes } from "./push";

describe("browser push state", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "serviceWorker", { value: {}, configurable: true });
    Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
    Object.defineProperty(window, "Notification", { value: { permission: "default" }, configurable: true });
    localStorage.clear();
  });
  afterEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
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
    localStorage.setItem("rap-push-endpoint", "https://push.example/x");
    expect(await pushState()).toBe("on");
  });

  it("is unsupported where the browser lacks push", async () => {
    // @ts-expect-error simulate a browser without the Push API
    delete window.PushManager;
    expect(pushSupported()).toBe(false);
    expect(await pushState()).toBe("unsupported");
  });

  it("decodes base64url VAPID keys", () => {
    expect(Array.from(vapidKeyBytes("AQID_-8"))).toEqual([1, 2, 3, 255, 239]);
  });

  it("subscribes with the VAPID key and registers the subscription", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { enabled: true, vapid_key: "AQID" } } as never);
    vi.mocked(api.post).mockResolvedValue({ data: null } as never);
    const subscribe = vi.fn().mockResolvedValue({
      toJSON: () => ({ endpoint: "https://push.example/abc", keys: { p256dh: "pk", auth: "au" } }),
    });
    const registration = { pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe } };
    Object.defineProperty(navigator, "serviceWorker", {
      value: { register: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(registration) },
      configurable: true,
    });
    Object.defineProperty(window, "Notification", {
      value: { permission: "default", requestPermission: vi.fn().mockResolvedValue("granted") },
      configurable: true,
    });
    expect(await enablePush()).toBe("on");
    expect(Array.from(subscribe.mock.calls[0][0].applicationServerKey)).toEqual([1, 2, 3]);
    expect(api.post).toHaveBeenCalledWith("/notifications/push/subscriptions", {
      endpoint: "https://push.example/abc",
      keys: { p256dh: "pk", auth: "au" },
      platform: "web",
    });
    expect(localStorage.getItem("rap-push-endpoint")).toBe("https://push.example/abc");
  });

  it("unsubscribes and revokes on disable", async () => {
    vi.mocked(api.delete).mockResolvedValue({ data: null } as never);
    const unsubscribe = vi.fn().mockResolvedValue(true);
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({ endpoint: "https://push.example/z", unsubscribe }),
          },
        }),
      },
      configurable: true,
    });
    expect(await disablePush()).toBe("off");
    expect(unsubscribe).toHaveBeenCalled();
    expect(api.delete).toHaveBeenCalledWith("/notifications/push/subscriptions", {
      data: { endpoint: "https://push.example/z", platform: "web" },
    });
  });
});
