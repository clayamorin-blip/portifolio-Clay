"""Gera js/assets-data.js (imagens) e js/hand-data.js (malha da mão) embutidos.
Assim o site funciona até abrindo o index.html com dois cliques (sem servidor).
Rode de novo se trocar alguma imagem da pasta assets:  python tools/embed_assets.py
"""
import base64, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILES = {
    'symbol': 'symbol.png', 'C': 'lC.png', 'L': 'lL.png', 'A': 'lA.png', 'Y': 'lY.png', 'S': 'lS.png', 'P': 'lP.png',
    'earthDay': 'earth_day.jpg', 'earthClouds': 'earth_clouds.jpg', 'earthSpec': 'earth_spec.jpg',
}
out = {}
for key, name in FILES.items():
    path = os.path.join(ROOT, 'assets', name)
    mime = 'image/png' if name.endswith('.png') else 'image/jpeg'
    with open(path, 'rb') as f:
        out[key] = f'data:{mime};base64,' + base64.b64encode(f.read()).decode()
meta = json.load(open(os.path.join(ROOT, 'assets', 'hand.json')))
with open(os.path.join(ROOT, 'js', 'assets-data.js'), 'w') as f:
    f.write('/* Gerado por tools/embed_assets.py — não editar à mão */\nwindow.CLAY_ASSETS = ' + json.dumps(out) + ';\n')
    f.write('window.CLAY_HAND_META = ' + json.dumps(meta, separators=(',', ':')) + ';\n')
with open(os.path.join(ROOT, 'assets', 'hand.bin'), 'rb') as f:
    b64 = base64.b64encode(f.read()).decode()
with open(os.path.join(ROOT, 'js', 'hand-data.js'), 'w') as f:
    f.write('/* Gerado por tools/embed_assets.py — malha da mão (usada só ao abrir sem servidor) */\nwindow.CLAY_HAND_B64 = "' + b64 + '";\n')
print('ok', sum(len(v) for v in out.values()) // 1024, 'KB +', len(b64) // 1024, 'KB')
