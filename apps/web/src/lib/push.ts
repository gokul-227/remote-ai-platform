import api from "@/lib/api";

/*
 * Browser push. The Firebase SDK is used only to obtain this browser's
 * messaging token; the notifications themselves are shown by /push-sw.js.
 * Public Firebase web config comes from NEXT_PUBLIC_FIREBASE_CONFIG (JSON);
 * the VAPID key and on/off state come from the API, so nothing is enabled
 * unless the backend is configured too.
 */

export type PushState = "unsupported" | "unconfigured" | "denied" | "off" | "on";

const TOKEN_KEY = "rap-push-token";

function firebaseConfig(): Record<string, string> | null {
  const raw = process.env.NEXT_PUBLIC_FIREBASE_CONFIG;
  if (!raw) return null;
  try {
    const cfg = JSON.parse(raw);
    return cfg && cfg.apiKey && cfg.projectId && cfg.messagingSenderId && cfg.appId ? cfg : null;
  } catch {
    return null;
  }
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  );
}

const storedToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (!firebaseConfig()) return "unconfigured";
  const cfg = await api
    .get<{ enabled: boolean }>("/notifications/push/config")
    .then((r) => r.data)
    .catch(() => null);
  if (!cfg?.enabled) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && storedToken() ? "on" : "off";
}

/** Ask permission, register the worker, get the FCM token and send it to the API. */
export async function enablePush(): Promise<PushState> {
  const cfg = firebaseConfig();
  if (!pushSupported() || !cfg) return "unsupported";
  const server = (await api.get<{ enabled: boolean; vapid_key: string | null }>("/notifications/push/config")).data;
  if (!server.enabled || !server.vapid_key) return "unconfigured";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
  const { initializeApp, getApps } = await import("firebase/app");
  const { getMessaging, getToken } = await import("firebase/messaging");
  const app = getApps()[0] ?? initializeApp(cfg);
  const token = await getToken(getMessaging(app), {
    vapidKey: server.vapid_key,
    serviceWorkerRegistration: registration,
  });
  if (!token) return "off";
  await api.post("/notifications/push/subscriptions", { token, platform: "web" });
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage blocked: the API still has the token */
  }
  return "on";
}

/** Stop push on this browser (the API revokes the token; permission stays with the browser). */
export async function disablePush(): Promise<PushState> {
  const token = storedToken();
  if (token) {
    await api.delete("/notifications/push/subscriptions", { data: { token, platform: "web" } }).catch(() => undefined);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }
  if (firebaseConfig()) {
    try {
      const { getApps } = await import("firebase/app");
      const { getMessaging, deleteToken } = await import("firebase/messaging");
      const app = getApps()[0];
      if (app) await deleteToken(getMessaging(app));
    } catch {
      /* the API revocation is what matters */
    }
  }
  return "off";
}
