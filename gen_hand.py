# Gera uma mão humana direita, procedural (SDF -> marching cubes), com ossos para skinning.
# Unidades: cm. Pulso na origem, dedos para -Y, dorso para +Z, palma para -Z, polegar em +X.
import numpy as np, json, struct, sys
from skimage import measure

def nrm(v):
    v = np.asarray(v, dtype=np.float64); return v / np.linalg.norm(v)

def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)

def smax(a, b, k):
    return -smin(-a, -b, k)

def round_cone(p, a, b, r1, r2):
    a = np.asarray(a, float); b = np.asarray(b, float)
    ba = b - a; l2 = ba @ ba; rr = r1 - r2; a2 = l2 - rr * rr; il2 = 1.0 / l2
    pa = p - a; y = pa @ ba; z = y - l2
    q = pa * l2 - np.outer(y, ba); x2 = (q * q).sum(1)
    y2 = y * y * l2; z2 = z * z * l2; k = np.sign(rr) * rr * rr * x2
    d3 = (np.sqrt(np.maximum(x2 * a2 * il2, 0)) + y * rr) * il2 - r1
    d1 = np.sqrt(x2 + z2) * il2 - r2
    d2 = np.sqrt(x2 + y2) * il2 - r1
    return np.where(np.sign(z) * a2 * z2 > k, d1, np.where(np.sign(y) * a2 * y2 < k, d2, d3))

def ellipsoid(p, c, r, R=None):
    q = p - np.asarray(c, float)
    if R is not None: q = q @ R
    r = np.asarray(r, float)
    k0 = np.linalg.norm(q / r, axis=1); k1 = np.linalg.norm(q / (r * r), axis=1)
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)

def rbox(p, c, h, rad, R=None):
    q = p - np.asarray(c, float)
    if R is not None: q = q @ R
    q = np.abs(q) - np.asarray(h, float)
    return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(q.max(1), 0) - rad

def frame(d, up=(0, 0, 1)):
    d = nrm(d); s = nrm(np.cross(d, up)); n = np.cross(s, d)
    return d, s, n  # along, side, dorsal

def rotz(a):
    c, s = np.cos(a), np.sin(a); return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])

# ---------------- anatomia ----------------
# dedos: nome, x do MCP, y do MCP, ângulo de abertura, comprimentos, raios (base, pip, dip, ponta)
FINGERS = [
    ('index', 2.45, -9.55, 0.10, [4.0, 2.4, 1.95], [0.98, 0.86, 0.76, 0.66]),
    ('middle', 0.70, -9.95, 0.015, [4.5, 2.85, 2.05], [1.00, 0.89, 0.78, 0.68]),
    ('ring', -1.05, -9.65, -0.075, [4.2, 2.7, 2.0], [0.94, 0.84, 0.74, 0.64]),
    ('little', -2.70, -8.75, -0.17, [3.4, 2.0, 1.8], [0.82, 0.72, 0.64, 0.56]),
]
MCP_Z = 0.05
bones = []  # dicts: name, parent, head, tail
def add_bone(name, parent, head, tail):
    bones.append(dict(name=name, parent=parent, head=[float(x) for x in head], tail=[float(x) for x in tail]))
    return len(bones) - 1

B_ARM = add_bone('arm', -1, (0, 1.2, 0), (0, 16, 0))
B_HAND = add_bone('hand', B_ARM, (0, 0.2, 0), (0.7, -9.95, 0))

segs = []  # (bone, a, b, r1, r2, finger_frame)
nails = []
joints_dorsal = []  # (pos, d, n, s, radius) para rugas
for name, mx, my, ang, L, R in FINGERS:
    d = rotz(ang) @ np.array([0, -1, 0.0]); d = nrm(d + np.array([0, 0, -0.04]))
    d, s, n = frame(d)
    p0 = np.array([mx, my, MCP_Z]); parent = B_HAND
    pts = [p0]
    for i in range(3):
        pts.append(pts[-1] + d * L[i])
    for i in range(3):
        b = add_bone(f'{name}{i}', parent, pts[i], pts[i + 1]); parent = b
        segs.append((b, pts[i], pts[i + 1], R[i], R[i + 1], (d, s, n)))
        joints_dorsal.append((pts[i], d, n, s, R[i], i))
    nails.append((pts[2], pts[3], d, s, n, R[2], R[3]))

