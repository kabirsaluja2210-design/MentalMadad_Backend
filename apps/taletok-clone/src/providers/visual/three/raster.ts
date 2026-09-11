import type { Mesh } from './mesh';
import { type Mat4, type Vec3, clamp, normalize, transformDirection, transformPoint } from './math';
import type { RgbPixel } from '@/lib/media-encode';

/**
 * Software rasterizer with cel shading.
 *
 * Geometry is rendered into a G-buffer (depth, normal, object id), which is
 * then shaded and edge-detected in two full-screen passes. Separating them is
 * what makes the cartoon outline possible: an outline is a discontinuity in id,
 * depth or normal, and that is only knowable once the whole frame is resolved.
 *
 * Buffers are allocated once per Renderer and reused across frames — a clip is
 * dozens of frames, and reallocating megabytes per frame dominates the cost.
 */

export interface Material {
  color: RgbPixel;
  /** 0 = fully matte cel bands; higher lifts the shadow floor. */
  ambient?: number;
}

export interface SceneObject {
  mesh: Mesh;
  /** World transform applied to the mesh at draw time. */
  transform: Mat4;
  material: Material;
}

export interface Camera {
  position: Vec3;
  /** Row-major view matrix, from lookAt(). */
  view: Mat4;
  /** Vertical field of view in radians. */
  fov: number;
}

export interface RenderOptions {
  /** Direction the light travels *from*, in world space. */
  lightDirection: Vec3;
  /** Vertical sky gradient, top to bottom. */
  skyTop: RgbPixel;
  skyBottom: RgbPixel;
  /** Outline colour and thickness in pixels. 0 disables outlines. */
  outlineColor: RgbPixel;
  outlineWidth: number;
  /** Distance fog blends toward the sky; 0 disables it. */
  fogStrength: number;
  /**
   * Outlines fade out past this view distance. Without it, the far edge of the
   * ground plane draws a hard line straight across the horizon.
   */
  outlineMaxDistance?: number;
}

const NEAR = 0.1;
/** Cel bands: lighting is snapped to these levels for a flat cartoon look. */
const TOON_BANDS = [0.42, 0.68, 0.88, 1.0];
const TOON_THRESHOLDS = [0.08, 0.35, 0.68];

export class Renderer {
  readonly width: number;
  readonly height: number;

