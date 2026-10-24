// Server-safe: imported by the root layout.
export const THEME_STORAGE_KEY = "theme";

/** Inline in <head> so a saved choice applies before first paint. */
export const themeInitScript = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
