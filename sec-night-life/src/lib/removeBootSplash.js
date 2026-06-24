/** Remove the inline HTML boot splash once React has painted. */
export function removeBootSplash() {
  const el = document.getElementById('sec-boot-splash');
  if (!el) return;
  el.classList.add('sec-boot-splash--out');
  window.setTimeout(() => el.remove(), 420);
}
