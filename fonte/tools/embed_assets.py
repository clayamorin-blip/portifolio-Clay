"""Gera js/assets-data.js (imagens + dados do braço) e js/arm-data.js (malha do braço) embutidos.
Assim o site funciona até abrindo o index.html com dois cliques (sem servidor).
Rode de novo se trocar alguma imagem da pasta assets:  python tools/embed_assets.py
"""
import base64, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = {
    'symbol': 'symbol.png', 'C': 'lC.png', 'L': 'lL.png', 'A': 'lA.png', 'Y': 'lY.png', 'S': 'lS.png', 'P': 'lP.png',
    'earthDay': 'earth_day.jpg', 'earthClouds': 'earth_clouds.jpg', 'earthSpec': 'earth_spec.jpg',
}
for i in range(4):
    FILES[f'arm{i}d'] = f'arm/m{i}_d.jpg'; FILES[f'arm{i}n'] = f'arm/m{i}_n.jpg'
FILES['arm0e'] = 'arm/m0_e.jpg'; FILES['arm1e'] = 'arm/m1_e.jpg'
out = {}
for key, name in FILES.items():
    path = os.path.join(ROOT, 'assets', name)
    mime = 'image/png' if name.endswith('.png') else 'image/jpeg'
    with open(path, 'rb') as f:
        out[key] = f'data:{mime};base64,' + base64.b64encode(f.read()).decode()
meta = json.load(open(os.path.join(ROOT, 'assets', 'arm', 'arm.json')))
with open(os.path.join(ROOT, 'js', 'assets-data.js'), 'w') as f:
    f.write('/* Gerado por tools/embed_assets.py — não editar à mão */\nwindow.CLAY_ASSETS = ' + json.dumps(out) + ';\n')
    f.write('window.CLAY_ARM_META = ' + json.dumps(meta, separators=(',', ':')) + ';\n')
with open(os.path.join(ROOT, 'assets', 'arm', 'arm.bin'), 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
with open(os.path.join(ROOT, 'js', 'arm-data.js'), 'w') as f:
    f.write('/* Gerado por tools/embed_assets.py — malha do braço robótico (CC BY 4.0, Daz) */\nwindow.CLAY_ARM_B64 = "' + b64 + '";\n')
print('ok', sum(len(v) for v in out.values()) // 1024, 'KB +', len(b64) // 1024, 'KB')
