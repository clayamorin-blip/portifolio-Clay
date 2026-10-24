from PIL import Image
import numpy as np, json
from scipy import ndimage as ndi
im=np.asarray(Image.open('logo_src.png').convert('RGB')).astype(np.float32)
lum=im.max(2)
X0,Y0,X1,Y1=290,205,1255,745
pieces={'mark':(530,212,985,565),'c':(300,596,456,732),'l':(482,604,592,732),'a':(600,604,776,732),'y':(774,604,930,732),'s':(936,604,1076,732),'p':(1094,604,1243,732)}
out={'stage':[X1-X0,Y1-Y0],'pieces':{}}
for k,(x0,y0,x1,y1) in pieces.items():
    sub=im[y0:y1,x0:x1]; L=lum[y0:y1,x0:x1]
    m=L>34
    m=ndi.binary_closing(m,structure=np.ones((3,3)),iterations=2)
    holes=ndi.binary_fill_holes(m)&~m
    lab,n=ndi.label(holes); sizes=ndi.sum(holes,lab,range(1,n+1))
    for i,s in enumerate(sizes):
        if s<400: m[lab==i+1]=True
    lab,n=ndi.label(m); sizes=ndi.sum(m,lab,range(1,n+1))
    for i,s in enumerate(sizes):
        if s<20: m[lab==i+1]=False
    a=ndi.gaussian_filter(m.astype(np.float32),0.7)
    soft=np.clip((L-12)/60,0,1)**1.3; soft[soft<0.05]=0
    alpha=np.clip(np.maximum(a,soft),0,1)
    rgb=np.clip(sub/np.maximum(alpha[...,None],1e-3),0,255)
    rgba=np.dstack([rgb,alpha*255]).astype(np.uint8)
    Image.fromarray(rgba).save(f'/home/claude/claysp/assets/{dict(mark='symbol',c='lC',l='lL',a='lA',y='lY',s='lS',p='lP')[k]}.png',optimize=True)
    out['pieces'][k]=[x0-X0,y0-Y0,x1-x0,y1-y0]
json.dump(out,open('logo_layout.json','w'))
for bg,name in [((120,20,20,255),'prev_red.png'),((0,0,0,255),'prev_black.png')]:
    cv=Image.new('RGBA',(X1-X0,Y1-Y0),bg)
    for k,(x,y,w,h) in out['pieces'].items():
        cv.alpha_composite(Image.open(f'/home/claude/claysp/assets/{dict(mark='symbol',c='lC',l='lL',a='lA',y='lY',s='lS',p='lP')[k]}.png'),(x,y))
    cv.save(name)
# diff vs original on black
orig=Image.open('logo_src.png').convert('RGB').crop((X0,Y0,X1,Y1))
d=np.abs(np.asarray(orig).astype(int)-np.asarray(Image.open('prev_black.png').convert('RGB')).astype(int))
print('max diff',d.max(),'mean',d.mean())
