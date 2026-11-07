"""
The project's own low-poly models, built with Blender's Python module and exported as GLB.

    npm run models            (uses $BLENDER_PYTHON, default python3; needs `pip install bpy==5.2.3`)

Style follows the Polyfork set the game already uses: one rough, non-metallic material, colour in
COLOR_0 vertex colours, flat shading. Colours are Radix (light) steps, written below by name.
Nature pieces get uneven shapes and a few percent of colour noise per face; human pieces stay
straight and clean. That difference is the faction language of the map.

Every model is a pure function of its seed, so re-running gives the same files.
"""
import math
import os
import random
import sys

import bpy  # noqa: I001  (bpy puts bmesh and mathutils on the path)
import bmesh
from mathutils import Euler, Matrix, Vector

# ── Palette (Radix light) ────────────────────────────────────────────────────

RADIX = {
    'sand3': '#f1f0ef', 'sand6': '#dad9d6', 'sand7': '#cfceca', 'sand8': '#bcbbb5', 'sand9': '#8d8d86', 'sand11': '#63635e',
    'brown6': '#e4cdb7', 'brown7': '#dcbc9f', 'brown8': '#cea37e', 'brown9': '#ad7f58', 'brown10': '#a07553',
    'brown11': '#815e46', 'brown12': '#3e332e',
    'olive7': '#cccfcc', 'olive8': '#b9bcb8', 'olive9': '#898e87', 'olive10': '#7f847d', 'olive11': '#60655f', 'olive12': '#1d211c',
    'grass6': '#b2ddb5', 'grass7': '#94ce9a', 'grass8': '#65ba74', 'grass9': '#46a758', 'grass10': '#3e9b4f', 'grass11': '#2a7e3b',
    'jade8': '#56ba9f', 'jade9': '#29a383', 'jade10': '#26997b', 'jade11': '#208368', 'teal10': '#0d9b8a', 'teal11': '#008573',
    'slate5': '#e0e1e6', 'slate7': '#cdced6', 'slate8': '#b9bbc6', 'slate9': '#8b8d98', 'slate10': '#80838d', 'slate11': '#60646c',
    'slate12': '#1c2024', 'gray8': '#bbbbbb', 'gray9': '#8d8d8d', 'gray11': '#646464',
    'sky2': '#f1fafd', 'sky3': '#e1f6fd', 'sky4': '#d1f0fa', 'sky5': '#bee7f5', 'sky6': '#a9daed', 'sky7': '#8dcae3',
    'cyan8': '#3db9cf', 'cyan9': '#00a2c7', 'cyan10': '#0797b9', 'cyan11': '#107d98',
    'amber7': '#e9c162', 'amber8': '#e2a336', 'amber9': '#ffc53d', 'amber11': '#ab6400', 'orange9': '#f76b15',
    'tomato8': '#ec8e7b', 'tomato9': '#e54d2e', 'tomato10': '#dd4425', 'tomato11': '#d13415',
    'crimson8': '#e093b2', 'crimson9': '#e93d82', 'pink8': '#dd93c2', 'plum9': '#ab4aba',
    'iris9': '#5b5bd6', 'iris10': '#5151cd', 'indigo9': '#3e63dd', 'lime8': '#8db654', 'lime9': '#bdee63',
    'yellow9': '#ffe629', 'bronze8': '#c2a499', 'bronze9': '#a18072', 'bronze10': '#957468', 'bronze11': '#7d5e54',
    'gold9': '#978365', 'white': '#ffffff',
}


def lin(name):
    """Radix step name (or #hex) to a linear RGBA tuple, which is what glTF vertex colours hold."""
    h = RADIX.get(name, name).lstrip('#')
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def scale_color(c, k):
    return (min(1, c[0] * k), min(1, c[1] * k), min(1, c[2] * k), 1.0)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(4))


# ── Model builder ────────────────────────────────────────────────────────────