# polegar
T_CMC = np.array([2.05, -2.6, -0.55])
td = nrm([0.62, -0.70, -0.36])
T_L = [4.4, 3.1, 2.55]; T_R = [1.22, 1.06, 0.93, 0.80]
tpts = [T_CMC]
dirs = [td, nrm(td + np.array([-0.12, -0.12, -0.05])), nrm(td + np.array([-0.22, -0.18, -0.08]))]
for i in range(3): tpts.append(tpts[-1] + dirs[i] * T_L[i])
parent = B_HAND
# dorso do polegar: aponta para fora (+x,+z)
for i in range(3):
    d_, s_, n_ = frame(dirs[i], up=nrm([0.55, 0.0, 0.85]))
    b = add_bone(f'thumb{i}', parent, tpts[i], tpts[i + 1]); parent = b
    segs.append((b, tpts[i], tpts[i + 1], T_R[i] * (1.12 if i == 0 else 1), T_R[i + 1], (d_, s_, n_)))
    if i > 0: joints_dorsal.append((tpts[i], d_, n_, s_, T_R[i], i))
    if i == 2: nails.append((tpts[2], tpts[3], d_, s_, n_, T_R[2], T_R[3]))

def sdf_nail(p):
    out = np.full(len(p), 1e9)
    for (a, c, dd, ss, nn, r1, r2) in nails:
        a = np.asarray(a); c = np.asarray(c); L = np.linalg.norm(c - a)
        M = np.stack([ss, dd, nn], 1)
        q = p @ M; qa = a @ M; qc = c @ M; sc = np.array([0.93, 1.0, 1.06])
        shell = round_cone(q * sc, qa * sc, (qc + np.array([0, 0.06, 0]) @ np.eye(3)) * sc if False else qc * sc, r1 + 0.06, r2 + 0.055)
        ctr = a + dd * (L * 0.66) + nn * (r2 * 0.95)
        region = rbox(p, ctr, (r2 * 0.60, L * 0.40, r2 * 0.55), 0.18, M)
        out = np.minimum(out, smax(shell, region, 0.05))
    return out

def sdf(p, want_parts=False):
    # antebraço + pulso
    zs = np.array([1, 1, 1.32])
    arm = round_cone(p * zs, (0, 1.5, 0), (0, 15.5, 0), 2.45, 3.05)
    wrist = round_cone(p * np.array([1, 1, 1.42]), (0, -1.2, -0.2), (0, 2.6, -0.2), 2.75, 2.5)
    d = smin(arm, wrist, 1.8)
    styl = ellipsoid(p, (-2.55, 1.0, 0.35), (0.55, 0.65, 0.5))
    d = smin(d, styl, 0.5)
    # palma
    palm = rbox(p, (0.05, -5.4, -0.32), (2.95, 3.55, 0.82), 0.62)
    # afunila a palma para o pulso
    for name, mx, my, ang, L, R in FINGERS:
        mc = round_cone(p * np.array([1, 1, 1.25]), (mx * 0.45, -1.2, 0), (mx, my + 0.6, MCP_Z * 1.25), 1.0, 1.05)
        palm = smin(palm, mc, 1.4)
    d = smin(d, palm, 1.3)
    then = ellipsoid(p, (2.15, -4.3, -1.25), (1.55, 2.5, 1.15))
    hypo = ellipsoid(p, (-2.25, -5.4, -1.05), (1.15, 2.7, 1.0))
    pads = ellipsoid(p, (0.2, -8.5, -1.05), (3.3, 0.9, 0.85))
    d = smin(d, then, 1.0); d = smin(d, hypo, 1.0); d = smin(d, pads, 0.9)
    # nós dos dedos (MCP) no dorso
    for name, mx, my, ang, L, R in FINGERS:
        kn = ellipsoid(p, (mx, my + 0.35, 0.42), (R[0] * 0.95, 0.95, 0.9))
        d = smin(d, kn, 0.6)
    # tendões extensores no dorso
    for name, mx, my, ang, L, R in FINGERS:
        t = round_cone(p, (mx * 0.35, -0.8, 1.05), (mx, my + 0.6, 1.05), 0.2, 0.26)
        d = smin(d, t, 0.45)
    # veias dorsais (sutis)
    vpts = [[(-0.6, 0.5, 1.12), (-0.2, -2.4, 1.18), (0.6, -4.4, 1.18), (1.4, -6.6, 1.16)],
            [(-1.9, -1.0, 1.1), (-1.5, -3.6, 1.18), (-0.5, -4.4, 1.2)],
            [(1.2, 0.2, 1.08), (1.7, -2.0, 1.12), (2.6, -3.4, 1.0)]]
    for chain in vpts:
        for a, b in zip(chain[:-1], chain[1:]):
            v = round_cone(p, a, b, 0.17, 0.17); d = smin(d, v, 0.35)
    # dedos
    for (b, a, c, r1, r2, fr) in segs:
        dd, ss, nn = fr
        # seção levemente oval (mais larga que alta)
        M = np.stack([ss, dd, nn], 1)  # colunas
        q = p @ M; qa = np.asarray(a) @ M; qc = np.asarray(c) @ M
        sc = np.array([0.93, 1.0, 1.06])
        seg = round_cone(q * sc, qa * sc, qc * sc, r1, r2)
        # almofada palmar
        mid = (np.asarray(a) + np.asarray(c)) / 2 - nn * (r1 + r2) * 0.22
        L = np.linalg.norm(np.asarray(c) - np.asarray(a))
        pad = ellipsoid(p, mid, (r1 * 0.8, L * 0.42, (r1 + r2) * 0.42), M)
        seg = smin(seg, pad, 0.3)
        k = 0.9 if bones[b]['parent'] in (B_HAND,) else 0.22
        d = smin(d, seg, k)
    # unhas (placa curva que acompanha o dedo)
    d = smin(d, sdf_nail(p), 0.035)
    return d

