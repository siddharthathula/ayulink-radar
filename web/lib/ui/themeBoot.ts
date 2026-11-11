export const SETTINGS_KEY = "ayulink-settings-v1";

/**
 * Inline script for <head>: applies the saved theme before first paint so the
 * page never flashes the wrong theme.
 */
export const THEME_BOOT_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem('${SETTINGS_KEY}')||'{}');var t=s.theme||'system';if(t==='system'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}var r=document.documentElement;r.dataset.theme=t;r.dataset.contrast=s.highContrast?'high':'normal';r.dataset.colors=s.colorSafe?'safe':'default';r.dataset.motion=s.reduceMotion?'reduce':'normal';r.style.colorScheme=t}catch(e){document.documentElement.dataset.theme='light'}})();`;
