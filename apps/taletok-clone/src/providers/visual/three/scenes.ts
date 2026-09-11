import type { RgbPixel } from '@/lib/media-encode';
import { hslToRgb } from '../painters';
import { seededRandom } from '@/lib/media-encode';
import {
  type Mat4, type Vec3, identity, lookAt, multiply, pingPong, rotationX, rotationY, rotationZ,
  scaling, smoothstep, translation,
} from './math';
import { type Mesh, box, capsule, cylinder, ground, sphere, transformMesh } from './mesh';
import type { Camera, RenderOptions, SceneObject } from './raster';

/**
 * Procedural 3D sets.
 *
 * A scene is chosen by hashing the visual prompt, so a given beat always gets
 * the same world and re-renders are stable. Everything is built from the mesh
 * primitives — there are no model assets — and every figure is a generic
 * original form made of capsules and spheres.
 *
 * Static geometry is built once per scene; only animated transforms and the
 * camera are recomputed per frame, which is what keeps a 48-frame clip
 * affordable.
 */

export interface AnimatedObject {
  object: SceneObject;
  /** Returns the world transform for normalised time t. */
  at: (t: number) => Mat4;
}

export interface SceneSpec {
  statics: SceneObject[];
  animated: AnimatedObject[];
  camera: (t: number) => Camera;
  options: RenderOptions;
  /** Archetype name, surfaced for logging and tests. */
  kind: string;
}

export const SCENE_KINDS = [
  'hills', 'city', 'peaks', 'forest', 'coast', 'interior', 'crowd',
  'vehicle', 'machine',
] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];

// ------------------------------------------------------------- palettes

interface Palette {
  sky: [RgbPixel, RgbPixel];
  ground: RgbPixel;
  primary: RgbPixel;
  secondary: RgbPixel;
  accent: RgbPixel;
  outline: RgbPixel;
}

/**
 * Palettes are anchored per archetype rather than picked from a free hue.
 * Cel shading collapses each surface to one flat band, so an arbitrary hue
 * reads as wrong immediately — ground that is magenta stops looking like
 * ground. The seed varies each family within a believable range.
 */
const PALETTE_FAMILIES: Record<string, (rand: () => number) => Palette> = {
  hills: (rand) => natural(rand, 96 + rand() * 24, 0.4, 0.46),
  forest: (rand) => natural(rand, 108 + rand() * 20, 0.45, 0.36),
  crowd: (rand) => natural(rand, 92 + rand() * 20, 0.22, 0.5),
  peaks: (rand) => ({
    sky: [hslToRgb(208, 0.5, 0.66), hslToRgb(196, 0.42, 0.86)],
    ground: hslToRgb(28 + rand() * 14, 0.2, 0.5),
    primary: hslToRgb(220, 0.16, 0.56),
    secondary: hslToRgb(212, 0.2, 0.44),
    accent: hslToRgb(24, 0.5, 0.58),
    outline: [26, 24, 34],
  }),
  city: (rand) => ({
    sky: [hslToRgb(206, 0.55, 0.62), hslToRgb(30 + rand() * 20, 0.5, 0.84)],
    ground: hslToRgb(215, 0.1, 0.42),
    primary: hslToRgb(205, 0.28, 0.62),
    secondary: hslToRgb(28, 0.3, 0.56),
    accent: hslToRgb(180, 0.32, 0.58),
    outline: [24, 22, 30],
  }),
  coast: (rand) => ({
    sky: [hslToRgb(204, 0.6, 0.64), hslToRgb(38, 0.55, 0.86)],
    ground: hslToRgb(44 + rand() * 8, 0.45, 0.72),
    primary: hslToRgb(196 + rand() * 10, 0.55, 0.5),
    secondary: hslToRgb(210, 0.15, 0.46),
    accent: hslToRgb(18, 0.5, 0.6),
    outline: [22, 26, 34],
  }),
  // Explainer look: pale desaturated sky, dark ground, one saturated hero.
  vehicle: (rand) => product(rand),
  machine: (rand) => product(rand),
  interior: (rand) => ({
    sky: [hslToRgb(34, 0.3, 0.78), hslToRgb(34, 0.25, 0.68)],
    ground: hslToRgb(28, 0.32, 0.52),
    primary: hslToRgb(20 + rand() * 30, 0.38, 0.58),
    secondary: hslToRgb(40, 0.22, 0.74),
    accent: hslToRgb(348, 0.42, 0.58),
    outline: [30, 24, 22],
  }),
};