# ---------------- grade ----------------
VOX = float(sys.argv[1]) if len(sys.argv) > 1 else 0.11
xs = np.arange(-6.0, 10.5, VOX); ys = np.arange(-21.0, 13.0, VOX); zs_ = np.arange(-6.6, 4.0, VOX)
print('grid', len(xs), len(ys), len(zs_))
vol = np.zeros((len(xs), len(ys), len(zs_)), np.float32)
X, Z = np.meshgrid(xs, zs_, indexing='ij')
for j, y in enumerate(ys):
    P = np.stack([X.ravel(), np.full(X.size, y), Z.ravel()], 1)
    vol[:, j, :] = sdf(P).reshape(X.shape)
verts, faces, normals, _ = measure.marching_cubes(vol, 0.0, spacing=(VOX, VOX, VOX))
verts += np.array([xs[0], ys[0], zs_[0]])
# corta o antebraço no topo
keep_v = verts[:, 1] < 12.4
fk = keep_v[faces].all(1); faces = faces[fk]
used = np.unique(faces); remap = -np.ones(len(verts), int); remap[used] = np.arange(len(used))
verts = verts[used]; faces = remap[faces]
# normais pelo gradiente analítico (diferenças centrais na SDF)
e = 0.02
g = np.stack([sdf(verts + [e, 0, 0]) - sdf(verts - [e, 0, 0]),
              sdf(verts + [0, e, 0]) - sdf(verts - [0, e, 0]),
              sdf(verts + [0, 0, e]) - sdf(verts - [0, 0, e])], 1)
normals = g / np.linalg.norm(g, axis=1, keepdims=True)
print('verts', len(verts), 'tris', len(faces))
# orientação dos triângulos: garantir que a normal geométrica concorde com a normal
fn = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
if (np.einsum('ij,ij->i', fn, normals[faces[:, 0]]) < 0).mean() > 0.5:
    faces = faces[:, ::-1].copy()

# ---------------- atributos ----------------
V = verts; N = normals
# AO
ao = np.zeros(len(V))
for i, h in enumerate([0.15, 0.35, 0.7, 1.2, 1.9]):
    ao += (h - np.minimum(sdf(V + N * h), h)) / h * (0.55 ** i)
ao = np.clip(1 - ao * 0.55, 0, 1)
# espessura (para translucidez)
th = np.zeros(len(V))
for h in [0.3, 0.6, 1.0, 1.5, 2.2, 3.0]:
    th += (sdf(V - N * h) < 0)
th = th / 6.0
# unha
nail = np.clip(1 - (sdf_nail(V) + 0.01) / 0.05, 0, 1)
# pontinha livre da unha: proximidade da ponta
tipw = np.zeros(len(V))
for (a, c, dd, ss, nn, r1, r2) in nails:
    t = (V - np.asarray(c)) @ dd
    tipw = np.maximum(tipw, np.clip((t + 0.05) / 0.12, 0, 1) * (nail > 0.3))
# rugas: coordenada ao longo do eixo e máscara dorsal perto das articulações
wr_u = np.zeros(len(V)); wr_m = np.zeros(len(V)); best = np.full(len(V), 1e9)
for (jp, dd, nn, ss, r, lvl) in joints_dorsal:
    q = V - jp; u = q @ dd; dist = np.linalg.norm(q - np.outer(u, dd), axis=1)
    dors = np.clip((q @ nn) / (r * 0.9), 0, 1)
    score = np.abs(u) + np.abs(dist - r) * 2
    sel = score < best
    m = np.clip(1 - np.abs(u) / (0.7 if lvl > 0 else 0.9), 0, 1) ** 1.5 * dors * np.clip(1 - np.abs(dist - r) / 0.7, 0, 1)
    m *= (0.5 if lvl == 0 else 1.0)
    sel = m > wr_m
    wr_u = np.where(sel, u, wr_u); wr_m = np.where(sel, m, wr_m)
# vermelhidão: nós, pontas dos dedos, palma
red = np.zeros(len(V))
for (jp, dd, nn, ss, r, lvl) in joints_dorsal:
    red = np.maximum(red, np.exp(-np.sum((V - (jp + nn * r * 0.7)) ** 2, 1) / 0.6) * 0.8)
