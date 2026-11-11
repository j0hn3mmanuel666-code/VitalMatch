(() => {
  'use strict';
  const toggle = document.getElementById('contactPickerToggle');
  const picker = document.getElementById('contactPicker');
  if (!toggle || !picker) return;
  const search = document.getElementById('contactSearch');
  const status = document.getElementById('contactStatus');
  const results = document.getElementById('contactResults');
  const retry = document.getElementById('contactRetry');
  const isAdmin = picker.dataset.admin === 'true';
  let timer, request, version = 0;

  function cancel() {
    clearTimeout(timer);
    request?.abort();
    version++;
    results.removeAttribute('aria-busy');
  }
  async function load() {
    cancel();
    const current = version;
    const query = search.value.trim();
    results.replaceChildren();
    retry.hidden = true;
    if (isAdmin && query.length < 2) {
      status.textContent = 'Enter at least 2 characters to find an account.';
      return;
    }
    request = new AbortController();
    results.setAttribute('aria-busy', 'true');
    status.textContent = 'Loading contacts…';
    try {
      const response = await fetch(`/messages/contacts?q=${encodeURIComponent(query)}`, {
        headers: { Accept: 'application/json' }, signal: request.signal
      });
      if (!response.ok) throw new Error('Contacts unavailable');
      const data = await response.json();
      if (current !== version || picker.hidden) return;
      for (const contact of data.contacts) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `/messages?userId=${encodeURIComponent(contact.id)}`;
        link.className = 'vm-contact-result';
        const name = document.createElement('strong');
        name.textContent = contact.name;
        const detail = document.createElement('span');
        detail.textContent = [contact.role === 'admin' ? 'Administrator' : contact.role,
          contact.hospitalName, contact.email].filter(Boolean).join(' · ');
        link.append(name, detail);
        item.append(link);
        results.append(item);
      }
      status.textContent = data.contacts.length
        ? `${data.contacts.length} contact${data.contacts.length === 1 ? '' : 's'}${data.hasMore ? ' shown. Refine your search for more.' : ' found.'}`
        : query ? 'No contacts match your search.' : 'No administrators are available right now. Please try again later.';
    } catch (error) {
      if (error.name === 'AbortError' || current !== version || picker.hidden) return;
      status.textContent = 'Could not load contacts. Please try again.';
      retry.hidden = false;
    } finally {
      if (current === version) results.removeAttribute('aria-busy');
    }
  }
  function close() {
    cancel();
    picker.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus();
  }
  toggle.addEventListener('click', () => {
    if (!picker.hidden) return close();
    picker.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    search.focus();
    load();
  });
  document.getElementById('contactPickerClose').addEventListener('click', close);
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  search.addEventListener('input', () => {
    cancel();
    results.replaceChildren();
    retry.hidden = true;
    status.textContent = isAdmin && search.value.trim().length < 2
      ? 'Enter at least 2 characters to find an account.' : 'Searching contacts…';
    timer = setTimeout(load, 250);
  });
  retry.addEventListener('click', load);
})();
