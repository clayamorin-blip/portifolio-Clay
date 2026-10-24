/*
  CLAYSP — Hero 3D (WebGL2, sem bibliotecas)
  - Mão humana esculpida do zero (malha com ossos: cada dedo dobra de verdade)
  - Pele: subsuperfície aproximada, poros, rugas nas articulações, unhas, sombras
  - Terra: textura própria, nuvens, oceano com reflexo, luzes noturnas, atmosfera
  - Scroll: a mão desce, agarra o globo e sobe levando a Terra
*/
(function () {
  'use strict';

  // ================= matemática =================
  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: a => Math.hypot(a[0], a[1], a[2]),
    norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  };
  const Q = {
    axis(ax, ang) { const s = Math.sin(ang / 2), n = V.norm(ax); return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)]; },
    mul(a, b) {
      return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
        a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
    },
    euler(x, y, z) { return Q.mul(Q.mul(Q.axis([0, 1, 0], y), Q.axis([1, 0, 0], x)), Q.axis([0, 0, 1], z)); },
    slerp(a, b, t) {
      let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; let bb = b;
      if (d < 0) { d = -d; bb = b.map(x => -x); }
      if (d > 0.9995) { const r = a.map((x, i) => x + (bb[i] - x) * t); const l = Math.hypot(...r); return r.map(x => x / l); }
      const th = Math.acos(d), s = Math.sin(th), w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
      return a.map((x, i) => x * w1 + bb[i] * w2);
    },
  };
  const M = {
    ident: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    mul(a, b) { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; },
    trs(t, q, s) {
      const [x, y, z, w] = q, x2 = x + x, y2 = y + y, z2 = z + z;
      const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
      return [(1 - (yy + zz)) * s, (xy + wz) * s, (xz - wy) * s, 0, (xy - wz) * s, (1 - (xx + zz)) * s, (yz + wx) * s, 0,
        (xz + wy) * s, (yz - wx) * s, (1 - (xx + yy)) * s, 0, t[0], t[1], t[2], 1];
    },
    persp(fy, asp, n, f) { const t = 1 / Math.tan(fy / 2); return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) / (n - f), -1, 0, 0, 2 * f * n / (n - f), 0]; },
    ortho(l, r, b, t, n, f) { return [2 / (r - l), 0, 0, 0, 0, 2 / (t - b), 0, 0, 0, 0, -2 / (f - n), 0, -(r + l) / (r - l), -(t + b) / (t - b), -(f + n) / (f - n), 1]; },
    look(e, c, up) {
      const z = V.norm(V.sub(e, c)), x = V.norm(V.cross(up, z)), y = V.cross(z, x);
      return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -V.dot(x, e), -V.dot(y, e), -V.dot(z, e), 1];
    },
  };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  // ================= shaders =================
  const COMMON = `
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
vec3 toSRGB(vec3 c){ return pow(c, vec3(1.0/2.2)); }
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
float hash3(vec3 p){ p = fract(p*0.3183099+0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x), mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x), mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y), f.z);
}
float shadowPCF(sampler2DShadow sm, vec4 lp, float bias){
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0 || p.z > 1.0) return 1.0;
  float s = 0.0; vec2 ts = vec2(1.0) / vec2(textureSize(sm, 0));
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++)
    s += texture(sm, vec3(p.xy + vec2(x, y) * ts * 1.25, p.z - bias));
  return s / 25.0;
}`;

  const HAND_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in uvec2 aBones;
