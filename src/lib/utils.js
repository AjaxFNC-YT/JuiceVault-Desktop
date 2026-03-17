export function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function truncate(str, length = 30) {
  if (!str) return "";
  return str.length > length ? str.slice(0, length) + "..." : str;
}
