// Runs before React hydrates to apply the saved theme and prevent flash.
try {
  var stored = localStorage.getItem('prose-theme')
  if (stored === 'light') {
    document.documentElement.classList.remove('dark')
  } else {
    document.documentElement.classList.add('dark')
  }
} catch (_) {
  document.documentElement.classList.add('dark')
}
