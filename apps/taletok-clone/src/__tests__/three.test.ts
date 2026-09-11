import { describe, expect, it } from 'vitest';
import {
  cross, dot, identity, length, lookAt, multiply, normalize, rotationY,
  transformDirection, transformPoint, translation,
} from '@/providers/visual/three/math';
import { box, capsule, cylinder, ground, mergeMeshes, sphere, transformMesh, triangleCount } from '@/providers/visual/three/mesh';
import { Renderer } from '@/providers/visual/three/raster';
import { buildScene, chooseSceneKind, frameObjects, SCENE_KINDS } from '@/providers/visual/three/scenes';

describe('3D maths', () => {
  it('normalizes to unit length and survives a zero vector', () => {
    expect(length(normalize([3, 4, 0]))).toBeCloseTo(1, 6);
    expect(normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('produces a cross product perpendicular to both inputs', () => {
    const a: [number, number, number] = [1, 2, 3];
    const b: [number, number, number] = [-2, 0, 5];
    const c = cross(a, b);
    expect(dot(c, a)).toBeCloseTo(0, 6);
    expect(dot(c, b)).toBeCloseTo(0, 6);
  });

  it('leaves points unchanged through identity', () => {
    expect(transformPoint(identity(), [1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('translates points but not directions', () => {
    const m = translation(5, 0, 0);
    expect(transformPoint(m, [1, 1, 1])[0]).toBe(6);
    expect(transformDirection(m, [1, 0, 0])).toEqual([1, 0, 0]);
  });

  it('rotates a quarter turn about Y', () => {
    const p = transformPoint(rotationY(Math.PI / 2), [1, 0, 0]);
    expect(p[0]).toBeCloseTo(0, 5);
    expect(p[2]).toBeCloseTo(-1, 5);
  });

  it('composes transforms in order', () => {
    const m = multiply(translation(0, 3, 0), rotationY(Math.PI));
    const p = transformPoint(m, [1, 0, 0]);
    expect(p[1]).toBeCloseTo(3, 5);
    expect(p[0]).toBeCloseTo(-1, 5);
  });

  it('places the camera so the target sits down its -Z axis', () => {
    // The renderer assumes this convention; if it flips, nothing draws.
    const view = lookAt([0, 0, 10], [0, 0, 0]);
    const target = transformPoint(view, [0, 0, 0]);
    expect(target[2]).toBeLessThan(0);
    expect(Math.abs(target[0])).toBeCloseTo(0, 5);
  });

  it('does not collapse when looking straight down', () => {
    const view = lookAt([0, 10, 0], [0, 0, 0]);
    expect([...view].every(Number.isFinite)).toBe(true);
  });
});

describe('mesh primitives', () => {
  const meshes = {
    box: box(1, 2, 3),
    sphere: sphere(1, 12, 8),
    cylinder: cylinder(0.5, 1, 2, 10),
    cone: cylinder(0, 1, 2, 10),
    capsule: capsule(0.5, 2, 10, 6),
    ground: ground(10, 4),
  };

  it('produces well-formed geometry', () => {
    for (const [name, mesh] of Object.entries(meshes)) {
      expect(mesh.indices.length % 3, `${name} indices`).toBe(0);
      expect(triangleCount(mesh), `${name} triangles`).toBeGreaterThan(0);
      expect(mesh.positions.length, `${name} normals`).toBe(mesh.normals.length);
    }
  });

  it('keeps every index inside the vertex range', () => {
    for (const [name, mesh] of Object.entries(meshes)) {
      const vertices = mesh.positions.length / 3;
      for (let i = 0; i < mesh.indices.length; i++) {
        expect(mesh.indices[i], `${name} index ${i}`).toBeLessThan(vertices);
      }
    }
  });

  it('emits unit-length normals', () => {
    for (const [name, mesh] of Object.entries(meshes)) {
      for (let i = 0; i < mesh.normals.length; i += 3) {
        const l = Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]);
        expect(l, `${name} normal ${i / 3}`).toBeCloseTo(1, 3);
      }
    }
  });

  it('puts sphere vertices on the radius', () => {
    const mesh = meshes.sphere;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      expect(Math.hypot(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2])).toBeCloseTo(1, 4);
    }
  });

  it('omits the degenerate cap on a cone', () => {
    // A zero-radius cap would contribute only slivers.
    expect(triangleCount(meshes.cone)).toBeLessThan(triangleCount(meshes.cylinder));
  });

  it('displaces ground vertices by the height function', () => {
    const flat = ground(10, 4);
    const bumpy = ground(10, 4, (x) => x);
    expect(flat.positions[1]).toBe(0);
    expect([...bumpy.positions].some((_, i) => i % 3 === 1 && bumpy.positions[i] !== 0)).toBe(true);
  });

  it('bakes transforms without changing topology', () => {
    const moved = transformMesh(meshes.box, translation(5, 0, 0));
    expect(moved.indices.length).toBe(meshes.box.indices.length);
    expect(moved.positions[0]).toBeCloseTo(meshes.box.positions[0] + 5, 5);
  });

  it('merges meshes and offsets their indices', () => {
    const merged = mergeMeshes([meshes.box, meshes.sphere]);
    expect(triangleCount(merged)).toBe(triangleCount(meshes.box) + triangleCount(meshes.sphere));
    const vertices = merged.positions.length / 3;
    for (let i = 0; i < merged.indices.length; i++) {
      expect(merged.indices[i]).toBeLessThan(vertices);
    }
  });
});

describe('rasterizer', () => {
  /** Renders a lone sphere and reports how much of the frame it covers. */
  function coverage(width = 64, height = 64) {
    const renderer = new Renderer(width, height);
    const sample = renderer.render(
      [{ mesh: sphere(2, 16, 12), transform: identity(), material: { color: [220, 60, 60] } }],
      { position: [0, 0, 8], view: lookAt([0, 0, 8], [0, 0, 0]), fov: 1 },
      {
        lightDirection: [-0.4, -0.8, -0.4],
        skyTop: [10, 20, 30], skyBottom: [10, 20, 30],
        outlineColor: [0, 0, 0], outlineWidth: 0, fogStrength: 0,
      },
    );

    let covered = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [r, g, b] = sample(x, y);
        if (!(r === 10 && g === 20 && b === 30)) covered++;
      }
    }
    return { covered, total: width * height, sample };
  }

  it('draws geometry rather than an empty sky', () => {
    // This is the regression that mattered: clearing depth to +Infinity made
    // every fragment fail the test, and the renderer silently drew nothing.
    const { covered, total } = coverage();
    expect(covered).toBeGreaterThan(total * 0.1);
  });

  it('leaves the background visible around the subject', () => {
    const { covered, total } = coverage();
    expect(covered).toBeLessThan(total * 0.95);
  });

  it('shades into discrete cel bands rather than a smooth ramp', () => {
    const { sample } = coverage();
    const reds = new Set<number>();
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const [r, g, b] = sample(x, y);
        if (!(r === 10 && g === 20 && b === 30)) reds.add(Math.round(r));
      }
    }
    // A few flat bands, not a continuous gradient.
    expect(reds.size).toBeGreaterThan(1);
    expect(reds.size).toBeLessThanOrEqual(6);
  });

  it('renders an empty scene as pure sky', () => {
    const renderer = new Renderer(16, 16);
    const sample = renderer.render([], { position: [0, 0, 5], view: lookAt([0, 0, 5], [0, 0, 0]), fov: 1 }, {
      lightDirection: [0, -1, 0], skyTop: [1, 2, 3], skyBottom: [1, 2, 3],
      outlineColor: [0, 0, 0], outlineWidth: 2, fogStrength: 0,
    });
    expect(sample(8, 8)).toEqual([1, 2, 3]);
  });

  it('survives geometry straddling the near plane', () => {
    // Without near-plane clipping these vertices project to wild coordinates.
    const renderer = new Renderer(32, 32);
    expect(() =>
      renderer.render(
        [{ mesh: box(20, 20, 20), transform: identity(), material: { color: [200, 200, 200] } }],
        { position: [0, 0, 0], view: lookAt([0, 0, 0], [0, 0, -1]), fov: 1 },
        {
          lightDirection: [0, -1, 0], skyTop: [0, 0, 0], skyBottom: [0, 0, 0],
          outlineColor: [0, 0, 0], outlineWidth: 1, fogStrength: 0,
        },
      ),
    ).not.toThrow();
  });
});

