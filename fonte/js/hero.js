/*
  CLAYSP — Hero 3D (WebGL2, sem bibliotecas)
  - Braço robótico: "Robotic Prosthetic Arm" de Daz (sketchfab.com/Darren.Hogan), licença CC BY 4.0,
    convertido por tools/export_arm.py. Esqueleto original (20 ossos) controlado por código.
  - Material: preto fosco na carcaça, grafite nas juntas, reflexos discretos de estúdio
  - Terra independente da mão; a mão só captura o globo quando a página é rolada para baixo
  - Contato: cada falange dobra apenas até encostar na esfera (nada atravessa)
  - "Ver globo": câmera se aproxima devagar; arraste gira a Terra só na horizontal
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
uniform float uCloudOff, uFade, uExposure, uTime, uDetail;
uniform mat3 uInvRot;
out vec4 frag;
${COMMON}
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = p * 2.03 + 1.7; a *= 0.5; } return s; }
void main(){
  vec3 N = normalize(vN);
  vec3 Vv = normalize(uCam - vW);
  vec3 day = toLin(texture(uDay, vUv).rgb);
  vec3 aux = texture(uSpec, vUv).rgb;           // R: oceanos · G: luzes das cidades (NASA Black Marble) · B: relevo
  float water = aux.r;
  vec2 cuv = vec2(vUv.x + uCloudOff, vUv.y);
  float cl = texture(uClouds, cuv).r;
  // de perto (órbita baixa) a textura sozinha fica borrada: soma relevo procedural no espaço do planeta
  vec3 P = uInvRot * N;
  if (uDetail > 0.001) {
    float fine = fbm3(P * 38.0 + vec3(uCloudOff * 40.0, 0.0, 0.0));
    float wisps = fbm3(P * 110.0);
    cl = clamp(cl + (fine - 0.5) * 0.32 * uDetail * smoothstep(0.05, 0.5, cl + 0.2) + (wisps - 0.5) * 0.14 * uDetail * cl, 0.0, 1.0);
  }
  float clShadow = texture(uClouds, cuv + vec2(0.003, 0.002)).r;
  float NoL = dot(N, uSun);
  float lit = smoothstep(-0.12, 0.35, NoL);
  float sh = shadowPCF(uShadow, vLP, 0.0025);
  float light = lit * mix(0.18, 1.0, sh);
  vec3 col = day * (1.0 - clShadow * 0.55) * light * uKeyCol * 1.15;
  // oceano: reflexo do sol
  vec3 H = normalize(uSun + Vv);
  float sp = pow(max(dot(N, H), 0.0), 140.0) * water * lit * sh;
  col += vec3(1.0, 0.88, 0.7) * sp * 0.35 * (1.0 - cl);
  col += vec3(0.25, 0.4, 0.6) * pow(max(dot(N, H), 0.0), 18.0) * water * lit * 0.035;
  // nuvens
  col = mix(col, vec3(0.95, 0.96, 1.0) * light * uKeyCol, cl * 0.92);
  // luzes das cidades no lado noturno
  float night = smoothstep(0.08, -0.25, NoL);
  float city = pow(aux.g, mix(1.0, 2.2, uDetail));          // de perto, só os pontos mais intensos (menos borrão)
  col += vec3(1.0, 0.66, 0.32) * city * night * mix(1.6, 0.9, uDetail) * (1.0 - cl * 0.8);
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
uniform vec3 uCam, uSun; uniform float uFade, uThin;
out vec4 frag;
void main(){
  vec3 N = normalize(vN); vec3 Vv = normalize(uCam - vW);
  float d = max(-dot(N, Vv), 0.0);
  float g = pow(d, mix(2.2, 0.9, uThin)) * mix(2.2, 3.2, uThin) * smoothstep(0.0, mix(0.33, 0.05, uThin), d);
  float s = smoothstep(-0.45, 0.7, dot(N, uSun)) * 0.9 + 0.1;
  vec3 c = vec3(0.30, 0.55, 1.0) * g * s;
  frag = vec4(c * uFade, 0.0);
}`;
  const SUN_VS = `#version 300 es
layout(location=0) in vec2 aP; out vec2 vP; void main(){ vP = aP; gl_Position = vec4(aP, 0.0, 1.0); }`;
  const SUN_FS = `#version 300 es
precision highp float;
in vec2 vP; uniform vec2 uSunPos; uniform float uAsp, uI; out vec4 frag;
void main(){
  vec2 d = (vP - uSunPos) * vec2(uAsp, 1.0);
  float r = length(d);
  vec3 c = vec3(1.0, 0.97, 0.92) * (exp(-r * 38.0) * 2.2 + exp(-r * 7.0) * 0.32 + exp(-r * 2.2) * 0.08);
  c += vec3(0.9, 0.93, 1.0) * exp(-abs(d.x) * 140.0) * exp(-abs(d.y) * 3.5) * 0.30;     // raio vertical
  c += vec3(0.9, 0.93, 1.0) * exp(-abs(d.y) * 160.0) * exp(-abs(d.x) * 5.0) * 0.12;     // raio horizontal
  // reflexos da lente ao longo da linha Sol → centro
  vec2 axis = -uSunPos;
  for (int i = 1; i <= 4; i++) {
    float k = float(i) * 0.38;
    vec2 g = (vP - (uSunPos + axis * k)) * vec2(uAsp, 1.0);
    float rr = length(g); float sz = 0.018 + 0.012 * float(i);
    vec3 tint = i == 1 ? vec3(0.3, 0.9, 0.7) : i == 2 ? vec3(0.7, 0.4, 1.0) : i == 3 ? vec3(0.3, 0.6, 1.0) : vec3(1.0, 0.5, 0.4);
    c += tint * smoothstep(sz, sz * 0.3, rr) * 0.045;
  }
  frag = vec4(c * uI, 0.0);
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

  // ================= braço robótico =================
  const ARM_VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aTan;
layout(location=3) in vec2 aUv;
layout(location=4) in uvec4 aJ;
layout(location=5) in vec4 aW;
uniform vec3 uMin, uMax; uniform vec2 uUvMin, uUvMax;
uniform mat4 uSkin[20];
uniform mat4 uModel, uVP, uLightVP;
out vec3 vW, vN, vT; out float vTs, vRestY; out vec2 vUv; out vec4 vLP;
void main(){
  vec3 p = mix(uMin, uMax, aPos);
  mat4 sk = uSkin[aJ.x] * aW.x + uSkin[aJ.y] * aW.y + uSkin[aJ.z] * aW.z + uSkin[aJ.w] * aW.w;
  vec4 wp = uModel * (sk * vec4(p, 1.0));
  mat3 m3 = mat3(uModel) * mat3(sk);
  vW = wp.xyz; vN = normalize(m3 * aNrm); vT = normalize(m3 * aTan.xyz); vTs = aTan.w < 0.0 ? -1.0 : 1.0;
  vUv = mix(uUvMin, uUvMax, aUv); vRestY = p.y;
  vLP = uLightVP * wp;
  gl_Position = uVP * wp;
}`;
  const ARM_FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vW, vN, vT; in float vTs, vRestY; in vec2 vUv; in vec4 vLP;
uniform sampler2D uD, uNm, uE; uniform float uHasE;
uniform sampler2DShadow uShadow;
uniform vec3 uCam, uKeyDir, uKeyCol, uFillDir, uFillCol, uRimDir, uRimCol;
uniform float uFade, uExposure;
out vec4 frag;
${COMMON}
float D_GGX(float NoH, float a){ float a2 = a*a; float d = NoH*NoH*(a2-1.0)+1.0; return a2/(3.14159*d*d); }
float V_S(float NoV, float NoL, float a){ float k = a*0.5; return 0.25 / ((NoV*(1.0-k)+k) * (NoL*(1.0-k)+k)); }
vec3 brdf(vec3 N, vec3 Vv, vec3 L, vec3 alb, vec3 F0, float rough){
  vec3 H = normalize(L + Vv);
  float NoL = max(dot(N, L), 0.0), NoV = max(dot(N, Vv), 1e-3), NoH = max(dot(N, H), 0.0), VoH = max(dot(Vv, H), 0.0);
  float a = max(rough * rough, 0.02);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - VoH, 5.0);
  return (alb / 3.14159 * (1.0 - F) + D_GGX(NoH, a) * V_S(NoV, NoL, a) * F) * NoL;
}
// estúdio escuro: uma softbox no alto, uma faixa lateral fria e chão preto
vec3 env(vec3 R, float rough){
  float top = smoothstep(0.35, 0.95, R.y) * 1.1;
  float strip = exp(-pow((R.x - 0.75) * 3.2, 2.0)) * smoothstep(-0.2, 0.5, R.y) * 0.55;
  float back = exp(-pow((R.z + 0.8) * 2.5, 2.0)) * 0.25;
  vec3 c = vec3(0.95, 0.97, 1.0) * top + vec3(0.62, 0.72, 0.9) * strip + vec3(0.5, 0.55, 0.65) * back;
  return mix(c, vec3(0.10, 0.11, 0.13), smoothstep(0.25, 0.9, rough));
}
void main(){
  vec3 d = texture(uD, vUv).rgb;
  vec3 nt = texture(uNm, vUv).rgb * 2.0 - 1.0;
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 T = normalize(vT - N * dot(vT, N)); vec3 B = cross(N, T) * vTs;
  N = normalize(mat3(T, B, N) * nt);
  vec3 Vv = normalize(uCam - vW);
  float metal = smoothstep(0.35, 0.75, d.b);
  float detail = clamp(d.r * 1.4, 0.0, 1.0);
  // preto fosco na carcaça, grafite / metal escuro nas juntas
  vec3 shell = vec3(0.016, 0.017, 0.019) * (0.7 + 0.6 * detail);
  vec3 graphite = vec3(0.13, 0.135, 0.145) * (0.8 + 0.3 * detail);
  float rough = mix(mix(0.52, 0.82, d.g), mix(0.36, 0.58, d.g), metal);
  vec3 alb = shell * (1.0 - metal);
  vec3 F0 = mix(vec3(0.035), graphite, metal);
  float sh = shadowPCF(uShadow, vLP, 0.0012);
  vec3 col = brdf(N, Vv, uKeyDir, alb, F0, rough) * uKeyCol * sh;
  col += brdf(N, Vv, uFillDir, alb, F0, rough) * uFillCol;
  col += brdf(N, Vv, uRimDir, alb, F0, rough) * uRimCol;
  // reflexo do ambiente (destaca as bordas sem deixar a mão brilhante)
  float NoV = max(dot(N, Vv), 0.0);
  vec3 Fr = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - NoV, 5.0);
  vec3 R = reflect(-Vv, N);
  col += env(R, rough) * Fr * mix(0.35, 0.8, metal) * mix(0.6, 1.0, sh);
  col += alb * vec3(0.03, 0.035, 0.05);
  // luzes de status: discretas, frias e quase brancas
  float e = texture(uE, vUv).r * uHasE;
  col += vec3(0.62, 0.72, 0.9) * e * 0.9;
  // o braço some na escuridão acima do cotovelo
  col *= smoothstep(-27.0, -9.0, vRestY);
  col = aces(col * uExposure);
  frag = vec4(toSRGB(col) * uFade, 1.0);
}`;
  const ARM_DEPTH_FS = `#version 300 es
precision mediump float; out vec4 frag; void main(){ frag = vec4(1.0); }`;

  const M4inv = (m) => {
    const inv = new Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    return inv.map(v => v / det);
  };
  const xf4 = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14], m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]];
  const xf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
  const xfDir = (m, d) => [m[0] * d[0] + m[4] * d[1] + m[8] * d[2], m[1] * d[0] + m[5] * d[1] + m[9] * d[2], m[2] * d[0] + m[6] * d[1] + m[10] * d[2]];

  // ossos do modelo (nomes do arquivo original → função)
  const FINGERS = { index: [17, 18, 19], middle: [8, 9, 10], ring: [11, 12, 13], little: [14, 15, 16] };
  const THUMB = [5, 6, 7];
  const WRIST = 3, ELBOW = 2;
  const ARM_S = 0.1;             // unidades do modelo → cena
  const FINGER_R = 0.82;         // raio aproximado das falanges (unidades do modelo)

  function buildArmRig(meta) {
    const bones = meta.bones.map((b, i) => {
      const rw = meta.restWorld[i];
      const rot3 = [rw[0], rw[1], rw[2], rw[4], rw[5], rw[6], rw[8], rw[9], rw[10]];
      return { ...b, i, restWorld: rw, invRest: M4inv(rw), rot3 };
    });
    // eixo de um osso (no seu espaço local) que corresponde a um eixo do modelo
    const toLocal = (k, ax) => {
      const r = bones[k].rot3; // colunas = eixos locais no espaço do modelo
      const c0 = V.norm([r[0], r[1], r[2]]), c1 = V.norm([r[3], r[4], r[5]]), c2 = V.norm([r[6], r[7], r[8]]);
      return V.norm([V.dot(c0, ax), V.dot(c1, ax), V.dot(c2, ax)]);
    };
    WRIST_REST = [bones[WRIST].restWorld[12], bones[WRIST].restWorld[13], bones[WRIST].restWorld[14]];
    return {
      bones, rootParent: meta.rootParent,
      wristFlexAx: toLocal(WRIST, [1, 0, 0]), wristDevAx: toLocal(WRIST, [0, 0, 1]), wristTwistAx: toLocal(WRIST, [0, 1, 0]),
      elbowAx: toLocal(ELBOW, [1, 0, 0]),
      palm: meta.palm,
    };
  }
  function boneLocalM(b, q) {
    const r = q ? Q.mul(b.r, q) : b.r;
    const m = M.trs(b.t, r, 1);
    if (b.s) { for (let c = 0; c < 3; c++) for (let rr = 0; rr < 3; rr++) m[c * 4 + rr] *= b.s[c]; }
    return m;
  }
  function boneDelta(rig, k, pose) {
    const b = rig.bones[k];
    if (k === WRIST) return Q.mul(Q.axis(rig.wristFlexAx, (pose.wristFlex || 0) * FLEX_SIGN), Q.mul(Q.axis(rig.wristDevAx, pose.wristDev || 0), Q.axis(rig.wristTwistAx, pose.wristTwist || 0)));
    if (k === ELBOW) return Q.axis(rig.elbowAx, pose.elbow || 0);
    if (b.flex && b.flex.angle > 0.01) {
      let c = 0;
      for (const f in FINGERS) { const j = FINGERS[f].indexOf(k); if (j >= 0) c = pose.curl[f][j]; }
      const tj = THUMB.indexOf(k); if (tj >= 0) c = pose.thumb[tj];
      return Q.axis(b.flex.axis, c * b.flex.angle);
    }
    return null;
  }
  function armWorlds(rig, pose) {
    const W = [];
    for (const b of rig.bones) {
      const L = boneLocalM(b, boneDelta(rig, b.i, pose));
      W[b.i] = M.mul(b.parent >= 0 ? W[b.parent] : rig.rootParent, L);
    }
    return W;
  }
  function armSkin(rig, W) {
    const out = new Float32Array(20 * 16);
    for (const b of rig.bones) out.set(M.mul(W[b.i], b.invRest), b.i * 16);
    return out;
  }

  // poses (frações do punho fechado do modelo: 0 = aberta, 1 = fechada)
  // pos = punho (cena); fwd = direção do antebraço; palm = para onde a palma olha
  // pos = punho; fwd = direção dos dedos; palm = para onde a palma olha (calculados a partir da esfera)
  const POSE_COVET = {   // cobiça: palma voltada para a Terra, dedos em garra, sem tocar
    pos: [1.065, 1.492, 0.274], fwd: [-0.395, -0.624, 0.675], palm: [-0.549, -0.749, -0.37],
    pos: [1.225, 1.858, 0.403], fwd: [-0.416, -0.669, 0.616], palm: [-0.52, -0.779, -0.35],
    curl: { index: [0.34, 0.46, 0.38], middle: [0.38, 0.50, 0.40], ring: [0.44, 0.54, 0.42], little: [0.50, 0.58, 0.46] },
    thumb: [0.30, 0.35, 0.35],
  };
  const POSE_REACH = {   // prepara o bote: abre os dedos e avança
    pos: [0.755, 1.233, 0.092], fwd: [-0.308, -0.461, 0.832], palm: [-0.476, -0.794, -0.377],
    elbow: 0, wristFlex: 0.92, wristDev: 0.0, wristTwist: 0,
    curl: { index: [0.06, 0.10, 0.08], middle: [0.08, 0.12, 0.08], ring: [0.10, 0.14, 0.10], little: [0.12, 0.16, 0.12] },
    thumb: [0.0, 0.05, 0.08],
  };
  const POSE_GRAB = {    // os dedos "querem" fechar; o contato com a esfera limita cada falange
    pos: [0.515, 0.957, 0.022], fwd: [-0.263, -0.37, 0.891], palm: [-0.4, -0.799, -0.449],
    elbow: 0, wristFlex: 0.90, wristDev: 0.0, wristTwist: 0,
    curl: { index: [1.0, 1.0, 1.0], middle: [1.0, 1.0, 1.0], ring: [1.0, 1.0, 1.0], little: [1.0, 1.0, 1.0] },
    thumb: [0.9, 0.9, 0.9],
  };
  if (window.CLAY_ARM_POSE) { Object.assign(POSE_COVET, window.CLAY_ARM_POSE.covet || {}); Object.assign(POSE_REACH, window.CLAY_ARM_POSE.reach || {}); Object.assign(POSE_GRAB, window.CLAY_ARM_POSE.grab || {}); }
  function lerpArmPose(a, b, t) {
    const o = { pos: V.lerp(a.pos, b.pos, t), fwd: V.norm(V.lerp(a.fwd, b.fwd, t)), palm: V.norm(V.lerp(a.palm, b.palm, t)) };
    for (const k of ['elbow', 'wristFlex', 'wristDev', 'wristTwist']) o[k] = mix(a[k], b[k], t);
    o.curl = {}; for (const f in a.curl) o.curl[f] = a.curl[f].map((x, i) => mix(x, b.curl[f][i], t));
    o.thumb = a.thumb.map((x, i) => mix(x, b.thumb[i], t));
    return o;
  }
  const clonePose = p => JSON.parse(JSON.stringify(p));

  // ----- contato com a esfera: cada falange dobra só até encostar -----
  const GAP = 0.010;
  // orientação do braço: 'fwd' = direção do antebraço (cotovelo → punho), 'palm' = para onde a palma olha
  function quatFromBasis(x, y, z) {
    const m00 = x[0], m11 = y[1], m22 = z[2], tr = m00 + m11 + m22; let q;
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, 0.25 * s]; }
    else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; q = [0.25 * s, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s]; }
    else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; q = [(y[0] + x[1]) / s, 0.25 * s, (z[1] + y[2]) / s, (z[0] - x[2]) / s]; }
    else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, 0.25 * s, (x[1] - y[0]) / s]; }
    const l = Math.hypot(...q); return q.map(v => v / l);
  }
  function armQuat(pose) {
    const y = V.norm(pose.fwd);
    let z = V.mul(V.norm(pose.palm), -1);          // a palma do modelo olha para -Z
    z = V.norm(V.sub(z, V.mul(y, V.dot(z, y))));
    const x = V.cross(y, z);
    return quatFromBasis(x, y, z);
  }
  let WRIST_REST = [0, 10.3, 0];
  const FLEX_SIGN = +(new URLSearchParams(location.search).get('fs') || 1);   // posição do punho no modelo (atualizada ao carregar o esqueleto)
  // a pose descreve a MÃO (fwd = direção dos dedos, palm = para onde a palma olha);
  // o antebraço sai do punho dobrado por 'wristFlex' (assim ele pode descer do alto da tela)
  function armModelM(pose) {
    const q = Q.mul(armQuat(pose), Q.axis([1, 0, 0], -(pose.wristFlex || 0) * FLEX_SIGN));
    return M.mul(M.trs(pose.pos, q, ARM_S), M.trs(V.mul(WRIST_REST, -1), [0, 0, 0, 1], 1));
  }
  function fingerSamples(rig, W, model, chain, k) {
    // pontos ao longo da falange k (da junta k até a próxima junta ou a ponta)
    const b = rig.bones[chain[k]];
    const a = xf(model, xf(W[chain[k]], [0, 0, 0]));
    let e;
    if (k < chain.length - 1) e = xf(model, xf(W[chain[k + 1]], [0, 0, 0]));
    else { const len = V.len(b.t); e = xf(model, xf(W[chain[k]], [0, len * 0.95, 0])); }
    return [V.lerp(a, e, 0.35), V.lerp(a, e, 0.7), e];
  }
  function minClearance(pts, C, R, rad) {
    let m = 1e9; for (const p of pts) m = Math.min(m, V.len(V.sub(p, C)) - R - rad);
    return m;
  }
  function solveArmContact(rig, pose, C, R, palmIn) {
    const rad = FINGER_R * ARM_S + GAP;
    // palma: empurra para fora se encostar demais; durante a captura, encosta na superfície
    for (let it = 0; it < 4; it++) {
      const W = armWorlds(rig, pose), model = armModelM(pose);
      const Hm = M.mul(model, M.mul(W[WRIST], rig.bones[WRIST].invRest));
      let minC = 1e9, cen = [0, 0, 0];
      for (const p of rig.palm) { const w = xf(Hm, p); cen = V.add(cen, w); minC = Math.min(minC, V.len(V.sub(w, C)) - R - 0.02); }
      for (const f in FINGERS) minC = Math.min(minC, V.len(V.sub(xf(model, xf(W[FINGERS[f][0]], [0, 0, 0])), C)) - R - rad);
      const dir = V.norm(V.sub(V.mul(cen, 1 / rig.palm.length), C));
      const move = minC < 0 ? -minC : -minC * palmIn;
      if (Math.abs(move) < 1e-4) break;
      pose.pos = V.add(pose.pos, V.mul(dir, move));
    }
    const want = { curl: JSON.parse(JSON.stringify(pose.curl)), thumb: pose.thumb.slice() };
    const chains = [...Object.keys(FINGERS).map(f => ({ f, chain: FINGERS[f] })), { f: 'thumb', chain: THUMB }];
    for (let pass = 0; pass < 3; pass++) {
      pose.curl = JSON.parse(JSON.stringify(want.curl)); pose.thumb = want.thumb.slice();
      let deficit = 0;
      const model = armModelM(pose);
      for (const { f, chain } of chains) {
        const get = k => f === 'thumb' ? pose.thumb[k] : pose.curl[f][k];
        const set = (k, v) => { if (f === 'thumb') pose.thumb[k] = v; else pose.curl[f][k] = v; };
        for (let k = 0; k < chain.length; k++) {
          const test = v => { set(k, v); const W = armWorlds(rig, pose); let m = 1e9; for (let j = k; j < chain.length; j++) m = Math.min(m, minClearance(fingerSamples(rig, W, model, chain, j), C, R, rad)); return m; };
          const w0 = get(k);
          if (test(w0) >= 0) continue;
          let lo = -0.15, hi = w0;
          const tl = test(lo);
          if (tl < 0) { set(k, lo); deficit = Math.max(deficit, -tl); continue; }
          for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (test(mid) < 0) hi = mid; else lo = mid; }
          set(k, lo);
        }
      }
      if (deficit <= 0) break;
      const W = armWorlds(rig, pose);
      const wr = xf(model, xf(W[WRIST], [0, 0, 0]));
      pose.pos = V.add(pose.pos, V.mul(V.norm(V.sub(wr, C)), deficit + 0.003));
    }
    return pose;
  }
  function armPenetration(rig, pose, C, R) {
    const W = armWorlds(rig, pose), model = armModelM(pose);
    let worst = 1e9;
    for (const f in FINGERS) for (let k = 0; k < 3; k++) worst = Math.min(worst, minClearance(fingerSamples(rig, W, model, FINGERS[f], k), C, R, FINGER_R * ARM_S));
    for (let k = 0; k < 3; k++) worst = Math.min(worst, minClearance(fingerSamples(rig, W, model, THUMB, k), C, R, FINGER_R * ARM_S));
    const Hm = M.mul(model, M.mul(W[WRIST], rig.bones[WRIST].invRest));
    for (const p of rig.palm) worst = Math.min(worst, V.len(V.sub(xf(Hm, p), C)) - R);
    return -worst;
  }

  // ================= cena =================
  const GLOBE_R = 0.80;
  const GLOBE_POS = [0, 0, 0];

  function create(canvas, opts = {}) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
    if (!gl) throw new Error('WebGL2 indisponível');
    const isMobile = matchMedia('(max-width: 760px), (pointer: coarse)').matches;
    const qs = new URLSearchParams(location.search);
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const A = window.CLAY_ASSETS || {};

    let progArm, progArmDepth, progGlobe, progAtmo, progStar, progSun;
    function buildPrograms() {
      progArm = compile(gl, ARM_VS, ARM_FS);
      progArmDepth = compile(gl, ARM_VS.replace('gl_Position = uVP * wp;', 'gl_Position = uLightVP * wp;'), ARM_DEPTH_FS);
      progGlobe = compile(gl, GLOBE_VS, GLOBE_FS);
      progAtmo = compile(gl, GLOBE_VS, ATMO_FS);
      progStar = compile(gl, STAR_VS, STAR_FS);
      progSun = compile(gl, SUN_VS, SUN_FS);
    }

    // ---- recursos de GPU (recriados se o navegador perder o contexto) ----
    const SEG_U = isMobile ? 96 : 160, SEG_V = isMobile ? 48 : 80;
    const NST = isMobile ? 500 : 1100;
    const SM = isMobile ? 1024 : 2048;
    const starData = new Float32Array(NST * 4);
    for (let i = 0; i < NST; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = 40, s = Math.sqrt(1 - u * u);
      starData.set([Math.cos(a) * s * r, u * r, -Math.abs(Math.sin(a) * s * r) - 6, Math.random() * 0.999], i * 4);
    }
    let quadVAO, globeVAO, globeCount, starVAO, smTex, smFB, arm = null, texGlobe = null;
    let images = null, armBuf = null, armMeta = null, rig = null;

    function buildStatic() {
      const gp = [], gi = [];
      for (let y = 0; y <= SEG_V; y++) for (let x = 0; x <= SEG_U; x++) {
        const u = x / SEG_U, v = y / SEG_V, th = u * Math.PI * 2, ph = v * Math.PI;
        gp.push(-Math.cos(th) * Math.sin(ph), Math.cos(ph), Math.sin(th) * Math.sin(ph), u, v);
      }
      for (let y = 0; y < SEG_V; y++) for (let x = 0; x < SEG_U; x++) { const a = y * (SEG_U + 1) + x, b = a + SEG_U + 1; gi.push(a, b, a + 1, b, b + 1, a + 1); }
      globeVAO = gl.createVertexArray(); gl.bindVertexArray(globeVAO);
      const gvb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, gvb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gp), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
      const gib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(gi), gl.STATIC_DRAW);
      globeCount = gi.length;
      starVAO = gl.createVertexArray(); gl.bindVertexArray(starVAO);
      const sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb); gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
      quadVAO = gl.createVertexArray(); gl.bindVertexArray(quadVAO);
      const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      smTex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, smTex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SM, SM);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      smFB = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, smFB);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, smTex, 0);
      gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    function uploadAssets() {
      texGlobe = { day: texFrom(gl, images.day), cl: texFrom(gl, images.cl), sp: texFrom(gl, images.sp) };
      const dv = new DataView(armBuf);
      const nv = dv.getUint32(4, true), ni = dv.getUint32(8, true);
      const f = i => dv.getFloat32(12 + i * 4, true);
      const mn = [f(0), f(1), f(2)], mx = [f(3), f(4), f(5)], uvmn = [f(6), f(7)], uvmx = [f(8), f(9)];
      const stride = armMeta.stride, off = 52;
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(armBuf, off, nv * stride), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.UNSIGNED_SHORT, true, stride, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.BYTE, true, stride, 8);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.BYTE, true, stride, 12);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 2, gl.UNSIGNED_SHORT, true, stride, 16);
      gl.enableVertexAttribArray(4); gl.vertexAttribIPointer(4, 4, gl.UNSIGNED_BYTE, stride, 20);
      gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 4, gl.UNSIGNED_BYTE, true, stride, 24);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
      const ibytes = armBuf.slice(off + nv * stride);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, armMeta.idx16 ? new Uint16Array(ibytes) : new Uint32Array(ibytes), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      const mats = images.mats.map((m, i) => ({ d: texFrom(gl, m.d), n: texFrom(gl, m.n), e: m.e ? texFrom(gl, m.e) : null, range: armMeta.ranges[i] }));
      arm = { vao, type: armMeta.idx16 ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT, mn, mx, uvmn, uvmx, mats };
    }

    // ---- estado ----
    let W = 1, H = 1, dpr = 1;
    let warm = 0, visible = true, fade = 1, intro = 0, introT0 = 0, started = false, lost = false;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
    let earthRot = +(qs.get('er') || -0.6), earthVel = 0.07, cloudOff = 0, last = performance.now(), time = 0, raf = 0;
    // captura (0 = mão em pose de cobiça · 1 = globo agarrado · 2 = levado para fora da tela)
    let cap = 0, capTarget = 0;
    // experiência "Ver globo"
    let focusOn = false, focusK = 0, dragging = false, lastX = 0, lastY = 0, dragDist = 0, firstDragDone = false, onFirstDrag = null, dragVel = 0;

    const keyDir = V.norm([-0.55, 0.72, 0.42]);
    const keyCol = [3.0, 2.85, 2.7];
    const fillDir = V.norm([0.75, -0.1, 0.65]);
    const fillCol = [0.16, 0.19, 0.26];
    const rimDir = V.norm([0.6, 0.35, -0.72]);
    const rimCol = [1.1, 1.25, 1.6];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2);
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      // no celular a barra de endereço muda a altura o tempo todo: só realoca o buffer se a mudança for grande
      if (canvas.width !== w || Math.abs(canvas.height - h) > (isMobile ? 160 * dpr : 0)) { canvas.width = w; canvas.height = h; }
      W = canvas.width; H = canvas.height;
    }
    window.addEventListener('resize', resize);
    resize();
    window.addEventListener('pointermove', e => { pointer.tx = (e.clientX / innerWidth) * 2 - 1; pointer.ty = (e.clientY / innerHeight) * 2 - 1; }, { passive: true });

    // perda de contexto (comum no celular com pouca memória): recupera sem recarregar a página
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => {
      try { buildPrograms(); buildStatic(); if (images && armBuf) uploadAssets(); lost = false; } catch (err) { console.warn(err); }
    }, false);

    buildPrograms(); buildStatic();

    const ready = (async () => {
      const src = (k, path) => A[k] || path;
      const loadBin = async () => {
        if (window.CLAY_ARM_B64) { const bin = atob(window.CLAY_ARM_B64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
        const r = await fetch('assets/arm/arm.bin'); if (!r.ok) throw new Error('arm.bin'); return r.arrayBuffer();
      };
      const [bin, meta, day, cl, sp, ...mt] = await Promise.all([
        loadBin(),
        Promise.resolve(window.CLAY_ARM_META || fetch('assets/arm/arm.json').then(r => r.json())),
        loadImage(src('earthDay', 'assets/earth_day.jpg')), loadImage(src('earthClouds', 'assets/earth_clouds.jpg')), loadImage(src('earthSpec', 'assets/earth_spec.jpg')),
        ...[0, 1, 2, 3].flatMap(i => [loadImage(src('arm' + i + 'd', `assets/arm/m${i}_d.jpg`)), loadImage(src('arm' + i + 'n', `assets/arm/m${i}_n.jpg`))]),
        loadImage(src('arm0e', 'assets/arm/m0_e.jpg')), loadImage(src('arm1e', 'assets/arm/m1_e.jpg')),
      ]);
      armBuf = bin; armMeta = meta;
      images = { day, cl, sp, mats: [0, 1, 2, 3].map(i => ({ d: mt[i * 2], n: mt[i * 2 + 1], e: i < 2 ? mt[8 + i] : null })) };
      uploadAssets();
      rig = buildArmRig(meta);
      if (window.CLAY_ARM_B64) window.CLAY_ARM_B64 = null; // libera memória
    })();

    // ---- pose do braço ----
    function computeArm(t) {
      // cap 0→1: avança, abre e fecha os dedos em volta do globo · 1→2: leva a Terra para cima
      // cap 0 → 0.3: o braço entra pelo alto (antes disso ele nem existe na tela)
      // cap 0.3 → 1: avança, abre e fecha os dedos em volta do globo · 1 → 2: leva a Terra para cima
      const arrive = sstep(0.0, 0.3, cap);
      const c1 = clamp((cap - 0.3) / 0.7, 0, 1), c2 = clamp(cap - 1, 0, 1);
      const reach = sstep(0.0, 0.45, c1), grab = sstep(0.35, 1.0, c1);
      let pose = lerpArmPose(POSE_COVET, POSE_REACH, reach);
      const g = lerpArmPose(pose, POSE_GRAB, grab);
      pose = g;
      // tensão: microajustes nos dedos e uma respiração lenta enquanto cobiça o planeta
      const idle = 1 - reach;
      const breath = Math.sin(t * 0.8) * 0.5 + 0.5;
      pose.pos = V.add(pose.pos, [Math.sin(t * 0.37) * 0.02 * idle, -breath * 0.05 * idle, 0]);
      for (const f in pose.curl) {
        const ph = { index: 0, middle: 0.7, ring: 1.4, little: 2.1 }[f];
        pose.curl[f] = pose.curl[f].map((c, i) => c + Math.sin(t * 1.1 + ph + i) * 0.025 * idle);
      }
      pose.thumb = pose.thumb.map((c, i) => c + Math.sin(t * 0.9 + i) * 0.02 * idle);
      // acompanha discretamente o cursor (só fora do modo "Ver globo")
      const follow = idle * (1 - focusK) * (isMobile ? 0 : 1);
      pose.fwd = V.norm(V.add(pose.fwd, [pointer.x * 0.05 * follow, 0, pointer.y * 0.04 * follow]));
      pose.pos = V.add(pose.pos, [pointer.x * 0.05 * follow, -pointer.y * 0.03 * follow, 0]);
      // a Terra fica onde está até ser agarrada; depois sobe junto com a mão
      const rise = ease(c2) * 7.5;
      const globePos = [GLOBE_POS[0], GLOBE_POS[1] + rise, GLOBE_POS[2]];
      pose.pos = V.add(pose.pos, [0, rise, 0]);
      // chegada: desce de fora do quadro, já com a intenção de agarrar
      pose.pos = V.add(pose.pos, [(1 - ease(arrive)) * 0.6, (1 - ease(arrive)) * 4.6, 0]);
      if (cap <= 0.002) return { pose, globePos, grip: 0, armOn: false };   // braço fora da cena: nada a calcular
      solveArmContact(rig, pose, globePos, GLOBE_R, grab);
      // cobiça: mantém uma folga visível entre a ponta dos dedos e a Terra (sem tocar)
      const hover = 0.24 * (1 - reach);
      if (hover > 0.001) {
        const gap = -armPenetration(rig, pose, globePos, GLOBE_R);   // folga mínima atual (negativa = penetração)
        if (gap < hover) {
          const dir = V.norm(V.sub(pose.pos, globePos));
          pose.pos = V.add(pose.pos, V.mul(dir, hover - gap));
        }
      }
      return { pose, globePos, grip: grab, armOn: cap > 0.002 };
    }

    // ---- câmera ----
    // referência: a composição anterior. Início: ~40% mais longe. "Ver globo": ~70% mais perto.
    const FOV = 30 * Math.PI / 180;
    // Órbita baixa ("Ver globo"): a câmera vai até ~18% do raio acima da superfície, olhando para o horizonte
    // na direção do Sol (que surge logo acima do limbo), com o horizonte cruzando a tela em diagonal.
    const makeOrbit = (yaw) => {
      const sun = keyDir;
      const t = V.norm(V.sub([0, 0, 1], V.mul(sun, sun[2])));           // lado do planeta voltado para a câmera inicial
      const up = V.norm(V.add(V.mul(sun, -0.26), V.mul(t, 0.966)));      // Sol ~15° abaixo da horizontal local (amanhecer)
      const alt = 0.18;                                                  // altitude, em raios
      const dip = Math.acos(1 / (1 + alt));                             // quanto o horizonte "desce" visto dessa altura
      let fwd = V.norm(V.sub(sun, V.mul(up, V.dot(sun, up))));         // horizontal, na direção do Sol
      const side = V.norm(V.cross(fwd, up));
      fwd = V.norm(V.add(V.mul(fwd, Math.cos(yaw)), V.mul(side, -Math.sin(yaw))));     // Sol um pouco à direita
      const pitch = -(dip - 0.085);
      const f = V.norm(V.add(V.mul(fwd, Math.cos(pitch)), V.mul(up, Math.sin(pitch))));
      // inclinação (roll) para o horizonte atravessar em diagonal suave
      const roll = -0.21, r0 = V.norm(V.cross(f, up)), u0 = V.cross(r0, f);
      const camUp = V.norm(V.add(V.mul(u0, Math.cos(roll)), V.mul(r0, Math.sin(roll))));
      return { up, alt, f, camUp };
    };
    const ORBIT_WIDE = makeOrbit(0.16), ORBIT_TALL = makeOrbit(0.05);   // telas largas / em pé
    function camera() {
      const asp = W / H, tn = Math.tan(FOV / 2);
      const needH = 4.1, needW = 2.9;                        // enquadramento da versão anterior (referência)
      const base = Math.max((needH / 2) / tn, (needW / 2) / (tn * asp)) * 1.04;
      const far = base * 1.4;                                 // início: ~40% mais longe
      const fk = focusK < 0.5 ? 4 * focusK * focusK * focusK : 1 - Math.pow(-2 * focusK + 2, 3) / 2; // acelera e desacelera
      const ty0 = asp < 0.8 ? 0.30 : 0.36;   // sem a mão no início: a Terra sobe um pouco, longe do título
      const tx0 = asp < 0.8 ? 0.32 : 0.12;
      const az = +(qs.get('az') || 0);
      const tgt0 = [tx0, ty0, 0];
      const eye0 = [tx0 + Math.sin(az) * far, ty0 + Math.sin(0.07) * far, Math.cos(az) * Math.cos(0.07) * far];
      // destino: perto da superfície (a escala vem da câmera, não do tamanho dos modelos)
      const ORBIT = asp < 0.8 ? ORBIT_TALL : ORBIT_WIDE;
      const eye1 = V.add(GLOBE_POS, V.mul(ORBIT.up, GLOBE_R * (1 + ORBIT.alt)));
      // trajetória: avança olhando para o planeta (ele cresce na tela) e, no fim, ergue o olhar para o horizonte
      const eye = V.lerp(eye0, eye1, sstep(0.0, 0.82, focusK));
      const tgtA = V.lerp(tgt0, GLOBE_POS, sstep(0.0, 0.5, focusK));
      const fA = V.norm(V.sub(tgtA, eye));
      const turn = sstep(0.5, 1.0, focusK);
      const fwd = V.norm(V.lerp(fA, ORBIT.f, turn));
      const up = V.norm(V.lerp([0, 1, 0], ORBIT.camUp, turn));
      const view = M.look(eye, V.add(eye, fwd), up);
      const fovNow = FOV * mix(1, asp < 0.8 ? 1.75 : 1.35, fk);   // de perto, um pouco mais de campo de visão
      const proj = M.persp(fovNow, asp, 0.01, 120);
      return { eye, vp: M.mul(proj, view), fk };
    }

    // ---- arraste do globo (somente horizontal, somente no modo "Ver globo") ----
    // Sensibilidade: radianos de rotação por pixel arrastado. Antes: 0.0055 → agora 25% disso (planeta pesado, imenso).
    const DRAG_SENSITIVITY = 0.0055 * 0.25;
    const DRAG_SMOOTH = 7.0;      // suavização do giro (maior = responde mais rápido)
    const DRAG_INERTIA = 0.35;    // quanto do impulso continua depois de soltar (0 = nenhum)
    let rotTarget = null;
    function onDown(e) {
      if (!focusOn || focusK < 0.85) return;
      dragging = true; lastX = e.clientX; lastY = e.clientY; dragDist = 0; dragVel = 0;
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
    function onMove(e) {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      // só o componente horizontal gira; o vertical é ignorado
      if (rotTarget === null) rotTarget = earthRot;
      rotTarget += dx * DRAG_SENSITIVITY;
      dragVel = dx * DRAG_SENSITIVITY * 60 * DRAG_INERTIA;
      dragDist += Math.abs(dx);
      if (!firstDragDone && dragDist > 36 && Math.abs(dx) >= Math.abs(dy)) { firstDragDone = true; if (onFirstDrag) onFirstDrag(); }
    }
    function onUp(e) { if (!dragging) return; dragging = false; canvas.style.cursor = focusOn ? 'grab' : ''; try { canvas.releasePointerCapture(e.pointerId); } catch (_) {} }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    function frame(now) {
      raf = requestAnimationFrame(frame);
      const realDt = Math.min(0.25, Math.max(0, (now - last) / 1000));   // relógio real (durações não dependem do FPS)
      const dt = Math.min(0.05, realDt); last = now; time += dt;
      if (lost || !arm || !rig) return;
      if (!visible && !focusOn && focusK === 0) return;
      if (!started && !qs.has('cap')) { if (warm >= 2) return; warm++; }
      if (started) intro = Math.min(1, (now - introT0) / 2400);
      if (qs.has('cap')) { cap = capTarget = +qs.get('cap'); intro = 1; }
      if (qs.has('fk')) { focusK = +qs.get('fk'); }
      // captura: duração controlada, independente da velocidade da rolagem
      const speed = reducedMotion ? 3 : 0.5;
      if (cap < capTarget) cap = Math.min(capTarget, cap + realDt * speed);
      else if (cap > capTarget) cap = Math.max(capTarget, cap - realDt * speed * 1.2);
      // câmera do "Ver globo": ~2,6 s para entrar ou sair
      const fT = focusOn ? 1 : 0, fs = reducedMotion ? 6 : 1 / 3.2;
      if (focusK < fT) focusK = Math.min(fT, focusK + realDt * fs); else if (focusK > fT) focusK = Math.max(fT, focusK - realDt * fs);
      pointer.x += (pointer.tx - pointer.x) * (1 - Math.exp(-dt * 3));
      pointer.y += (pointer.ty - pointer.y) * (1 - Math.exp(-dt * 3));
      const { pose, globePos, grip, armOn } = computeArm(time);
      // rotação própria da Terra: para quando é agarrada; no modo imersivo segue o arraste com inércia
      if (rotTarget !== null) {
        if (!dragging) { rotTarget += dragVel * dt; dragVel *= Math.exp(-dt * 4.5); }
        earthRot += (rotTarget - earthRot) * (1 - Math.exp(-dt * DRAG_SMOOTH));
        if (!focusOn && Math.abs(rotTarget - earthRot) < 1e-4) rotTarget = null;
      }
      const spin = dt * earthVel * (1 - grip) * (focusOn ? 0.12 : 1);
      earthRot += spin; if (rotTarget !== null) rotTarget += spin;
      cloudOff += dt * 0.004 * (1 - grip * 0.8);
      draw(pose, globePos, armOn);
    }

    function draw(pose, globePos, armOn = true) {
      const cam = camera();
      const Wb = armWorlds(rig, pose);
      const skin = armSkin(rig, Wb);
      const armModel = armModelM(pose);
      const globeModel = M.trs(globePos, Q.mul(Q.axis([0, 0, 1], 0.32), Q.axis([0, 1, 0], earthRot)), GLOBE_R);
      const lc = V.add(globePos, [0, 1.2, 0]);
      const lv = M.look(V.add(lc, V.mul(keyDir, 9)), lc, [0, 1, 0]);
      const lightVP = M.mul(M.ortho(-3.0, 3.0, -3.0, 3.0, 1, 20), lv);

      gl.enable(gl.DEPTH_TEST);
      // sombra do braço
      gl.bindFramebuffer(gl.FRAMEBUFFER, smFB); gl.viewport(0, 0, SM, SM); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.disable(gl.CULL_FACE); gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1.5, 3);
      if (armOn) {
      gl.useProgram(progArmDepth.p);
      const D = progArmDepth.U;
      gl.uniformMatrix4fv(D.uSkin, false, skin); gl.uniformMatrix4fv(D.uModel, false, armModel); gl.uniformMatrix4fv(D.uLightVP, false, lightVP); gl.uniformMatrix4fv(D.uVP, false, lightVP);
      gl.uniform3fv(D.uMin, arm.mn); gl.uniform3fv(D.uMax, arm.mx); gl.uniform2fv(D.uUvMin, arm.uvmn); gl.uniform2fv(D.uUvMax, arm.uvmx);
      gl.bindVertexArray(arm.vao);
      for (const m of arm.mats) gl.drawElements(gl.TRIANGLES, m.range[1], arm.type, m.range[0] * (arm.type === gl.UNSIGNED_SHORT ? 2 : 4));
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const f = fade;
      // estrelas
      gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(progStar.p);
      gl.uniformMatrix4fv(progStar.U.uVP, false, cam.vp); gl.uniform1f(progStar.U.uTime, time); gl.uniform1f(progStar.U.uPx, dpr); gl.uniform1f(progStar.U.uFade, f);
      gl.bindVertexArray(starVAO); gl.drawArrays(gl.POINTS, 0, NST);
      gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE);
      // globo
      gl.useProgram(progGlobe.p);
      const G = progGlobe.U;
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texGlobe.day);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texGlobe.cl);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, texGlobe.sp);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, smTex);
      gl.uniform1i(G.uDay, 0); gl.uniform1i(G.uClouds, 1); gl.uniform1i(G.uSpec, 2); gl.uniform1i(G.uShadow, 3);
      gl.uniformMatrix4fv(G.uModel, false, globeModel); gl.uniformMatrix4fv(G.uVP, false, cam.vp); gl.uniformMatrix4fv(G.uLightVP, false, lightVP);
      gl.uniform3fv(G.uCam, cam.eye); gl.uniform3fv(G.uSun, keyDir); gl.uniform3fv(G.uKeyCol, [1.0, 0.97, 0.93]);
      gl.uniform1f(G.uCloudOff, cloudOff); gl.uniform1f(G.uFade, f); gl.uniform1f(G.uExposure, 1.15); gl.uniform1f(G.uTime, time);
      gl.uniform1f(G.uDetail, cam.fk);
      { const q = Q.mul(Q.axis([0, 0, 1], 0.32), Q.axis([0, 1, 0], earthRot)); const m = M.trs([0, 0, 0], [-q[0], -q[1], -q[2], q[3]], 1);
        gl.uniformMatrix3fv(G.uInvRot, false, [m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]); }
      gl.bindVertexArray(globeVAO); gl.drawElements(gl.TRIANGLES, globeCount, gl.UNSIGNED_INT, 0);
      // braço
      if (armOn) {
      gl.disable(gl.CULL_FACE);
      gl.useProgram(progArm.p);
      const U = progArm.U;
      gl.uniformMatrix4fv(U.uSkin, false, skin); gl.uniformMatrix4fv(U.uModel, false, armModel); gl.uniformMatrix4fv(U.uVP, false, cam.vp); gl.uniformMatrix4fv(U.uLightVP, false, lightVP);
      gl.uniform3fv(U.uMin, arm.mn); gl.uniform3fv(U.uMax, arm.mx); gl.uniform2fv(U.uUvMin, arm.uvmn); gl.uniform2fv(U.uUvMax, arm.uvmx);
      gl.uniform3fv(U.uCam, cam.eye);
      gl.uniform3fv(U.uKeyDir, keyDir); gl.uniform3fv(U.uKeyCol, keyCol); gl.uniform3fv(U.uFillDir, fillDir); gl.uniform3fv(U.uFillCol, fillCol);
      gl.uniform3fv(U.uRimDir, rimDir); gl.uniform3fv(U.uRimCol, rimCol);
      gl.uniform1f(U.uFade, f); gl.uniform1f(U.uExposure, 1.0);
      gl.uniform1i(U.uD, 0); gl.uniform1i(U.uNm, 1); gl.uniform1i(U.uE, 2); gl.uniform1i(U.uShadow, 3);
      gl.bindVertexArray(arm.vao);
      for (const m of arm.mats) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, m.d);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, m.n);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, m.e || m.d);
        gl.uniform1f(U.uHasE, m.e ? 1 : 0);
        gl.drawElements(gl.TRIANGLES, m.range[1], arm.type, m.range[0] * (arm.type === gl.UNSIGNED_SHORT ? 2 : 4));
      }
      gl.enable(gl.CULL_FACE);
      }
      // atmosfera
      gl.useProgram(progAtmo.p);
      const At = progAtmo.U;
      gl.uniformMatrix4fv(At.uModel, false, M.trs(globePos, [0, 0, 0, 1], mix(1.07, 1.022, cam.fk) * GLOBE_R)); gl.uniformMatrix4fv(At.uVP, false, cam.vp);
      gl.uniform1f(At.uThin, cam.fk);
      gl.uniform3fv(At.uCam, cam.eye); gl.uniform3fv(At.uSun, keyDir); gl.uniform1f(At.uFade, f);
      gl.cullFace(gl.FRONT); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      gl.bindVertexArray(globeVAO); gl.drawElements(gl.TRIANGLES, globeCount, gl.UNSIGNED_INT, 0);
      gl.cullFace(gl.BACK); gl.disable(gl.BLEND); gl.depthMask(true);
      // Sol nascendo atrás do limbo (só aparece quando a câmera está perto)
      if (cam.fk > 0.02) {
        const sp = xf4(cam.vp, V.add(cam.eye, V.mul(keyDir, 60)));
        if (sp[3] > 0) {
          const sx = sp[0] / sp[3], sy = sp[1] / sp[3];
          // a Terra encobre o Sol? (distância do raio ao centro do planeta)
          const oc = V.sub(globePos, cam.eye), tca = V.dot(oc, keyDir);
          const dPerp = Math.sqrt(Math.max(0, V.dot(oc, oc) - tca * tca));
          const vis = tca < 0 ? 1 : sstep(GLOBE_R * 0.995, GLOBE_R * 1.05, dPerp);
          gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
          gl.useProgram(progSun.p);
          gl.uniform2f(progSun.U.uSunPos, sx, sy); gl.uniform1f(progSun.U.uAsp, W / H); gl.uniform1f(progSun.U.uI, cam.fk * cam.fk * vis * f);
          gl.bindVertexArray(quadVAO); gl.drawArrays(gl.TRIANGLES, 0, 3);
          gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
        }
      }
      gl.bindVertexArray(null);
    }

    raf = requestAnimationFrame(frame);
    return {
      ready,
      start() { if (!started) { started = true; introT0 = performance.now(); } },
      setVisible(v) { visible = v; },
      setFade(v) { fade = v; },
      // captura: 0 = cobiça, 2 = globo levado para fora da tela
      setCapture(on) { capTarget = on ? 2 : 0; },
      get capture() { return cap; },
      setFocus(on, cb) {
        focusOn = !!on; onFirstDrag = cb || null;
        if (on) { firstDragDone = false; dragDist = 0; dragVel = 0; visible = true; if (!started) { started = true; introT0 = performance.now() - 5000; } }
        else { dragging = false; }
        canvas.style.touchAction = on ? 'none' : '';
        canvas.style.cursor = on ? 'grab' : '';
      },
      get focusProgress() { return focusK; },
      penetration() {
        if (!rig) return null;
        const out = []; const keep = cap;
        for (let c = 0; c <= 2.0001; c += 0.05) { cap = c; const r = computeArm(0); out.push(+Math.max(0, armPenetration(rig, r.pose, r.globePos, GLOBE_R)).toFixed(4)); }
        cap = keep; return out;
      },
      gl,
    };
  }

  window.ClayHero = { create };
})();
