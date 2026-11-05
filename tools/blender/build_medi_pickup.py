
"""Photo-guided fictional crew-cab rescue pickup for the Peterborough fleet.

Model dimensions are metres in game coordinates (+Y up, -Z forward).
"""
import math

import bpy
from mathutils import Vector


FRONT_AXLE = -2.09
REAR_AXLE = 1.98
WHEEL_RADIUS = .539
TRACK = 1.83


def lerp(a, b, t):
    return a + (b - a) * t


def profile_at(stations, z):
    for (a, *left), (b, *right) in zip(stations, stations[1:]):
        if z <= b + 1e-8:
            return tuple(lerp(x, y, (z - a) / (b - a)) for x, y in zip(left, right))
    return stations[-1][1:]


def grid(rows, reverse=False):
    width = len(rows[0])
    quads = []
    for row in range(len(rows) - 1):
        for col in range(width - 1):
            i = row * width + col
            face = (i, i + 1, i + width + 1, i + width)
            quads.append(face[::-1] if reverse else face)
    return [vertex for row in rows for vertex in row], quads


def soft_outline(corners, amount=.12, samples=4):
    """Round a closed 2D outline while retaining its straight stretches."""
    points = []
    for index, corner in enumerate(corners):
        a = tuple(lerp(x, y, amount) for x, y in zip(corner, corners[index - 1]))
        b = tuple(lerp(x, y, amount) for x, y in zip(corner, corners[(index + 1) % len(corners)]))
        for j in range(samples + 1):
            t = j / samples
            points.append(tuple((1-t)**2 * x + 2*t*(1-t)*y + t*t*z for x, y, z in zip(a, corner, b)))
    return points


