(() => {
  const button = document.getElementById('resendBtn');
  const form = document.getElementById('resendForm');
  const status = document.getElementById('resend-status');
  if (!button || !status) return;
  const resend = async event => {
    event.preventDefault();
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Sending…';
    status.hidden = true;
    try {
      const response = await fetch('/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content },
        body: JSON.stringify({ email: form ? document.getElementById('email').value : button.dataset.email })
      });
      const data = await response.json();
      status.textContent = data.message || 'If an unverified account exists for that email, a verification link has been requested.';
      const success = response.ok && data.success;
      status.classList.toggle('journey-alert--success', Boolean(success));
      status.setAttribute('role', success ? 'status' : 'alert');
    } catch {
      status.textContent = 'We could not complete the request. Check your connection and try again.';
      status.classList.remove('journey-alert--success');
      status.setAttribute('role', 'alert');
    } finally {
      status.hidden = false;
      button.disabled = false;
      button.textContent = label;
    }
  };
  (form || button).addEventListener(form ? 'submit' : 'click', resend);
})();