/**
 * Product/mechanism palette: a pale, almost colourless sky and dark ground so
 * the single saturated hero object carries the whole frame. Smooth shading
 * needs the surroundings to stay quiet or the subject stops reading.
 */
function product(rand: () => number): Palette {
  const heroHue = [12, 210, 30, 348][Math.floor(rand() * 4)];
  return {
    sky: [hslToRgb(205, 0.28, 0.7), hslToRgb(200, 0.16, 0.84)],
    ground: hslToRgb(215, 0.05, 0.17),
    primary: hslToRgb(heroHue, 0.68, 0.5),
    secondary: hslToRgb(215, 0.06, 0.42),
    accent: hslToRgb(212, 0.08, 0.72),
    outline: [18, 20, 24],
  };
}

/** Green-ground, blue-sky outdoor family shared by the landscape sets. */
function natural(rand: () => number, groundHue: number, saturation: number, lightness: number): Palette {
  return {
    sky: [hslToRgb(207, 0.62, 0.6), hslToRgb(196, 0.5, 0.85)],
    ground: hslToRgb(groundHue, saturation, lightness),
    primary: hslToRgb(groundHue + 6, saturation + 0.1, lightness - 0.08),
    secondary: hslToRgb(26, 0.35, 0.36),
    accent: hslToRgb(8 + rand() * 30, 0.6, 0.56),
    outline: [26, 28, 26],
  };
}

function paletteFor(rand: () => number, kind: string): Palette {
  return (PALETTE_FAMILIES[kind] ?? PALETTE_FAMILIES.hills)(rand);
}

// ------------------------------------------------------------- components

/**
 * A generic original figure: capsule torso, sphere head, simple limbs.
 * Deliberately abstract — a silhouette, not a likeness.
 */
function figure(height: number, body: RgbPixel, head: RgbPixel): { mesh: Mesh; material: RgbPixel }[] {
  const unit = height / 7;
  const parts: { mesh: Mesh; material: RgbPixel }[] = [];

  parts.push({
    mesh: transformMesh(capsule(unit * 1.05, unit * 3.4, 12, 6), translation(0, unit * 2.6, 0)),
    material: body,
  });
  parts.push({
    mesh: transformMesh(sphere(unit * 0.92, 14, 10), translation(0, unit * 5.05, 0)),
    material: head,
  });

  for (const side of [-1, 1]) {
    parts.push({
      mesh: transformMesh(
        capsule(unit * 0.36, unit * 2.4, 8, 4),
        multiply(translation(side * unit * 1.25, unit * 2.9, 0), rotationZ(side * 0.28)),
      ),
      material: body,
    });
    parts.push({
      mesh: transformMesh(capsule(unit * 0.45, unit * 2.3, 8, 4), translation(side * unit * 0.5, unit * 0.95, 0)),
      material: body,
    });
  }

  return parts;
}

/**
 * A generic road vehicle: a low body, a set-back cabin and four wheels.
 * Deliberately an archetype rather than any particular model — no badges,
 * grille pattern or marque-specific shaping.
 */