class Model:
    """One bmesh per exported object. Every primitive is placed, jittered and painted on creation."""

    def __init__(self, name, seed=1, vary=0.07):
        self.name = name
        self.rng = random.Random(seed)
        self.vary = vary
        self.parts = {}
        self.part('body')

    def part(self, name, pivot=(0, 0, 0)):
        """Switch to (or start) a separately exported object, e.g. a rotor the game spins."""
        if name not in self.parts:
            bm = bmesh.new()
            self.parts[name] = {'bm': bm, 'col': bm.loops.layers.float_color.new('Color'), 'pivot': Vector(pivot)}
        self.cur = self.parts[name]
        return self

    # Placement -----------------------------------------------------------

    def _matrix(self, at, s, rot):
        sx, sy, sz = (s, s, s) if isinstance(s, (int, float)) else s
        return Matrix.Translation(Vector(at)) @ Euler(rot, 'XYZ').to_matrix().to_4x4() @ Matrix.Diagonal((sx, sy, sz, 1))

    def _finish(self, verts, color, at, s, rot, jit, vary, grad, mat):
        bm = self.cur['bm']
        if jit:
            for v in verts:
                v.co += Vector((self.rng.uniform(-1, 1), self.rng.uniform(-1, 1), self.rng.uniform(-1, 1))) * jit
        bmesh.ops.transform(bm, matrix=self._matrix(at, s, rot), verts=verts)
        faces = {f for v in verts for f in v.link_faces}
        vary = self.vary if vary is None else vary
        base = lin(color)
        top = lin(grad) if grad else None
        if top:
            zs = [v.co.z for v in verts]
            z0, z1 = min(zs), max(zs)
        col = self.cur['col']
        for f in faces:
            c = base
            if top:
                t = (f.calc_center_median().z - z0) / max(1e-6, z1 - z0)
                c = mix(base, top, max(0, min(1, t)))
            c = scale_color(c, 1 + self.rng.uniform(-vary, vary))
            for loop in f.loops:
                loop[col] = c
            f.smooth = False
            f.material_index = mat
        return faces

    # Primitives ----------------------------------------------------------

    def ico(self, r=1.0, sub=1, at=(0, 0, 0), s=1, rot=(0, 0, 0), jit=0.0, color='grass9', vary=None, grad=None, mat=0):
        res = bmesh.ops.create_icosphere(self.cur['bm'], subdivisions=sub, radius=r)
        return self._finish(res['verts'], color, at, s, rot, jit, vary, grad, mat)

    def cone(self, r1=1.0, r2=0.0, h=1.0, segs=8, at=(0, 0, 0), s=1, rot=(0, 0, 0), jit=0.0, color='brown9', vary=None, grad=None, mat=0):
        """Base at `at`, pointing up +Z (before rotation)."""
        res = bmesh.ops.create_cone(
            self.cur['bm'], cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=max(r2, 0.0), depth=h,
            matrix=Matrix.Translation((0, 0, h / 2)),
        )
        return self._finish(res['verts'], color, at, s, rot, jit, vary, grad, mat)

    def cyl(self, r=1.0, h=1.0, segs=8, **kw):
        return self.cone(r, r, h, segs, **kw)

    def box(self, size=(1, 1, 1), at=(0, 0, 0), rot=(0, 0, 0), color='brown9', vary=None, jit=0.0, grad=None, mat=0):
        """Sits on `at` (bottom face at at.z)."""
        res = bmesh.ops.create_cube(self.cur['bm'], size=1.0, matrix=Matrix.Translation((0, 0, 0.5)))
        return self._finish(res['verts'], color, at, size, rot, jit, vary, grad, mat)

    def blade(self, at, h, w=0.06, lean=0.25, color='grass9', vary=None, grad=None):
        """A grass blade: a thin three-sided spike leaning a random way."""
        yaw = self.rng.uniform(0, math.tau)
        tilt = self.rng.uniform(0, lean)
        return self.cone(w, 0, h, 3, at=at, rot=(math.sin(yaw) * tilt, math.cos(yaw) * tilt, yaw), color=color, vary=vary, grad=grad)

    def disc(self, r, h=0.06, segs=10, at=(0, 0, 0), s=1, jit=0.0, color='brown10', vary=None, mat=0):
        return self.cone(r, r, h, segs, at=at, s=s, jit=jit, color=color, vary=vary, mat=mat)

    def limb(self, start, end, r1, r2, segs=6, color='brown10', vary=None, jit=0.0, mat=0):
        """A cone from one point to another: branches, legs, struts."""
        a, b = Vector(start), Vector(end)
        d = b - a
        q = Vector((0, 0, 1)).rotation_difference(d.normalized())
        res = bmesh.ops.create_cone(
            self.cur['bm'], cap_ends=True, cap_tris=False, segments=segs, radius1=r1, radius2=r2, depth=d.length,
            matrix=Matrix.Translation((0, 0, d.length / 2)),
        )
        verts = res['verts']
        if jit:
            for v in verts:
                v.co += Vector((self.rng.uniform(-1, 1), self.rng.uniform(-1, 1), self.rng.uniform(-1, 1))) * jit
        bmesh.ops.transform(self.cur['bm'], matrix=Matrix.Translation(a) @ q.to_matrix().to_4x4(), verts=verts)
        return self._paint(verts, color, vary, mat)

    def _paint(self, verts, color, vary, mat=0):
        faces = {f for v in verts for f in v.link_faces}
        vary = self.vary if vary is None else vary
        col = self.cur['col']
        for f in faces:
            c = scale_color(lin(color), 1 + self.rng.uniform(-vary, vary))
            for loop in f.loops:
                loop[col] = c
            f.smooth = False
            f.material_index = mat
        return faces

    def scatter(self, n, radius, fn, inner=0.0, center=(0, 0)):
        """Call fn(x, y, i) at n random points in a ring."""
        for i in range(n):
            a = self.rng.uniform(0, math.tau)
            d = math.sqrt(self.rng.uniform((inner / radius) ** 2 if radius else 0, 1)) * radius
            fn(center[0] + math.cos(a) * d, center[1] + math.sin(a) * d, i)

    # Output ---------------------------------------------------------------

    def save(self, out_dir, materials=None):
        """Cut everything below the ground plane, then export all parts to <name>.glb."""
        bpy.ops.wm.read_factory_settings(use_empty=True)
        body_mat = make_material(self.name, 0.85)
        mats = [body_mat] + [make_material(f'{self.name}-{k}', 0.6, emit=v) for k, v in (materials or {}).items()]
        objs = []
        for pname, p in self.parts.items():
            bm = p['bm']
            geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
            bmesh.ops.translate(bm, vec=-p['pivot'], verts=bm.verts)
            me = bpy.data.meshes.new(pname)
            bm.to_mesh(me)
            me.color_attributes.active_color = me.color_attributes['Color']
            me.color_attributes.render_color_index = me.color_attributes.active_color_index
            for m in mats:
                me.materials.append(m)
            ob = bpy.data.objects.new(pname if pname != 'body' else self.name, me)
            ob.location = p['pivot']
            bpy.context.scene.collection.objects.link(ob)
            objs.append(ob)
        for ob in objs:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.export_scene.gltf(
            filepath=os.path.join(out_dir, f'{self.name}.glb'),
            export_format='GLB',
            use_selection=True,
            export_vertex_color='ACTIVE',
            export_all_vertex_colors=False,
            export_normals=True,
            export_texcoords=False,
            export_yup=True,
        )


