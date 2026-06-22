// Runs before React hydrates to apply the saved theme (or the OS preference,
// if the user has never explicitly set one) and prevent a flash of the wrong
// theme — including on the static loading screen below, which reads the same
// class before any JS framework has loaded.
try {
  var stored = localStorage.getItem('prose-theme')
  var isDark = stored === 'light'
    ? false
    : stored === 'dark'
      ? true
      : window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', isDark)
} catch (_) {
  document.documentElement.classList.add('dark')
}