function vehicleParts(length: number, body: RgbPixel, glass: RgbPixel, tyre: RgbPixel) {
  const u = length / 10;
  const parts: { mesh: Mesh; material: RgbPixel }[] = [];

  // The body sits high enough to clear the wheels: with it any lower, the top
  // half of each wheel disappears inside the box and what is left reads as a
  // crescent rather than a wheel.
  parts.push({ mesh: transformMesh(box(u * 10, u * 1.6, u * 4), translation(0, u * 2.75, 0)), material: body });
  parts.push({ mesh: transformMesh(box(u * 5.2, u * 1.5, u * 3.6), translation(-u * 0.4, u * 4.3, 0)), material: glass });
  // Sill running between the wheels, inset so the wheels stand proud of it.
  parts.push({ mesh: transformMesh(box(u * 6.2, u * 0.8, u * 3.4), translation(0, u * 1.9, 0)), material: tyre });

  // Wheels are discs on an X axis, so the cylinder is rotated a quarter turn.
  for (const dx of [-u * 3.1, u * 3.1]) {
    for (const dz of [-u * 2.15, u * 2.15]) {
      parts.push({
        mesh: transformMesh(
          cylinder(u * 1.5, u * 1.5, u * 0.75, 16),
          multiply(translation(dx, u * 1.5, dz), rotationZ(Math.PI / 2)),
        ),
        material: tyre,
      });
    }
  }
  return parts;
}

/**
 * A generic mechanical assembly: a block, a bank of cylinders, a pulley and
 * some piping. An archetype of a machine, not a copy of any real unit.
 */
function machineParts(scaleUnit: number, metal: RgbPixel, dark: RgbPixel, accent: RgbPixel) {
  const u = scaleUnit;
  const parts: { mesh: Mesh; material: RgbPixel }[] = [];

  parts.push({ mesh: transformMesh(box(u * 4, u * 2.6, u * 3), translation(0, u * 1.3, 0)), material: metal });
  parts.push({ mesh: transformMesh(box(u * 3.6, u * 0.8, u * 2.6), translation(0, u * 3, 0)), material: dark });

  // Cylinder bank across the top.
  // Spaced wider than their diameter, or the bank merges into one slab.
  for (let i = 0; i < 4; i++) {
    parts.push({
      mesh: transformMesh(cylinder(u * 0.34, u * 0.34, u * 1.4, 12), translation(-u * 1.5 + i * u * 1.0, u * 4.05, 0)),
      material: accent,
    });
  }

  // Pulley on the front face and a length of pipe along the side.
  // Housing for the pulley. The rotating face is mounted clear in front of
  // this rather than through it: coplanar surfaces at the same depth stipple
  // badly under a z-buffer.
  parts.push({
    mesh: transformMesh(cylinder(u * 0.95, u * 0.95, u * 0.36, 16), multiply(translation(u * 2.12, u * 1.5, 0), rotationZ(Math.PI / 2))),
    material: dark,
  });
  parts.push({
    mesh: transformMesh(cylinder(u * 0.22, u * 0.22, u * 3.4, 10), multiply(translation(-u * 0.2, u * 2.2, u * 1.7), rotationX(Math.PI / 2))),
    material: dark,
  });
  parts.push({ mesh: transformMesh(box(u * 4.2, u * 0.4, u * 3.2), translation(0, u * 0.2, 0)), material: dark });

  return parts;
}

/** Conical evergreen: stacked cones on a trunk. */
function tree(height: number, trunk: RgbPixel, leaf: RgbPixel): { mesh: Mesh; material: RgbPixel }[] {
  return [
    {
      mesh: transformMesh(cylinder(height * 0.05, height * 0.07, height * 0.3, 8), translation(0, height * 0.15, 0)),
      material: trunk,
    },
    {
      mesh: transformMesh(cylinder(0, height * 0.26, height * 0.45, 10), translation(0, height * 0.5, 0)),
      material: leaf,
    },
    {
      mesh: transformMesh(cylinder(0, height * 0.19, height * 0.38, 10), translation(0, height * 0.78, 0)),
      material: leaf,
    },
  ];
}

