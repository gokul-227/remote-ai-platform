import api from "@/lib/api";

/*
 * Browser push over the standard Web Push protocol (no Firebase, no SDK).
 * The browser's own PushManager subscribes with the API's VAPID public key;
 * the subscription (endpoint + keys) is sent to the API, which encrypts and
 * signs each message. Notifications are shown by /push-sw.js. Nothing is
 * enabled unless the backend has VAPID keys configured.
 */

export type PushState = "unsupported" | "unconfigured" | "denied" | "off" | "on";

const ENDPOINT_KEY = "rap-push-endpoint";

type ServerConfig = { enabled: boolean; vapid_key: string | null };

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

/** base64url VAPID public key -> bytes for PushManager.subscribe. */
export function vapidKeyBytes(key: string): Uint8Array<ArrayBuffer> {
  const padded = (key + "=".repeat((4 - (key.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const storedEndpoint = () => {
  try {
    return localStorage.getItem(ENDPOINT_KEY);
  } catch {
    return null;
  }
};

async function serverConfig(): Promise<ServerConfig | null> {
  return api
    .get<ServerConfig>("/notifications/push/config")
    .then((r) => r.data)
    .catch(() => null);
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const cfg = await serverConfig();
  if (!cfg?.enabled) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && storedEndpoint() ? "on" : "off";
}

/** Ask permission, register the worker, subscribe with the VAPID key and send the subscription to the API. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const server = await serverConfig();
  if (!server?.enabled || !server.vapid_key) return "unconfigured";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKeyBytes(server.vapid_key),
    }));
  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return "off";
  await api.post("/notifications/push/subscriptions", {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    platform: "web",
  });
  try {
    localStorage.setItem(ENDPOINT_KEY, json.endpoint);
  } catch {
    /* storage blocked: the API still has the subscription */
  }
  return "on";
}

/** Stop push on this browser (unsubscribe locally and revoke on the API). */
export async function disablePush(): Promise<PushState> {
  let endpoint = storedEndpoint();
  if (pushSupported()) {
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        endpoint = endpoint ?? subscription.endpoint;
        await subscription.unsubscribe();
      }
    } catch {
      /* the API revocation is what matters */
    }
  }
  if (endpoint) {
    await api
      .delete("/notifications/push/subscriptions", { data: { endpoint, platform: "web" } })
      .catch(() => undefined);
  }
  try {
    localStorage.removeItem(ENDPOINT_KEY);
  } catch {
    /* ignore */
  }
  return "off";
}
