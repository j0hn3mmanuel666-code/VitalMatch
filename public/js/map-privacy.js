(function () {
  'use strict';
  var form = document.getElementById('mapPrivacyForm'); if (!form) return;
  var toggle = document.getElementById('mapVisibilityToggle'), status = document.getElementById('map-privacy-status');
  var button = form.querySelector('button[type="submit"]'), saved = toggle.checked;
  function save(event) {
    if (event) event.preventDefault();
    var desired = toggle.checked;
    toggle.disabled = true; button.disabled = true; status.textContent = 'Saving map privacy…';
    fetch(form.action, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams({ _csrf: form.elements._csrf.value, shareOnMap: desired ? 'on' : 'off' }) })
      .then(function (response) { return response.json().then(function (data) { if (!response.ok || !data.success) throw new Error(data.error || 'Map privacy could not be saved.'); return data; }); })
      .then(function (data) { saved = data.shareOnMap === true; toggle.checked = saved; status.textContent = data.message; })
      .catch(function (error) { toggle.checked = saved; status.textContent = 'Not saved. ' + (error.message || 'Please retry.'); })
      .finally(function () { toggle.disabled = false; button.disabled = false; });
  }
  toggle.addEventListener('change', save); form.addEventListener('submit', save);
})();
