/* global localStorage, document */
try {
  const saved = localStorage.getItem("dayflow-theme");
  const t = saved === "light" || saved === "dark" ? saved : "system";
  document.documentElement.dataset.theme = t;
  document.documentElement.style.colorScheme =
    t === "system" ? "light dark" : t;
} catch {
  /* Use system theme when browser storage is unavailable. */
}