for (a, c, dd, ss, nn, r1, r2) in nails:
    red = np.maximum(red, np.exp(-np.sum((V - np.asarray(c)) ** 2, 1) / 1.2))
red = np.maximum(red, np.clip(-V[:, 2] - 0.6, 0, 1) * (V[:, 1] < -1) * 0.5)

# ---------------- pesos dos ossos ----------------
def seg_dist(p, a, b):
    a = np.asarray(a); b = np.asarray(b); ab = b - a; t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(p - (a + np.outer(t, ab)), axis=1), (p - a) @ nrm(ab)
nb = len(bones)
D = np.full((len(V), nb), 1e9); S = np.zeros((len(V), nb))
for (b, a, c, r1, r2, fr) in segs:
    dist, along = seg_dist(V, a, c); D[:, b] = dist - r1; S[:, b] = along
# mão: distância à palma (aprox pela sdf de partes da palma) -> usamos a distância a um retângulo
palm_d = rbox(V, (0.05, -5.0, -0.3), (2.9, 4.6, 0.8), 0.6)
D[:, B_HAND] = palm_d + 0.15
D[:, B_ARM] = np.where(V[:, 1] > 0.6, -1, 1e9)
owner = D.argmin(1)
b0 = owner.copy(); b1 = owner.copy(); w0 = np.ones(len(V))
par = np.array([bb['parent'] for bb in bones])
for i in range(len(V)):
    pass
# vetorizado: dedos/polegar misturam com o pai perto da articulação
isseg = np.isin(owner, [s[0] for s in segs])
along_own = S[np.arange(len(V)), owner]
wself = np.clip((along_own + 0.5) / 1.0, 0, 1); wself = wself * wself * (3 - 2 * wself)
b1 = np.where(isseg, par[owner], owner)
w0 = np.where(isseg, wself, 1.0)
# vértices da palma perto do início de um dedo: misturar com o falange proximal mais próxima
prox = [s[0] for s in segs if par[s[0]] == B_HAND]
for b in prox:
    dist = D[:, b]; al = S[:, b]
    cand = (owner == B_HAND) & (dist < 0.6) & (al > -0.9)
    w = np.clip((al + 0.9) / 1.0, 0, 1); w = w * w * (3 - 2 * w) * 0.5
    sel = cand & (w > 0)
    b0 = np.where(sel, b, b0); b1 = np.where(sel, B_HAND, b1); w0 = np.where(sel, w, w0)
# pulso: mistura braço/mão
wy = np.clip((V[:, 1] - (-0.6)) / 2.2, 0, 1); wy = wy * wy * (3 - 2 * wy)
inwrist = (owner == B_ARM) | (owner == B_HAND) & (V[:, 1] > -0.6)
b0 = np.where(inwrist, B_ARM, b0); b1 = np.where(inwrist, B_HAND, b1); w0 = np.where(inwrist, wy, w0)

# ---------------- exporta ----------------
mn = V.min(0); mx_ = V.max(0)
q = np.round((V - mn) / (mx_ - mn) * 65535).astype(np.uint16)
n8 = np.round(N * 127).astype(np.int8)
def u8(a): return np.round(np.clip(a, 0, 1) * 255).astype(np.uint8)
rec = np.zeros(len(V), dtype=[('p', '<u2', 3), ('n', 'i1', 3), ('b0', 'u1'), ('b1', 'u1'), ('w', 'u1'),
                               ('ao', 'u1'), ('th', 'u1'), ('nail', 'u1'), ('tip', 'u1'), ('wu', 'i1'), ('wm', 'u1'), ('red', 'u1'), ('pad', 'u1')])
rec['p'] = q; rec['n'] = n8; rec['b0'] = b0; rec['b1'] = b1; rec['w'] = u8(w0)
rec['ao'] = u8(ao); rec['th'] = u8(th); rec['nail'] = u8(nail); rec['tip'] = u8(tipw)
rec['wu'] = np.clip(np.round(wr_u * 100), -127, 127).astype(np.int8); rec['wm'] = u8(wr_m); rec['red'] = u8(red)
print('stride', rec.dtype.itemsize)
idx = faces.astype(np.uint16 if len(V) < 65536 else np.uint32)
with open('/home/claude/claysp/assets/hand.bin', 'wb') as f:
    hdr = struct.pack('<4sIIffffff', b'HND1', len(V), len(idx) * 3, *mn, *mx_)
    f.write(hdr); f.write(rec.tobytes()); f.write(idx.tobytes())
meta = dict(bones=bones, stride=rec.dtype.itemsize, idx16=bool(len(V) < 65536))
json.dump(meta, open('/home/claude/claysp/assets/hand.json', 'w'), indent=0)
np.save('hand_preview.npy', dict(V=V, F=faces, N=N, ao=ao, owner=owner))
print('ok', mn, mx_)