  /** View-space depth per pixel; Infinity where nothing was drawn. */
  private depth: Float32Array;
  private normals: Float32Array;
  private ids: Int32Array;
  private colors: Float32Array;
  /** Reusable scratch for projected vertices, grown as needed. */
  private projected: Float32Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    const pixels = width * height;
    this.depth = new Float32Array(pixels);
    this.normals = new Float32Array(pixels * 3);
    this.ids = new Int32Array(pixels);
    this.colors = new Float32Array(pixels * 3);
    this.projected = new Float32Array(1024 * 8);
  }

  /** Renders a frame and returns an RGB sampler for the PNG encoder. */
  render(
    objects: SceneObject[],
    camera: Camera,
    options: RenderOptions,
  ): (x: number, y: number) => RgbPixel {
    this.clear();
    // Materials are looked up by object id during the shading pass.
    this.materials = objects.map((o) => o.material);
    for (let i = 0; i < objects.length; i++) {
      this.drawObject(objects[i], camera, i + 1);
    }
    this.shade(camera, options);
    if (options.outlineWidth > 0) this.outline(options);

    const { colors, width } = this;
    return (x: number, y: number) => {
      const p = (y * width + x) * 3;
      return [colors[p], colors[p + 1], colors[p + 2]];
    };
  }

  private clear(): void {
    // Nearer means *larger* view z (the camera looks down -Z), so the buffer
    // must start at negative infinity for the first fragment to win.
    this.depth.fill(-Infinity);
    this.ids.fill(0);
  }

  // ------------------------------------------------------------- geometry

  private drawObject(object: SceneObject, camera: Camera, id: number): void {
    const { mesh, transform } = object;
    const vertexCount = mesh.positions.length / 3;

    const needed = vertexCount * 8;
    if (this.projected.length < needed) this.projected = new Float32Array(needed);
    const p = this.projected;

    const f = 1 / Math.tan(camera.fov / 2);
    const aspect = this.width / this.height;
    const halfW = this.width / 2;
    const halfH = this.height / 2;

    // Vertex stage: model -> world -> view -> screen, kept in one flat buffer.
    for (let v = 0; v < vertexCount; v++) {
      const i = v * 3;
      const world = transformPoint(transform, [
        mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2],
      ]);
      const view = transformPoint(camera.view, world);
      const normal = normalize(
        transformDirection(transform, [mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]]),
      );

      const o = v * 8;
      p[o] = view[0];
      p[o + 1] = view[1];
      p[o + 2] = view[2];
      p[o + 3] = normal[0];
      p[o + 4] = normal[1];
      p[o + 5] = normal[2];

      // Camera looks down -Z, so visible geometry has negative view z.
      const invDepth = view[2] < -1e-6 ? -1 / view[2] : 0;
      p[o + 6] = halfW + view[0] * f / aspect * invDepth * halfW;
      p[o + 7] = halfH - view[1] * f * invDepth * halfH;
    }

    for (let t = 0; t < mesh.indices.length; t += 3) {
      const a = mesh.indices[t];
      const b = mesh.indices[t + 1];
      const c = mesh.indices[t + 2];

      const az = p[a * 8 + 2];
      const bz = p[b * 8 + 2];
      const cz = p[c * 8 + 2];

      // Entirely behind the near plane.
      if (az > -NEAR && bz > -NEAR && cz > -NEAR) continue;

      if (az > -NEAR || bz > -NEAR || cz > -NEAR) {
        this.clipAndRaster(p, a, b, c, camera, id);
        continue;
      }
      this.rasterTriangle(
        p[a * 8 + 6], p[a * 8 + 7], az, p[a * 8 + 3], p[a * 8 + 4], p[a * 8 + 5],
        p[b * 8 + 6], p[b * 8 + 7], bz, p[b * 8 + 3], p[b * 8 + 4], p[b * 8 + 5],
        p[c * 8 + 6], p[c * 8 + 7], cz, p[c * 8 + 3], p[c * 8 + 4], p[c * 8 + 5],
        id,
      );
    }
  }

  /**
   * Clips a triangle straddling the near plane and rasterizes the remainder.
   * Without this, vertices behind the camera project to wild coordinates and
   * smear across the frame whenever the camera pushes into the scene.
   */
  private clipAndRaster(
    p: Float32Array, ia: number, ib: number, ic: number, camera: Camera, id: number,
  ): void {
    type ClipVertex = { view: Vec3; normal: Vec3 };
    const read = (i: number): ClipVertex => ({
      view: [p[i * 8], p[i * 8 + 1], p[i * 8 + 2]],
      normal: [p[i * 8 + 3], p[i * 8 + 4], p[i * 8 + 5]],
    });

    const input = [read(ia), read(ib), read(ic)];
    const output: ClipVertex[] = [];

    // Sutherland-Hodgman against the single plane z = -NEAR.
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const next = input[(i + 1) % input.length];
      const currentIn = current.view[2] <= -NEAR;
      const nextIn = next.view[2] <= -NEAR;

      if (currentIn) output.push(current);
      if (currentIn !== nextIn) {
        const t = (-NEAR - current.view[2]) / (next.view[2] - current.view[2]);
        output.push({
          view: [
            current.view[0] + (next.view[0] - current.view[0]) * t,
            current.view[1] + (next.view[1] - current.view[1]) * t,
            -NEAR,
          ],
          normal: normalize([
            current.normal[0] + (next.normal[0] - current.normal[0]) * t,
            current.normal[1] + (next.normal[1] - current.normal[1]) * t,
            current.normal[2] + (next.normal[2] - current.normal[2]) * t,
          ]),
        });
      }
    }

    if (output.length < 3) return;

    const f = 1 / Math.tan(camera.fov / 2);
    const aspect = this.width / this.height;
    const halfW = this.width / 2;
    const halfH = this.height / 2;

    const screen = output.map((v) => {
      const invDepth = -1 / v.view[2];
      return {
        x: halfW + v.view[0] * f / aspect * invDepth * halfW,
        y: halfH - v.view[1] * f * invDepth * halfH,
        z: v.view[2],
        n: v.normal,
      };
    });

    // Fan-triangulate the clipped polygon.
    for (let i = 1; i < screen.length - 1; i++) {
      const v0 = screen[0];
      const v1 = screen[i];
      const v2 = screen[i + 1];
      this.rasterTriangle(
        v0.x, v0.y, v0.z, v0.n[0], v0.n[1], v0.n[2],
        v1.x, v1.y, v1.z, v1.n[0], v1.n[1], v1.n[2],
        v2.x, v2.y, v2.z, v2.n[0], v2.n[1], v2.n[2],
        id,
      );
    }
  }

  /**
   * Scanline-free half-space rasterizer with a depth test.
   * Normals are interpolated perspective-correctly via 1/z.
   */
  private rasterTriangle(
    ax: number, ay: number, az: number, anx: number, any: number, anz: number,
    bx: number, by: number, bz: number, bnx: number, bny: number, bnz: number,
    cx: number, cy: number, cz: number, cnx: number, cny: number, cnz: number,
    id: number,
  ): void {
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    // Backface cull; also drops degenerate triangles.
    if (area >= -1e-9) return;

    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(this.width - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(this.height - 1, Math.ceil(Math.max(ay, by, cy)));
    if (minX > maxX || minY > maxY) return;

    const invArea = 1 / area;
    const invAz = 1 / az;
    const invBz = 1 / bz;
    const invCz = 1 / cz;

    for (let y = minY; y <= maxY; y++) {
      const py = y + 0.5;
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5;

        let w0 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
        let w1 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
        let w2 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
        if (w0 > 0 || w1 > 0 || w2 > 0) continue;

        // Barycentrics: w1 weights a, w2 weights b, w0 weights c.
        w0 *= invArea;
        w1 *= invArea;
        w2 *= invArea;

        // Interpolating 1/z is linear in screen space; z is not.
        const invZ = w1 * invAz + w2 * invBz + w0 * invCz;
        if (invZ >= 0) continue;
        const z = 1 / invZ;

        const index = y * this.width + x;
        // Larger (less negative) z is nearer, since the camera looks down -Z.
        if (z <= this.depth[index]) continue;

        this.depth[index] = z;
        this.ids[index] = id;

        const n = index * 3;
        const pa = (w1 * invAz) / invZ;
        const pb = (w2 * invBz) / invZ;
        const pc = (w0 * invCz) / invZ;
        this.normals[n] = anx * pa + bnx * pb + cnx * pc;
        this.normals[n + 1] = any * pa + bny * pb + cny * pc;
        this.normals[n + 2] = anz * pa + bnz * pb + cnz * pc;
      }
    }
  }

  // -------------------------------------------------------------- shading

  private shade(camera: Camera, options: RenderOptions): void {
    const light = normalize(options.lightDirection);
    const { width, height, depth, ids, normals, colors } = this;

    // Depth range drives fog; computed per frame so scenes self-normalise.
    let nearest = -Infinity;
    let farthest = 0;
    for (let i = 0; i < depth.length; i++) {
      // Untouched pixels are sky; ids is the reliable coverage mask.
      if (ids[i] === 0) continue;
      const z = depth[i];
      if (z > nearest) nearest = z;
      if (z < farthest) farthest = z;
    }
    const range = Math.max(1e-3, nearest - farthest);

    for (let y = 0; y < height; y++) {
      const skyT = y / Math.max(1, height - 1);
      const skyR = options.skyTop[0] + (options.skyBottom[0] - options.skyTop[0]) * skyT;
      const skyG = options.skyTop[1] + (options.skyBottom[1] - options.skyTop[1]) * skyT;
      const skyB = options.skyTop[2] + (options.skyBottom[2] - options.skyTop[2]) * skyT;

      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        const c = index * 3;

        if (ids[index] === 0) {
          colors[c] = skyR;
          colors[c + 1] = skyG;
          colors[c + 2] = skyB;
          continue;
        }

        const material = this.materials[ids[index] - 1];
        const n = index * 3;
        let nx = normals[n];
        let ny = normals[n + 1];
        let nz = normals[n + 2];
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= len; ny /= len; nz /= len;

        const ndotl = Math.max(0, -(nx * light[0] + ny * light[1] + nz * light[2]));
        let band = TOON_BANDS[0];
        for (let b = 0; b < TOON_THRESHOLDS.length; b++) {
          if (ndotl > TOON_THRESHOLDS[b]) band = TOON_BANDS[b + 1];
        }
        const ambient = material.ambient ?? 0;
        const intensity = clamp(band + ambient * (1 - band), 0, 1.2);

        let r = material.color[0] * intensity;
        let g = material.color[1] * intensity;
        let b2 = material.color[2] * intensity;

        if (options.fogStrength > 0) {
          const fog = clamp(((nearest - depth[index]) / range) * options.fogStrength, 0, 1);
          r += (skyR - r) * fog;
          g += (skyG - g) * fog;
          b2 += (skyB - b2) * fog;
        }

        colors[c] = r;
        colors[c + 1] = g;
        colors[c + 2] = b2;
      }
    }
    void camera;
  }

  /**
   * Draws cartoon outlines where the frame is discontinuous: a different
   * object, a depth jump, or a sharp change in normal (a crease).
   */
  private outline(options: RenderOptions): void {
    const { width, height, depth, ids, normals, colors } = this;
    const edges = new Uint8Array(width * height);
    const maxDistance = options.outlineMaxDistance ?? Infinity;

    for (let y = 0; y < height - 1; y++) {
      for (let x = 0; x < width - 1; x++) {
        const i = y * width + x;
        const right = i + 1;
        const below = i + width;

        // An outline needs at least one near-enough surface on either side of
        // it. Testing only the centre pixel still inked the horizon, because
        // the *sky* pixel above the ground's far edge sees an id change and is
        // itself never "too far".
        if (!this.inkable(i, maxDistance) &&
            !this.inkable(right, maxDistance) &&
            !this.inkable(below, maxDistance)) continue;

        let edge = ids[i] !== ids[right] || ids[i] !== ids[below];

        if (!edge && ids[i] !== 0) {
          // Depth jumps scale with distance, so compare relatively.
          const z = depth[i];
          const threshold = Math.abs(z) * 0.035 + 0.05;
          edge =
            Math.abs(z - depth[right]) > threshold ||
            Math.abs(z - depth[below]) > threshold;
        }

        if (!edge && ids[i] !== 0 && ids[i] === ids[right] && ids[i] === ids[below]) {
          const a = i * 3;
          const b = right * 3;
          const c = below * 3;
          const dotRight = normals[a] * normals[b] + normals[a + 1] * normals[b + 1] + normals[a + 2] * normals[b + 2];
          const dotBelow = normals[a] * normals[c] + normals[a + 1] * normals[c + 1] + normals[a + 2] * normals[c + 2];
          edge = dotRight < 0.55 || dotBelow < 0.55;
        }

        if (edge) edges[i] = 1;
      }
    }

    const radius = Math.max(1, Math.round(options.outlineWidth));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!edges[y * width + x]) continue;
        for (let dy = 0; dy < radius; dy++) {
          for (let dx = 0; dx < radius; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= width || py >= height) continue;
            const c = (py * width + px) * 3;
            colors[c] = options.outlineColor[0];
            colors[c + 1] = options.outlineColor[1];
            colors[c + 2] = options.outlineColor[2];
          }
        }
      }
    }
  }

  /** True when a pixel holds geometry near enough to carry an outline. */
  private inkable(index: number, maxDistance: number): boolean {
    // depth is negative view z, so distance is its magnitude.
    return this.ids[index] !== 0 && -this.depth[index] <= maxDistance;
  }

  /** Materials indexed by object id - 1, refreshed at the start of render(). */
  private materials: Material[] = [];
}
