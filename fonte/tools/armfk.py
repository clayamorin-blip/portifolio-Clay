import numpy as np
from glb import *
g=GLB('arm.glb')
skin=g.j['skins'][0]; joints=skin['joints']; jidx={j:k for k,j in enumerate(joints)}
IBM=g.acc(skin['inverseBindMatrices']).reshape(-1,4,4).transpose(0,2,1)
anim=g.j['animations'][0]
ch={}
for c in anim['channels']:
    s=anim['samplers'][c['sampler']]
    ch[(c['target']['node'],c['target']['path'])]=(g.acc(s['input']),g.acc(s['output']))
def sample(node,path,t,default):
    if (node,path) not in ch: return default
    T,O=ch[(node,path)]; i=np.searchsorted(T,t); i=min(max(i,0),len(T)-1); return list(O[i])
def joint_worlds(t=None, override=None):
    out=[]
    for k,j in enumerate(joints):
        n=dict(g.nodes[j])
        if t is not None:
            n['rotation']=sample(j,'rotation',t,n.get('rotation',[0,0,0,1]))
            n['translation']=sample(j,'translation',t,n.get('translation',[0,0,0]))
        if override and k in override: n['rotation']=override[k]
        M=local(n); i=j
        # sobe pela hierarquia (pais que são juntas usam pose animada)
        out.append((j,M))
    W={}
    def wm(j):
        if j in W: return W[j]
        k=jidx.get(j)
        M=out[k][1] if k is not None else local(g.nodes[j])
        p=g.parent.get(j)
        R=(wm(p)@M) if p is not None else M
        W[j]=R; return R
    return np.array([wm(j) for j in joints])
