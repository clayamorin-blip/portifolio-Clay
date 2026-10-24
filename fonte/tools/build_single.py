"""Junta o site inteiro em um único arquivo: dist/index.html (CSS, JS, imagens e a mão embutidos).
Rode:  python tools/build_single.py"""
import os, re, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rd = lambda p: open(os.path.join(ROOT, p), encoding='utf-8').read()
html = rd('index.html')
html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + rd('css/style.css') + '\n</style>')
def inline(m):
    src = m.group(1)
    code = rd(src)
    if src == 'js/assets-data.js':
        code += "\n" + rd("js/arm-data.js")
    return '<script>\n' + code.replace('</script', '<\\/script') + '\n</script>'
html = re.sub(r'<script src="(js/[^"]+)"></script>', inline, html)
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
open(os.path.join(ROOT, 'dist', 'index.html'), 'w', encoding='utf-8').write(html)
print('dist/index.html', len(html) // 1024, 'KB')
# no repositório, a pasta do projeto fica em fonte/ e o site publicado é o index.html da raiz
parent = os.path.dirname(ROOT)
if os.path.exists(os.path.join(parent, 'server.js')):
    open(os.path.join(parent, 'index.html'), 'w', encoding='utf-8').write(html)
    print('index.html da raiz atualizado')
