/**
 * Minimal 3D maths for the software renderer.
 *
 * Vectors are plain tuples and matrices are row-major 16-element arrays. Hot
 * paths in the rasterizer avoid these helpers and work on raw numbers instead;
 * these exist for scene setup, where clarity matters more than speed.
 */

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export function vec3(x: number, y: number, z: number): Vec3 {
  return [x, y, z];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

export function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 1e-8 ? [a[0] / len, a[1] / len, a[2] / len] : [0, 0, 0];
}

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// ------------------------------------------------------------------ Mat4

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

/** Row-major multiply: returns a * b. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[r * 4 + k] * b[k * 4 + c];
      out[r * 4 + c] = sum;
    }
  }
  return out;
}

export function translation(x: number, y: number, z: number): Mat4 {
  const m = identity();
  m[3] = x;
  m[7] = y;
  m[11] = z;
  return m;
}

export function scaling(x: number, y: number, z: number): Mat4 {
  const m = new Float32Array(16);
  m[0] = x;
  m[5] = y;
  m[10] = z;
  m[15] = 1;
  return m;
}

export function rotationY(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity();
  m[0] = c;
  m[2] = s;
  m[8] = -s;
  m[10] = c;
  return m;
}

export function rotationX(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity();
  m[5] = c;
  m[6] = -s;
  m[9] = s;
  m[10] = c;
  return m;
}

export function rotationZ(radians: number): Mat4 {
  const c = Math.cos(radians);
  const s = Math.sin(radians);
  const m = identity();
  m[0] = c;
  m[1] = -s;
  m[4] = s;
  m[5] = c;
  return m;
}

/**
 * View matrix looking from `eye` toward `target`.
 * Builds the camera basis and folds in the translation directly.
 */
export function lookAt(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Mat4 {
  const forward = normalize(sub(target, eye));
  let right = cross(forward, up);
  // Guard the degenerate case where forward is parallel to up.
  if (length(right) < 1e-6) right = cross(forward, [0, 0, 1]);
  right = normalize(right);
  const trueUp = cross(right, forward);

  const m = identity();
  m[0] = right[0];    m[1] = right[1];    m[2] = right[2];    m[3] = -dot(right, eye);
  m[4] = trueUp[0];   m[5] = trueUp[1];   m[6] = trueUp[2];   m[7] = -dot(trueUp, eye);
  m[8] = -forward[0]; m[9] = -forward[1]; m[10] = -forward[2]; m[11] = dot(forward, eye);
  return m;
}

/** Transforms a point (w = 1). */
export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

/** Transforms a direction (w = 0) — ignores translation. */
export function transformDirection(m: Mat4, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[4] * v[0] + m[5] * v[1] + m[6] * v[2],
    m[8] * v[0] + m[9] * v[1] + m[10] * v[2],
  ];
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Smooth 0..1 ramp, used for easing camera moves. */
export function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Eases in and out over a full 0..1 cycle and returns to the start. */
export function pingPong(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * 2 * t);
}
