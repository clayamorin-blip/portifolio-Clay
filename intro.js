/*
  CLAYSP — Abertura
  Ordem: linha vermelha (carregamento real) → "Seja bem-vindo :)" → "Criado por" →
  símbolo C + pulsação → CLAYSP letra por letra → reflexos C..P → pulsação conjunta → queima → hero.
  Cada etapa só começa quando a anterior termina (await).
*/
(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const A = window.CLAY_ASSETS || {};

  // ---------- imagens embutidas ----------
  $$('[data-asset]').forEach(img => { if (A[img.dataset.asset]) img.src = A[img.dataset.asset]; });
  $$('.brand-letter').forEach(el => {
    const url = A[el.dataset.l];
    const sheen = $('.sheen', el);
    if (url && sheen) { sheen.style.webkitMaskImage = `url(${url})`; sheen.style.maskImage = `url(${url})`; }
  });
  const yr = $('#year'); if (yr) yr.textContent = new Date().getFullYear();

  // ---------- divide textos em letras ----------
  function splitChars(el, text) {
    el.textContent = '';
    const chars = [];
    text.split(' ').forEach((word, wi, arr) => {
      const w = document.createElement('span');
      w.className = 'w';
      for (const c of word) {
        const s = document.createElement('span');
        s.className = 'ch'; s.textContent = c;
        w.appendChild(s); chars.push(s);
      }
      el.appendChild(w);
      if (wi < arr.length - 1) { const sp = document.createElement('span'); sp.className = 'sp'; sp.innerHTML = '&nbsp;'; el.appendChild(sp); }
    });
    el.setAttribute('aria-label', text);
    return chars;
  }

  // letra por letra, saindo de um borrão
  function blurIn(chars, { stagger = 55, dur = 900, blur = 14, x = 0.35 } = {}) {
    const anims = chars.map((c, i) => c.animate([
      { opacity: 0, filter: `blur(${blur}px)`, transform: `translateX(${x}em)` },
      { opacity: 1, filter: 'blur(0px)', transform: 'translateX(0)' },
    ], { duration: dur, delay: i * stagger, easing: 'cubic-bezier(.2,.65,.25,1)', fill: 'forwards' }));
    return Promise.all(anims.map(a => a.finished));
  }
  function blurOut(chars, { stagger = 30, dur = 650, blur = 12 } = {}) {
    const anims = chars.map((c, i) => c.animate([
      { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0)' },
      { opacity: 0, filter: `blur(${blur}px)`, transform: 'translateY(-0.15em)' },
    ], { duration: dur, delay: i * stagger, easing: 'cubic-bezier(.5,0,.75,.4)', fill: 'forwards' }));
    return Promise.all(anims.map(a => a.finished));
  }

  // ---------- carregamento real ----------
  const line = $('#intro-line i'), lineWrap = $('#intro-line'), pct = $('#intro-percent');
  let total = 0, done = 0;
  function track(p) {
    total++;
    const step = () => {
      done++;
      const v = done / total;
      line.style.transform = `scaleX(${v})`;
      pct.textContent = String(Math.round(v * 100)).padStart(2, '0');
      if (v >= 1) lineWrap.classList.add('is-full');
    };
    return Promise.resolve(p).then(step, step);
  }
  const imgsReady = $$('#intro img').map(img => track(img.decode ? img.decode().catch(() => {}) : null));
  const fontsReady = track(document.fonts ? Promise.race([document.fonts.ready, wait(3500)]) : null);

  // ---------- hero 3D (prepara por trás da abertura) ----------
  let hero = null;
  const heroSection = $('.hero');
  const heroReady = track((async () => {
    try {
      hero = window.ClayHero.create($('#hero-canvas'));
      window.__clayHero = hero;
      await Promise.race([hero.ready, wait(9000)]);
    } catch (err) {
      console.warn('Hero 3D desativado:', err);
      heroSection.classList.add('no-webgl');
      hero = null;
    }
  })());
  const allReady = Promise.all([...imgsReady, fontsReady, heroReady]);

  // ---------- etapas ----------
  const intro = $('#intro');
  const brand = $('#brand');
  const halo = $('.brand-halo', brand);
  const symbol = $('.brand-symbol', brand);
  const letters = $$('.brand-letter', brand);
  let skipped = false, finished = false;

  async function stageTexts() {
    const hello = $('#intro-hello'), by = $('#intro-by');
    const c1 = splitChars(hello, hello.dataset.text);
    await wait(500);
    await blurIn(c1, { stagger: 60, dur: 1000 });
    await wait(900);
    await blurOut(c1);
    if (skipped) return;
    const c2 = splitChars(by, by.dataset.text);
    await blurIn(c2, { stagger: 70, dur: 900, blur: 10 });
    await wait(700);
    await blurOut(c2, { stagger: 35 });
  }

  async function stageSymbol() {
    lineWrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' });
    pct.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
    await symbol.animate([
      { opacity: 0, filter: 'blur(18px) brightness(.35)', transform: 'scale(.93)' },
      { opacity: 1, filter: 'blur(0px) brightness(1)', transform: 'scale(1)' },
    ], { duration: 1600, easing: 'cubic-bezier(.2,.6,.2,1)', fill: 'forwards' }).finished;
    // batida de coração atrás do símbolo (continua durante o nome)
    halo.style.opacity = '';
    halo.classList.add('is-beating');
    await wait(500);
  }

  async function stageName() {
    const anims = letters.map((el, i) => el.animate([
      { opacity: 0, filter: 'blur(16px) brightness(.5)' },
      { opacity: 0.55, filter: 'blur(6px) brightness(.8)', offset: 0.45 },
      { opacity: 1, filter: 'blur(0px) brightness(1)' },
    ], { duration: 1050, delay: i * 190, easing: 'cubic-bezier(.25,.6,.3,1)', fill: 'forwards' }));
    await Promise.all(anims.map(a => a.finished));
    await wait(250);
  }

  async function stageSheen() {
    for (const el of letters) {
      const band = $('.sheen i', el);
      const img = $('img', el);
      const d = 620;
      band.animate([
        { transform: 'translateY(-120%)', opacity: 0 },
        { opacity: 1, offset: 0.18 },
        { opacity: 1, offset: 0.8 },
        { transform: 'translateY(240%)', opacity: 0 },
      ], { duration: d, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' });
      // o metal fica um pouco mais vivo enquanto a luz passa e volta ao normal
      await img.animate([
        { filter: 'brightness(1)' }, { filter: 'brightness(1.28)', offset: 0.5 }, { filter: 'brightness(1)' },
      ], { duration: d, easing: 'ease-in-out' }).finished;
    }
    await wait(200);
  }

  async function stagePulse() {
    halo.classList.remove('is-beating');
    halo.style.opacity = '0.3';
    const glow = [
      { filter: 'brightness(1) drop-shadow(0 0 0 rgba(235,240,255,0))' },
      { filter: 'brightness(1.32) drop-shadow(0 0 14px rgba(235,240,255,.55))', offset: 0.42 },
      { filter: 'brightness(1) drop-shadow(0 0 0 rgba(235,240,255,0))' },
    ];
    const opt = { duration: 1100, easing: 'cubic-bezier(.4,0,.2,1)' };
    const all = [symbol, ...letters].map(el => el.animate(glow, opt));
    all.push(halo.animate([
      { opacity: .3, transform: 'translate(-50%,-50%) scale(.9)' },
      { opacity: 1, transform: 'translate(-50%,-50%) scale(1.08)', offset: 0.42 },
      { opacity: .3, transform: 'translate(-50%,-50%) scale(.92)' },
    ], opt));
    await Promise.all(all.map(a => a.finished));
    await wait(700); // tempo para apreciar a marca completa
  }

  // desenha a marca no canvas exatamente como está na tela (para a queima)
  function paintBrand(ctx) {
    const hr = halo.getBoundingClientRect();
    const hOp = parseFloat(getComputedStyle(halo).opacity) || 0;
    if (hOp > 0.01) {
      const g = ctx.createRadialGradient(hr.left + hr.width / 2, hr.top + hr.height / 2, 0, hr.left + hr.width / 2, hr.top + hr.height / 2, hr.width / 2);
      g.addColorStop(0, `rgba(225,232,255,${0.34 * hOp})`); g.addColorStop(0.45, `rgba(190,200,230,${0.12 * hOp})`);
      g.addColorStop(0.7, `rgba(160,170,210,${0.03 * hOp})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(hr.left, hr.top, hr.width, hr.height);
    }
    [symbol, ...letters.map(l => $('img', l))].forEach(img => {
      const r = img.getBoundingClientRect();
      const op = parseFloat(getComputedStyle(img.closest('.brand-letter') || img).opacity);
      if (op < 0.01 || !img.complete) return;
      ctx.globalAlpha = op;
      ctx.drawImage(img, r.left, r.top, r.width, r.height);
    });
    ctx.globalAlpha = 1;
  }

  // ---------- revelação do conteúdo do hero ----------
  function revealHero() {
    const title = $('[data-reveal]');
    if (title) {
      // separa preservando o <em>
      const nodes = Array.from(title.childNodes);
      title.textContent = '';
      const chars = [];
      nodes.forEach(n => {
        const holder = n.nodeType === 1 ? document.createElement(n.tagName.toLowerCase()) : document.createDocumentFragment();
        const text = n.textContent;
        text.split(/(\s+)/).forEach(tok => {
          if (!tok) return;
          if (/^\s+$/.test(tok)) { holder.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w';
          for (const c of tok) { const s = document.createElement('span'); s.className = 'ch'; s.textContent = c; w.appendChild(s); chars.push(s); }
          holder.appendChild(w);
        });
        title.appendChild(holder);
      });
      title.setAttribute('aria-label', nodes.map(n => n.textContent).join(''));
      chars.forEach((c, i) => c.animate([
        { opacity: 0, filter: 'blur(.3em)', transform: 'translateX(.35em)' },
        { opacity: 1, filter: 'blur(0)', transform: 'translateX(0)' },
      ], { duration: 900, delay: 300 + i * 28, easing: 'cubic-bezier(.2,.65,.25,1)', fill: 'forwards' }));
    }
    $$('.fade-up').forEach((el, i) => el.animate([
      { opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 900, delay: 200 + i * 140, easing: 'cubic-bezier(.2,.65,.25,1)', fill: 'forwards' }));
  }

  function finishIntro() {
    if (finished) return;
    finished = true;
    intro.classList.add('is-gone');
    document.body.classList.remove('intro-active');
    $$('#burn, #embers').forEach(el => el.remove());
    if (hero) hero.start();
    revealHeroOnce();
    try { sessionStorage.setItem('claysp-intro', '1'); } catch (e) {}
  }

  async function burnOut(duration) {
    await ClayBurn.burn({
      duration,
      center: (() => { const r = symbol.getBoundingClientRect(); return [(r.left + r.width / 2) / innerWidth, (r.top + r.height / 2) / innerHeight]; })(),
      paint: paintBrand,
      hideSource: () => { intro.style.visibility = 'hidden'; },
      onStart: () => {
        if (hero) hero.start();
        document.body.classList.remove('intro-active');
        setTimeout(revealHeroOnce, Math.max(400, duration * 0.45));
      },
    });
  }
  let heroRevealed = false;
  function revealHeroOnce() { if (!heroRevealed) { heroRevealed = true; revealHero(); } }

  async function run() {
    if (reduced) {
      // versão curta e calma
      await Promise.race([allReady, wait(5000)]);
      [symbol, ...letters].forEach(el => { el.style.opacity = 1; });
      halo.style.opacity = '.35';
      await wait(1200);
      await intro.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' }).finished;
      finishIntro();
      return;
    }
    await stageTexts();
    if (skipped) return;
    // a marca só entra quando os recursos essenciais estão prontos (no máximo 6 s de espera extra)
    await Promise.race([allReady, wait(6000)]);
    if (skipped) return;
    await stageSymbol();
    if (skipped) return;
    await stageName();
    if (skipped) return;
    await stageSheen();
    if (skipped) return;
    await stagePulse();
    if (skipped) return;
    await burnOut(+(new URLSearchParams(location.search).get('burn')) || 2900);
    finishIntro();
  }

  // pular: mostra a marca pronta e queima rápido
  $('#intro-skip').addEventListener('click', async () => {
    if (skipped || finished) return;
    skipped = true;
    document.getAnimations().forEach(a => { if (intro.contains(a.effect && a.effect.target)) a.finish(); });
    $$('.intro-text').forEach(t => t.style.opacity = 0);
    [symbol, ...letters].forEach(el => { el.style.opacity = 1; el.style.filter = 'none'; });
    lineWrap.style.opacity = 0; pct.style.opacity = 0;
    halo.style.opacity = '.4';
    try { await burnOut(1500); } catch (e) {}
    finishIntro();
  });

  // ---------- segurança: nada pode prender o visitante ----------
  window.addEventListener('error', () => { if (!finished && !skipped) setTimeout(finishIntro, 300); });
  setTimeout(() => { if (!finished) finishIntro(); }, 32000);
  if (new URLSearchParams(location.search).has('semintro')) { allReady.then(finishIntro); }
  else run().catch(err => { console.error(err); finishIntro(); });

  // ---------- hero: pausa quando sai da tela + sequência no scroll ----------
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { if (hero) hero.setVisible(e.isIntersecting); }, { threshold: 0 }).observe(heroSection);
  }
  const copy = $('#hero-copy'), cue = $('#scroll-cue'), caption = $('#hero-caption');
  let capChars = null, capShown = false, capAnims = [];
  function showCaption(on) {
    if (on === capShown || !caption) return;
    capShown = on;
    if (!capChars) capChars = splitChars(caption, caption.dataset.text);
    capAnims.forEach(a => a.cancel());
    capAnims = on
      ? capChars.map((c, i) => c.animate([{ opacity: 0, filter: 'blur(12px)', transform: 'translateX(.3em)' }, { opacity: 1, filter: 'blur(0)', transform: 'translateX(0)' }], { duration: 900, delay: i * 32, easing: 'cubic-bezier(.2,.65,.25,1)', fill: 'forwards' }))
      : capChars.map((c, i) => c.animate([{ opacity: getComputedStyle(c).opacity, filter: 'blur(0)' }, { opacity: 0, filter: 'blur(10px)' }], { duration: 450, delay: i * 10, fill: 'forwards' }));
  }
  function onScroll() {
    const r = heroSection.getBoundingClientRect();
    const span = Math.max(1, r.height - innerHeight);
    const p = Math.min(1, Math.max(0, -r.top / span));
    if (hero) hero.setScroll(p);
    if (heroRevealed) {
      const f = 1 - Math.min(1, Math.max(0, (p - 0.015) / 0.09));
      copy.style.opacity = f; copy.style.transform = `translateY(${(1 - f) * -18}px)`;
      copy.style.pointerEvents = f < 0.2 ? 'none' : '';
      cue.style.filter = `opacity(${f})`;
    }
    showCaption(p > 0.42 && p < 0.66);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();
})();
