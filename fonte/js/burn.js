/*
  CLAYSP — Transição de queima
  Fotografa a tela da abertura (fundo preto + marca), esconde a versão em HTML
  e queima essa "película" num shader, abrindo um buraco irregular que revela o hero real.
  Faíscas e cinzas são desenhadas num canvas 2D por cima.
*/
(function () {
  'use strict';

  // ---------- ruído 2D que se repete (o mesmo valor é usado no shader e nas faíscas) ----------
  const NS = 256;
  function makeNoise() {
    const lattice = (n, seed) => {
      const a = new Float32Array(n * n);
      let s = seed;
      for (let i = 0; i < a.length; i++) { s = (s * 16807) % 2147483647; a[i] = s / 2147483647; }
      return a;
    };
    const out = new Float32Array(NS * NS);
    let amp = 0.5, tot = 0;
    for (let o = 0, cells = 4; o < 6; o++, cells *= 2) {
      const L = lattice(cells, 1234 + o * 97);
      for (let y = 0; y < NS; y++) {
        const fy = (y / NS) * cells, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < NS; x++) {
          const fx = (x / NS) * cells, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx);
          const i00 = L[(y0 % cells) * cells + (x0 % cells)], i10 = L[(y0 % cells) * cells + ((x0 + 1) % cells)];
          const i01 = L[((y0 + 1) % cells) * cells + (x0 % cells)], i11 = L[((y0 + 1) % cells) * cells + ((x0 + 1) % cells)];
          out[y * NS + x] += amp * ((i00 * (1 - sx) + i10 * sx) * (1 - sy) + (i01 * (1 - sx) + i11 * sx) * sy);
        }
      }
      tot += amp; amp *= 0.52;
    }
    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < out.length; i++) { out[i] /= tot; mn = Math.min(mn, out[i]); mx = Math.max(mx, out[i]); }
    for (let i = 0; i < out.length; i++) out[i] = (out[i] - mn) / (mx - mn);
    return out;
  }
  function sampleNoise(N, u, v) {
    u = ((u % 1) + 1) % 1; v = ((v % 1) + 1) % 1;
    const x = u * NS - 0.5, y = v * NS - 0.5;
    const x0 = Math.floor(x), y0 = Math.floor(y), tx = x - x0, ty = y - y0;
    const g = (i, j) => N[(((j % NS) + NS) % NS) * NS + (((i % NS) + NS) % NS)];
    return (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  }

  const VERT = 'attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }';
  const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uNoise;
uniform float uP;
uniform float uAspect;
uniform vec2 uCenter;
uniform float uTime;

float field(vec2 uv, float logo){
  vec2 q = vec2(uv.x * uAspect, uv.y);
  float n = texture2D(uNoise, q * 0.9).r;
  float n2 = texture2D(uNoise, q * 3.7 + 0.31).r;
  float d = length((uv - uCenter) * vec2(uAspect, 1.0)) / length(vec2(uAspect, 1.0)) * 1.9;
  return d * 0.58 + n * 0.36 + n2 * 0.1 - logo * 0.2;
}

void main(){
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 src = texture2D(uTex, uv);
  float logo = clamp(max(src.r, max(src.g, src.b)) * 1.6, 0.0, 1.0);
  float m = field(uv, logo);
  float e = m - uP;                     // < 0 já queimou
  if (e < -0.012) discard;

  // região que vai escurecendo/chamuscando antes do fogo chegar
  float char = 1.0 - smoothstep(0.0, 0.09, e);
  vec3 col = src.rgb;
  // metal da marca esquenta antes de se desfazer
  float heat = (1.0 - smoothstep(0.0, 0.07, e)) * logo;
  col = mix(col, col * vec3(1.6, 0.85, 0.45) + vec3(0.25, 0.08, 0.0) * heat, heat);
  col = mix(col, vec3(0.03, 0.012, 0.004), char * 0.85 * (1.0 - logo * 0.6));
  col += vec3(0.09, 0.03, 0.0) * char * (0.4 + 0.6 * texture2D(uNoise, uv * vec2(uAspect,1.0) * 9.0).r) * (1.0 - smoothstep(0.03, 0.09, e));

  // borda incandescente
  float rim = 1.0 - smoothstep(0.0, 0.016, abs(e - 0.002));
  float flick = 0.75 + 0.25 * sin(uTime * 23.0 + uv.x * 60.0 + uv.y * 41.0);
  vec3 hot = mix(vec3(1.0, 0.36, 0.06), vec3(1.0, 0.86, 0.55), smoothstep(0.004, -0.008, e));
  col += hot * rim * 2.2 * flick;

  float a = smoothstep(-0.012, -0.002, e);
  gl_FragColor = vec4(col * a, a);
}`;

  function burn(opts) {
    const { duration = 2900, onStart, hideSource } = opts;
    return new Promise((resolve) => {
      const W = window.innerWidth, H = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);

      // 1) foto da abertura
      const cap = document.createElement('canvas');
      cap.width = Math.round(W * dpr); cap.height = Math.round(H * dpr);
      const cx = cap.getContext('2d');
      cx.fillStyle = '#000'; cx.fillRect(0, 0, cap.width, cap.height);
      cx.scale(dpr, dpr);
      (opts.paint || (() => {}))(cx);

      // 2) canvas do shader
      const cvs = document.createElement('canvas');
      cvs.id = 'burn';
      cvs.width = cap.width; cvs.height = cap.height;
      const gl = cvs.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
      const emb = document.createElement('canvas');
      emb.id = 'embers';
      emb.width = cap.width; emb.height = cap.height;
      const ex = emb.getContext('2d');

      const finish = () => { cvs.remove(); emb.remove(); resolve(); };

      if (!gl) { // sem WebGL: abertura circular simples
        hideSource();
        onStart && onStart();
        const ov = document.getElementById('intro');
        ov.style.display = 'grid';
        ov.animate([{ clipPath: 'circle(150% at 50% 50%)' }, { clipPath: 'circle(0% at 50% 50%)' }], { duration: 1200, easing: 'cubic-bezier(.6,0,.3,1)' }).finished.then(resolve);
        return;
      }

      document.body.appendChild(cvs);
      document.body.appendChild(emb);

      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog); gl.useProgram(prog);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'aPos'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      const tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      const N = burn.noise || (burn.noise = makeNoise());
      const nb = new Uint8Array(NS * NS);
      for (let i = 0; i < nb.length; i++) nb[i] = Math.round(N[i] * 255);
      const nt = gl.createTexture(); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, nt);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, NS, NS, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, nb);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

      const U = n => gl.getUniformLocation(prog, n);
      gl.uniform1i(U('uTex'), 0); gl.uniform1i(U('uNoise'), 1);
      const aspect = W / H;
      gl.uniform1f(U('uAspect'), aspect);
      const center = opts.center || [0.5, 0.45];
      gl.uniform2f(U('uCenter'), center[0], center[1]);
      gl.viewport(0, 0, cvs.width, cvs.height);
      gl.clearColor(0, 0, 0, 0);

      // brilho da marca (para soltar faíscas prateadas onde ela queima)
      const small = document.createElement('canvas'); small.width = 160; small.height = Math.max(1, Math.round(160 / aspect));
      const sx = small.getContext('2d'); sx.drawImage(cap, 0, 0, small.width, small.height);
      const lum = sx.getImageData(0, 0, small.width, small.height).data;
      const logoAt = (u, v) => { const i = (Math.min(small.height - 1, (v * small.height) | 0) * small.width + Math.min(small.width - 1, (u * small.width) | 0)) * 4; return Math.min(1, Math.max(lum[i], lum[i + 1], lum[i + 2]) / 255 * 1.6); };
      const field = (u, v) => {
        const lg = logoAt(u, v);
        const qx = u * aspect, qy = v;
        const n = sampleNoise(N, qx * 0.9, qy * 0.9), n2 = sampleNoise(N, qx * 3.7 + 0.31, qy * 3.7 + 0.31);
        const d = Math.hypot((u - center[0]) * aspect, v - center[1]) / Math.hypot(aspect, 1) * 1.9;
        return d * 0.58 + n * 0.36 + n2 * 0.1 - lg * 0.2;
      };

      hideSource();
      onStart && onStart();

      const parts = [];
      const PMIN = -0.12, PMAX = 1.42;
      const t0 = performance.now();
      let raf;
      const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      function frame(now) {
        const k = Math.min(1, (now - t0) / duration);
        const p = PMIN + (PMAX - PMIN) * ease(k);
        gl.uniform1f(U('uP'), p);
        gl.uniform1f(U('uTime'), (now - t0) / 1000);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // faíscas na frente do fogo
        if (k < 1) {
          for (let tries = 0; tries < 260; tries++) {
            const u = Math.random(), v = Math.random();
            const e = field(u, v) - p;
            if (e > -0.004 && e < 0.012) {
              const lg = logoAt(u, v);
              const silver = lg > 0.25 && Math.random() < 0.7;
              const ang = Math.atan2(v - center[1], (u - center[0]) * aspect) + (Math.random() - 0.5) * 1.6;
              const sp = (silver ? 50 : 26) + Math.random() * 60;
              parts.push({
                x: u * W, y: v * H, vx: Math.cos(ang) * sp * 0.6, vy: Math.sin(ang) * sp * 0.6 - 30 - Math.random() * 40,
                life: 0, max: 0.5 + Math.random() * (silver ? 0.9 : 1.2), size: silver ? 0.8 + Math.random() * 1.4 : 0.6 + Math.random() * 1.8,
                kind: silver ? 1 : (Math.random() < 0.12 ? 2 : 0), rot: Math.random() * 6,
              });
              if (parts.length > 700) parts.shift();
            }
          }
        }
        ex.setTransform(dpr, 0, 0, dpr, 0, 0);
        ex.clearRect(0, 0, W, H);
        const dt = 1 / 60;
        ex.globalCompositeOperation = 'lighter';
        for (let i = parts.length - 1; i >= 0; i--) {
          const q = parts[i];
          q.life += dt;
          if (q.life >= q.max) { parts.splice(i, 1); continue; }
          q.vy -= 22 * dt; q.vx *= 0.985; q.vy *= 0.985;
          q.x += q.vx * dt; q.y += q.vy * dt; q.rot += dt * 3;
          const f = 1 - q.life / q.max;
          if (q.kind === 2) continue; // cinza é desenhada depois, sem soma de luz
          const c = q.kind === 1 ? `rgba(255,${235 + 20 * f | 0},${210 + 40 * f | 0},${f})` : `rgba(255,${120 + 110 * f | 0},${30 + 40 * f | 0},${f * 0.95})`;
          ex.fillStyle = c;
          ex.beginPath(); ex.arc(q.x, q.y, q.size * (0.5 + f * 0.6), 0, 6.283); ex.fill();
        }
        ex.globalCompositeOperation = 'source-over';
        for (const q of parts) {
          if (q.kind !== 2) continue;
          const f = 1 - q.life / q.max;
          ex.save(); ex.translate(q.x, q.y); ex.rotate(q.rot);
          ex.fillStyle = `rgba(70,62,58,${f * 0.8})`; ex.fillRect(-q.size, -q.size * 0.5, q.size * 2.2, q.size);
          ex.restore();
        }
        if (k < 1 || parts.length) raf = requestAnimationFrame(frame);
        else finish();
      }
      raf = requestAnimationFrame(frame);
      // garantia: nunca fica preso
      setTimeout(() => { cancelAnimationFrame(raf); finish(); }, duration + 3500);
    });
  }

  window.ClayBurn = { burn };
})();