def make_material(name, rough, emit=None):
    mat = bpy.data.materials.new(name)
    mat.use_backface_culling = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (1, 1, 1, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    if emit:
        c, strength = emit
        bsdf.inputs['Emission Color'].default_value = lin(c)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


# ── Shared bits ──────────────────────────────────────────────────────────────


def rock(m, at, r, color='slate9', moss=None, sub=1, s=(1, 1, 0.7)):
    faces = m.ico(r, sub, at=at, s=s, rot=(0, 0, m.rng.uniform(0, math.tau)), jit=r * 0.18, color=color)
    if moss:
        mc = lin(moss)
        col = m.cur['col']
        for f in faces:
            if f.normal.z > 0.55 and m.rng.random() < 0.7:
                c = scale_color(mc, 1 + m.rng.uniform(-0.08, 0.08))
                for loop in f.loops:
                    loop[col] = c
    return faces


def tuft(m, x, y, n=5, h=0.5, color='grass9', tip=None, w=0.05):
    for _ in range(n):
        m.blade((x + m.rng.uniform(-0.08, 0.08), y + m.rng.uniform(-0.08, 0.08), 0), h * m.rng.uniform(0.6, 1.1), w, color=color, grad=tip)


def flower(m, x, y, h, color):
    m.cone(0.02, 0.015, h, 4, at=(x, y, 0), color='grass10', vary=0.02)
    m.ico(0.09, 0, at=(x, y, h), s=(1, 1, 0.6), color=color, vary=0.04)


def blob_tree(m, at=(0, 0, 0), trunk_h=1.6, r=1.0, leaves=('grass9', 'grass10'), trunk='brown10', n=4):
    x, y, z = at
    m.cone(r * 0.16, r * 0.1, trunk_h, 6, at=(x, y, z), color=trunk)
    for i in range(n):
        a = i / n * math.tau + m.rng.uniform(-0.4, 0.4)
        d = r * 0.45 if i else 0
        m.ico(r * m.rng.uniform(0.55, 0.75), 1, at=(x + math.cos(a) * d, y + math.sin(a) * d, z + trunk_h + r * m.rng.uniform(0.1, 0.5)),
              jit=r * 0.08, color=leaves[i % len(leaves)])


def nest(m, at, r=0.32, eggs='sky4'):
    x, y, z = at
    m.cone(r * 0.7, r, r * 0.45, 7, at=(x, y, z), jit=r * 0.14, color='brown10')
    for i in range(5):
        a = i / 5 * math.tau
        m.limb((x + math.cos(a) * r * 0.9, y + math.sin(a) * r * 0.9, z + r * 0.3),
               (x + math.cos(a + 1.2) * r * 1.15, y + math.sin(a + 1.2) * r * 1.15, z + r * 0.5), r * 0.07, r * 0.03, 3, color='brown11')
    m.cone(r * 0.75, r * 0.8, r * 0.05, 9, at=(x, y, z + r * 0.42), color='brown12', vary=0.03)
    if eggs:
        for i in range(2):
            m.ico(r * 0.2, 1, at=(x + (i - 0.5) * r * 0.35, y, z + r * 0.5), s=(1, 1, 1.25), color=eggs, vary=0.02)


def hole(m, at, r, tilt=0.0, yaw=0.0):
    """A dark burrow mouth: a squashed, very dark half sphere."""
    return m.ico(r, 1, at=at, s=(1, 0.55, 0.75), rot=(tilt, 0, yaw), color='slate12', vary=0.03)


# ── Lairs ────────────────────────────────────────────────────────────────────


def anthill(out):
    m = Model('lair-anthill', 11)
    m.ico(1.5, 2, s=(1, 1, 0.75), jit=0.1, color='brown9', grad='brown8')
    for i in range(7):
        a = i / 7 * math.tau
        m.ico(0.45, 1, at=(math.cos(a) * 1.25, math.sin(a) * 1.25, 0.05), jit=0.08, color='brown10')
    m.cone(0.32, 0.12, 0.25, 8, at=(0, 0, 1.0), color='brown12', vary=0.02)
    hole(m, (0.6, -1.0, 0.45), 0.16, 0.6, 0.3)
    hole(m, (-0.9, -0.6, 0.35), 0.13, 0.6, -0.6)
    # Pine needles and twigs on the mound.
    m.scatter(26, 1.3, lambda x, y, i: m.box((0.03, 0.4, 0.03), at=(x, y, 1.05 * math.sqrt(max(0, 1 - (x * x + y * y) / 2.4)) * 0.85),
                                            rot=(0.3, 0, m.rng.uniform(0, math.tau)), color='brown11'))
    m.scatter(6, 2.4, lambda x, y, i: tuft(m, x, y, 4, 0.35, 'grass9'), inner=1.7)
    m.save(out)


def termite_mound(out):
    m = Model('lair-termite-mound', 12)
    m.ico(1.3, 1, s=(1, 1, 0.5), jit=0.12, color='brown9')
    m.cone(0.75, 0.12, 3.6, 7, at=(0, 0, 0), jit=0.08, color='bronze10', grad='bronze8')
    for i, (a, h) in enumerate([(0.4, 2.3), (2.3, 1.7), (4.2, 2.0), (5.4, 1.2)]):
        d = 0.75
        m.cone(0.42, 0.08, h, 6, at=(math.cos(a) * d, math.sin(a) * d, 0), jit=0.06, color='bronze10', grad='bronze8')
    for z in (0.9, 1.7, 2.4):
        hole(m, (0.0, -0.55 + z * 0.12, z), 0.08, 1.2)
    m.scatter(7, 2.2, lambda x, y, i: tuft(m, x, y, 5, 0.6, 'amber8', 'sand7'), inner=1.4)
    m.save(out)


def den(out):
    m = Model('lair-den', 13)
    rock(m, (-1.1, 0.2, 0.3), 1.2, 'slate9', 'olive10', s=(1, 0.9, 0.9))
    rock(m, (1.1, 0.3, 0.2), 1.05, 'slate10', 'olive10', s=(1, 0.9, 0.85))
    rock(m, (0.0, 0.9, 0.9), 1.25, 'slate9', 'grass11', s=(1.2, 0.9, 0.7))
    hole(m, (0, -0.15, 0.45), 0.75, 0.15)
    # Bones by the door.
    for x, y, a in [(0.5, -1.4, 0.4), (-0.4, -1.6, 2.0), (0.1, -1.9, 1.2)]:
        m.cyl(0.05, 0.6, 5, at=(x, y, 0.05), rot=(math.pi / 2, 0, a), color='sand3', vary=0.03)
        m.ico(0.08, 0, at=(x, y, 0.05), color='sand3', vary=0.02)
    m.scatter(8, 2.6, lambda x, y, i: tuft(m, x, y, 5, 0.45, 'grass9'), inner=1.8)
    m.save(out)


def cave(out, name='lair-cave', seed=14, scale=1.0, snow=False):
    m = Model(name, seed)
    k = scale
    rock(m, (0, 0.6 * k, 0.4 * k), 2.2 * k, 'slate10', 'sky3' if snow else None, sub=2, s=(1.15, 0.9, 0.75))
    rock(m, (-1.9 * k, -0.2 * k, 0.2 * k), 1.1 * k, 'slate11', 'sky3' if snow else None)
    rock(m, (1.8 * k, -0.1 * k, 0.1 * k), 1.0 * k, 'slate9', 'sky3' if snow else None)
    hole(m, (0, -0.95 * k, 0.75 * k), 1.0 * k, 0.05)
    # Icicles or stalactites along the mouth.
    for i in range(5):
        x = (i - 2) * 0.35 * k
        m.cone(0.08 * k, 0, 0.45 * k, 4, at=(x, -1.25 * k, 1.75 * k - abs(i - 2) * 0.12 * k), rot=(math.pi, 0, 0),
               color='sky5' if snow else 'slate9', vary=0.04)
    for i in range(5):
        a = m.rng.uniform(-0.6, 3.7)
        rock(m, (math.cos(a) * 2.8 * k, math.sin(a) * 2.2 * k - 0.4 * k, 0), 0.35 * k, 'slate9')
    m.save(out)


def glacier(out):
    m = Model('lair-glacier', 15)
    m.ico(2.4, 1, s=(1.4, 1, 0.3), jit=0.15, color='sky3')
    shards = [(-1.4, 0.4, 2.6, 0.2), (-0.6, 0.9, 3.4, -0.15), (0.5, 0.7, 2.9, 0.25), (1.4, 0.1, 2.2, -0.3), (0.2, -0.4, 1.6, 0.1)]
    for x, y, h, tilt in shards:
        m.ico(0.9, 0, at=(x, y, h * 0.35), s=(0.6, 0.55, h * 0.55), rot=(tilt, 0, m.rng.uniform(0, 3)), jit=0.08,
              color='sky6', grad='sky3', vary=0.05)
    # The crevasse the mammoths come out of.
    m.box((2.2, 0.35, 0.08), at=(0, -0.95, 0.15), rot=(0, 0, 0.15), color='cyan11', vary=0.02)
    m.scatter(6, 3.4, lambda x, y, i: m.ico(0.35, 0, at=(x, y, 0.1), s=(1, 1, 0.6), jit=0.05, color='sky4'), inner=2.6)
    m.save(out)


def flowers(out):
    m = Model('lair-flowers', 16)
    m.ico(2.0, 1, s=(1, 1, 0.12), jit=0.15, color='grass8')
    m.scatter(22, 2.0, lambda x, y, i: tuft(m, x, y, 4, 0.55, 'grass9', 'lime8'))
    colors = ['amber9', 'tomato9', 'crimson8', 'yellow9', 'plum9', 'white']
    m.scatter(34, 1.9, lambda x, y, i: flower(m, x, y, m.rng.uniform(0.35, 0.75), colors[i % len(colors)]))
    m.save(out)


def burrow(out):
    m = Model('lair-burrow', 17)
    m.ico(1.4, 2, s=(1.2, 1, 0.45), jit=0.1, color='brown10', grad='brown9')
    for x, y, a in [(-0.7, -0.6, -0.5), (0.6, -0.4, 0.4), (0.0, 0.7, 2.9)]:
        hole(m, (x, y, 0.35), 0.22, 0.7, a)
    # What rats live on: scraps from the city.
    m.cyl(0.12, 0.3, 8, at=(1.5, -0.9, 0.12), rot=(math.pi / 2, 0, 0.6), color='slate8', vary=0.02)
    m.ico(0.16, 0, at=(-1.5, -0.8, 0.1), jit=0.05, color='sand3')
    m.box((0.35, 0.25, 0.02), at=(-1.1, 1.1, 0.0), rot=(0, 0, 0.5), color='amber7', vary=0.02)
    m.cyl(0.04, 0.5, 5, at=(1.2, 0.9, 0.04), rot=(math.pi / 2, 0, 2.0), color='sand3', vary=0.02)
    m.scatter(6, 2.4, lambda x, y, i: tuft(m, x, y, 4, 0.4, 'olive10'), inner=1.7)
    m.save(out)


def thicket(out, name='lair-thicket', seed=18, jungle=False):
    m = Model(name, seed)
    greens = ['jade10', 'teal10', 'grass11', 'jade9'] if jungle else ['grass9', 'grass10', 'grass11', 'grass10']
    spots = [(0, 0.3, 1.25), (-1.2, 0.0, 0.95), (1.2, 0.1, 1.0), (-0.6, 1.1, 0.9), (0.7, 1.2, 0.95), (-1.6, -0.9, 0.6), (1.7, -0.8, 0.55)]
    for i, (x, y, r) in enumerate(spots):
        m.ico(r, 1, at=(x, y, r * 0.7), s=(1, 1, 0.85), jit=r * 0.12, color=greens[i % len(greens)])
    hole(m, (0, -0.85, 0.45), 0.5, 0.1)
    if jungle:
        # Big leaves fanning out, and a couple of palms over the top.
        for i in range(9):
            a = i / 9 * math.tau
            m.ico(0.9, 1, at=(math.cos(a) * 1.9, math.sin(a) * 1.9, 0.55), s=(1, 0.35, 0.06), rot=(0, -0.45, a), color='jade9')
        for x, y, h in [(-0.9, 0.9, 3.4), (1.0, 0.6, 2.8)]:
            m.limb((x, y, 0), (x * 1.2, y * 1.1, h), 0.14, 0.09, 6, color='brown10')
            for j in range(6):
                a = j / 6 * math.tau
                m.ico(0.8, 1, at=(x * 1.2 + math.cos(a) * 0.6, y * 1.1 + math.sin(a) * 0.6, h - 0.1), s=(1, 0.3, 0.05),
                      rot=(0, 0.35, a), color='grass10')
    else:
        for i in range(6):
            a = m.rng.uniform(0, math.tau)
            m.limb((math.cos(a) * 0.9, math.sin(a) * 0.9, 0.8), (math.cos(a) * 2.0, math.sin(a) * 2.0, 1.5), 0.04, 0.01, 4, color='brown11')
    m.save(out)


def wallow(out, name='lair-wallow', seed=19, big=False):
    m = Model(name, seed)
    k = 1.5 if big else 1.0
    m.ico(2.0 * k, 1, s=(1.3, 1, 0.12), jit=0.15 * k, color='brown9')
    m.ico(1.6 * k, 1, at=(0, 0, 0.05), s=(1.25, 0.95, 0.1), jit=0.12 * k, color='brown11')
    m.disc(1.2 * k, 0.03, 12, at=(0, 0, 0.17), s=(1.25, 0.9, 1), jit=0.08 * k, color='bronze11', vary=0.03)
    for i in range(4 if big else 3):
        a = m.rng.uniform(0, math.tau)
        rock(m, (math.cos(a) * 2.4 * k, math.sin(a) * 1.9 * k, 0.05), 0.3 * k, 'gray9')
    m.scatter(10 if big else 7, 2.8 * k, lambda x, y, i: tuft(m, x, y, 5, 0.6, 'olive9', 'sand8'), inner=2.1 * k)
    if big:
        m.limb((-2.6, 1.2, 0.2), (-0.8, 2.4, 0.3), 0.22, 0.16, 7, color='gray9')
        m.limb((-1.8, 1.7, 0.25), (-1.6, 2.6, 1.2), 0.08, 0.04, 5, color='gray9')
    m.save(out)


def reeds(out):
    m = Model('lair-reeds', 20)
    m.ico(2.0, 1, s=(1.4, 1, 0.18), jit=0.15, color='brown8')
    m.ico(1.5, 1, at=(-0.6, 0.4, 0.05), s=(1.3, 1, 0.15), jit=0.1, color='brown10')

    def reed(x, y, i):
        h = m.rng.uniform(1.0, 1.9)
        m.blade((x, y, 0), h, 0.05, 0.2, ['grass10', 'olive10', 'grass11'][i % 3], grad='amber8')
        if i % 3 == 0:
            m.cyl(0.06, 0.28, 5, at=(x, y, h * 0.8), color='brown11', vary=0.03)

    m.scatter(60, 1.8, reed, center=(-0.3, 0.3))
    for i in range(3):
        rock(m, (1.6 - i * 0.6, -1.2 + i * 0.3, 0.05), 0.35, 'slate9', 'olive10')
    m.save(out)


def pond(out):
    m = Model('lair-pond', 21)
    m.ico(2.2, 1, s=(1.3, 1, 0.14), jit=0.15, color='brown10')
    m.disc(1.7, 0.04, 14, at=(0, 0, 0.2), s=(1.3, 1, 1), jit=0.1, color='olive11', vary=0.03)
    m.scatter(8, 1.6, lambda x, y, i: m.disc(0.28, 0.02, 7, at=(x, y, 0.25), jit=0.03, color='grass9'), center=(0, 0))
    m.scatter(18, 2.6, lambda x, y, i: m.blade((x, y, 0), m.rng.uniform(0.6, 1.2), 0.04, 0.2, 'olive10', grad='sand8'), inner=2.0)
    m.limb((-1.2, 0.6, 0.2), (0.2, 1.4, 1.0), 0.06, 0.03, 4, color='gray9')
    m.save(out)


def nest_tree(out):
    m = Model('lair-nest-tree', 22)
    m.cone(0.4, 0.25, 2.6, 7, color='brown10', jit=0.03)
    for i, (a, z, l) in enumerate([(0.3, 1.8, 1.4), (2.4, 2.1, 1.3), (4.3, 1.6, 1.2)]):
        end = (math.cos(a) * l, math.sin(a) * l, z + 0.8)
        m.limb((0, 0, z), end, 0.14, 0.07, 6, color='brown10')
        nest(m, (end[0], end[1], end[2] - 0.05), 0.32)
    for i in range(6):
        a = i / 6 * math.tau
        m.ico(1.0, 1, at=(math.cos(a) * 1.1, math.sin(a) * 1.1, 3.4 + m.rng.uniform(-0.2, 0.4)), jit=0.1,
              color=['grass9', 'grass10', 'grass8'][i % 3])
    m.ico(1.2, 1, at=(0, 0, 4.1), jit=0.1, color='grass9')
    nest(m, (0.2, -0.3, 4.9), 0.35)
    m.save(out)


def dead_tree(out):
    m = Model('lair-dead-tree', 23)
    m.cone(0.45, 0.18, 3.4, 6, color='gray9', jit=0.06)
    branches = [(0.2, 1.9, 1.6, 1.2), (2.0, 2.5, 1.4, 1.4), (3.9, 2.2, 1.5, 1.0), (5.2, 3.0, 1.0, 1.0)]
    for a, z, l, up in branches:
        mid = (math.cos(a) * l * 0.55, math.sin(a) * l * 0.55, z + up * 0.5)
        end = (math.cos(a + 0.4) * l, math.sin(a + 0.4) * l, z + up)
        m.limb((0, 0, z), mid, 0.12, 0.08, 5, color='gray9')
        m.limb(mid, end, 0.08, 0.02, 4, color='gray9')
    for p in [(math.cos(0.2) * 0.9, math.sin(0.2) * 0.9, 2.6), (math.cos(3.9) * 0.85, math.sin(3.9) * 0.85, 2.75), (0.0, 0.0, 3.4)]:
        nest(m, p, 0.24, eggs=None)
    rock(m, (1.0, -0.8, 0.0), 0.5, 'slate11')
    rock(m, (-0.9, -0.6, 0.0), 0.35, 'slate11')
    m.save(out)


def reef(out, name='lair-reef', seed=24, deep=False):
    m = Model(name, seed)
    rock(m, (0, 0, 0.2), 1.6 if deep else 1.3, 'slate11' if deep else 'slate9', sub=2, s=(1.3, 1, 0.6))
    rock(m, (1.5, 0.5, 0.1), 0.8, 'slate10')
    corals = ['iris9', 'indigo9', 'cyan10', 'plum9'] if deep else ['tomato9', 'crimson8', 'amber8', 'orange9']

    def branch_coral(x, y, i):
        c = corals[i % len(corals)]
        z0 = 0.6 if abs(x) < 1.2 else 0.2
        for j in range(4):
            a = j / 4 * math.tau + m.rng.uniform(-0.3, 0.3)
            m.limb((x, y, z0), (x + math.cos(a) * 0.35, y + math.sin(a) * 0.35, z0 + m.rng.uniform(0.5, 0.9)), 0.07, 0.03, 4, color=c)

    m.scatter(9, 1.6, branch_coral)
    m.scatter(4, 1.8, lambda x, y, i: m.ico(0.35, 2, at=(x, y, 0.5), s=(1, 1, 0.7), color='pink8' if not deep else 'iris10', vary=0.05))
    if deep:
        for i in range(7):
            a = m.rng.uniform(0, math.tau)
            x, y = math.cos(a) * 2.0, math.sin(a) * 1.6
            m.limb((x, y, 0), (x + 0.2, y, 2.6 + m.rng.uniform(-0.5, 0.7)), 0.08, 0.03, 4, color='grass10')
    m.save(out)


def prairie(out):
    m = Model('lair-prairie', 25)
    m.ico(2.6, 1, s=(1.3, 1, 0.1), jit=0.2, color='gold9', vary=0.1)
    m.scatter(30, 2.8, lambda x, y, i: tuft(m, x, y, 6, m.rng.uniform(0.6, 1.1), ['amber8', 'olive9', 'sand9'][i % 3], 'sand7'))
    rock(m, (1.6, -1.2, 0.0), 0.45, 'gray9')
    # A skull, for the bison's reputation.
    m.ico(0.25, 1, at=(-1.4, -1.5, 0.15), s=(1, 1.3, 0.8), color='sand3', vary=0.02)
    for side in (-1, 1):
        m.limb((-1.4 + side * 0.18, -1.45, 0.25), (-1.4 + side * 0.5, -1.4, 0.5), 0.05, 0.01, 4, color='sand6')
    m.save(out)


def baobab(out):
    m = Model('lair-baobab', 26)
    m.cone(1.0, 0.7, 3.4, 9, jit=0.08, color='bronze9', grad='bronze8')
    for i in range(6):
        a = i / 6 * math.tau + 0.3
        end = (math.cos(a) * 1.6, math.sin(a) * 1.6, 4.4 + m.rng.uniform(-0.2, 0.3))
        m.limb((0, 0, 3.2), end, 0.25, 0.12, 6, color='bronze9')
        m.ico(0.85, 1, at=end, s=(1, 1, 0.5), jit=0.08, color=['grass9', 'grass11', 'grass10'][i % 3])
    m.ico(1.1, 1, at=(0, 0, 4.4), s=(1, 1, 0.45), jit=0.08, color='grass9')
    m.scatter(10, 3.0, lambda x, y, i: tuft(m, x, y, 5, 0.7, 'amber8', 'sand7'), inner=1.6)
    m.save(out)


# ── Landmarks and human outposts ─────────────────────────────────────────────


def volcano(out):
    m = Model('volcano', 30, vary=0.05)
    m.cone(10, 2.8, 8, 16, jit=0.35, color='brown11', grad='slate9')
    m.cone(12.5, 8, 1.6, 18, jit=0.3, color='brown10')
    # Crater rim, then the lava pool (second material, glowing).
    m.cone(3.0, 2.4, 0.5, 14, at=(0, 0, 7.8), jit=0.1, color='slate10', vary=0.05)
    m.cone(2.3, 2.3, 0.2, 14, at=(0, 0, 8.2), color='orange9', vary=0.05, mat=1)
    # Streams running down the slope, hugging the surface.
    slope = lambda r: 8 - (r - 2.8) / (10 - 2.8) * 8
    for a in (0.5, 1.4, 3.9):
        pts = []
        for j in range(6):
            r = 2.6 + j * 1.5
            wob = a + math.sin(j * 1.7 + a) * 0.08
            pts.append((math.cos(wob) * r, math.sin(wob) * r, max(0.2, slope(r)) + 0.12))
        for (p, q), w in zip(zip(pts, pts[1:]), (0.42, 0.38, 0.33, 0.28, 0.22)):
            m.limb(p, q, w, w * 0.9, 5, color='tomato9', vary=0.08, mat=1)
    m.scatter(14, 11, lambda x, y, i: rock(m, (x, y, 0), m.rng.uniform(0.6, 1.2), 'slate11'), inner=9.5)
    m.save(out, materials={'lava': ('orange9', 2.5)})


def watchtower(out):
    m = Model('watchtower', 31, vary=0.02)
    for x in (-0.6, 0.6):
        for y in (-0.6, 0.6):
            m.limb((x * 1.3, y * 1.3, 0), (x, y, 3.0), 0.09, 0.08, 5, color='brown10', vary=0.02)
    m.limb((-0.75, -0.75, 1.2), (0.75, 0.75, 2.2), 0.05, 0.05, 4, color='brown11', vary=0.02)
    m.limb((0.75, -0.75, 1.2), (-0.75, 0.75, 2.2), 0.05, 0.05, 4, color='brown11', vary=0.02)
    m.box((1.8, 1.8, 0.15), at=(0, 0, 3.0), color='brown9')
    for x, y, w, d in [(0, -0.85, 1.8, 0.1), (0, 0.85, 1.8, 0.1), (-0.85, 0, 0.1, 1.8), (0.85, 0, 0.1, 1.8)]:
        m.box((w, d, 0.6), at=(x, y, 3.15), color='brown10')
    m.cone(1.4, 0, 1.0, 4, at=(0, 0, 4.0), rot=(0, 0, math.pi / 4), color='tomato10')
    for x in (-0.8, 0.8):
        for y in (-0.8, 0.8):
            m.cyl(0.05, 0.85, 4, at=(x, y, 3.15), color='brown11')
    m.save(out)


def wind_turbine(out):
    m = Model('wind-turbine', 32, vary=0.01)
    m.cone(0.35, 0.18, 9.0, 10, color='slate5', vary=0.01)
    m.box((0.5, 1.4, 0.5), at=(0, 0.2, 8.9), color='slate5')
    m.cyl(0.8, 0.12, 8, at=(0, 0, 0), color='slate8')
    m.part('rotor', pivot=(0, -0.55, 9.15))
    m.ico(0.28, 1, at=(0, -0.6, 9.15), s=(1, 1.4, 1), color='slate5', vary=0.01)
    for i in range(3):
        a = i / 3 * math.tau
        m.limb((0, -0.65, 9.15), (math.sin(a) * 4.2, -0.65, 9.15 + math.cos(a) * 4.2), 0.18, 0.05, 4, color='white', vary=0.01)
    m.save(out)


def oil_rig(out):
    m = Model('oil-rig', 33, vary=0.02)
    for x in (-1.6, 1.6):
        for y in (-1.6, 1.6):
            m.cyl(0.22, 4.0, 6, at=(x, y, 0), color='amber8')
    m.box((4.2, 4.2, 0.4), at=(0, 0, 4.0), color='slate9')
    m.box((2.0, 1.6, 1.0), at=(-0.9, 0.9, 4.4), color='slate7')
    m.box((0.6, 0.6, 0.4), at=(-0.9, 0.9, 5.4), color='tomato10')
    # The derrick.
    for x in (-0.6, 0.6):
        for y in (-0.6, 0.6):
            m.limb((0.9 + x, -0.6 + y, 4.4), (0.9 + x * 0.2, -0.6 + y * 0.2, 9.0), 0.06, 0.05, 4, color='tomato9')
    m.limb((-2.0, -1.8, 4.4), (-2.6, -2.4, 6.4), 0.07, 0.05, 4, color='amber9')
    m.cone(0.12, 0.25, 0.5, 6, at=(-2.6, -2.4, 6.4), color='orange9', mat=1)
    m.save(out, materials={'flare': ('orange9', 3)})


def mine_head(out):
    m = Model('mine-head', 34, vary=0.02)
    m.box((3.2, 2.0, 1.6), at=(-1.2, 0.8, 0), color='bronze9')
    m.box((3.4, 2.2, 0.15), at=(-1.2, 0.8, 1.6), rot=(0.12, 0, 0), color='slate10')
    for x in (-0.5, 0.5):
        m.limb((x + 1.2, -0.8, 0), (x * 0.3 + 1.2, -0.8, 4.2), 0.09, 0.07, 4, color='slate11')
        m.limb((x + 1.2, 1.2, 0), (x * 0.3 + 1.2, -0.6, 4.1), 0.07, 0.06, 4, color='slate11')
    m.cyl(0.6, 0.12, 12, at=(1.2, -0.65, 4.2), rot=(math.pi / 2, 0, math.pi / 2), color='tomato10')
    m.box((0.9, 0.6, 0.5), at=(2.6, 1.2, 0.15), color='slate9')
    m.scatter(5, 0.5, lambda x, y, i: m.ico(0.18, 0, at=(2.6 + x, 1.2 + y, 0.7), color='gray11', vary=0.03))
    m.box((4.5, 0.08, 0.06), at=(1.0, 1.2, 0.05), color='brown11')
    m.save(out)


def geothermal(out):
    m = Model('geothermal', 35, vary=0.02)
    for x in (-1.4, 1.4):
        m.cone(1.3, 0.95, 1.8, 14, at=(x, 0.6, 0), color='slate7')
        m.cone(0.95, 1.1, 1.4, 14, at=(x, 0.6, 1.8), color='slate7')
    m.box((3.6, 1.6, 1.4), at=(0, -1.6, 0), color='slate8')
    m.box((3.8, 1.8, 0.12), at=(0, -1.6, 1.4), color='slate10')
    for y in (-0.4, -0.2):
        m.limb((-3.0, y, 0.6), (3.0, y, 0.6), 0.1, 0.1, 6, color='amber8')
    m.save(out)


# ── Props ────────────────────────────────────────────────────────────────────


def grass_tuft(out):
    m = Model('grass-tuft', 40)
    m.scatter(4, 0.35, lambda x, y, i: tuft(m, x, y, 5, 0.7, 'grass9', 'lime8'))
    m.save(out)


def fern(out):
    m = Model('fern', 41)
    for i in range(7):
        a = i / 7 * math.tau
        m.ico(0.55, 1, at=(math.cos(a) * 0.45, math.sin(a) * 0.45, 0.3), s=(1, 0.28, 0.05), rot=(0, -0.5, a), color='grass10')
    m.save(out)


def wildflowers(out):
    m = Model('wildflowers', 42)
    m.scatter(6, 0.5, lambda x, y, i: tuft(m, x, y, 3, 0.4, 'grass9'))
    colors = ['amber9', 'crimson8', 'white', 'plum9']
    m.scatter(8, 0.55, lambda x, y, i: flower(m, x, y, m.rng.uniform(0.3, 0.55), colors[i % 4]))
    m.save(out)


def vines(out):
    """Nature creeping over pavement: a low leafy mat with a couple of tendrils."""
    m = Model('vines', 43)
    m.scatter(16, 0.9, lambda x, y, i: m.ico(0.22, 0, at=(x, y, 0.04), s=(1, 1, 0.3), rot=(0, 0, m.rng.uniform(0, 3)),
                                             color=['grass9', 'grass10', 'jade9'][i % 3]))
    for i in range(3):
        a = i / 3 * math.tau
        m.limb((0, 0, 0.05), (math.cos(a) * 1.1, math.sin(a) * 1.1, 0.08), 0.03, 0.02, 4, color='grass11')
    m.save(out)


def stump(out):
    m = Model('stump', 44, vary=0.04)
    m.cone(0.45, 0.38, 0.5, 9, jit=0.03, color='brown10')
    m.cyl(0.36, 0.03, 9, at=(0, 0, 0.5), color='brown7', vary=0.02)
    for i in range(4):
        a = i / 4 * math.tau + 0.4
        m.limb((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.1), (math.cos(a) * 0.7, math.sin(a) * 0.7, 0.0), 0.08, 0.03, 4, color='brown11')
    m.save(out)


def fence(out):
    m = Model('fence', 45, vary=0.02)
    for x in (-1.5, 0, 1.5):
        m.box((0.14, 0.14, 1.1), at=(x, 0, 0), color='brown9')
    for z in (0.4, 0.85):
        m.box((3.2, 0.06, 0.12), at=(0, 0, z), color='brown8')
    m.save(out)


def log_pile(out):
    m = Model('log-pile', 46, vary=0.04)
    for row, n in enumerate((4, 3, 2)):
        for i in range(n):
            x = (i - (n - 1) / 2) * 0.42
            m.cyl(0.2, 2.2, 8, at=(x, -1.1, 0.2 + row * 0.36), rot=(-math.pi / 2, 0, 0), color='brown10')
            m.cyl(0.17, 0.02, 8, at=(x, 1.1, 0.2 + row * 0.36), rot=(-math.pi / 2, 0, 0), color='brown7', vary=0.02)
    m.save(out)


BUILDERS = [
    anthill, termite_mound, den, cave,
    lambda o: cave(o, 'lair-cave-big', 27, 1.35, snow=True),
    glacier, flowers, burrow, thicket,
    lambda o: thicket(o, 'lair-jungle', 28, jungle=True),
    wallow,
    lambda o: wallow(o, 'lair-wallow-big', 29, big=True),
    reeds, pond, nest_tree, dead_tree, reef,
    lambda o: reef(o, 'lair-reef-deep', 36, deep=True),
    prairie, baobab,
    volcano, watchtower, wind_turbine, oil_rig, mine_head, geothermal,
    grass_tuft, fern, wildflowers, vines, stump, fence, log_pile,
]


def main():
    out = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else os.path.join(os.getcwd(), 'models-raw')
    os.makedirs(out, exist_ok=True)
    for build in BUILDERS:
        build(out)
    names = sorted(f[:-4] for f in os.listdir(out) if f.endswith('.glb'))
    print('built', len(names), 'models:', ' '.join(names))


if __name__ == '__main__':
    main()