function obj(mesh: Mesh, color: RgbPixel, transform: Mat4 = identity(), ambient = 0.12): SceneObject {
  return { mesh, transform, material: { color, ambient } };
}

// --------------------------------------------------------------- builders

type Builder = (rand: () => number, palette: Palette, aspect: number) => SceneSpec;

/**
 * Slow orbit around a point, with a gentle rise — the default documentary move.
 *
 * The sweep is a sine rather than a linear ramp so the camera eases out and
 * back to exactly where it started. A linear sweep ends half a sweep away from
 * its start, which snaps visibly every time a clip loops to fill a scene.
 */
function orbitCamera(
  radius: number, height: number, target: Vec3, sweep: number, fov: number,
): (t: number) => Camera {
  return (t: number) => {
    const angle = (sweep / 2) * Math.sin(Math.PI * 2 * t);
    const eye: Vec3 = [
      target[0] + Math.sin(angle) * radius,
      height + Math.sin(t * Math.PI) * height * 0.08,
      target[2] + Math.cos(angle) * radius,
    ];
    return { position: eye, view: lookAt(eye, target), fov };
  };
}

/** Push in toward the subject and ease back out, so the clip loops. */
function dollyCamera(
  from: number, to: number, height: number, target: Vec3, fov: number,
): (t: number) => Camera {
  return (t: number) => {
    const distance = from + (to - from) * pingPong(t);
    const eye: Vec3 = [target[0], height, target[2] + distance];
    return { position: eye, view: lookAt(eye, target), fov };
  };
}

const hills: Builder = (rand, palette) => {
  const statics: SceneObject[] = [];
  const animated: AnimatedObject[] = [];

  const phase = rand() * 10;
  statics.push(
    obj(ground(220, 40, (x, z) =>
      Math.sin(x * 0.09 + phase) * 1.8 + Math.cos(z * 0.07 - phase) * 2.1 - 2,
    ), palette.ground),
  );

  for (let i = 0; i < 16; i++) {
    const x = (rand() - 0.5) * 60;
    const z = -10 - rand() * 45;
    const height = 3.5 + rand() * 3;
    const y = Math.sin(x * 0.09 + phase) * 1.8 + Math.cos(z * 0.07 - phase) * 2.1 - 2;
    for (const part of tree(height, palette.secondary, palette.primary)) {
      statics.push(obj(part.mesh, part.material, translation(x, y, z)));
    }
  }

  // A figure walking the ridge gives the shot a subject.
  const walkX = (rand() - 0.5) * 8;
  for (const part of figure(3.4, palette.accent, palette.secondary)) {
    animated.push({
      object: obj(part.mesh, part.material),
      at: (t) => {
        const z = -6 + Math.sin(t * Math.PI * 2) * 3;
        const y = Math.sin(walkX * 0.09 + phase) * 1.8 + Math.cos(z * 0.07 - phase) * 2.1 - 2;
        const bob = Math.abs(Math.sin(t * Math.PI * 6)) * 0.12;
        return translation(walkX, y + bob, z);
      },
    });
  }

  return {
    kind: 'hills',
    statics,
    animated,
    camera: orbitCamera(22, 10, [0, 1.5, -10], 0.5, 0.9),
    options: baseOptions(palette, 0.35),
  };
};

const city: Builder = (rand, palette) => {
  const statics: SceneObject[] = [
    obj(ground(240, 26, (x, z) => Math.sin(x * 0.04) * 0.4 + Math.cos(z * 0.045) * 0.4), palette.ground),
  ];

  for (let i = 0; i < 26; i++) {
    const x = (rand() - 0.5) * 55;
    const z = -8 - rand() * 50;
    const height = 4 + rand() * 18;
    const width = 3 + rand() * 3;
    const tone = rand();
    statics.push(
      obj(
        box(width, height, width),
        tone > 0.66 ? palette.primary : tone > 0.33 ? palette.secondary : palette.accent,
        translation(x, height / 2, z),
      ),
    );
  }

  return {
    kind: 'city',
    statics,
    animated: [],
    camera: orbitCamera(34, 14, [0, 6, -22], 0.42, 0.9),
    options: baseOptions(palette, 0.5),
  };
};

