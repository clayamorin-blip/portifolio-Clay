"""Prepara as texturas da Terra a partir das imagens da NASA (domínio público):
Blue Marble (superfície), Black Marble (luzes noturnas), máscara de oceanos, relevo e nuvens.
Uso: python tools/prepare_nasa.py PASTA_COM_AS_IMAGENS
(espera earth-blue-marble.jpg, earth-night.jpg, earth-water.png, earth-topology.png, clouds.png)"""
import sys, os
import numpy as np
from PIL import Image
src = sys.argv[1]; A = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets')
p = lambda n: os.path.join(src, n)
Image.open(p('earth-blue-marble.jpg')).convert('RGB').save(os.path.join(A, 'earth_day.jpg'), quality=84, optimize=True, progressive=True)
cl = np.asarray(Image.open(p('clouds.png')).convert('RGBA'))[..., 3]
Image.fromarray(cl).resize((2048, 1024), Image.LANCZOS).save(os.path.join(A, 'earth_clouds.jpg'), quality=82, optimize=True)
S = (2048, 1024)
water = np.asarray(Image.open(p('earth-water.png')).convert('L').resize(S, Image.LANCZOS)).astype(float)
night = np.asarray(Image.open(p('earth-night.jpg')).convert('RGB').resize(S, Image.LANCZOS)).astype(float)
lights = np.clip((night[..., 0] * 1.2 - night[..., 2] * 0.6 - 8) * 2.2, 0, 255)
topo = np.asarray(Image.open(p('earth-topology.png')).convert('L').resize(S, Image.LANCZOS)).astype(float)
Image.fromarray(np.stack([water, lights, topo], 2).astype(np.uint8)).save(os.path.join(A, 'earth_spec.jpg'), quality=86, optimize=True)
print('ok')
