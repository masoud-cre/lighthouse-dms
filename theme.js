// Theme: system | light | dark
const THEMES = ['system', 'light', 'dark'];
const ICONS = {
  system: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>`,
  light:  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M18.364 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10 5 5 0 000-10z"/></svg>`,
  dark:   `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>`,
};

function applyTheme(pref) {
  const html = document.documentElement;
  const isDark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  html.setAttribute('data-theme', isDark ? 'dark' : 'light');
}

function getTheme() { return localStorage.getItem('dms-theme') || 'system'; }

function cycleTheme() {
  const current = getTheme();
  const next = THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
  localStorage.setItem('dms-theme', next);
  applyTheme(next);
  updateThemeBtn();
}

function updateThemeBtn() {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;
  const t = getTheme();
  btn.innerHTML = ICONS[t];
  btn.title = `Theme: ${t} (click to change)`;
}

// Init on load
(function() {
  applyTheme(getTheme());
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') applyTheme('system');
  });
})();

window.cycleTheme    = cycleTheme;
window.updateThemeBtn = updateThemeBtn;

// ── Auto password show/hide toggle ──────────────────────────────────────────
// Injects an eye button into every input[type="password"] whose parent doesn't
// already contain a manual toggle button.
function initPasswordToggles() {
  document.querySelectorAll('input[type="password"]').forEach(input => {
    // Skip if a toggle button already lives in the same parent
    if (input.parentElement.querySelector('button[data-pw-auto]')) return;
    if (input.parentElement.querySelector('button[type="button"]')) return;

    const parent = input.parentElement;

    // Transfer margin-bottom from input to wrapper so spacing is preserved
    const marginBottom = input.style.marginBottom || '';
    if (marginBottom) input.style.marginBottom = '';

    const wrapper = document.createElement('div');
    wrapper.style.cssText = `position:relative;display:block;${marginBottom ? 'margin-bottom:' + marginBottom + ';' : ''}`;

    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);
    input.style.paddingRight = '44px';

    const SVG_SHOW = `<svg class="eye-s" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
    const SVG_HIDE = `<svg class="eye-h" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-pw-auto', 'true');
    btn.style.cssText = 'position:absolute;right:0;top:0;bottom:0;width:44px;background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--text-3);padding:0;';
    btn.innerHTML = SVG_SHOW + SVG_HIDE;
    btn.addEventListener('click', () => {
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      btn.querySelector('.eye-s').style.display = visible ? '' : 'none';
      btn.querySelector('.eye-h').style.display = visible ? 'none' : '';
    });

    wrapper.appendChild(btn);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updateThemeBtn();
  initPasswordToggles();
});
