# Converte o GLB (Robotic Prosthetic Arm, Daz, CC-BY 4.0) num formato compacto para o site:
#  assets/arm/arm.bin  (malha única, pose de repouso já no espaço do modelo, 4 ossos por vértice)
#  assets/arm/arm.json (ossos: hierarquia, pose de repouso, eixos de flexão medidos na animação original)
#  assets/arm/m{0..3}_d.jpg (R: base×oclusão, G: rugosidade, B: metal) · m{0..3}_n.jpg (normal) · m{0,1}_e.jpg (luzes)
import numpy as np, io, json, struct
from glb import *
from armfk import g, joints, IBM, joint_worlds, jidx
from PIL import Image
OUT='/home/claude/claysp/assets/arm/'
JW0=joint_worlds(None)
SK=JW0@IBM            # matriz de pele na pose de repouso
P_all=[];N_all=[];T_all=[];UV_all=[];J_all=[];W_all=[];M_all=[];I_all=[];RANGES={}
icount=0
base=0
for m in g.j['meshes']:
    p=m['primitives'][0]; a=p['attributes']
    P=g.acc(a['POSITION']).astype(np.float64); N=g.acc(a['NORMAL']).astype(np.float64); T=g.acc(a['TANGENT']).astype(np.float64)
    UV=g.acc(a['TEXCOORD_0']).astype(np.float64); J=g.acc(a['JOINTS_0']).astype(int); W=g.acc(a['WEIGHTS_0']).astype(np.float64)
    W=W/np.maximum(W.sum(1,keepdims=True),1e-9)
    Mk=np.einsum('nc,ncij->nij',W,SK[J])
    Pw=np.einsum('nij,nj->ni',Mk,np.c_[P,np.ones(len(P))])[:,:3]
    R3=Mk[:,:3,:3]
    Nw=np.einsum('nij,nj->ni',R3,N); Nw/=np.linalg.norm(Nw,axis=1,keepdims=True)
    Tw=np.einsum('nij,nj->ni',R3,T[:,:3]); Tw/=np.maximum(np.linalg.norm(Tw,axis=1,keepdims=True),1e-9)
    idx=g.acc(p['indices']).astype(np.int64)+base
    P_all.append(Pw);N_all.append(Nw);T_all.append(np.c_[Tw,T[:,3]]);UV_all.append(UV);J_all.append(J);W_all.append(W)
    M_all.append(np.full(len(P),p['material']));I_all.append(idx); base+=len(P)
    mt=p['material']; r=RANGES.setdefault(mt,[icount,0]); assert r[0]+r[1]==icount, 'faixa não contígua'; r[1]+=len(idx); icount+=len(idx)
