import { api } from "@/lib/api";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getExistingSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function enablePush() {
  if (!pushSupported()) throw new Error("Push notifications are not supported on this device/browser.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was denied.");

  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
  await navigator.serviceWorker.ready;

  const { data } = await api.get("/push/public-key");
  if (!data.publicKey) throw new Error("Push is not configured on the server.");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });
  }
  const json = sub.toJSON();
  await api.post("/push/subscribe", { endpoint: json.endpoint, keys: json.keys });
  return true;
}

export async function disablePush() {
  const sub = await getExistingSubscription();
  if (sub) {
    const endpoint = sub.endpoint;
    try {
      await sub.unsubscribe();
    } catch (e) {
      /* ignore */
    }
    await api.post("/push/unsubscribe", { endpoint });
  }
  return true;
}
