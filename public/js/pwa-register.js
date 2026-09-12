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
    opts = opts || {};
    var method = (opts.method || "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") {
      var target = typeof url === "string" ? url : (url && url.url);
      if (target && target.charAt(0) === "/") {
        var token = window.csrfToken();
        if (token) {
          if (opts.headers instanceof Headers) {
            opts.headers.set("X-CSRF-Token", token);
          } else {
            opts.headers = opts.headers || {};
            opts.headers["X-CSRF-Token"] = token;
          }
        }
      }
    }
    return origFetch(url, opts);
  };
})();
