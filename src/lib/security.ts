// Anti-inspection & anti-debugging protection
export function initSecurityLayer() {
  // Security active in all environments

  // Block right-click context menu
  document.addEventListener("contextmenu", (e) => e.preventDefault());

  // Block DevTools shortcuts
  document.addEventListener("keydown", (e) => {
    // F12
    if (e.key === "F12") e.preventDefault();
    // Ctrl+Shift+I / Cmd+Option+I
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "I") e.preventDefault();
    // Ctrl+Shift+J / Cmd+Option+J
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "J") e.preventDefault();
    // Ctrl+Shift+C
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "C") e.preventDefault();
    // Ctrl+U (view source)
    if ((e.ctrlKey || e.metaKey) && e.key === "u") e.preventDefault();
    // Ctrl+S (save page)
    if ((e.ctrlKey || e.metaKey) && e.key === "s") e.preventDefault();
  });

  // Anti-debugging: detect DevTools via debugger timing
  let _dc = 0;
  const _t = setInterval(() => {
    const _s = performance.now();
    // deno-lint-ignore no-debugger
    debugger;
    if (performance.now() - _s > 100) {
      _dc++;
      if (_dc > 2) {
        document.body.innerHTML = "";
        clearInterval(_t);
      }
    }
  }, 3000);

  // Disable text selection & drag
  document.addEventListener("selectstart", (e) => e.preventDefault());
  document.addEventListener("dragstart", (e) => e.preventDefault());

  // Console warning
  const _w = "%c⛔ STOP!";
  const _m = "%cCette zone est réservée aux développeurs. Toute tentative d'accès non autorisé est interdite.";
  console.log(_w, "color:red;font-size:40px;font-weight:bold");
  console.log(_m, "color:red;font-size:16px");
}
