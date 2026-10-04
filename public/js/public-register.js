(() => {
  document.querySelectorAll('[data-password-policy]').forEach(input => {
    const minimum = Math.max(8, Math.min(64, Number(input.getAttribute('minlength')) || 8));
    const requireSpecial = input.dataset.requireSpecial === 'true';
    const rules = {
      length: value => value.length >= minimum,
      upper: value => /[A-Z]/.test(value),
      lower: value => /[a-z]/.test(value),
      digit: value => /\d/.test(value),
      special: value => !requireSpecial || /[@$!%*?&]/.test(value),
      allowed: value => /^[a-zA-Z\d@$!%*?&]+$/.test(value),
      max: value => value.length > 0 && new TextEncoder().encode(value).length <= 72
    };
    const messages = {
      length: `Use at least ${minimum} characters.`,
      upper: 'Include an uppercase letter (A-Z).',
      lower: 'Include a lowercase letter (a-z).',
      digit: 'Include a number (0-9).',
      special: 'Include a symbol from @$!%*?&.',
      allowed: 'Use only A-Z, a-z, 0-9, or @$!%*?&.',
      max: 'Use no more than 72 UTF-8 bytes.'
    };
    const form = input.closest('form');
    const confirmation = form?.querySelector('[name="confirmPassword"]');
    const checkConfirmation = () => confirmation?.setCustomValidity(confirmation.value && confirmation.value !== input.value ? 'Your passwords must match.' : '');
    const checkPassword = () => {
      document.querySelectorAll('#passwordRequirements [data-rule]').forEach(item => {
        const rule = rules[item.dataset.rule];
        if (rule) item.setAttribute('data-valid', String(rule(input.value)));
      });
      const failure = Object.keys(rules).find(name => !rules[name](input.value));
      input.setCustomValidity(input.value && failure ? messages[failure] : '');
      checkConfirmation();
    };
    input.addEventListener('input', checkPassword);
    input.addEventListener('change', checkPassword);
    confirmation?.addEventListener('input', checkConfirmation);
    checkPassword();
  });
})();