P=np.concatenate(P_all);N=np.concatenate(N_all);T=np.concatenate(T_all);UV=np.concatenate(UV_all);J=np.concatenate(J_all);W=np.concatenate(W_all);MAT=np.concatenate(M_all);I=np.concatenate(I_all)
print('verts',len(P),'tris',len(I)//3,'uv range',UV.min(0),UV.max(0))
mn=P.min(0); mx=P.max(0)
uvmn=UV.min(0); uvmx=UV.max(0)
rec=np.zeros(len(P),dtype=[('p','<u2',3),('m','u1'),('pad','u1'),('n','i1',4),('t','i1',4),('uv','<u2',2),('j','u1',4),('w','u1',4)])
rec['p']=np.round((P-mn)/(mx-mn)*65535); rec['m']=MAT
rec['n'][:,:3]=np.round(N*127); rec['t'][:,:3]=np.round(T[:,:3]*127); rec['t'][:,3]=np.sign(T[:,3]).astype(int)*127
rec['uv']=np.round((UV-uvmn)/(uvmx-uvmn)*65535)
rec['j']=J; wq=np.round(W*255).astype(int); wq[:,0]+=255-wq.sum(1); rec['w']=np.clip(wq,0,255)
idx=I.astype(np.uint16 if len(P)<65536 else np.uint32)
with open(OUT+'arm.bin','wb') as f:
    f.write(struct.pack('<4sII',b'ARM1',len(P),len(I)))
    f.write(struct.pack('<10f',*mn,*mx,*uvmn,*uvmx)); f.write(rec.tobytes()); f.write(idx.tobytes())
print('stride',rec.dtype.itemsize,'bytes',rec.nbytes+idx.nbytes)
# pontos da face palmar (espaço do modelo): menor z da malha da mão em alguns pontos
H=P[(MAT==2)]
palm=[]
for (x,y) in [(0,13),(0,16),(2.5,15),(-2.5,15),(1.5,18),(-2,18),(4,13.5),(-4,14)]:
    sel=H[(np.abs(H[:,0]-x)<1.0)&(np.abs(H[:,1]-y)<1.0)]
    if len(sel): palm.append([x,y,float(sel[:,2].min())])
print('palm',palm)
# ossos: pose de repouso (local, em relação ao pai dentro do esqueleto) e mundo
names=[g.nodes[j]['name'] for j in joints]
parent=[jidx.get(g.parent.get(j),-1) for j in joints]
# matriz do pai fora do esqueleto (para o primeiro osso)
rootParentW=np.eye(4)
pj=g.parent.get(joints[0]); 
if pj is not None: rootParentW=world(g,pj)
# eixos de flexão: compara repouso e punho fechado (t=4s) na animação original
def nodeRot(k,t): 
    from armfk import sample
    j=joints[k]; return np.array(sample(j,'rotation',t,g.nodes[j].get('rotation',[0,0,0,1])),float)
def qinv(q): return np.array([-q[0],-q[1],-q[2],q[3]])
def qmul(a,b):
    return np.array([a[3]*b[0]+a[0]*b[3]+a[1]*b[2]-a[2]*b[1],a[3]*b[1]-a[0]*b[2]+a[1]*b[3]+a[2]*b[0],a[3]*b[2]+a[0]*b[1]-a[1]*b[0]+a[2]*b[3],a[3]*b[3]-a[0]*b[0]-a[1]*b[1]-a[2]*b[2]])
flex={}
for k in range(len(joints)):
    if k<3: continue
    q0=np.array(g.nodes[joints[k]].get('rotation',[0,0,0,1]),float); q1=nodeRot(k,4.0)
    d=qmul(qinv(q0),q1)
    if d[3]<0: d=-d
    ang=2*np.arccos(np.clip(d[3],-1,1)); ax=d[:3]/max(np.linalg.norm(d[:3]),1e-9)
    flex[k]=dict(axis=ax.round(5).tolist(),angle=round(float(ang),4))
    print(k,names[k],'axis',ax.round(3),'ang',round(float(np.degrees(ang)),1))
bones=[]
for k,j in enumerate(joints):
    n=g.nodes[j]
    bones.append(dict(name=names[k],parent=parent[k],t=n.get('translation',[0,0,0]),r=n.get('rotation',[0,0,0,1]),s=n.get('scale',[1,1,1]),
                      flex=flex.get(k)))
json.dump(dict(bones=bones,rootParent=rootParentW.T.flatten().round(6).tolist(),restWorld=[m.T.flatten().round(6).tolist() for m in JW0],
               stride=int(rec.dtype.itemsize), ranges=[RANGES[k] for k in sorted(RANGES)], palm=palm,idx16=bool(len(P)<65536),
               credit='"Robotic Prosthetic Arm" by Daz (https://sketchfab.com/Darren.Hogan), CC BY 4.0'),open(OUT+'arm.json','w'))
# texturas
mats=g.j['materials']
def img(i): return Image.open(io.BytesIO(g.image(g.j['textures'][i]['source'])))
for mi,m in enumerate(mats):
    pbr=m['pbrMetallicRoughness']
    S=1024
    bc=np.asarray(img(pbr['baseColorTexture']['index']).convert('L').resize((S,S),Image.LANCZOS)).astype(float)
    mr=np.asarray(img(pbr['metallicRoughnessTexture']['index']).convert('RGB').resize((S,S),Image.LANCZOS)).astype(float)
    d=np.stack([bc*mr[...,0]/255,mr[...,1],mr[...,2]],2)
    Image.fromarray(np.clip(d,0,255).astype(np.uint8)).save(OUT+f'm{mi}_d.jpg',quality=88)
    img(m['normalTexture']['index']).convert('RGB').resize((S,S),Image.LANCZOS).save(OUT+f'm{mi}_n.jpg',quality=90)
    if 'emissiveTexture' in m:
        e=img(m['emissiveTexture']['index']).convert('L').resize((512,512),Image.LANCZOS)
        e.save(OUT+f'm{mi}_e.jpg',quality=85)
print('ok')
