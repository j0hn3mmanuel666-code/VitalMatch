(function () {
  'use strict';
  var form = document.getElementById('appointmentActionForm');
  if (!form) return;
  var modal = document.getElementById('appointmentActionModal'), selected, action, operationKey, pending = false;
  var feedback = document.getElementById('appointmentFeedback');
  function close() { if (!pending) modal.classList.add('hidden'); }
  window.closeAppointmentAction = close;
  document.querySelectorAll('[data-appointment-action]').forEach(function (button) {
    button.addEventListener('click', function () {
      selected = button.dataset; action = selected.appointmentAction; operationKey = crypto.randomUUID(); form.reset();
      var title = { complete: 'Record completed donation', reschedule: 'Reschedule appointment', cancel: 'Cancel appointment' }[action];
      document.getElementById('appointmentActionTitle').textContent = title;
      document.getElementById('appointmentContext').textContent = 'Request #' + selected.requestId + ' · ' + selected.remaining + ' units remaining';
      var submit = form.querySelector('[type="submit"]'); submit.textContent = title;
      submit.className = 'vm-button ' + (action === 'cancel' ? 'vm-button--danger-solid' : action === 'complete' ? 'vm-button--success' : 'vm-button--warning');
      var units = form.elements.unitsProvided, date = form.elements.scheduledDate, reason = form.elements.reason;
      units.closest('div').hidden = action !== 'complete'; units.disabled = action !== 'complete'; units.required = action === 'complete'; units.max = Math.min(10, Number(selected.remaining)); units.value = Math.min(1, Number(selected.remaining));
      date.closest('div').hidden = action !== 'reschedule'; date.disabled = action !== 'reschedule'; date.required = action === 'reschedule';
      reason.required = action !== 'complete';
      document.getElementById('appointmentActionError').textContent = '';
      modal.classList.remove('hidden');
    });
  });
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); if (pending || !form.checkValidity()) { form.reportValidity(); return; }
    var error = document.getElementById('appointmentActionError');
    var payload = { version: Number(selected.version), appointmentId: Number(selected.appointmentId), reason: form.elements.reason.value, notes: form.elements.reason.value,
      unitsProvided: form.elements.unitsProvided.value, scheduledDate: form.elements.scheduledDate.value, idempotencyKey: operationKey };
    if (action === 'reschedule' && new Date(payload.scheduledDate).getTime() <= Date.now()) { error.textContent = 'Choose a future appointment date and time.'; return; }
    if (payload.scheduledDate) payload.scheduledDate = new Date(payload.scheduledDate).toISOString();
    var url = action === 'complete' ? '/admin/fulfill-request/' + selected.requestId : '/admin/appointments/' + selected.appointmentId + '/' + action;
    pending = true; form.setAttribute('aria-busy', 'true'); form.querySelector('[type="submit"]').disabled = true;
    try {
      var response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': window.getCsrfToken() }, body: JSON.stringify(payload) });
      var data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || data.error || 'This appointment changed. Refresh and review its current state.');
      feedback.textContent = data.message || 'Appointment updated. Refreshing the register…'; modal.classList.add('hidden'); window.location.reload();
    } catch (failure) { error.textContent = failure.message || 'The update could not be completed. Your entered details are still available.'; }
    finally { pending = false; form.removeAttribute('aria-busy'); form.querySelector('[type="submit"]').disabled = false; }
  });
})();
