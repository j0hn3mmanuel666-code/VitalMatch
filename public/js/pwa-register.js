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
