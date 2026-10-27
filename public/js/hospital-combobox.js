/* Idea-type hospital selector: turns a hospital name text field into a searchable
   dropdown. The field keeps its name/value contract, so the server contract is
   unchanged and the plain text field remains the graceful fallback. */
(function () {
  'use strict';

  var HOSPITALS = [
    'Bulalacao Community Hospital',
    'Calapan City District Hospital',
    'Calapan City Hospital',
    'Grace Mission Hospital',
    'Hospital of the Holy Cross',
    'Luna Goco Medical Center',
    'Maria Estrella General Hospital',
    'Medical Mission Group Hospital',
    'Naujan District Hospital',
    'Oriental Mindoro Central District Hospital',
    'Oriental Mindoro Provincial Hospital',
    'Oriental Mindoro Southern District Hospital',
    'Pinamalayan Doctors Hospital',
    'Roxas Municipal Hospital',
    'Sta. Maria Village Hospital'
  ];

  function normalize(value) { return String(value == null ? '' : value).trim().toLowerCase(); }

  // Prefix matches rank above interior matches, then the alphabetical order holds.
  function suggest(query) {
    var needle = normalize(query);
    if (!needle) return HOSPITALS.slice();
    var prefix = [], interior = [];
    HOSPITALS.forEach(function (name) {
      var index = name.toLowerCase().indexOf(needle);
      if (index === 0) prefix.push(name);
      else if (index > 0) interior.push(name);
    });
    return prefix.concat(interior);
  }

  function highlight(name, query) {
    var fragment = document.createDocumentFragment();
    var needle = normalize(query);
    var index = needle ? name.toLowerCase().indexOf(needle) : -1;
    if (index < 0) { fragment.appendChild(document.createTextNode(name)); return fragment; }
    fragment.appendChild(document.createTextNode(name.slice(0, index)));
    var mark = document.createElement('mark');
    mark.textContent = name.slice(index, index + needle.length);
    fragment.appendChild(mark);
    fragment.appendChild(document.createTextNode(name.slice(index + needle.length)));
    return fragment;
  }

  function setup(input) {
    if (input.dataset.hospitalComboboxReady === 'true') return;
    input.dataset.hospitalComboboxReady = 'true';

    var wrapper = document.createElement('div');
    wrapper.className = 'vm-combobox';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    var menu = document.createElement('ul');
    menu.className = 'vm-combobox__menu';
    menu.id = (input.id || 'hospitalName') + '-listbox';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Hospital suggestions');
    menu.hidden = true;
    wrapper.appendChild(menu);

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-controls', menu.id);
    input.setAttribute('autocomplete', 'off');

    var activeIndex = -1;
    var results = [];

    function close() {
      menu.hidden = true;
      activeIndex = -1;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
    }

    function setActive(index) {
      var options = menu.children;
      if (!options.length) return;
      activeIndex = (index + options.length) % options.length;
      for (var i = 0; i < options.length; i++) {
        var selected = i === activeIndex;
        options[i].classList.toggle('is-active', selected);
        options[i].setAttribute('aria-selected', String(selected));
      }
      input.setAttribute('aria-activedescendant', options[activeIndex].id);
      options[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function choose(name) {
      input.value = name;
      close();
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
      input.dispatchEvent(new window.Event('change', { bubbles: true }));
      input.focus();
    }

    function render() {
      results = suggest(input.value);
      menu.textContent = '';
      if (!results.length) { close(); return; }
      results.forEach(function (name, index) {
        var option = document.createElement('li');
        option.className = 'vm-combobox__option';
        option.id = menu.id + '-option-' + index;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', 'false');
        option.appendChild(highlight(name, input.value));
        option.addEventListener('mousedown', function (event) { event.preventDefault(); choose(name); });
        menu.appendChild(option);
      });
      menu.hidden = false;
      activeIndex = -1;
      input.setAttribute('aria-expanded', 'true');
      input.removeAttribute('aria-activedescendant');
    }

    function open() {
      if (input.readOnly || input.disabled) return;
      render();
    }

    input.addEventListener('input', render);
    input.addEventListener('focus', open);
    input.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        if (input.readOnly || input.disabled) return;
        event.preventDefault();
        if (menu.hidden) { render(); if (!menu.children.length) return; }
        setActive(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
      } else if (event.key === 'Enter') {
        if (!menu.hidden && activeIndex >= 0) { event.preventDefault(); choose(results[activeIndex]); }
      } else if (event.key === 'Escape') {
        if (!menu.hidden) { event.preventDefault(); close(); }
      } else if (event.key === 'Tab') {
        close();
      }
    });
    input.addEventListener('blur', function () { window.setTimeout(close, 120); });
  }

  function init() {
    var fields = document.querySelectorAll('input[data-hospital-combobox]');
    for (var i = 0; i < fields.length; i++) setup(fields[i]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
