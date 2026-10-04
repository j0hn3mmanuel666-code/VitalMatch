/* Accessible account forms. The server remains authoritative; no patient drafts are stored. */
(function () {
  'use strict';
  document.querySelectorAll('[data-workspace-form]').forEach(function (form) {
    var donor = form.id === 'donorProfileForm';
    var steps = Array.from(form.querySelectorAll(donor ? '.donor-step' : '.form-step'));
    var total = donor ? 4 : 5, current = 1, submitting = false;
    var next = document.getElementById(donor ? 'donorWizardNext' : 'wizardNext');
    var back = document.getElementById(donor ? 'donorWizardBack' : 'wizardBack');
    var submit = form.querySelector('button[type="submit"]');
    var summary = document.createElement('div');
    summary.className = 'vm-alert vm-alert--danger hidden'; summary.setAttribute('role', 'alert'); summary.tabIndex = -1;
    form.prepend(summary);
    var restored = false;
    var saved = document.getElementById(donor ? 'donor-data' : 'request-form-data');
    if (saved && saved.textContent.trim()) {
      try {
        var values = JSON.parse(saved.textContent);
        restored = !donor && Object.keys(values).some(function (key) { return key !== 'submissionKey' && key !== '_csrf' && values[key] !== null && values[key] !== ''; });
        Array.from(form.querySelectorAll('input,select,textarea')).forEach(function (field) {
          var value = values[field.name] === undefined ? values[field.name.replace(/\[\]$/, '')] : values[field.name];
          if (value === undefined || value === null || field.name === '_csrf') return;
          if (field.type === 'checkbox') field.checked = Array.isArray(value) ? value.includes(field.value) : Boolean(value);
          else if (field.hasAttribute('data-city-select') && !Array.from(field.options).some(function (option) { return option.value === value; })) {
            field.value = '__other'; var other = field.closest('[data-city-wrap]').querySelector('[data-city-other]'); other.value = value; field.dispatchEvent(new window.Event('change', { bubbles: true }));
          } else field.value = value;
        });
      } catch (ignore) { /* A missing draft is not an error; persistent storage is never used. */ }
    }
    var facility = form.querySelector('[data-facility-select]'), facilityName = form.querySelector('[name="hospitalName"]');
    if (facility && facilityName) {
      function selectFacility() {
        var choice = facility.options[facility.selectedIndex];
        facilityName.readOnly = facility.value !== 'external';
        if (choice && choice.dataset.facilityName) facilityName.value = choice.dataset.facilityName;
      }
      facility.addEventListener('change', selectFacility); selectFacility();
    }
    function dateToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
    var deadline = form.querySelector('[name="requiredByDate"]'); if (deadline) deadline.min = dateToday();
    var previousDonation = form.querySelector('[name="lastDonationDate"]'); if (previousDonation) previousDonation.max = dateToday();
    function showStep(n) {
      current = n;
      steps.forEach(function (step) { step.classList.toggle('hidden', Number(step.dataset.step) !== n); });
      form.querySelectorAll('[data-step-pill]').forEach(function (pill) {
        pill.classList.toggle('bg-gray-100', Number(pill.dataset.stepPill) === n);
        if (Number(pill.dataset.stepPill) === n) pill.setAttribute('aria-current', 'step'); else pill.removeAttribute('aria-current');
      });
      document.getElementById(donor ? 'donorStepNumber' : 'stepNumber').textContent = n;
      document.getElementById('progressText').textContent = 'Step ' + n + ' of ' + total;
      document.getElementById('progressBar').style.width = ((n - 1) / (total - 1) * 100) + '%';
      back.classList.toggle('invisible', n === 1); next.classList.toggle('hidden', n === total); submit.classList.toggle('hidden', n !== total);
      var heading = steps.find(function (step) { return Number(step.dataset.step) === n; });
      if (heading) { heading.tabIndex = -1; heading.focus(); }
    }
    function error(field) {
      if (field.disabled || field.type === 'hidden') return '';
      var value = String(field.value == null ? '' : field.value).trim();
      if (field.required && (field.type === 'checkbox' ? !field.checked : !value)) return 'Complete this required field.';
      if (!value) return '';
      if (/Volume$/.test(field.name) && (!/^\d+(?:\.\d+)?(?:\s*(?:ml|units?|bags?))?$/i.test(value) || Number.parseFloat(value) <= 0 || Number.parseFloat(value) > 100000)) return 'Enter a positive component quantity up to 100000, optionally followed by ml, units or bags.';
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return 'Enter a valid email address.';
      if (field.type === 'tel' && !/^(?:09\d{9}|\+?639\d{9})$/.test(value.replace(/[\s()-]/g, ''))) return 'Enter a Philippine mobile number (09 or +639).';
      if (field.type === 'number') {
        var number = Number(value);
        if (!Number.isFinite(number) || (field.min && number < Number(field.min)) || (field.max && number > Number(field.max))) return 'Enter a number within the allowed range.';
        if ((!field.step || field.step === '1') && !Number.isInteger(number)) return 'Enter a whole number.';
      }
      if (field.type === 'date' && (field.min && value < field.min || field.max && value > field.max)) return 'Choose a date within the allowed range.';
      if (field.name === 'dateOfBirth') {
        var today = new Date(dateToday() + 'T12:00:00'), birth = new Date(value + 'T12:00:00');
        var age = today.getFullYear() - birth.getFullYear();
        if (today.getMonth() < birth.getMonth() || today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) age--;
        if (!Number.isFinite(age) || age < 18 || age > 65) return 'Donor registration is for ages 18 to 65. Medical staff assess final eligibility.';
      }
      if (field.dataset.validate && field.dataset.validate.includes('minLength:2') && value.length < 2) return 'Enter at least two characters.';
      return '';
    }
    function validate(fields) {
      var first = null;
      fields.forEach(function (field) {
        if (field.type === 'hidden' || field.disabled) return;
        var message = error(field);
        field.setAttribute('aria-invalid', String(!!message));
        var display = field.parentElement.querySelector('.error-message');
        if (!display) { display = document.createElement('p'); display.className = 'error-message vm-field-error hidden'; field.after(display); }
        if (!display.id) display.id = (field.id || form.id + '-' + field.name.replace(/[^a-z0-9]/gi, '-')) + '-error';
        field.setAttribute('aria-describedby', display.id); display.textContent = message; display.classList.toggle('hidden', !message);
        if (message && !first) first = field;
      });
      var components = form.querySelectorAll('[name="bloodComponents[]"]');
      if (components.length && fields.some(function (f) { return f.name === 'bloodComponents[]'; }) && !Array.from(components).some(function (f) { return f.checked; })) {
        first = first || components[0]; summary.textContent = 'Select at least one blood component and enter its units/volume.';
      } else summary.textContent = first ? 'Review the highlighted fields. Your entered details are still on this page.' : '';
      summary.classList.toggle('hidden', !first);
      if (first) { var step = first.closest('[data-step]'); if (step) showStep(Number(step.dataset.step)); first.focus(); }
      return !first;
    }
    form.querySelectorAll('[name="bloodComponents[]"]').forEach(function (checkbox) {
      var volume = document.getElementById(checkbox.value + 'Volume');
      if (!volume) return;
      function update() { volume.disabled = !checkbox.checked; volume.required = checkbox.checked; }
      checkbox.addEventListener('change', update); update();
    });
    next.addEventListener('click', function () {
      var fields = steps.filter(function (step) { return Number(step.dataset.step) === current; }).flatMap(function (step) { return Array.from(step.querySelectorAll('input,select,textarea')); });
      if (validate(fields)) showStep(current + 1);
    });
    back.addEventListener('click', function () { summary.classList.add('hidden'); showStep(current - 1); });
    form.addEventListener('submit', function (event) {
      if (submitting || !validate(Array.from(form.querySelectorAll('input,select,textarea')))) { event.preventDefault(); return; }
      submitting = true; submit.disabled = true; form.setAttribute('aria-busy', 'true');
      document.getElementById('loadingOverlay').classList.remove('hidden');
    });
    // Geolocation is an explicit optional action rather than an automatic permission prompt.
    var latitude = form.querySelector('[name="latitude"]'), longitude = form.querySelector('[name="longitude"]');
    if (latitude && longitude) {
      var locate = document.createElement('button'); locate.type = 'button'; locate.className = 'vm-button vm-button--small'; locate.textContent = 'Use my current location (optional)';
      var feedback = document.createElement('p'); feedback.className = 'vm-muted text-sm'; feedback.setAttribute('aria-live', 'polite');
      longitude.after(locate, feedback);
      locate.addEventListener('click', function () {
        if (!navigator.geolocation) { feedback.textContent = 'Location is unavailable. Municipality details are sufficient.'; return; }
        locate.disabled = true; feedback.textContent = 'Requesting location permission…';
        navigator.geolocation.getCurrentPosition(function (position) {
          latitude.value = position.coords.latitude; longitude.value = position.coords.longitude; locate.disabled = false; feedback.textContent = 'Location added for distance matching. Your precise donor location is not shown to other users.';
        }, function () { locate.disabled = false; feedback.textContent = 'Location was not added. You can continue with municipality details.'; }, { timeout: 10000, maximumAge: 300000 });
      });
    }
    window.addEventListener('pageshow', function () { submitting = false; submit.disabled = false; form.removeAttribute('aria-busy'); document.getElementById('loadingOverlay').classList.add('hidden'); });
    if (restored && summary) { summary.textContent = 'Review the server feedback above. Your entered request details have been restored for correction.'; summary.classList.remove('hidden'); }
    showStep(1);
  });
})();