const peaks: Builder = (rand, palette) => {
  const phase = rand() * 8;
  const statics: SceneObject[] = [
    obj(ground(260, 46, (x, z) => {
      const ridge = Math.exp(-((z + 30) ** 2) / 900) * 16;
      return Math.sin(x * 0.13 + phase) * ridge * 0.6 + ridge * 0.5 - 3;
    }), palette.ground),
  ];

  for (let i = 0; i < 5; i++) {
    const x = (rand() - 0.5) * 70;
    const z = -30 - rand() * 40;
    const height = 16 + rand() * 14;
    statics.push(obj(cylinder(0, height * 0.45, height, 8), palette.secondary, translation(x, height / 2 - 2, z)));
    statics.push(obj(cylinder(0, height * 0.16, height * 0.3, 8), [246, 248, 252], translation(x, height * 0.86 - 2, z)));
  }

  return {
    kind: 'peaks',
    statics,
    animated: [],
    camera: dollyCamera(46, 30, 12, [0, 4, -30], 0.95),
    options: baseOptions(palette, 0.55),
  };
};

const forest: Builder = (rand, palette) => {
  const statics: SceneObject[] = [obj(ground(220, 34, (x, z) => Math.sin(x * 0.2) * 0.4 + Math.cos(z * 0.18) * 0.4 - 1.5), palette.ground)];

  for (let i = 0; i < 30; i++) {
    const x = (rand() - 0.5) * 50;
    const z = -4 - rand() * 42;
    const height = 5 + rand() * 4;
    for (const part of tree(height, palette.secondary, palette.primary)) {
      statics.push(obj(part.mesh, part.material, translation(x, -1.5, z)));
    }
  }

  return {
    kind: 'forest',
    statics,
    animated: [],
    camera: dollyCamera(26, 14, 5, [0, 2.5, -16], 1.0),
    options: baseOptions(palette, 0.62),
  };
};

const coast: Builder = (rand, palette) => {
  const statics: SceneObject[] = [];
  const animated: AnimatedObject[] = [];
  const seaLevel = -2.4;

  // The sea is a wide plane whose whole surface rolls over the cycle.
  const seaMesh = ground(260, 40, (x, z) => Math.sin(x * 0.25) * 0.25 + Math.cos(z * 0.3) * 0.25);
  animated.push({
    object: obj(seaMesh, palette.primary, identity(), 0.2),
    at: (t) => translation(0, seaLevel + Math.sin(t * Math.PI * 2) * 0.18, 0),
  });

  // A headland running into frame from the left gives the shot a foreground
  // and somewhere to stand the tower.
  statics.push(
    obj(
      ground(70, 22, (x, z) => Math.max(0, 5.5 - Math.hypot(x + 7, z + 18) * 0.36)),
      palette.ground,
      translation(0, seaLevel + 0.1, 0),
    ),
  );

  // A slender tower — the vertical anchor a coastline shot needs.
  const towerX = -7;
  const towerZ = -18;
  const towerBase = seaLevel + 5.2;
  statics.push(obj(cylinder(1.0, 1.7, 7.5, 12), [238, 240, 244], translation(towerX, towerBase + 3.7, towerZ)));
  statics.push(obj(cylinder(1.25, 1.25, 1.1, 12), palette.accent, translation(towerX, towerBase + 7.9, towerZ)));
  statics.push(obj(cylinder(0, 1.5, 1.6, 12), palette.secondary, translation(towerX, towerBase + 9.1, towerZ)));

  // Rocks sit clearly above the waterline; half-submerged spheres just read as
  // dark arcs floating on flat blue.
  for (let i = 0; i < 8; i++) {
    const x = 4 + rand() * 34 * (rand() > 0.5 ? 1 : -1);
    const z = -10 - rand() * 30;
    const size = 1.6 + rand() * 2.8;
    statics.push(obj(sphere(size, 9, 7), palette.secondary, translation(x, seaLevel + size * 0.72, z)));
  }

  return {
    kind: 'coast',
    statics,
    animated,
    camera: orbitCamera(31, 14, [-7, 4, -18], 0.3, 0.92),
    options: baseOptions(palette, 0.45),
  };
};

