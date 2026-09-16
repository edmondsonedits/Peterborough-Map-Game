"""Fit CC0 MakeHuman graphical assets; no MakeHuman application code imported."""
import bpy, numpy as np
from pathlib import Path

def read_obj(path):
    verts=[];uv=[];faces=[];groups=[];group=''
    for line in Path(path).read_text().splitlines():
        p=line.split()
        if not p:continue
        if p[0]=='v':verts.append(list(map(float,p[1:4])))
        elif p[0]=='vt':uv.append(list(map(float,p[1:3])))
        elif p[0]=='g':group=p[1]
        elif p[0]=='f':faces.append([tuple(int(a)-1 for a in token.split('/')[:2]) for token in p[1:]]);groups.append(group)
    return np.array(verts),uv,faces,groups

def add_anatomy(vendor,parent):
    base,uv,faces,groups=read_obj(vendor/'base.obj');shaped=base.copy()
    for name,weight in [('caucasian-male-young.target',1),('universal-male-young-averagemuscle-averageweight.target',.75),('universal-male-young-maxmuscle-averageweight.target',.25),('head-square.target',.32),('head-scale-vert-decr.target',.08)]:
        for line in (vendor/name).read_text().splitlines():
            p=line.split()
            if len(p)==4 and not line.startswith('#'):shaped[int(p[0])]+=np.array(list(map(float,p[1:])))*weight
    top=shaped[:13380,1].max();offset=1.89-top*.1
    def transform(v):
        result=[]
        for p in v:
            height=1.67+(float(p[1])*.1+offset-1.67)*1.06-.02
            x=float(p[0])*.108;depth=float(p[2])*.108
            if height<1.64:
                x=max(-.076,min(.076,x));depth=max(-.071,min(.071,depth))
            result.append((x,depth,height))
        return result
    def mesh(name,v,tex,polys,material):
        used=sorted({c[0] for f in polys for c in f});lookup={v:i for i,v in enumerate(used)}
        data=bpy.data.meshes.new(name);data.from_pydata(transform(v[used]),[],[[lookup[c[0]] for c in f] for f in polys]);data.update()
        layer=data.uv_layers.new(name='UVMap')
        for p,f in zip(data.polygons,polys):
            p.use_smooth=True
            for li,c in zip(p.loop_indices,f):layer.data[li].uv=tex[c[1]]
        obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.data.materials.append(material);obj.parent=parent;return obj
    def material(name,path,alpha=False,rough=.62):
        m=bpy.data.materials.new(name);m.use_nodes=True;n=m.node_tree.nodes;p=n.get('Principled BSDF');p.inputs['Roughness'].default_value=rough
        t=n.new('ShaderNodeTexImage');t.image=bpy.data.images.load(str(path),check_existing=True);m.node_tree.links.new(t.outputs['Color'],p.inputs['Base Color'])
        if alpha:m.node_tree.links.new(t.outputs['Alpha'],p.inputs['Alpha']);m.surface_render_method='DITHERED'
        if name=='short04':
            mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.6,.28,.10,1)
            m.node_tree.links.new(t.outputs['Color'],mix.inputs[1]);m.node_tree.links.new(mix.outputs[0],p.inputs['Base Color']);p.inputs['Roughness'].default_value=.75
        if name=='Anatomical skin':p.inputs['Subsurface Weight'].default_value=.06
        return m
    skin=material('Anatomical skin',vendor/'skins/young_caucasian_male2/young_lightskinned_male_diffuse2.png')
    head=mesh('Anatomical head and neck',shaped,uv,[f for f,g in zip(faces,groups) if g=='body' and all(shaped[c[0],1]>top-3.1 for c in f)],skin)
    sub=head.modifiers.new('Facial surface','SUBSURF');sub.levels=1
    bpy.context.view_layer.objects.active=head;head.select_set(True);bpy.ops.object.modifier_apply(modifier=sub.name);head.select_set(False)
    def proxy(folder,name,texture,alpha=False):
        path=vendor/folder/name;v,tex,polys,_=read_obj(path.with_suffix('.obj'));mapping=[];scale=np.ones(3);reading=False
        for line in path.with_suffix('.mhclo').read_text().splitlines():
            p=line.split()
            if not p or p[0].startswith('#'):continue
            if p[0] in ['x_scale','y_scale','z_scale']:
                axis='xyz'.index(p[0][0]);scale[axis]=abs(shaped[int(p[1]),axis]-shaped[int(p[2]),axis])/float(p[3])
            elif p[0]=='verts':reading=True
            elif reading:
                if not p[0].lstrip('-').isdigit():
                    if not mapping:continue
                    break
                mapping.append(p)
        for i,p in enumerate(mapping[:len(v)]):
            if len(p)==1:v[i]=shaped[int(p[0])]
            elif len(p)>=9:v[i]=sum(shaped[int(p[j])]*float(p[j+3]) for j in range(3))+np.array(list(map(float,p[6:9])))*scale
        return mesh(name,v,tex,polys,material(name,vendor/texture,alpha,.7 if alpha else .28))
    proxy('eyes/high-poly','high-poly','eyes/materials/bluegreen_eye.png',True)
    proxy('eyebrows/eyebrow001','eyebrow001','eyebrows/eyebrow001/eyebrow001.png',True)
    hair=proxy('hair/short04','short04','hair/short04/short04_diffuse.png',True)
    for v in hair.data.vertices:
        weight=max(0,min(1,(v.co.z-1.79)/.09))*max(0,min(1,(v.co.y+.015)/.11))
        v.co.z+=.027*weight;v.co.x+=.01*weight
    return head
