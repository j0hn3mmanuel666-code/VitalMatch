(function () {
  'use strict';
  var form = document.getElementById('adminBloodRequestForm'); if (!form) return;
  var saved = document.getElementById('request-form-data');
  if (saved && saved.textContent.trim()) {
    try {
      var values = JSON.parse(saved.textContent);
      form.querySelectorAll('input,select,textarea').forEach(function (field) {
        if (field.name === '_csrf' || values[field.name] === undefined || values[field.name] === null) return;
        var value = values[field.name];
        if (field.hasAttribute('data-city-select') && !Array.from(field.options).some(function (option) { return option.value === value; })) {
          field.value = '__other';
          var other = field.closest('[data-city-wrap]').querySelector('[data-city-other]');
          if (other) other.value = value;
          field.dispatchEvent(new window.Event('change', { bubbles: true }));
        } else field.value = value;
      });
    } catch (ignore) { /* Server feedback remains visible; no persistent draft is used. */ }
  }
  var facility = form.querySelector('[data-facility-select]'), name = form.querySelector('[name="hospitalName"]');
  function updateFacility() {
    var option = facility.options[facility.selectedIndex]; name.readOnly = facility.value !== 'external';
    if (option && option.dataset.facilityName) name.value = option.dataset.facilityName;
  }
  facility.addEventListener('change', updateFacility); updateFacility();
})();