/**
 * Explainer render options: smooth shading, a specular highlight and no
 * outlines. Cel bands and ink lines are exactly what this genre does not do.
 */
function productOptions(palette: Palette, fog: number): RenderOptions {
  return {
    lightDirection: [-0.4, -0.78, -0.48],
    skyTop: palette.sky[0],
    skyBottom: palette.sky[1],
    outlineColor: palette.outline,
    outlineWidth: 0,
    fogStrength: fog,
    shading: 'smooth',
    specular: 0.5,
  };
}

/**
 * Distance at which an object of `boundingRadius` fits the frame.
 *
 * In a portrait frame the horizontal field is the binding constraint -- at 9:16
 * it is only ~56% of the vertical -- so framing by vertical FOV alone crops the
 * subject badly. This solves for whichever axis is tighter.
 */
export function framingDistance(
  boundingRadius: number, fov: number, aspectRatio: number, margin = 1.25,
): number {
  const halfVertical = Math.tan(fov / 2);
  const halfHorizontal = halfVertical * aspectRatio;
  return (boundingRadius * margin) / Math.max(1e-3, Math.min(halfVertical, halfHorizontal));
}

/**
 * Slow continuous arc around a hero object, easing out and back so the clip
 * loops. This genre holds one moving shot rather than cutting, so the move has
 * to stay interesting on its own.
 */
function heroCamera(
  radius: number, height: number, target: Vec3, sweep: number, fov: number, push = 0,
): (t: number) => Camera {
  return (t: number) => {
    const angle = (sweep / 2) * Math.sin(Math.PI * 2 * t);
    // A gentle push-in layered under the arc adds depth without a cut.
    const distance = radius - push * pingPong(t);
    const eye: Vec3 = [
      target[0] + Math.sin(angle) * distance,
      height,
      target[2] + Math.cos(angle) * distance,
    ];
    return { position: eye, view: lookAt(eye, target), fov };
  };
}

const vehicle: Builder = (rand, palette, aspectRatio) => {
  const statics: SceneObject[] = [];

  // Dark road surface with a lighter shoulder either side.
  statics.push(obj(ground(260, 24, (x) => (Math.abs(x) > 9 ? 0.35 : 0)), palette.ground, identity(), 0.25));
  for (const dx of [-9.6, 9.6]) {
    statics.push(obj(box(0.5, 0.16, 240), palette.accent, translation(dx, 0.4, 0), 0.4));
  }
  // Lane dashes running into the distance.
  for (let i = -8; i < 14; i++) {
    statics.push(obj(box(0.28, 0.06, 3.4), palette.accent, translation(0, 0.32, i * 9), 0.4));
  }
  // A barrier rail gives the shot a horizon anchor.
  for (let i = -6; i < 10; i++) {
    statics.push(obj(box(0.22, 0.55, 7.6), palette.secondary, translation(-11.2, 1.15, i * 8), 0.3));
  }

  const heroParts = vehicleParts(9, palette.primary, palette.secondary, [26, 26, 30]);
  for (const part of heroParts) statics.push(obj(part.mesh, part.material, identity(), 0.2));

  // The body is 9 long and ~4 wide, so the bounding radius is about 5.5.
  const fov = 0.9;
  const distance = framingDistance(5.5, fov, aspectRatio, 1.12);

  return {
    kind: 'vehicle',
    statics,
    animated: [],
    camera: heroCamera(distance, distance * 0.22, [0, 1.9, 0], 1.5, fov, distance * 0.18),
    options: productOptions(palette, 0.32),
  };
};