def create_medi_model(materials, mat, box, cyl, rod, join_by_material, xyz):
    """Create one transport-ready pickup. Named pivots are the runtime interface."""
    materials.update({
        'Pickup fire red': mat('Pickup fire red', (.56,.012,.019,1), .13, .27),
        'Pickup shadow seam': mat('Pickup shadow seam', (.052,.005,.009,1), .05, .50),
        'Pickup tinted glass': mat('Pickup tinted glass', (.047,.103,.145,1), .32, .20),
        'Pickup brightwork': mat('Pickup brightwork', (.66,.72,.75,1), .54, .25),
        'Pickup alloy': mat('Pickup alloy', (.33,.38,.41,1), .45, .32),
        'Pickup retroreflective': mat('Pickup retroreflective', (.91,.91,.79,1), .13, .33, .075),
        'Pickup reflective gold': mat('Pickup reflective gold', (.94,.50,.08,1), .15, .36, .045),
        'Pickup light optics': mat('Pickup light optics', (.69,.79,.85,1), .25, .22, .13),
    })
    paint = 'Pickup fire red'
    seam = 'Pickup shadow seam'
    glass = 'Pickup tinted glass'
    bright = 'Pickup brightwork'
    alloy = 'Pickup alloy'
    stripe = 'Pickup retroreflective'
    gold = 'Pickup reflective gold'
    optic = 'Pickup light optics'
    rubber = 'Rubber'
    black = 'Deep black'

    def mesh(name, points, faces, material, smooth=False, parent=None):
        data = bpy.data.meshes.new(name)
        data.from_pydata([xyz(point) for point in points], [], faces)
        data.update()
        data.materials.append(materials[material])
        for face in data.polygons:
            face.use_smooth = smooth
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.parent = parent
        return obj

    def sheet(name, rows, material, reverse=False, smooth=True):
        return mesh(name, *grid(rows, reverse), material, smooth)

    def face(name, points, material, outward):
        points = list(points)
        normal = (Vector(points[1])-Vector(points[0])).cross(Vector(points[2])-Vector(points[0]))
        if normal.dot(Vector(outward)) < 0:
            points.reverse()
        return mesh(name, points, [tuple(range(len(points)))], material)

    def patch(name, corners, project, material, normal, rounding=.12):
        return face(name, [project(*p) for p in soft_outline(corners, rounding)], material, normal)

    def lettering(name, words, position, up, normal, size, material):
        from mathutils import Matrix
        up = Vector(up).normalized()
        normal = Vector(normal).normalized()
        right = up.cross(normal)
        basis = Matrix((xyz(right), xyz(up), xyz(normal))).transposed()
        data = bpy.data.curves.new(name, 'FONT')
        data.body = words
        data.align_x = 'CENTER'
        data.align_y = 'CENTER'
        data.size = size
        data.extrude = .0008
        data.resolution_u = 5
        data.materials.append(materials[material])
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = xyz(position)
        obj.rotation_euler = basis.to_euler()
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target='MESH')

    # Lower body sections meet at panel shutlines. Each fender is built around
    # an open wheel cutout, with a turned-in lip and a recessed inner liner.
    front = [(-3.46,.964,1.52),(-3.35,.989,1.56),(-3.14,1.001,1.59),
             (-2.75,1.015,1.61),(-2.10,1.025,1.62),(-1.72,1.005,1.60),(-1.41,.997,1.58)]
    cab = [(-1.402,.997,1.58),(-1.22,1.005,1.57),(-.85,1.014,1.56),
           (-.35,1.015,1.55),(.20,1.009,1.54),(.63,.986,1.53)]
    bed = [(.645,.982,1.515),(.85,.997,1.515),(1.33,1.015,1.52),
           (1.98,1.031,1.52),(2.46,1.018,1.51),(2.85,1.002,1.49),
           (3.11,.977,1.48),(3.20,.93,1.46)]
    rocker = .54
    arch = .647

    def lower_edge(z, axle):
        if axle is None or abs(z-axle) >= arch:
            return rocker
        return rocker + math.sqrt(max(0, arch**2 - (z-axle)**2))

    def side_point(section, side, z, level, axle=None, offset=0):
        half, top = profile_at(section, z)
        low = lower_edge(z, axle)
        y = lerp(low, top, level)
        # A rounded shoulder and tucked sill give the door sheet its crown.
        profile = profile_at([(0,-.043),(.16,-.011),(.49,.009),(.77,.006),(1,-.052)], level)[0]
        return (side*(half+profile+offset), y, z)

    def lower_shell(section, title, axle=None, close_front=True):
        start, stop = section[0][0], section[-1][0]
        cuts = [row[0] for row in section]
        cuts += [lerp(start, stop, i/40) for i in range(41)]
        if axle is not None:
            cuts += [axle+arch*math.cos(i*math.pi/26) for i in range(27)]
        zs = sorted({round(z, 7) for z in cuts if start-1e-7 <= z <= stop+1e-7})
        for side in (-1,1):
            rows = [[side_point(section, side, z, u, axle) for u in (0,.16,.33,.49,.64,.77,.9,1)] for z in zs]
            sheet(title, rows, paint, reverse=side < 0)
            if axle is None:
                continue
            arc_z = sorted(axle+arch*math.cos(i*math.pi/32) for i in range(33))
            lips, liners = [], []
            for z in arc_z:
                x, y, _ = side_point(section, side, z, 0, axle)
                lips.append([(x,y,z),(x-side*.032,y-.018,z),(x-side*.060,y-.022,z)])
                liners.append([(x-side*.060,y-.022,z),(side*.69,y-.024,z)])
            sheet(title+' turned arch lip', lips, paint, reverse=side < 0)
            sheet(title+' recessed wheel liner', liners, black, reverse=side < 0)
        for z, outward in ((start,-1),(stop,1)):
            if outward < 0 and not close_front:
                continue
            edges = [side_point(section, side, z, u, axle) for side,u in ((-1,0),(-1,1),(1,1),(1,0))]
            face(title+' bulkhead', edges, paint, (0,0,outward))

    lower_shell(front, 'Sculpted front clip', FRONT_AXLE, close_front=False)
    lower_shell(cab, 'Crew-cab pressed door shell')
    lower_shell(bed, 'Pickup bed quarter', REAR_AXLE)

    def nose_z(x):
        return -3.567+.107*min(1,(abs(x)/.92)**2.2)

    nose_rows=[]
    for level in (0,.15,.32,.49,.64,.77,.9,1):
        edge,y,_=side_point(front,1,front[0][0],level)
        nose_rows.append([(u*edge,y,nose_z(u*edge)) for u in (-1,-.86,-.64,-.4,-.2,0,.2,.4,.64,.86,1)])
    sheet('Rounded front fascia skin',nose_rows,paint,reverse=True)

    hood = []
    for i,(z,half,y) in enumerate(front):
        depth=1 if i==0 else .26 if i==1 else 0
        crown=0 if i==0 else .026 if i==1 else .056
        hood.append([(u*(half-.052),y+crown*(1-u*u),lerp(z,nose_z(u*(half-.052)),depth))
                     for u in (-1,-.9,-.72,-.48,-.36,0,.36,.48,.72,.9,1)])
    sheet('Crowned stamped hood', hood, paint, reverse=True)

    # Tapered, fully skinned cab. Glazing lies on the same surfaces as the
    # painted pillars, so the windows and roof do not leave see-through seams.
    belt, header = 1.55, 2.29

    def canopy_width(y):
        return profile_at([(belt,.951),(1.71,.947),(1.92,.918),(2.16,.877),(header,.814)], y)[0]

    def cab_end(y, rear):
        t=(y-belt)/(header-belt)
        return lerp(.625,.475,t) if rear else lerp(-1.65,-1.015,t)

    def side_cab(side,y,z,offset=0):
        width=canopy_width(y)
        front_edge, back_edge = cab_end(y,False), cab_end(y,True)
        taper=.045*max(0,1-min(abs(z-front_edge),abs(z-back_edge))/.14)**2
        return (side*(width-taper+offset),y,z)

    ys=[belt,1.62,1.71,1.83,1.95,2.08,2.19,2.24,header]
    for side in (-1,1):
        rows = [[side_cab(side, y, lerp(cab_end(y,False),cab_end(y,True),u))
                 for u in (0,.03,.10,.25,.50,.75,.9,.97,1)] for y in ys]
        sheet('Formed cab and pillars',rows,paint,reverse=side>0)
        windows = [
            [(1.676,-1.464),(2.185,-.994),(2.195,-.406),(1.676,-.401)],
            [(1.676,-.326),(2.191,-.329),(2.181,.308),(1.69,.486)],
        ]
        for index,outline in enumerate(windows):
            project=lambda y,z: side_cab(side,y,z,.009)
            patch(f'Door {index+1} glazing gasket',outline,project,black,(side,0,0))
            y0=sum(p[0] for p in outline)/4
            z0=sum(p[1] for p in outline)/4
            inset=[(lerp(y0,y,.92),lerp(z0,z,.95)) for y,z in outline]
            patch(f'Door {index+1} inset glass',inset,lambda y,z:side_cab(side,y,z,.012),glass,(side,0,0))
        # Seal the beltline below the two apertures.
        rod('Lower window weatherstrip',side_cab(side,1.657,-1.48,.009),side_cab(side,1.657,.49,.009),.016,black)
        for z in (-1.36,-.39,.57):
            rows=[[side_point(cab,side,z+dz,u,offset=.010)
                   for dz in (-.006,.006)] for u in (.13,.3,.48,.64,.80,.96)]
            sheet('Door stamped shutline',rows,seam,reverse=side>0,smooth=False)
        for z in (-.64,.33):
            x,y,_=side_point(cab,side,z,.75,offset=.025)
            box('Door handle pocket',(x,y,z),(.036,.074,.208),black,.025)
            box('Door handle insert',(x+side*.018,y+.005,z),(.021,.025,.16),alloy,.009)
        rod('Mirror support',(side*.91,1.76,-1.36),(side*1.18,1.85,-1.32),.035,black)
        rod('Mirror lower brace',(side*.94,1.72,-1.17),(side*1.18,1.76,-1.24),.023,black)
        box('Heavy duty tow mirror',(side*1.228,1.842,-1.29),(.176,.273,.23),black,.058)
        box('Tow mirror reflecting face',(side*1.233,1.852,-1.172),(.132,.185,.018),alloy,.025)
        box('Mirror turn repeater',(side*1.296,1.823,-1.333),(.028,.043,.078),'Amber',.013)
        box('Full length running board',(side*1.035,.445,-.385),(.28,.105,1.99),black,.035)
        for z in (-1.14,-.42,.31):
            box('Step anti-slip insert',(side*1.067,.501,z),(.172,.014,.53),rubber,.01)

    def end_cab(y,u,rear,offset=0):
        x=u*(canopy_width(y)-.045)
        depth=.045*(1-u*u)
        z=cab_end(y,rear)+(1 if rear else -1)*(depth+offset)
        return x,y,z

    for rear in (False,True):
        rows=[[end_cab(y,u,rear) for u in (-1,-.85,-.55,-.25,0,.25,.55,.85,1)] for y in ys]
        sheet('Rear cab closeout' if rear else 'Rounded windshield surround',rows,paint,reverse=not rear)
        # Grid strips follow windshield curvature and preserve exterior-facing normals.
        for material,top,bottom,half,depth in ((black,2.231,1.628,.90,.009),(glass,2.209,1.652,.866,.012)):
            rows=[[end_cab(y,u*half,rear,depth) for u in (-1,-.85,-.55,-.25,0,.25,.55,.85,1)]
                  for y in [lerp(bottom,top,i/7) for i in range(8)]]
            sheet('Window gasket' if material==black else 'Laminated windshield',rows,material,reverse=not rear)
    roof=[]
    for i in range(13):
        t=i/12
        z=lerp(cab_end(header,False),cab_end(header,True),t)
        half_width=abs(side_cab(1,header,z)[0])
        roof.append([(u*half_width,header+.053*(1-u*u)*math.sin(t*math.pi)**.6,
                      lerp(end_cab(header,u,False)[2],end_cab(header,u,True)[2],t))
                     for u in (-1,-.9,-.72,-.5,0,.5,.72,.9,1)])
    sheet('Crowned steel cab roof',roof,paint,reverse=True)
    for side in (-1,1):
        rod('Windshield wiper arm',end_cab(1.658,side*.26,False,.030),end_cab(1.731,side*.63,False,.024),.013,black)
        rod('Windshield blade',end_cab(1.715,side*.36,False,.025),end_cab(1.752,side*.79,False,.025),.016,black)

    # Fitted red rescue canopy and its flush side access hatches.
    cap_front, cap_rear, cap_belt, cap_top = .664, 3.135, 1.513, 2.231

    def cap_end(y,rear):
        t=(y-cap_belt)/(cap_top-cap_belt)
        return lerp(cap_rear,cap_rear-.23,t) if rear else lerp(cap_front,cap_front+.035,t)

    def cap_width(y,z):
        t=(y-cap_belt)/(cap_top-cap_belt)
        edge=min(abs(z-cap_end(y,False)),abs(z-cap_end(y,True)))
        return lerp(.964,.853,t)-.052*max(0,1-edge/.25)**2

    def cap_side(side,y,z,offset=0):
        return side*(cap_width(y,z)+offset),y,z

    cap_ys=[lerp(cap_belt,cap_top,i/9) for i in range(10)]
    for side in (-1,1):
        rows=[[cap_side(side,y,lerp(cap_end(y,False),cap_end(y,True),u))
               for u in (0,.04,.12,.25,.5,.75,.88,.96,1)] for y in cap_ys]
        sheet('Painted tapered canopy shell',rows,paint,reverse=side>0)
        hatch=[(1.673,.84),(2.118,.88),(2.114,2.685),(1.672,2.868)]
        patch('Continuous canopy hatch gasket',hatch,lambda y,z:cap_side(side,y,z,.013),black,(side,0,0),.15)
        patch('Inset painted equipment hatch',[(lerp(1.89,y,.92),lerp(1.85,z,.978)) for y,z in hatch],
              lambda y,z:cap_side(side,y,z,.016),paint,(side,0,0),.15)
        x,y,z=cap_side(side,1.79,2.33,.035)
        box('Canopy keyed latch plate',(x,y,z),(.027,.09,.098),black,.018)
        box('Canopy compression latch',(x+side*.013,y,z),(.017,.046,.063),bright,.011)
        lettering('Canopy agency lettering','FIRE RESCUE',cap_side(side,1.945,1.67,.025),(0,1,0),(side,0,0),.132,gold)
        for z in (.87,2.70):
            x,y,_=cap_side(side,2.15,z,.025)
            box('Recessed canopy hinge',(x,y,z),(.042,.047,.146),black,.012)

    def cap_end_point(y,u,rear,offset=0):
        z=cap_end(y,rear)
        return (u*cap_width(y,z),y,z+(1 if rear else -1)*(.026*(1-u*u)+offset))

    for rear in (False,True):
        rows=[[cap_end_point(y,u,rear) for u in (-1,-.88,-.6,-.28,0,.28,.6,.88,1)] for y in cap_ys]
        sheet('Canopy hatch' if rear else 'Closed canopy bulkhead',rows,paint,reverse=not rear)
    cap_roof=[]
    for i in range(15):
        t=i/14
        z=lerp(cap_end(cap_top,False),cap_end(cap_top,True),t)
        cap_roof.append([(u*cap_width(cap_top,z),cap_top+.051*(1-u*u)*math.sin(t*math.pi)**.55,
                          lerp(cap_end_point(cap_top,u,False)[2],cap_end_point(cap_top,u,True)[2],t))
                         for u in (-1,-.9,-.72,-.5,0,.5,.72,.9,1)])
    sheet('Rounded canopy roof',cap_roof,paint,reverse=True)
    for color,top,bottom,half,depth in ((black,2.118,1.726,.78,.012),(glass,2.087,1.757,.73,.018)):
        rows=[[cap_end_point(y,u*half,True,depth) for u in (-1,-.7,-.35,0,.35,.7,1)]
              for y in (bottom,lerp(bottom,top,.15),lerp(bottom,top,.85),top)]
        sheet('Rear canopy glazing',rows,color)
    box('Canopy rear handle',(0,1.651,3.126),(.20,.065,.05),black,.017)
    box('Canopy bed gasket',(0,1.483,1.898),(1.815,.077,2.49),black,.019)

    # Reflective lower belt, with a short rise onto the rear quarter.
    for side in (-1,1):
        for section,axle,points in (
            (front,FRONT_AXLE,[(-1.415,.763),(-1.461,.763),(-1.486,.763)]),
            (cab,None,[(-1.401,.763),(-1.09,.763),(-.76,.763),(-.33,.763),(.16,.763),(.628,.763)]),
            (bed,REAR_AXLE,[(.648,.763),(.776,.763),(1.104,1.30),(1.42,1.30),(1.98,1.30),(2.52,1.30),(3.154,1.30)])):
            for bottom,top,material in ((0,.068,stripe),(.068,.083,gold)):
                rows=[]
                samples=[]
                for (z0,y0),(z1,y1) in zip(points,points[1:]):
                    count=max(1,math.ceil(abs(z1-z0)/.04))
                    samples.extend((lerp(z0,z1,i/count),lerp(y0,y1,i/count)) for i in range(count))
                for z,y in [*samples,points[-1]]:
                    y0=lower_edge(z,axle)
                    ceiling=profile_at(section,z)[1]
                    if y <= y0:
                        continue
                    rows.append([side_point(section,side,z,(y+dy-y0)/(ceiling-y0),axle,.017) for dy in (bottom,top)])
                if len(rows)>1:
                    sheet('Reflective response stripe',rows,material,reverse=side<0,smooth=False)
        for words,z,y,size in (('MEDI 1',-.81,1.223,.158),('FIRE RESCUE',.046,1.12,.106)):
            half,top=profile_at(cab,z)
            x,_,_=side_point(cab,side,z,(y-rocker)/(top-rocker),offset=.015)
            lettering('Door unit lettering',words,(x,y,z),(0,1,0),(side,0,0),size,gold)
        box('Front fender badge',(side*1.021,1.428,-1.746),(.024,.105,.13),black,.02)
        box('Fender side marker',(side*1.031,1.442,-1.747),(.018,.026,.086),bright,.008)

    # Wide, rounded chrome front bumper and recessed tiered headlamp units.
    def fascia_z(x):
        return nose_z(x)

    def fascia(y,x,depth=0):
        return x,y,fascia_z(x)-depth

    xs=(-1.064,-1.035,-.96,-.78,-.54,-.25,0,.25,.54,.78,.96,1.035,1.064)
    bumper = [[fascia(y,x,offset) for x in xs]
              for y,offset in ((.45,.014),(.52,.065),(.63,.114),(.78,.102),(.86,.044),(.89,.004))]
    sheet('Wraparound chrome bumper',bumper,bright,reverse=True)
    sheet('Lower bumper valance',[[fascia(y,x,d) for x in xs] for y,d in ((.378,.007),(.45,.035),(.525,.069))],black,reverse=True)
    box('Front tow recess',(0,.608,-3.686),(.80,.115,.036),black,.028)
    grille_rows=[(y,half) for y,half in ((.936,.56),(.97,.652),(1.048,.674),(1.43,.674),(1.51,.653),(1.538,.59))]
    sheet('Deep curved grille opening',
          [[fascia(y,u*half,.027) for u in (-1,-.9,-.75,-.5,-.25,0,.25,.5,.75,.9,1)] for y,half in grille_rows],
          black,reverse=True)
    for y in (.992,1.073,1.158,1.245,1.333,1.420,1.515):
        rows=[[fascia(y+dy,x,.055) for x in (-.64,-.54,-.35,-.15,0,.15,.35,.54,.64)] for dy in (-.013,.016)]
        sheet('Swept horizontal grille trim',rows,bright,reverse=True)
    box('Grille badge mount',(0,1.254,-3.630),(.196,.087,.025),black,.029)
    lettering('Grille badge lettering','RESCUE',(0,1.253,-3.646),(0,1,0),(0,0,-1),.043,bright)
    for side in (-1,1):
        outer=[(.94,side*.65),(1.544,side*.658),(1.51,side*.994),(.96,side*.991)]
        patch('Headlamp chrome bezel',outer,lambda y,x:fascia(y,x,.047),bright,(0,0,-1),.13)
        for y in (1.059,1.32):
            patch('Headlamp optic recess',[(y-.084,side*.681),(y+.093,side*.681),(y+.091,side*.906),(y-.083,side*.916)],
                  lambda yy,x:fascia(yy,x,.053),black,(0,0,-1))
            patch('Headlamp projector lens',[(y-.067,side*.698),(y+.074,side*.698),(y+.071,side*.892),(y-.065,side*.897)],
                  lambda yy,x:fascia(yy,x,.060),optic,(0,0,-1))
        patch('Amber wraparound indicator',[(1.01,side*.924),(1.438,side*.924),(1.434,side*.982),(1.012,side*.983)],
              lambda y,x:fascia(y,x,.061),'Amber',(0,0,-1))
        box('Bumper fog lamp',(side*.74,.665,fascia_z(.74)-.108),(.142,.072,.032),optic,.017)

    # Rear lamp pockets, bumper step, receiver, and equipment identification.
    box('Rear alloy step bumper',(0,.535,3.233),(1.94,.28,.211),bright,.065)
    box('Rear bumper grip',(0,.688,3.215),(1.72,.054,.22),black,.032)
    box('Receiver drawbar mount',(0,.373,3.251),(.218,.132,.135),black,.02)
    box('Tailgate handle',(0,1.18,3.212),(.212,.065,.045),black,.02)
    box('Tailgate plate pocket',(0,.811,3.216),(.277,.145,.034),black,.027)
    for side in (-1,1):
        box('Tall recessed tail lamp bezel',(side*.901,1.123,3.196),(.171,.60,.082),black,.052)
        box('Tail and brake lens',(side*.901,1.231,3.24),(.133,.347,.048),'Warning red',.036)
        box('Rear reverse lens',(side*.901,.946,3.236),(.118,.091,.038),optic,.021)
        box('Rear lower reflector',(side*.823,.59,3.343),(.139,.055,.017),'Warning red',.012)
        for z in (FRONT_AXLE+.65,REAR_AXLE+.63):
            box('Moulded mud flap',(side*.888,.331,z),(.31,.389,.036),rubber,.025)
    lettering('Tailgate unit number','MEDI 1',(0,1.338,3.209),(0,1,0),(0,0,1),.104,gold)
    for x in (-.57,.57):
        box('Boxed chassis rail',(x,.573,-.044),(.143,.141,5.89),'Graphite',.027)
    box('Rear differential housing',(0,.52,REAR_AXLE),(.52,.37,.47),'Graphite',.068)
    rod('Rear axle tube',(-.77,.54,REAR_AXLE),(.77,.54,REAR_AXLE),.068,'Graphite')
    rod('Drive shaft',(0,.64,-1.18),(0,.52,REAR_AXLE),.051,alloy)

    # Keep only the lens nodes animated by the game. The housings are static.
    box('Low profile emergency light bar housing',(0,2.357,-.54),(1.51,.078,.253),black,.039)
    box('Light bar roof plinth',(0,2.325,-.54),(1.11,.050,.18),'Graphite',.027)
    for x in (-.65,.65):
        box('Canopy corner light mount',(x,2.264,2.65),(.242,.046,.119),black,.023)
    static=[o for o in bpy.context.scene.objects if o.type=='MESH' and o.parent is None]
    join_by_material(static,'MediPickup')

    def wheel_lathe(parent, name, profile, material, segments=48):
        rows=[]
        for x,r in profile:
            rows.append([(x, r*math.cos(i*math.tau/segments), r*math.sin(i*math.tau/segments))
                         for i in range(segments+1)])
        verts, faces=grid(rows)
        return mesh(name, verts, faces, material, True, parent)

    wheel_nodes=[]
    for end,z in (('F',FRONT_AXLE),('R',REAR_AXLE)):
        for label,side in (('L',-1),('R',1)):
            name='Wheel_'+end+label
            pivot=bpy.data.objects.new(name,None)
            bpy.context.collection.objects.link(pivot)
            pivot.location=xyz((side*TRACK/2,WHEEL_RADIUS,z))
            wheel_nodes.append(name)
            wheel_lathe(pivot,'Radial all-terrain tyre',[
                (-.139,.285),(-.167,.376),(-.168,.447),(-.136,.496),(-.102,.520),(-.064,.527),
                (.064,.527),(.102,.520),(.136,.496),(.168,.447),(.167,.376),(.139,.285),
                (-.139,.285)],rubber)
            # The staggered tread wraps all four wheels with a quiet, genuine silhouette.
            vertices,quads=[],[]
            for tread in range(40):
                for lane,x in enumerate((-.101,-.042,.042,.101)):
                    alpha=(tread+(lane%2)*.47)*math.tau/40
                    base=len(vertices)
                    for r in (.520,WHEEL_RADIUS-.0005):
                        for u,v in ((-1,-1),(1,-1),(1,1),(-1,1)):
                            theta=alpha+v*.054+u*(.018 if lane<2 else -.018)
                            vertices.append((x+u*.020,r*math.cos(theta),r*math.sin(theta)))
                    quads.extend(tuple(base+k for k in f) for f in
                                 ((0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)))
            mesh('Alternating tread blocks',vertices,quads,rubber,parent=pivot)
            profile=[(.134,.0),(.134,.218),(.160,.265),(.178,.283),(.198,.281),
                     (.198,.252),(.169,.232),(.169,.0),(.134,.0)]
            if side<0:
                profile=[(-x,r) for x,r in reversed(profile)]
            wheel_lathe(pivot,'Stepped forged alloy rim',profile,alloy)
            cyl('Deep wheel pocket',(side*.174,0,0),.224,.020,black,'X',pivot,verts=36)
            for i in range(8):
                angle=i*math.tau/8
                a=(side*.192,.095*math.cos(angle),.095*math.sin(angle))
                b=(side*.190,.234*math.cos(angle+.08),.234*math.sin(angle+.08))
                rod('Sculpted alloy spoke',a,b,.024,bright,pivot)
                angle+=.23
                cyl('Recessed wheel lug',(side*.207,.113*math.cos(angle),.113*math.sin(angle)),.014,.024,alloy,'X',pivot,verts=10)
            cyl('Alloy hub boss',(side*.201,0,0),.096,.042,bright,'X',pivot,verts=28)
            cyl('Wheel centre medallion',(side*.226,0,0),.045,.012,'Graphite','X',pivot,verts=20)
            join_by_material([o for o in pivot.children if o.type=='MESH'],'Medi_'+name)

    beacon_nodes=[]
    for label,side in (('L',-1),('R',1)):
        for name,pos,size,color in (
            ('Beacon_'+label,(side*.398,2.410,-.54),(.70,.066,.203),'Warning red' if side<0 else 'Ivory'),
            ('Beacon_Rear'+label,(side*.65,2.302,2.65),(.20,.045,.084),'Warning red')):
            node=bpy.data.objects.new(name,None)
            bpy.context.collection.objects.link(node)
            node.location=xyz(pos)
            box('LED lens cluster',(0,0,0),size,color,.024,node)
            beacon_nodes.append(name)

    root=bpy.data.objects.new('MediPickup',None)
    bpy.context.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.parent is None:
            obj.parent=root
    bpy.context.view_layer.update()
    bounds=[obj.matrix_world @ Vector(corner) for obj in root.children_recursive if obj.type=='MESH' for corner in obj.bound_box]
    extents=[round(max(v[axis] for v in bounds)-min(v[axis] for v in bounds),3) for axis in range(3)]
    width,length,height=extents
    meta={
        'name':'Station 1 medical response pickup','units':'metres','forward':'-Z','up':'+Y',
        'dimensions':{'length':length,'width':width,'height':height},
        'measuredBounds':{'length':length,'width':width,'height':height},
        'wheelbase':round(REAR_AXLE-FRONT_AXLE,3),'wheelRadius':WHEEL_RADIUS,
        'wheelNodes':wheel_nodes,'beaconNodes':beacon_nodes,
        'fourDoorCab':True,'fullyEnclosedCanopy':True,'ambulance':False,
        'body':'Contoured red four-door fire rescue pickup with a colour-matched canopy, lower reflective stripe and alloy brightwork',
        'source':'Original Blender geometry informed by two user-provided fire rescue pickup reference photographs',
        'commercialUse':'Original project geometry, fictional markings, no reference photo pixels used',
    }
    return root, meta