layout(location=3) in float aW;
layout(location=4) in vec4 aM0;   // ao, espessura, unha, ponta livre
layout(location=5) in float aWu;  // coordenada da ruga
layout(location=6) in vec3 aM1;   // máscara ruga, vermelhidão, -
uniform vec3 uMin, uMax;
uniform mat4 uBones[24];
uniform mat4 uModel, uVP, uLightVP;
out vec3 vW, vN, vRest;
out vec4 vM0, vLP;
out float vWu;
out vec3 vM1;
void main(){
  vec3 p = mix(uMin, uMax, aPos);
  mat4 sk = uBones[aBones.x] * aW + uBones[aBones.y] * (1.0 - aW);
  vec4 wp = uModel * (sk * vec4(p, 1.0));
  vW = wp.xyz;
  vN = normalize(mat3(uModel) * (mat3(sk) * aNrm));
  vRest = p; vM0 = aM0; vWu = aWu; vM1 = aM1;
  vLP = uLightVP * wp;
  gl_Position = uVP * wp;
}`;
  const HAND_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vW, vN, vRest; in vec4 vM0, vLP; in float vWu; in vec3 vM1;
uniform vec3 uCam, uKeyDir, uKeyCol, uFillDir, uFillCol, uRimDir, uRimCol;
uniform sampler2DShadow uShadow;
uniform float uFade, uExposure;
out vec4 frag;
${COMMON}
float heightAt(vec3 r, float wu, float wm){
  // poros + microrelevo + rugas nas articulações (em cm, espaço de repouso)
  float pores = vnoise(r * 9.0) * 0.55 + vnoise(r * 21.0) * 0.45;
  float micro = vnoise(r * vec3(2.2, 6.0, 2.2));
  float wob = vnoise(r * 1.7) * 0.9;
  float per = 0.17 + 0.07 * vnoise(r * 2.3 + 3.0);
  float lines = sin((wu + wob * 0.14 + (vnoise(r * 5.0) - 0.5) * 0.08) * 6.2831 / per);
  float aa = 1.0 - smoothstep(0.025, 0.07, fwidth(wu));
  lines = smoothstep(0.25, 1.0, lines) * wm * aa * smoothstep(0.25, 0.6, vnoise(r * 3.3 + 11.0));
  return pores * 0.010 + micro * 0.012 - lines * 0.016;
}
vec3 perturb(vec3 N, vec3 P, float h){
  vec3 dpx = dFdx(P), dpy = dFdy(P);
  float dhx = dFdx(h), dhy = dFdy(h);
  vec3 r1 = cross(dpy, N), r2 = cross(N, dpx);
  float det = dot(dpx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * N - g);
}
float D_GGX(float NoH, float a){ float a2 = a*a; float d = NoH*NoH*(a2-1.0)+1.0; return a2/(3.14159*d*d); }
float G_S(float NoV, float NoL, float a){ float k = a*0.5; return NoV/(NoV*(1.0-k)+k) * NoL/(NoL*(1.0-k)+k); }
vec3 spec(vec3 N, vec3 Vv, vec3 L, float rough, float F0){
  vec3 H = normalize(L + Vv);
  float NoL = max(dot(N, L), 0.0), NoV = max(dot(N, Vv), 1e-3), NoH = max(dot(N, H), 0.0), VoH = max(dot(Vv, H), 0.0);
  float a = rough * rough;
  float F = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
  return vec3(D_GGX(NoH, a) * G_S(NoV, NoL, a) * F / max(4.0 * NoV, 1e-3)) ;
}
vec3 skinDiffuse(vec3 N, vec3 L, float sh){
  float d = dot(N, L);
  // difusão com "wrap" por canal: o vermelho atravessa a pele e suaviza o terminador
  vec3 w = vec3(0.42, 0.20, 0.13);
  vec3 r = clamp((vec3(d) + w) / (1.0 + w), 0.0, 1.0);
  r = r * r;
  // dentro da sombra, deixa passar um pouco de vermelho (espalhamento)
  vec3 shc = mix(vec3(sh), vec3(1.0), vec3(0.22, 0.06, 0.03) * (1.0 - sh));
  return r * mix(shc, vec3(sh), step(0.0, -d) * 0.0);
}
void main(){
  vec3 N = normalize(vN);
  vec3 Vv = normalize(uCam - vW);
  if (!gl_FrontFacing) N = -N;
  float ao = vM0.x, thick = vM0.y, nail = smoothstep(0.2, 0.85, vM0.z), tip = vM0.w;
  float wm = vM1.x, red = vM1.y;
  float h = heightAt(vRest, vWu, wm * (1.0 - nail));
  h = mix(h, vnoise(vRest * vec3(30.0, 4.0, 30.0)) * 0.006, nail);
  vec3 Nb = perturb(N, vW, h * 0.1);

  // cor da pele (linear) com variação natural
  vec3 base = toLin(vec3(0.80, 0.60, 0.50));
  float mott = vnoise(vRest * 0.9) * 0.6 + vnoise(vRest * 3.1) * 0.4;
  base *= 0.92 + 0.14 * mott;
  base = mix(base, toLin(vec3(0.82, 0.50, 0.44)), clamp(red * 0.75, 0.0, 1.0));
  base = mix(base, toLin(vec3(0.70, 0.52, 0.45)), smoothstep(0.55, 0.9, vnoise(vRest*0.5)) * 0.25);
  vec3 nailCol = toLin(vec3(0.82, 0.57, 0.53)) * (0.92 + 0.12 * vnoise(vRest * vec3(40.0, 3.0, 40.0)));
  nailCol = mix(nailCol, toLin(vec3(0.90, 0.80, 0.74)), tip * 0.8);
  vec3 alb = mix(base, nailCol, nail);
  float rough = mix(0.56 - 0.06 * mott, 0.36, nail);
  float rough2 = 0.30;

  float sh = shadowPCF(uShadow, vLP, 0.0016);
  vec3 col = vec3(0.0);
  // luz principal
  vec3 dK = mix(skinDiffuse(Nb, uKeyDir, sh), vec3(max(dot(Nb, uKeyDir), 0.0) * sh), nail);
  col += alb * dK * uKeyCol;
  float NoLk = max(dot(Nb, uKeyDir), 0.0);
  col += (spec(Nb, Vv, uKeyDir, rough, 0.028) * 0.75 + spec(Nb, Vv, uKeyDir, rough2, 0.028) * 0.25 * (1.0 - nail)) * NoLk * sh * uKeyCol;
  // preenchimento
  col += alb * skinDiffuse(Nb, uFillDir, 1.0) * uFillCol * mix(1.0, ao, 0.7);
  // contraluz (borda) + translucidez nas partes finas
  float NoLr = max(dot(Nb, uRimDir), 0.0);
  col += alb * NoLr * uRimCol * 0.6;
  col += spec(Nb, Vv, uRimDir, 0.38, 0.028) * NoLr * uRimCol * 1.4;
  float trans = pow(clamp(dot(Vv, -normalize(uRimDir + Nb * 0.35)), 0.0, 1.0), 3.0) * (1.0 - thick);
  col += trans * vec3(1.0, 0.30, 0.16) * uRimCol * 0.35 * (1.0 - nail);
  float transK = pow(clamp(dot(Vv, -normalize(uKeyDir + Nb * 0.3)), 0.0, 1.0), 4.0) * (1.0 - thick);
  col += transK * vec3(1.0, 0.28, 0.14) * uKeyCol * 0.12;
  // ambiente (céu escuro / reflexo azul da Terra embaixo)
  vec3 amb = mix(vec3(0.020, 0.028, 0.050), vec3(0.030, 0.026, 0.024), Nb.y * 0.5 + 0.5);
  amb += vec3(0.02, 0.05, 0.11) * clamp(-Nb.y, 0.0, 1.0);
  col += alb * amb * ao;
  // fresnel de pele (leve brilho na silhueta)
  float fr = pow(1.0 - max(dot(Nb, Vv), 0.0), 4.0);
  col += fr * 0.05 * ao * vec3(0.8, 0.85, 1.0);
  col *= mix(0.55, 1.0, ao);

  // o antebraço se dissolve na escuridão
  col *= 1.0 - smoothstep(4.0, 11.5, vRest.y);
  col = aces(col * uExposure);
  frag = vec4(toSRGB(col) * uFade, 1.0);
}`;
  const DEPTH_VS = HAND_VS.replace('out vec3 vW, vN, vRest;', 'out vec3 vW, vN, vRest;').replace('gl_Position = uVP * wp;', 'gl_Position = uLightVP * wp;');
  const DEPTH_FS = `#version 300 es
precision mediump float; out vec4 frag; void main(){ frag = vec4(1.0); }`;

  const GLOBE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uModel, uVP, uLightVP;