const machine: Builder = (rand, palette, aspectRatio) => {
  const statics: SceneObject[] = [
    obj(ground(160, 12), palette.ground, identity(), 0.3),
  ];

  const unit = 1.5;
  for (const part of machineParts(unit, palette.secondary, [34, 36, 42], palette.primary)) {
    statics.push(obj(part.mesh, part.material, identity(), 0.22));
  }

  // A slowly turning pulley keeps the mechanism alive while the camera arcs.
  const animated: AnimatedObject[] = [{
    object: obj(
      cylinder(unit * 0.62, unit * 0.62, unit * 0.5, 16),
      palette.primary, identity(), 0.22,
    ),
    // Sits in front of the housing face (which ends at x = 2.3u), not inside it.
    at: (t) => multiply(
      multiply(translation(unit * 2.62, unit * 1.5, 0), rotationZ(Math.PI / 2)),
      rotationY(t * Math.PI * 2),
    ),
  }];

  const fov = 0.85;
  const distance = framingDistance(unit * 3.2, fov, aspectRatio, 1.12);

  return {
    kind: 'machine',
    statics,
    animated,
    camera: heroCamera(distance, distance * 0.32, [0, unit * 2, 0], 1.9, fov, distance * 0.16),
    options: productOptions(palette, 0.25),
  };
};

const interior: Builder = (rand, palette) => {
  const statics: SceneObject[] = [
    obj(ground(26, 4), palette.ground),
    obj(box(26, 12, 0.5), palette.secondary, translation(0, 6, -13)),
    obj(box(0.5, 12, 26), palette.primary, translation(-13, 6, 0)),
  ];

  // A few blocky furnishings to give the room scale and occlusion.
  for (let i = 0; i < 6; i++) {
    const x = (rand() - 0.5) * 18;
    const z = -2 - rand() * 8;
    const h = 1 + rand() * 2.5;
    statics.push(obj(box(1.6 + rand() * 2, h, 1.6 + rand() * 2), palette.accent, translation(x, h / 2, z)));
  }

  const animated: AnimatedObject[] = [];
  for (const part of figure(3.6, palette.primary, palette.secondary)) {
    animated.push({
      object: obj(part.mesh, part.material),
      at: (t) => multiply(translation(2.5, 0, -3), rotationY(Math.sin(t * Math.PI * 2) * 0.5)),
    });
  }

  return {
    kind: 'interior',
    statics,
    animated,
    camera: dollyCamera(16, 10, 5, [0, 2.5, -5], 1.0),
    options: baseOptions(palette, 0.18),
  };
};

const crowd: Builder = (rand, palette) => {
  const statics: SceneObject[] = [
    obj(ground(220, 30, (x, z) => Math.sin(x * 0.06) * 0.5 + Math.cos(z * 0.05) * 0.5), palette.ground),
  ];
  const animated: AnimatedObject[] = [];

  const tones = [palette.primary, palette.secondary, palette.accent];
  for (let i = 0; i < 9; i++) {
    const x = (rand() - 0.5) * 20;
    const z = -6 - rand() * 20;
    const scaleFactor = 0.8 + rand() * 0.5;
    const tone = tones[Math.floor(rand() * tones.length)];
    const offset = rand() * Math.PI * 2;

    for (const part of figure(3.6, tone, palette.secondary)) {
      animated.push({
        object: obj(part.mesh, part.material),
        at: (t) =>
          multiply(
            translation(x, Math.abs(Math.sin(t * Math.PI * 4 + offset)) * 0.18, z),
            multiply(rotationY(Math.sin(t * Math.PI * 2 + offset) * 0.35), scaling(scaleFactor, scaleFactor, scaleFactor)),
          ),
      });
    }
  }

  return {
    kind: 'crowd',
    statics,
    animated,
    camera: orbitCamera(19, 8.5, [0, 1.6, -13], 0.5, 0.9),
    options: baseOptions(palette, 0.3),
  };
};

