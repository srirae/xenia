/**
 * Inline script that applies the saved theme before first paint to avoid a
 * flash of the wrong colour scheme. Runs synchronously in <head>.
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('veil-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`;
  // eslint-disable-next-line react/no-danger
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
