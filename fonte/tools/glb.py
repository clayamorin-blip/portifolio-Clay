import json, struct, numpy as np
CT={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32}
NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
class GLB:
    def __init__(s,path):
        b=open(path,'rb').read(); off=12; ch=[]
        while off<len(b):
            cl,ct=struct.unpack('<II',b[off:off+8]); ch.append(b[off+8:off+8+cl]); off+=8+cl
        s.j=json.loads(ch[0]); s.bin=ch[1]
        s.nodes=s.j['nodes']; s.parent={}
        for i,n in enumerate(s.nodes):
            for c in n.get('children',[]): s.parent[c]=i
    def acc(s,i):
        a=s.j['accessors'][i]; bv=s.j['bufferViews'][a['bufferView']]
        dt=CT[a['componentType']]; n=NC[a['type']]; cnt=a['count']
        off=bv.get('byteOffset',0)+a.get('byteOffset',0); stride=bv.get('byteStride',0)
        isz=np.dtype(dt).itemsize*n
        if stride and stride!=isz:
            raw=np.frombuffer(s.bin,np.uint8,count=stride*(cnt-1)+isz,offset=off)
            out=np.stack([np.frombuffer(raw[k*stride:k*stride+isz].tobytes(),dt) for k in range(cnt)])
        else:
            out=np.frombuffer(s.bin,dt,count=cnt*n,offset=off).reshape(cnt,n) if n>1 else np.frombuffer(s.bin,dt,count=cnt,offset=off)
        if a.get('normalized'):
            out=out.astype(np.float32)/np.iinfo(dt).max
        return np.array(out)
    def image(s,i):
        im=s.j['images'][i]; bv=s.j['bufferViews'][im['bufferView']]
        o=bv.get('byteOffset',0); return s.bin[o:o+bv['byteLength']]
def qmat(q):
    x,y,z,w=q
    return np.array([[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y)],[2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x)],[2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]])
def local(n):
    if 'matrix' in n: return np.array(n['matrix'],float).reshape(4,4).T
    M=np.eye(4); R=qmat(n.get('rotation',[0,0,0,1])); S=np.diag(n.get('scale',[1,1,1]))
    M[:3,:3]=R@S; M[:3,3]=n.get('translation',[0,0,0]); return M
def world(g,i):
    M=local(g.nodes[i])
    while i in g.parent: i=g.parent[i]; M=local(g.nodes[i])@M
    return M