function baseOptions(palette: Palette, fog: number): RenderOptions {
  return {
    lightDirection: [-0.45, -0.82, -0.36],
    skyTop: palette.sky[0],
    skyBottom: palette.sky[1],
    outlineColor: palette.outline,
    outlineWidth: 2,
    fogStrength: fog,
    outlineMaxDistance: 62,
  };
}

const BUILDERS: Record<SceneKind, Builder> = {
  hills, city, peaks, forest, coast, interior, crowd, vehicle, machine,
};

// ---------------------------------------------------------------- selection

/**
 * Picks an archetype from words in the prompt, falling back to the seed.
 * Keyword matching keeps the set loosely relevant to the narration instead of
 * being arbitrary.
 */
export function chooseSceneKind(prompt: string, seed: number): SceneKind {
  const text = prompt.toLowerCase();
  const rules: [RegExp, SceneKind][] = [
    // Subject-led sets are checked first: an explainer about a car on a road
    // should show the car, not the streetscape behind it.
    [/\b(car|vehicle|truck|van|driver|driving|crash|collision|road|brake|tyre|tire|seatbelt|steering|chassis|bumper)\b/, 'vehicle'],
    [/\b(engine|motor|machine|mechanism|gear|piston|pump|turbine|valve|bearing|shaft|pulley|hydraulic|assembly)\b/, 'machine'],
    [/\b(city|cities|urban|street|building|tower|downtown|skyline)\b/, 'city'],
    [/\b(mountain|peak|ridge|summit|alpine|volcano|cliff)\b/, 'peaks'],
    [/\b(forest|tree|wood|jungle|canopy)\b/, 'forest'],
    [/\b(sea|ocean|coast|shore|island|harbour|harbor|wave|lighthouse|beach)\b/, 'coast'],
    [/\b(room|indoor|interior|office|house|kitchen|lab|library)\b/, 'interior'],
    [/\b(crowd|people|team|group|family|everyone|community)\b/, 'crowd'],
    [/\b(hill|field|valley|meadow|countryside|farm|path)\b/, 'hills'],
  ];
  for (const [pattern, kind] of rules) {
    if (pattern.test(text)) return kind;
  }
  return SCENE_KINDS[seed % SCENE_KINDS.length];
}

/** Width / height for the supported output aspects. */
function aspectRatioOf(aspect: string): number {
  return aspect === '16:9' ? 16 / 9 : aspect === '1:1' ? 1 : 9 / 16;
}

export function buildScene(
  prompt: string, seed: number, aspect = '9:16', style = 'cartoon-3d',
): SceneSpec {
  const rand = seededRandom(seed);
  const kind = chooseSceneKind(prompt, seed);
  const spec = BUILDERS[kind](rand, paletteFor(rand, kind), aspectRatioOf(aspect));

  // Explainer formats are smooth-shaded and un-inked whatever set they land on;
  // otherwise a topic without a mechanism keyword would come back cel-shaded
  // in the middle of an otherwise photographic-looking piece.
  if (style === 'product-3d') {
    return {
      ...spec,
      options: { ...spec.options, shading: 'smooth', specular: 0.45, outlineWidth: 0 },
    };
  }
  return spec;
}

/** Objects for one frame: statics plus animated transforms evaluated at t. */
export function frameObjects(spec: SceneSpec, t: number): SceneObject[] {
  const out: SceneObject[] = spec.statics.slice();
  for (const entry of spec.animated) {
    out.push({ ...entry.object, transform: entry.at(t) });
  }
  return out;
}

export { smoothstep };
