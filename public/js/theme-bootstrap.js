(function () {
  try {
    var theme = localStorage.getItem('theme');
    document.documentElement.classList.toggle('dark', theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches));
  } catch (error) { /* Use the readable light default when storage is unavailable. */ }
})();
