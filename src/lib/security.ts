// betesim — security layer (multi-layer anti-piracy protection)

const _0x = (s: string) => s.split('').reverse().join('');
const _noop = () => {};

function _honeypot() {
  // Fake API key to detect copy-paste scrapers — runs silently in background
  const _fakeKey = _0x('YEK_EKAT_EMISETEB_0000000000000000000000000000000');
  Object.defineProperty(window, '__betesim_debug_key__', {
    get() {
      // Silent detection — log internally, never lock the UI
      console.warn('[betesim] suspicious probe detected');
      return _fakeKey;
    },
    configurable: false,
  });
}

function _blockActions() {
  // Block right-click
  document.addEventListener('contextmenu', (e) => e.preventDefault(), true);

  // Block all DevTools shortcuts
  document.addEventListener('keydown', (e) => {
    const k = e.key;
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;

    if (k === 'F12') { e.preventDefault(); e.stopPropagation(); return; }
    if (ctrl && shift && ['I', 'J', 'C', 'K'].includes(k)) { e.preventDefault(); return; }
    if (ctrl && ['u', 'U', 's', 'S', 'a', 'A', 'p', 'P'].includes(k)) { e.preventDefault(); return; }
    if (k === 'F5' && shift) { e.preventDefault(); return; }
  }, true);

  // Disable text selection
  document.addEventListener('selectstart', (e) => e.preventDefault(), true);
  document.addEventListener('dragstart', (e) => e.preventDefault(), true);

  // Block copy/cut
  document.addEventListener('copy', (e) => { e.preventDefault(); }, true);
  document.addEventListener('cut', (e) => { e.preventDefault(); }, true);
}

function _watchDevTools() {
  let _hits = 0;
  let _lastCheck = Date.now();

  const _check = () => {
    // Throttle — only check every 2s
    if (Date.now() - _lastCheck < 2000) return;
    _lastCheck = Date.now();

    // Size-based detection (most reliable)
    const wDiff = window.outerWidth - window.innerWidth;
    const hDiff = window.outerHeight - window.innerHeight;
    if (wDiff > 160 || hDiff > 160) {
      _hits++;
    } else {
      _hits = Math.max(0, _hits - 1);
    }

    // Silent background detection — never blanks the page
    if (_hits >= 3) {
      console.warn('[betesim] DevTools activity detected');
      _hits = 0;
    }
  };

  setInterval(_check, 1500);

  // Also check on resize
  window.addEventListener('resize', _check);
}

function _consoleWarning() {
  const _stop = '%c⛔ STOP — betesim';
  const _msg  = '%cSi quelqu\'un vous a demandé de copier-coller quelque chose ici, c\'est une arnaque ! Fermez cette fenêtre immédiatement.';
  const _sys  = '%c© betesim — Système protégé. Toute ingénierie inverse est interdite.';
  console.clear();
  console.log(_stop, 'color:#ef4444;font-size:36px;font-weight:900;text-shadow:0 0 10px red');
  console.log(_msg,  'color:#f97316;font-size:15px;font-weight:600');
  console.log(_sys,  'color:#6366f1;font-size:12px');
  // Flood console to bury any leaked info
  for (let i = 0; i < 10; i++) console.log('%c ', 'font-size:1px');
}

export function initSecurityLayer() {
  _blockActions();
  _honeypot();
  _consoleWarning();
  _watchDevTools();

  // Re-warn every 5s in case console is opened
  setInterval(_consoleWarning, 5000);
}
