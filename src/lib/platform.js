const USER_AGENT =
  typeof navigator !== "undefined" ? navigator.userAgent || "" : "";

export const IS_TAURI = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
export const IS_MACOS = /Macintosh|Mac OS X|MacIntel/i.test(USER_AGENT);
export const IS_WINDOWS = /Windows/i.test(USER_AGENT);
export const API_ORIGIN = "https://api.juicevault.xyz";

export function isLocalDevOrigin() {
  if (typeof window === "undefined") return false;
  return /^http:\/\/(localhost|127\.0\.0\.1):1420$/i.test(window.location.origin);
}

export function getApiOrigin() {
  return isLocalDevOrigin() ? "/proxy-api" : API_ORIGIN;
}

export function toApiUrl(path = "") {
  if (!path) return "";
  if (/^(https?:|asset:|data:|blob:)/i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiOrigin()}${normalizedPath}`;
}

export function getDefaultTitlebarStyle() {
  return IS_MACOS ? "macos" : "windows";
}

export function getTitlebarStyle() {
  if (typeof window === "undefined") return getDefaultTitlebarStyle();
  return localStorage.getItem("titlebarStyle") || getDefaultTitlebarStyle();
}

export function setTitlebarStyle(style) {
  if (typeof window === "undefined") return;
  localStorage.setItem("titlebarStyle", style);
  window.dispatchEvent(new Event("titlebar-style-sync"));
}
