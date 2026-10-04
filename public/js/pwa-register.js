let deferredPrompt;
let installButton;

function setupInstallButton() {
  installButton = document.getElementById('pwaInstallButton');
  if (!installButton) return;
  installButton.addEventListener('click', promptPWAInstall);
  updateInstallButton();
}

function promptPWAInstall() {
  if (!deferredPrompt) return;

  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    console.log('User choice:', choiceResult.outcome);
    deferredPrompt = null;
    updateInstallButton();
  });
}

function updateInstallButton() {
  if (!installButton) {
    installButton = document.getElementById('pwaInstallButton');
  }
  if (!installButton) return;

  if (deferredPrompt) {
    installButton.classList.remove('hidden');
  } else {
    installButton.classList.add('hidden');
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  console.log('PWA install prompt saved');
  updateInstallButton();
});

window.addEventListener('appinstalled', () => {
  console.log('PWA was installed');
});

window.addEventListener('DOMContentLoaded', setupInstallButton);

window.addEventListener('load', () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => console.log('Service Worker registered with scope:', registration.scope))
      .catch(err => console.warn('Service Worker registration failed:', err));
  } else {
    console.log('Service Worker not supported in this browser.');
  }
});

window.promptPWAInstall = promptPWAInstall;

// Municipality dropdowns: when "Others" is picked, swap name="city"
// onto a free-text field so typos are impossible for listed towns
document.addEventListener("change", function (e) {
  var sel = e.target && e.target.closest ? e.target.closest("select[data-city-select]") : null;
  if (!sel) return;
  var wrap = sel.closest("[data-city-wrap]");
  var other = wrap ? wrap.querySelector("input[data-city-other]") : null;
  if (!other) return;
  var isOther = sel.value === "__other";
  other.classList.toggle("hidden", !isOther);
  other.required = isOther;
  if (isOther) {
    sel.removeAttribute("name");
    other.setAttribute("name", "city");
    other.focus();
  } else {
    sel.setAttribute("name", "city");
    other.removeAttribute("name");
  }
});

// CSRF: read the per-session token rendered into <meta name="csrf-token">
window.csrfToken = function () {
  var meta = document.querySelector('meta[name="csrf-token"]');
  return meta ? meta.content : "";
};

// Automatically attach the CSRF token to same-origin mutating fetch calls
// (covers JSON, urlencoded, and FormData/multipart without touching Content-Type)
(function () {
  var origFetch = window.fetch;
  window.fetch = function (url, opts) {
    opts = Object.assign({}, opts || {});
    var method = (opts.method || (url instanceof Request ? url.method : 'GET')).toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      var target = typeof url === "string" ? url : (url && url.url);
      var sameOrigin = target && new URL(target, window.location.href).origin === window.location.origin;
      if (sameOrigin) {
        var token = window.csrfToken();
        if (token) {
          var headers = new Headers(opts.headers || (url instanceof Request ? url.headers : undefined));
          headers.set('X-CSRF-Token', token);
          opts.headers = headers;
        }
      }
    }
    return origFetch.call(window, url, opts);
  };
})();

// Clear caches left by older service workers before leaving an authenticated
// session. Other open tabs reload so they cannot keep showing the prior account.
function clearVitalMatchCaches() {
  if (navigator.serviceWorker?.controller) navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_PRIVATE_CACHE' });
  if ('caches' in window) return caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vitalmatch-')).map(key => caches.delete(key))));
  return Promise.resolve();
}
var sessionChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('vitalmatch-session') : null;
if (sessionChannel) sessionChannel.onmessage = function (event) {
  if (event.data === 'logout' && window.csrfToken()) { clearVitalMatchCaches(); window.location.replace('/login'); }
};
document.addEventListener('submit', function (event) {
  var form = event.target;
  if (!(form instanceof HTMLFormElement) || new URL(form.action, location.href).pathname !== '/logout') return;
  queueMicrotask(function () {
    if (event.defaultPrevented) return;
    clearVitalMatchCaches();
    if (sessionChannel) sessionChannel.postMessage('logout');
  });
}, true);
window.addEventListener('pageshow', function (event) {
  if (event.persisted && document.querySelector('[data-internal-workspace], .vm-page')) window.location.reload();
});
