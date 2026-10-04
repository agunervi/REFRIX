// Aplica el tema antes de pintar para evitar el "parpadeo" blanco en modo oscuro.
;(function () {
  try {
    var pref = localStorage.getItem('inv:theme') || 'system'
    var dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    if (dark) document.documentElement.classList.add('dark')
  } catch (e) {}
})()
