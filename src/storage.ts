export const readCache = () => {
  try {
    return sessionStorage.getItem("dayflow-offline");
  } catch {
    return null;
  }
};
export const writeCache = (data: unknown) => {
  try {
    sessionStorage.setItem("dayflow-offline", JSON.stringify(data));
  } catch {
    /* Storage restrictions must not turn a successful mutation into a failed one. */
  }
};
export const clearCache = () => {
  try {
    sessionStorage.removeItem("dayflow-offline");
  } catch {
    /* Safari may restrict storage. */
  }
};
export const readTheme = () => {
  try {
    const t = localStorage.getItem("dayflow-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
};
