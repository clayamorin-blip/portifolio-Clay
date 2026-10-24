/*
  CLAYSP — Menu global e experiência "Ver globo"
  Um único estado controla a interface (nunca dois abertos ao mesmo tempo):
    page      → página normal
    menu      → menu aberto (fundo desfocado, opções, bolinha na seção atual; X fecha o menu)
    closing   → menu fechando
    entering  → câmera se aproximando da Terra
    focus     → globo em destaque (X sai; arraste só na horizontal)
    leaving   → câmera voltando
  Nenhum desses estados dispara a captura da mão: ela depende só da rolagem para baixo (js/intro.js).
*/
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const menu = $('#menu'), openBtn = $('#menu-open'), closeBtn = $('#ui-close'), seeBtn = $('#see-globe');
  const hint = $('#drag-hint'), dot = menu && menu.querySelector('.menu-dot');
  if (!menu || !openBtn || !closeBtn) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const T = ms => (reduced ? 30 : ms);
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const CAMERA_MS = 3200;           // mesma duração da câmera em js/hero.js (entrada e saída)
  let state = 'page';
  let lastFocus = null;

  const hero = () => window.__clayHero || null;
  const lock = on => document.documentElement.classList.toggle('is-locked', on);
  function showClose(label) {
    closeBtn.setAttribute('aria-label', label);
    closeBtn.hidden = false;
    requestAnimationFrame(() => requestAnimationFrame(() => closeBtn.classList.add('is-on')));
  }
  function hideClose() {
    closeBtn.classList.remove('is-on');
    setTimeout(() => { if (state === 'page') closeBtn.hidden = true; }, T(500));
  }

  // ---------- seção atual (bolinha) ----------
  function currentSection() {
    const ids = ['topo', 'projetos', 'sobre', 'contato'];
    let cur = 'topo';
    for (const id of ids) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= innerHeight * 0.45) cur = id; }
    return cur;
  }
  function placeDot(id) {
    if (!dot) return;
    const item = menu.querySelector(`[data-section="${id}"] .mi-mask`);   // a máscara não se move na animação
    const nav = dot.parentElement;
    if (!item) { dot.classList.remove('is-on'); return; }
    const r = item.getBoundingClientRect(), n = nav.getBoundingClientRect();
    dot.style.setProperty('--dx', `${r.left - n.left - 22}px`);
    dot.style.setProperty('--dy', `${r.top - n.top + r.height * 0.52}px`);
    dot.classList.add('is-on');
    menu.querySelectorAll('.menu-item').forEach(a => a.toggleAttribute('aria-current', a.dataset.section === id));
  }

  // ---------- menu ----------
  function openMenu() {
    if (state !== 'page' || document.body.classList.contains('intro-active')) return;
    state = 'menu';
    lastFocus = document.activeElement;
    menu.hidden = false;
    menu.classList.remove('is-closing');
    lock(true);
    openBtn.setAttribute('aria-expanded', 'true');
    // posiciona a bolinha antes da animação (sem saltos)
    requestAnimationFrame(() => {
      placeDot(currentSection());
      requestAnimationFrame(() => menu.classList.add('is-open'));
    });
    showClose('Fechar menu');
    menu.focus({ preventScroll: true });
  }
  async function closeMenu(target) {
    if (state !== 'menu') return;
    state = 'closing';
    menu.classList.add('is-closing');
    menu.classList.remove('is-open');
    openBtn.setAttribute('aria-expanded', 'false');
    hideClose();
    await wait(T(850));
    menu.hidden = true;
    menu.classList.remove('is-closing');
    lock(false);
    state = 'page';
    if (target) {
      const el = document.querySelector(target);
      if (el) el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    } else if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }

  // ---------- "Ver globo" ----------
  // espera a câmera chegar (entrada) ou voltar (saída) de verdade, com limite de segurança
  function untilFocus(h, target) {
    const t0 = performance.now();
    return new Promise(res => {
      (function check() {
        const k = h ? h.focusProgress : target;
        if (Math.abs(k - target) < 0.001 || performance.now() - t0 > CAMERA_MS * 3) return res();
        requestAnimationFrame(check);
      })();
    });
  }
  function onFirstDrag() {
    hint.classList.remove('is-on');
    setTimeout(() => { hint.hidden = true; }, T(600));
  }
  async function enterGlobe() {
    const h = hero();
    if (state !== 'page' || !h) return;
    if (h.capture > 0.01) return;               // só a partir da composição inicial
    state = 'entering';
    lastFocus = document.activeElement;
    lock(true);
    document.body.classList.add('is-focus');
    h.setVisible(true);
    h.setFocus(true, onFirstDrag);
    showClose('Sair da visualização do globo');
    await untilFocus(h, 1);
    if (state !== 'entering') return;
    state = 'focus';
    hint.hidden = false;
    requestAnimationFrame(() => hint.classList.add('is-on'));
    closeBtn.focus({ preventScroll: true });
  }
  async function leaveGlobe() {
    const h = hero();
    if (state !== 'focus' && state !== 'entering') return;
    state = 'leaving';
    hint.classList.remove('is-on');
    if (h) h.setFocus(false);                   // a câmera faz o caminho inverso, com a mesma curva
    hideClose();
    await untilFocus(h, 0);
    document.body.classList.remove('is-focus');
    hint.hidden = true;
    lock(false);
    state = 'page';
    closeBtn.hidden = true;
    window.dispatchEvent(new Event('scroll'));
    if (seeBtn) seeBtn.focus({ preventScroll: true });
  }

  // ---------- eventos ----------
  openBtn.addEventListener('click', openMenu);
  if (seeBtn) seeBtn.addEventListener('click', enterGlobe);
  closeBtn.addEventListener('click', () => {
    if (state === 'menu') closeMenu();
    else if (state === 'focus' || state === 'entering') leaveGlobe();
  });
  menu.addEventListener('click', e => {
    const a = e.target.closest('[data-go]');
    if (a) { e.preventDefault(); closeMenu(a.dataset.go); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (state === 'menu') closeMenu();
      else if (state === 'focus') leaveGlobe();
    }
    if (e.key === 'Tab' && state === 'menu') {
      const items = [...menu.querySelectorAll('a'), closeBtn];
      const i = items.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); items[items.length - 1].focus(); }
      else if (!e.shiftKey && (i === -1 || i === items.length - 1)) { e.preventDefault(); items[0].focus(); }
    }
  });
  // com o menu ou o globo abertos, a roda do mouse não rola a página por trás (só nesses estados)
  window.addEventListener('wheel', e => { if (state === 'entering' || state === 'focus' || state === 'leaving') e.preventDefault(); }, { passive: false });
  window.addEventListener('resize', () => { if (state === 'menu') placeDot(currentSection()); });

  window.ClayMenu = { get state() { return state; }, openMenu, closeMenu, enterGlobe, leaveGlobe };
})();