out vec3 vW, vN; out vec2 vUv; out vec4 vLP;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vW = wp.xyz; vN = normalize(mat3(uModel) * aPos); vUv = aUv;
  vLP = uLightVP * wp;
  gl_Position = uVP * wp;
}`;
  const GLOBE_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vW, vN; in vec2 vUv; in vec4 vLP;
uniform sampler2D uDay, uClouds, uSpec;
uniform sampler2DShadow uShadow;
uniform vec3 uCam, uSun, uKeyCol;
uniform float uCloudOff, uFade, uExposure, uTime;
out vec4 frag;
${COMMON}
void main(){
  vec3 N = normalize(vN);
  vec3 Vv = normalize(uCam - vW);
  vec3 day = toLin(texture(uDay, vUv).rgb);
  float water = texture(uSpec, vUv).r;
  vec2 cuv = vec2(vUv.x + uCloudOff, vUv.y);
  float cl = texture(uClouds, cuv).r;
  float clShadow = texture(uClouds, cuv + vec2(0.003, 0.002)).r;
  float NoL = dot(N, uSun);
  float lit = smoothstep(-0.12, 0.35, NoL);
  float sh = shadowPCF(uShadow, vLP, 0.0025);
  float light = lit * mix(0.18, 1.0, sh);
  vec3 col = day * (1.0 - clShadow * 0.55) * light * uKeyCol * 1.15;
  // oceano: reflexo do sol
  vec3 H = normalize(uSun + Vv);
  float sp = pow(max(dot(N, H), 0.0), 60.0) * water * lit * sh;
  col += vec3(1.0, 0.88, 0.7) * sp * 0.45 * (1.0 - cl);
  col += vec3(0.25, 0.4, 0.6) * pow(max(dot(N, H), 0.0), 12.0) * water * lit * 0.08;
  // nuvens
  col = mix(col, vec3(0.95, 0.96, 1.0) * light * uKeyCol, cl * 0.92);
  // luzes das cidades no lado noturno
  float night = smoothstep(0.08, -0.25, NoL);
  vec3 sp3 = N * 420.0;
  float city = smoothstep(0.82, 0.98, vnoise(sp3)) * smoothstep(0.45, 0.8, vnoise(N * 37.0)) * (1.0 - water);
  col += vec3(1.0, 0.62, 0.28) * city * night * 0.9 * (1.0 - cl);
  // atmosfera na borda
  float NoV = max(dot(N, Vv), 0.0);
  float rim = pow(1.0 - NoV, 3.0);
  col += vec3(0.28, 0.52, 1.0) * rim * (0.12 + 0.95 * smoothstep(-0.3, 0.6, NoL));
  col = mix(col, col * vec3(0.8, 0.9, 1.2) + vec3(0.01, 0.02, 0.05) * lit, 0.25);
  col = aces(col * uExposure);
  frag = vec4(toSRGB(col) * uFade, 1.0);
}`;
  const ATMO_FS = `#version 300 es
precision highp float;
in vec3 vW, vN; in vec2 vUv; in vec4 vLP;
uniform vec3 uCam, uSun; uniform float uFade;
out vec4 frag;
void main(){
  vec3 N = normalize(vN); vec3 Vv = normalize(uCam - vW);
  float d = max(-dot(N, Vv), 0.0);
  float g = pow(d, 2.2) * 2.2 * smoothstep(0.0, 0.33, d);
  float s = smoothstep(-0.45, 0.7, dot(N, uSun)) * 0.9 + 0.1;
  vec3 c = vec3(0.30, 0.55, 1.0) * g * s;
  frag = vec4(c * uFade, 0.0);
}`;
  const STAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aS;
