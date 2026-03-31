const USER_AGENT =
  typeof navigator !== "undefined" ? navigator.userAgent || "" : "";

export const IS_TAURI = typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
export const IS_MACOS = /Macintosh|Mac OS X|MacIntel/i.test(USER_AGENT);
export const IS_WINDOWS = /Windows/i.test(USER_AGENT);

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