describe('scene archetypes', () => {
  it('builds every archetype with geometry and a camera', () => {
    for (const kind of SCENE_KINDS) {
      const spec = buildScene(`${kind} establishing shot`, 12345);
      const objects = frameObjects(spec, 0.25);
      expect(objects.length, `${kind} objects`).toBeGreaterThan(0);
      const camera = spec.camera(0.25);
      expect([...camera.view].every(Number.isFinite), `${kind} camera`).toBe(true);
    }
  });

  it('routes prompts to a matching set', () => {
    expect(chooseSceneKind('the city skyline at night', 0)).toBe('city');
    expect(chooseSceneKind('a lighthouse on the shore', 0)).toBe('coast');
    expect(chooseSceneKind('deep in the forest', 0)).toBe('forest');
    expect(chooseSceneKind('a crowd of people waiting', 0)).toBe('crowd');
    expect(chooseSceneKind('inside the empty office', 0)).toBe('interior');
  });

  it('still picks a set when nothing matches', () => {
    expect(SCENE_KINDS).toContain(chooseSceneKind('abstract notions of value', 3));
  });

  it('is deterministic for the same prompt and seed', () => {
    const a = buildScene('a quiet harbour', 999);
    const b = buildScene('a quiet harbour', 999);
    expect(a.kind).toBe(b.kind);
    expect(frameObjects(a, 0.5).length).toBe(frameObjects(b, 0.5).length);
  });

  it('animates: transforms differ across the cycle', () => {
    const spec = buildScene('a crowd of people waiting', 7);
    expect(spec.animated.length).toBeGreaterThan(0);
    const start = [...spec.animated[0].at(0)].join(',');
    const mid = [...spec.animated[0].at(0.3)].join(',');
    expect(start).not.toBe(mid);
  });

  it('closes the camera path so a clip loops', () => {
    for (const kind of SCENE_KINDS) {
      const spec = buildScene(`${kind} shot`, 55);
      const start = [...spec.camera(0).view];
      const end = [...spec.camera(1).view];
      for (let i = 0; i < 16; i++) {
        expect(Math.abs(start[i] - end[i]), `${kind} camera seam`).toBeLessThan(0.02);
      }
    }
  });
});
