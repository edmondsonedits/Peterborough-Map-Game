"""Render the actual editable model under neutral studio lighting."""
import bpy, math
from pathlib import Path
from mathutils import Vector
root=Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(root/'assets-source/characters/firefighter.blend'))
scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=32;scene.cycles.use_denoising=True
scene.render.resolution_x=1100;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.15,.15,.15,1);scene.world.node_tree.nodes['Background'].inputs[1].default_value=.35
def area(n,p,power,size):
 data=bpy.data.lights.new(n,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(n,data);scene.collection.objects.link(o);o.location=p;o.rotation_euler=(Vector((0,0,1))-o.location).to_track_quat('-Z','Y').to_euler()
area('Large soft key',(-3,4,4),700,4);area('Soft fill',(3,2,2),220,3);area('Edge light',(1,-3,3),500,2)
bpy.ops.mesh.primitive_plane_add(size=200);floor=bpy.context.object;floor.name='Review floor';m=bpy.data.materials.new('Studio charcoal');m.diffuse_color=(.08,.085,.09,1);floor.data.materials.append(m)
bpy.ops.object.camera_add();cam=bpy.context.object;scene.camera=cam;cam.data.type='ORTHO';cam.data.ortho_scale=2.2
def view(p,target,scale):cam.location=p;cam.rotation_euler=(Vector(target)-cam.location).to_track_quat('-Z','Y').to_euler();cam.data.ortho_scale=scale
view((2.5,6,2.1),(0,0,.98),2.2)
bpy.ops.file.pack_all();bpy.ops.wm.save_as_mainfile(filepath=str(root/'assets-source/characters/firefighter-review.blend'))
for name,p,target,scale in [('studio-front',(2.5,6,2.1),(0,0,.98),2.2),('studio-head',(1.4,6,1.92),(0,0,1.72),.55),('studio-back',(-2.5,-6,2.1),(0,0,.98),2.2)]:
 view(p,target,scale);scene.render.filepath=str(root/'artifacts'/('firefighter-'+name+'.png'));bpy.ops.render.render(write_still=True)
