"""Render actual eligible/emitted paint XY and unresolved contact patches to SVG.
Usage: python tools/plot_historical_contact_qa.py INPUT.json OUTPUT.svg
No external imagery; input comes from test_historical_visible_road_top.mjs.
"""
import json, sys, html
from pathlib import Path

def triangles(values):
    return [[(values[i+j], values[i+j+2]) for j in (0,3,6)] for i in range(0,len(values),9)]

def main(source,destination):
    data=json.loads(Path(source).read_text())
    out=['<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1120" viewBox="0 0 1400 1120">',
         '<rect width="1400" height="1120" fill="white"/>',
         '<style>text{font-family:Arial,sans-serif;fill:#182333} .title{font-size:23px;font-weight:bold}.body{font-size:15px}</style>',
         '<text x="28" y="35" class="title">Historical paint contact QA: '+('low-power' if data['lowPower'] else 'desktop')+'</text>',
         '<text x="28" y="62" class="body">Blue: full eligible paint. Green: emitted contact triangles. Red: unresolved rendered-contact patches.</text>',
         '<text x="28" y="85" class="body">These sub-millimetre contact omissions are not evidence of real-world paint gaps. No source imagery used.</text>']
    for column,p in enumerate(data['profiles']):
        expected=triangles(p['eligible']);actual=triangles(p['emitted'])
        gaps=[list(zip(g['positionsXZ'][::2],g['positionsXZ'][1::2])) for g in p.get('omittedPatches') or []]
        coords=[v for t in expected for v in t]
        x0=min(v[0] for v in coords);x1=max(v[0] for v in coords);z0=min(v[1] for v in coords);z1=max(v[1] for v in coords)
        cx=(x0+x1)/2;cz=(z0+z1)/2
        contact=p.get('contact') or {};label='Medical Drive' if '250810393' in p['id'] else 'Hospital Drive'
        left=column*700+25
        out.append(f'<text x="{left}" y="120" class="title">{label}</text>')
        out.append(f'<text x="{left}" y="146" class="body">Omitted area: {contact.get("omittedAreaM2",0):.8f} m²; max omitted station span: {contact.get("maxAffectedStationSpanM",0)*1000:.3f} mm</text>')
        out.append(f'<text x="{left}" y="169" class="body">Float32 area residual: {contact.get("quantizationAreaResidualM2",0):.8f} m²; patches: {len(gaps)}</text>')
        def draw_panel(px,py,width,height,center,scale,identifier):
            out.append(f'<defs><clipPath id="{identifier}"><rect x="{px}" y="{py}" width="{width}" height="{height}"/></clipPath></defs>')
            out.append(f'<rect x="{px}" y="{py}" width="{width}" height="{height}" fill="#f6f8fb" stroke="#abb5c0"/>')
            out.append(f'<g clip-path="url(#{identifier})">')
            def draw(poly,fill):
                points=[(px+width/2+(x-center[0])*scale,py+height/2+(z-center[1])*scale) for x,z in poly]
                if max(x for x,y in points)<px or min(x for x,y in points)>px+width or max(y for x,y in points)<py or min(y for x,y in points)>py+height:return
                out.append('<polygon points="'+' '.join(f'{x:.4f},{y:.4f}' for x,y in points)+f'" fill="{fill}"/>')
            for t in expected:draw(t,'#5293db')
            for t in actual:draw(t,'#31825b')
            for t in gaps:draw(t,'#ec273f')
            out.append('</g>')
        scale=min(625/max(x1-x0,1),475/max(z1-z0,1))
        draw_panel(left,190,650,500,(cx,cz),scale,f'full-{column}')
        if gaps:
            largest=max(p['omittedPatches'],key=lambda g:g['areaM2'])
            triangle=list(zip(largest['positionsXZ'][::2],largest['positionsXZ'][1::2]))
            center=(sum(v[0] for v in triangle)/3,sum(v[1] for v in triangle)/3)
            span=max(.006,max(max(v[k] for v in triangle)-min(v[k] for v in triangle) for k in (0,1))*8)
            out.append(f'<text x="{left}" y="725" class="body">Largest local patch magnified: panel width {span*1000:.2f} mm</text>')
            draw_panel(left,743,650,275,center,650/span,f'zoom-{column}')
        else:out.append(f'<text x="{left}" y="725" class="body">No unresolved patches.</text>')
        out.append(f'<text x="{left}" y="1055" class="body">Source world coordinates (metres); north is up. Full eligibility remains mandatory.</text>')
    out.append('</svg>')
    Path(destination).write_text('\n'.join(out))
def png_preview(source,destination):
    import os
    os.environ.setdefault('MPLCONFIGDIR','/tmp/historical-contact-matplotlib')
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    data=json.loads(Path(source).read_text())
    fig,axes=plt.subplots(2,2,figsize=(14,11),gridspec_kw={'height_ratios':[2,1]})
    for col,p in enumerate(data['profiles']):
        gaps=p.get('omittedPatches') or []
        layers=[(triangles(p['eligible']),'#5293db'),(triangles(p['emitted']),'#31825b'),
                ([list(zip(g['positionsXZ'][::2],g['positionsXZ'][1::2])) for g in gaps],'#ec273f')]
        for row in [0,1]:
            ax=axes[row,col]
            if row==1 and not gaps:
                ax.set_axis_off();ax.text(.5,.5,'No unresolved contact patches',ha='center',va='center',transform=ax.transAxes);continue
            for poly,color in layers:ax.add_collection(PolyCollection(poly,facecolors=color,edgecolors='none'))
            ax.autoscale();ax.set_aspect('equal');ax.invert_yaxis();ax.ticklabel_format(useOffset=False,style='plain');ax.tick_params(labelsize=7)
        c=p['contact'];label='Medical' if '250810393' in p['id'] else 'Hospital'
        axes[0,col].set_title(f"{label}: eligible blue / emitted green / omitted red\nOmitted leaves {c['omittedAreaM2']:.8f} m²; max patch {c['maxPatchSpanM']*1000:.3f} mm",fontsize=11)
        if gaps:
            g=max(gaps,key=lambda g:g['areaM2']);x=sum(g['positionsXZ'][::2])/3;z=sum(g['positionsXZ'][1::2])/3
            axes[1,col].set_xlim(x-.003,x+.003);axes[1,col].set_ylim(z+.003,z-.003)
            axes[1,col].set_title('Largest local contact patch: 6 mm × 6 mm zoom',fontsize=10)
    mode='low-power' if data['lowPower'] else 'desktop'
    fig.suptitle(f'Actual-coordinate {mode} contact QA. Rendered-mesh contact gaps, not observed road paint gaps.',fontsize=13)
    fig.tight_layout();fig.savefig(destination,dpi=150);plt.close(fig)

if __name__=='__main__':
    if Path(sys.argv[2]).suffix.lower()=='.png':png_preview(sys.argv[1],sys.argv[2])
    else:main(sys.argv[1],sys.argv[2])
