document.querySelectorAll('[data-google-sign-in]').forEach(link => {
  link.addEventListener('click', () => {
    const remember = document.getElementById('rememberMe');
    link.href = `/auth/google?remember=${remember ? remember.checked : true}`;
  });
});