uniform mat4 uVP; uniform float uTime, uPx;
out float vA;
void main(){
  vec4 p = uVP * vec4(aS.xyz, 1.0);
  gl_Position = p;
  float tw = 0.6 + 0.4 * sin(uTime * (0.6 + fract(aS.w * 7.3) * 2.0) + aS.w * 40.0);
  vA = fract(aS.w) * tw;
  gl_PointSize = (0.8 + fract(aS.w * 13.1) * 1.6) * uPx;
}`;
  const STAR_FS = `#version 300 es
precision mediump float; in float vA; uniform float uFade; out vec4 frag;
void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); frag = vec4(vec3(0.85, 0.9, 1.0) * a * vA * 0.75 * uFade, 0.0); }`;

  // ================= utilidades GL =================
  function compile(gl, vs, fs) {
    const mk = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o) + '\n' + s.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n')); return o; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const U = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); U[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
    return { p, U };
  }
  function loadImage(src) {
    return new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
  }
  function texFrom(gl, img, wrapS) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS || gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const ext = gl.getExtension('EXT_texture_filter_anisotropic');
    if (ext) gl.texParameterf(gl.TEXTURE_2D, ext.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    return t;
  }
  async function loadHandBuffer(url) {
    if (location.protocol !== 'file:') {
      try { const r = await fetch(url); if (r.ok) return await r.arrayBuffer(); } catch (e) { /* tenta a versão embutida */ }
    }
    if (!window.CLAY_HAND_B64) {
      await new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'js/hand-data.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    }
    const bin = atob(window.CLAY_HAND_B64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }

  // ================= esqueleto da mão =================
  function buildRig(meta) {
    const bones = meta.bones.map((b, i) => {
      const d = V.norm(V.sub(b.tail, b.head));
      const isThumb = b.name.startsWith('thumb');
      const up = isThumb ? V.norm([0.55, 0, 0.85]) : [0, 0, 1];
      const side = V.norm(V.cross(d, up));
      const dors = V.cross(side, d);
      return { ...b, i, d, side, dors };
    });
    const byName = {}; bones.forEach(b => { byName[b.name] = b; });
    return { bones, byName };
  }
  // pose: { wristFlex, wristDev, wristTwist, curl: {index:[a,b,c],...}, spread, thumb:[opp, a0, a1, a2] }
  function rigMatrices(rig, pose) {
    const out = new Float32Array(24 * 16);
    const world = [];
    for (const b of rig.bones) {
      let q = [0, 0, 0, 1];
      const nm = b.name;
      if (nm === 'hand') {
        q = Q.mul(Q.axis([1, 0, 0], pose.wristFlex || 0), Q.mul(Q.axis([0, 0, 1], pose.wristDev || 0), Q.axis([0, 1, 0], pose.wristTwist || 0)));
      } else if (nm.startsWith('thumb')) {
        const k = +nm.slice(5); const t = pose.thumb || [0, 0, 0, 0];
        q = Q.axis(V.mul(b.side, -1), t[k + 1] || 0);
        if (k === 0) q = Q.mul(Q.axis([0, 1, 0.2], t[0] || 0), q);
      } else if (nm !== 'arm') {
        const fname = nm.slice(0, -1), k = +nm.slice(-1);
        const c = (pose.curl && pose.curl[fname]) || [0, 0, 0];
        q = Q.axis(V.mul(b.side, -1), c[k]);
        if (k === 0) {
          const spreadSign = { index: 1, middle: 0.15, ring: -0.6, little: -1.25 }[fname];
          q = Q.mul(Q.axis(b.dors, (pose.spread || 0) * spreadSign), q);
        }
      }
      const L = M.mul(M.mul(M.trs(b.head, [0, 0, 0, 1], 1), M.trs([0, 0, 0], q, 1)), M.trs(V.mul(b.head, -1), [0, 0, 0, 1], 1));
      const W = b.parent >= 0 ? M.mul(world[b.parent], L) : L;
      world[b.i] = W;
      out.set(W, b.i * 16);
    }
    return out;
  }

  // ================= poses (ajustadas à mão) =================
  const POSE_REACH = {
    pos: [0.30, 3.40, 0.25], rot: [-0.18, -0.85, 0.10],
    wristFlex: -0.08, wristDev: 0.0, wristTwist: 0,
    spread: 0.18,
    curl: { index: [0.16, 0.24, 0.16], middle: [0.22, 0.32, 0.20], ring: [0.30, 0.40, 0.24], little: [0.38, 0.48, 0.28] },
    thumb: [0.10, 0.10, 0.08, 0.12],
  };
  const POSE_OPEN = {
    pos: [0.30, 2.55, 0.25], rot: [-0.40, -0.85, 0.05],
    wristFlex: -0.20, wristDev: 0, wristTwist: 0,
    spread: 0.32,
    curl: { index: [0.04, 0.08, 0.05], middle: [0.05, 0.10, 0.05], ring: [0.07, 0.12, 0.07], little: [0.09, 0.14, 0.08] },
    thumb: [0.0, -0.15, 0.05, 0.05],
  };
  const POSE_GRAB = {
    pos: [0.22, 1.33, -0.70], rot: [-0.64, -0.30, 0.0],
    wristFlex: -0.56, wristDev: 0.04, wristTwist: 0,
    spread: 0.30,
    curl: { index: [0.38, 0.56, 0.36], middle: [0.42, 0.58, 0.37], ring: [0.46, 0.62, 0.38], little: [0.54, 0.66, 0.40] },
    thumb: [0.7, 0.35, 0.45, 0.35],
  };
  if (window.CLAY_POSE_OVERRIDE) Object.assign(POSE_GRAB, window.CLAY_POSE_OVERRIDE);
  function lerpPose(a, b, t) {
    const o = { pos: V.lerp(a.pos, b.pos, t), rot: a.rot.map((x, i) => mix(x, b.rot[i], t)) };
    ['wristFlex', 'wristDev', 'wristTwist', 'spread'].forEach(k => { o[k] = mix(a[k], b[k], t); });
    o.curl = {}; for (const f in a.curl) o.curl[f] = a.curl[f].map((x, i) => mix(x, b.curl[f][i], t));
    o.thumb = a.thumb.map((x, i) => mix(x, b.thumb[i], t));
    return o;
  }

  const HAND_SCALE = 0.125;
  // ================= cena =================
  function create(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL2 indisponível');
    const isMobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    const qs = new URLSearchParams(location.search);

    const progHand = compile(gl, HAND_VS, HAND_FS);
    const progDepth = compile(gl, DEPTH_VS, DEPTH_FS);
    const progGlobe = compile(gl, GLOBE_VS, GLOBE_FS);
    const progAtmo = compile(gl, GLOBE_VS, ATMO_FS);
    const progStar = compile(gl, STAR_VS, STAR_FS);

    // ---- globo ----
    const SEG_U = isMobile ? 96 : 160, SEG_V = isMobile ? 48 : 80;
    const gp = [], gi = [];
    for (let y = 0; y <= SEG_V; y++) for (let x = 0; x <= SEG_U; x++) {
      const u = x / SEG_U, v = y / SEG_V, th = u * Math.PI * 2, ph = v * Math.PI;
      gp.push(-Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph), u, v);
    }
    for (let y = 0; y < SEG_V; y++) for (let x = 0; x < SEG_U; x++) {
      const a = y * (SEG_U + 1) + x, b = a + SEG_U + 1;
      gi.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const globeVAO = gl.createVertexArray(); gl.bindVertexArray(globeVAO);
    const gvb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gvb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gp), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    const gib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(gi), gl.STATIC_DRAW);
    const globeCount = gi.length;
    gl.bindVertexArray(null);

    // ---- estrelas ----
    const NST = isMobile ? 500 : 1100; const st = new Float32Array(NST * 4);
    for (let i = 0; i < NST; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 40;
      const s = Math.sqrt(1 - u * u);
      st.set([Math.cos(a) * s * r, u * r, -Math.abs(Math.sin(a) * s * r) - 6, Math.random() * 0.999], i * 4);
    }
    const starVAO = gl.createVertexArray(); gl.bindVertexArray(starVAO);
    const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.bufferData(gl.ARRAY_BUFFER, st, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // ---- sombra ----
    const SM = isMobile ? 1024 : 2048;
    const smTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, smTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const smFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, smFB);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, smTex, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // ---- estado ----
    let hand = null, rig = null, texDay = null, texCl = null, texSpec = null;
    let W = 1, H = 1, dpr = 1;
    let warm = 0, running = false, visible = true, fade = 1, intro = 0, introT0 = 0, started = false;
    let scrollTarget = 0, scrollP = 0;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, near: 0 };
    let earthRot = +(qs.get('er') || -0.6), cloudOff = 0, last = performance.now(), time = 0, raf = 0;

    // luzes
    const keyDir = V.norm([-0.62, 0.68, 0.36]);
    const keyCol = [2.7, 2.5, 2.25];
    const fillDir = V.norm([0.7, -0.15, 0.6]);
    const fillCol = [0.10, 0.13, 0.20];
    const rimDir = V.norm([0.75, 0.25, -0.62]);
    const rimCol = [0.85, 1.05, 1.5];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.6 : 2);
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(r.width * dpr)); H = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    }
    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('pointermove', e => {
      pointer.tx = (e.clientX / innerWidth) * 2 - 1; pointer.ty = (e.clientY / innerHeight) * 2 - 1;
    }, { passive: true });

    const ready = (async () => {
      const A = window.CLAY_ASSETS || {};
      const [buf, meta, iDay, iCl, iSp] = await Promise.all([
        loadHandBuffer(opts.handUrl || 'assets/hand.bin'),
        Promise.resolve(window.CLAY_HAND_META || fetch('assets/hand.json').then(r => r.json())),
        loadImage(A.earthDay || 'assets/earth_day.jpg'),
        loadImage(A.earthClouds || 'assets/earth_clouds.jpg'),
        loadImage(A.earthSpec || 'assets/earth_spec.jpg'),
      ]);
      texDay = texFrom(gl, iDay); texCl = texFrom(gl, iCl); texSpec = texFrom(gl, iSp);
      // malha da mão
      const dv = new DataView(buf);
      const nv = dv.getUint32(4, true), ni = dv.getUint32(8, true);
      const mn = [dv.getFloat32(12, true), dv.getFloat32(16, true), dv.getFloat32(20, true)];
      const mx = [dv.getFloat32(24, true), dv.getFloat32(28, true), dv.getFloat32(32, true)];
      const stride = meta.stride, off = 36;
      const vbytes = new Uint8Array(buf, off, nv * stride);
      const ibytes = buf.slice(off + nv * stride);
      const idx16 = nv < 65536 && meta.idx16;
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, vbytes, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, stride, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, stride, 6);
      gl.enableVertexAttribArray(2); gl.vertexAttribIPointer(2, 2, gl.UNSIGNED_BYTE, stride, 9);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.UNSIGNED_BYTE, true, stride, 11);
      gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 4, gl.UNSIGNED_BYTE, true, stride, 12);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 1, gl.BYTE, true, stride, 16);
      gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 3, gl.UNSIGNED_BYTE, true, stride, 17);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx16 ? new Uint16Array(ibytes) : new Uint32Array(ibytes), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      hand = { vao, count: ni, type: idx16 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, mn, mx };
      rig = buildRig(meta);
    })();

    // ---- pose em função do scroll ----
    function computePose(p, t) {
      // 0 → 0.10: parada, tentando alcançar · 0.10 → 0.30: abre a mão e desce · 0.30 → 0.48: fecha em volta do globo
      // 0.48 → 0.56: segura firme · 0.56 → 1: sobe levando a Terra
      const a = sstep(0.06, 0.30, p), b = sstep(0.28, 0.48, p), lift = ease(clamp((p - 0.56) / 0.44, 0, 1));
      let pose = lerpPose(POSE_REACH, POSE_OPEN, a);
      pose = lerpPose(pose, POSE_GRAB, b);
      // respiração / tentativa de alcançar (some quando agarra)
      const idle = 1 - a;
      const br = Math.sin(t * 0.9) * 0.5 + 0.5;
      pose.pos = V.add(pose.pos, [Math.sin(t * 0.45) * 0.03 * idle, -br * 0.09 * idle, 0]);
      for (const f in pose.curl) {
        const ph = { index: 0, middle: 0.6, ring: 1.2, little: 1.8 }[f];
        const w = Math.sin(t * 1.3 + ph) * 0.05 * idle + pointer.near * 0.12 * idle;
        pose.curl[f] = pose.curl[f].map((c, i) => c + w * (i + 1) * 0.5);
      }
      pose.spread += pointer.near * 0.08 * idle;
      // segue levemente o cursor
      pose.rot = [pose.rot[0] + pointer.y * 0.06 * idle, pose.rot[1] + pointer.x * 0.12 * idle, pose.rot[2] - pointer.x * 0.05 * idle];
      pose.pos = V.add(pose.pos, [pointer.x * 0.12 * idle, -pointer.y * 0.05 * idle, 0]);
      // aperto
      const squeeze = sstep(0.46, 0.52, p) * (1 - sstep(0.52, 0.6, p));
      for (const f in pose.curl) pose.curl[f] = pose.curl[f].map(c => c + squeeze * 0.05);
      // subida
      const globePos = [0, -0.12 + lift * 4.4, 0];
      pose.pos = V.add(pose.pos, [0, lift * 4.4, 0]);
      pose.rot = [pose.rot[0] + lift * 0.18, pose.rot[1], pose.rot[2]];
      // entrada (depois da queima): a mão desce do topo
      const k = ease(intro);
      pose.pos = V.add(pose.pos, [0, (1 - k) * 2.6, 0]);
      return { pose, globePos, grip: b, lift };
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; time += dt;
      if (!visible || !hand) return;
      // enquanto a abertura cobre a tela, desenha só 2 quadros (aquece shaders e texturas) e espera
      if (!started && !qs.has('p')) { if (warm >= 2) return; warm++; }
      if (started) intro = Math.min(1, (now - introT0) / 2200);
      if (qs.has('p')) { scrollTarget = +qs.get('p'); intro = 1; }
      scrollP += (scrollTarget - scrollP) * (1 - Math.exp(-dt * 5.5));
      pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
      pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
      const nearT = clamp(1 - Math.hypot(pointer.x - 0.0, pointer.y + 0.45) / 0.7, 0, 1);
      pointer.near += (nearT - pointer.near) * (1 - Math.exp(-dt * 4));
      const { pose, globePos, grip } = computePose(scrollP, time);
      earthRot += dt * 0.07 * (1 - grip);
      cloudOff += dt * 0.004 * (1 - grip * 0.8);
      draw(pose, globePos);
    }

    function camera() {
      const asp = W / H;
      const fov = 30 * Math.PI / 180;
      // enquadra o globo e a mão em qualquer proporção de tela
      const needH = 4.1, needW = 2.9;
      const distH = (needH / 2) / Math.tan(fov / 2);
      const distW = (needW / 2) / (Math.tan(fov / 2) * asp);
      const dist = Math.max(distH, distW) * (asp < 0.8 ? 1.0 : 1.04);
      const z = +(qs.get('zoom') || 1), ty = qs.has('ty') ? +qs.get('ty') : 0.62;
      // em telas largas a cena fica à direita (o texto ocupa a esquerda) e volta ao centro ao rolar
      const shift = (asp > 1.15 ? -Math.min(1.25, (asp - 1.15) * 1.6 + 0.55) : 0) * (1 - sstep(0.02, 0.2, scrollP));
      const lift0 = (asp < 0.8 ? -0.55 : 0) * (1 - sstep(0.02, 0.2, scrollP));
      let eye = [shift + (+(qs.get('cx') || 0)), 0.75 + (ty - 0.62) + lift0, dist / z]; const tgt = [shift, ty + lift0, 0];
      if (qs.has('side')) eye = [dist / z, ty, 0.001];
      const view = M.look(eye, tgt, [0, 1, 0]);
      const proj = M.persp(fov, asp, 0.1, 100);
      return { eye, vp: M.mul(proj, view), proj, view };
    }

    function draw(pose, globePos) {
      const cam = camera();
      const handModel = M.trs(pose.pos, Q.euler(pose.rot[0], pose.rot[1], pose.rot[2]), HAND_SCALE);
      const bones = rigMatrices(rig, pose);
      const globeModel = M.trs(globePos, Q.mul(Q.axis([0, 0, 1], 0.32), Q.axis([0, 1, 0], earthRot)), 1);
      // câmera da luz (ortográfica), centrada na região entre globo e mão
      const c = V.add(globePos, [0, 0.9, 0]);
      const lv = M.look(V.add(c, V.mul(keyDir, 8)), c, [0, 1, 0]);
      const lp = M.ortho(-2.6, 2.6, -2.6, 2.6, 1, 16);
      const lightVP = M.mul(lp, lv);

      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
      // ---- passe de sombra ----
      gl.bindFramebuffer(gl.FRAMEBUFFER, smFB); gl.viewport(0, 0, SM, SM);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
      gl.useProgram(progDepth.p);
      gl.uniformMatrix4fv(progDepth.U.uBones, false, bones);
      gl.uniformMatrix4fv(progDepth.U.uModel, false, handModel);
      gl.uniformMatrix4fv(progDepth.U.uLightVP, false, lightVP);
      gl.uniformMatrix4fv(progDepth.U.uVP, false, lightVP);
      gl.uniform3fv(progDepth.U.uMin, hand.mn); gl.uniform3fv(progDepth.U.uMax, hand.mx);
      gl.bindVertexArray(hand.vao); gl.drawElements(gl.TRIANGLES, hand.count, hand.type, 0);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.enable(gl.CULL_FACE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // ---- cena ----
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const f = fade;

      // estrelas
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(progStar.p);
      gl.uniformMatrix4fv(progStar.U.uVP, false, cam.vp); gl.uniform1f(progStar.U.uTime, time); gl.uniform1f(progStar.U.uPx, dpr); gl.uniform1f(progStar.U.uFade, f);
      gl.bindVertexArray(starVAO); gl.drawArrays(gl.POINTS, 0, NST);
      gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);

      // globo
      gl.useProgram(progGlobe.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texDay);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texCl);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texSpec);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, smTex);
      const G = progGlobe.U;
      gl.uniform1i(G.uDay, 0); gl.uniform1i(G.uClouds, 1); gl.uniform1i(G.uSpec, 2); gl.uniform1i(G.uShadow, 3);
      gl.uniformMatrix4fv(G.uModel, false, globeModel); gl.uniformMatrix4fv(G.uVP, false, cam.vp); gl.uniformMatrix4fv(G.uLightVP, false, lightVP);
      gl.uniform3fv(G.uCam, cam.eye); gl.uniform3fv(G.uSun, keyDir); gl.uniform3fv(G.uKeyCol, [1.0, 0.97, 0.93]);
      gl.uniform1f(G.uCloudOff, cloudOff); gl.uniform1f(G.uFade, f); gl.uniform1f(G.uExposure, 1.15); gl.uniform1f(G.uTime, time);
      gl.bindVertexArray(globeVAO); gl.drawElements(gl.TRIANGLES, globeCount, gl.UNSIGNED_INT, 0);

      // mão
      gl.useProgram(progHand.p);
      const Hn = progHand.U;
      gl.uniformMatrix4fv(Hn.uBones, false, bones);
      gl.uniformMatrix4fv(Hn.uModel, false, handModel); gl.uniformMatrix4fv(Hn.uVP, false, cam.vp); gl.uniformMatrix4fv(Hn.uLightVP, false, lightVP);
      gl.uniform3fv(Hn.uMin, hand.mn); gl.uniform3fv(Hn.uMax, hand.mx);
      gl.uniform3fv(Hn.uCam, cam.eye);
      gl.uniform3fv(Hn.uKeyDir, keyDir); gl.uniform3fv(Hn.uKeyCol, keyCol);
      gl.uniform3fv(Hn.uFillDir, fillDir); gl.uniform3fv(Hn.uFillCol, fillCol);
      gl.uniform3fv(Hn.uRimDir, rimDir); gl.uniform3fv(Hn.uRimCol, rimCol);
      gl.uniform1i(Hn.uShadow, 3); gl.uniform1f(Hn.uFade, f); gl.uniform1f(Hn.uExposure, 1.0);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(hand.vao); gl.drawElements(gl.TRIANGLES, hand.count, hand.type, 0);
      gl.enable(gl.CULL_FACE);

      // atmosfera (casca externa, faces de trás, soma de luz)
      gl.useProgram(progAtmo.p);
      const At = progAtmo.U;
      gl.uniformMatrix4fv(At.uModel, false, M.trs(globePos, [0, 0, 0, 1], 1.07)); gl.uniformMatrix4fv(At.uVP, false, cam.vp);
      gl.uniform3fv(At.uCam, cam.eye); gl.uniform3fv(At.uSun, keyDir); gl.uniform1f(At.uFade, f);
      gl.cullFace(gl.FRONT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      gl.bindVertexArray(globeVAO); gl.drawElements(gl.TRIANGLES, globeCount, gl.UNSIGNED_INT, 0);
      gl.cullFace(gl.BACK); gl.disable(gl.BLEND); gl.depthMask(true);
      gl.bindVertexArray(null);
    }

    raf = requestAnimationFrame(frame);
    return {
      ready,
      start() { if (!started) { started = true; introT0 = performance.now(); } },
      setVisible(v) { visible = v; },
      setFade(v) { fade = v; },
      setScroll(p) { scrollTarget = clamp(p, 0, 1); },
      gl,
    };
  }

  window.ClayHero = { create };
})();
