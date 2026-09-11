import { type Mat4, type Vec3, normalize, transformDirection, transformPoint } from './math';

/**
 * Procedural mesh primitives.
 *
 * Everything the renderer draws is generated from parameters here — there are
 * no model files in the repo. Meshes are flat typed arrays so the rasterizer
 * can walk them without per-vertex object allocation.
 */

export interface Mesh {
  /** xyz per vertex. */
  positions: Float32Array;
  /** xyz per vertex, unit length. */
  normals: Float32Array;
  /** Triangle vertex indices, counter-clockwise when seen from outside. */
  indices: Uint32Array;
}

export function vertexCount(mesh: Mesh): number {
  return mesh.positions.length / 3;
}

export function triangleCount(mesh: Mesh): number {
  return mesh.indices.length / 3;
}

// ------------------------------------------------------------- primitives

/** Axis-aligned box with hard face normals, centred on the origin. */
export function box(width: number, height: number, depth: number): Mesh {
  const x = width / 2;
  const y = height / 2;
  const z = depth / 2;

  // Each face gets its own four vertices so the normals stay hard.
  const faces: { normal: Vec3; corners: Vec3[] }[] = [
    { normal: [0, 0, 1], corners: [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]] },
    { normal: [0, 0, -1], corners: [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z]] },
    { normal: [1, 0, 0], corners: [[x, -y, z], [x, -y, -z], [x, y, -z], [x, y, z]] },
    { normal: [-1, 0, 0], corners: [[-x, -y, -z], [-x, -y, z], [-x, y, z], [-x, y, -z]] },
    { normal: [0, 1, 0], corners: [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]] },
    { normal: [0, -1, 0], corners: [[-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z]] },
  ];

  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (const face of faces) {
    const base = positions.length / 3;
    for (const corner of face.corners) {
      positions.push(corner[0], corner[1], corner[2]);
      normals.push(face.normal[0], face.normal[1], face.normal[2]);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  return toMesh(positions, normals, indices);
}

/** UV sphere with smooth normals — toon bands read cleanly on these. */
export function sphere(radius: number, segments = 16, rings = 12): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  for (let ring = 0; ring <= rings; ring++) {
    const phi = (ring / rings) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2;
      const nx = sinPhi * Math.cos(theta);
      const ny = cosPhi;
      const nz = sinPhi * Math.sin(theta);
      positions.push(nx * radius, ny * radius, nz * radius);
      normals.push(nx, ny, nz);
    }
  }

  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * stride + seg;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  return toMesh(positions, normals, indices);
}

/**
 * Cylinder, cone or truncated cone depending on the two radii.
 * Side normals are smooth; caps are flat.
 */
export function cylinder(
  radiusTop: number, radiusBottom: number, height: number, segments = 14,
): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const halfHeight = height / 2;

  // The side normal tilts with the slope so cones shade correctly.
  const slope = (radiusBottom - radiusTop) / height;
  const normalScale = 1 / Math.sqrt(1 + slope * slope);

  for (let seg = 0; seg <= segments; seg++) {
    const theta = (seg / segments) * Math.PI * 2;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    positions.push(radiusTop * cos, halfHeight, radiusTop * sin);
    normals.push(cos * normalScale, slope * normalScale, sin * normalScale);
    positions.push(radiusBottom * cos, -halfHeight, radiusBottom * sin);
    normals.push(cos * normalScale, slope * normalScale, sin * normalScale);
  }

  for (let seg = 0; seg < segments; seg++) {
    const a = seg * 2;
    indices.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
  }

  // Caps, each with its own centre vertex and a flat normal.
  for (const [y, ny, radius] of [[halfHeight, 1, radiusTop], [-halfHeight, -1, radiusBottom]] as const) {
    if (radius <= 1e-6) continue;
    const centre = positions.length / 3;
    positions.push(0, y, 0);
    normals.push(0, ny, 0);

    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2;
      positions.push(radius * Math.cos(theta), y, radius * Math.sin(theta));
      normals.push(0, ny, 0);
    }
    for (let seg = 0; seg < segments; seg++) {
      const a = centre + 1 + seg;
      if (ny > 0) indices.push(centre, a, a + 1);
      else indices.push(centre, a + 1, a);
    }
  }

  return toMesh(positions, normals, indices);
}

/** Rounded capsule — the body shape used for figures. */
export function capsule(radius: number, height: number, segments = 14, rings = 8): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const half = Math.max(0, height / 2 - radius);

  // Two hemispheres joined by a cylindrical middle, built as one strip.
  for (let ring = 0; ring <= rings; ring++) {
    const phi = (ring / rings) * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);
    // Offset the upper half up and the lower half down to create the barrel.
    const offset = cosPhi >= 0 ? half : -half;

    for (let seg = 0; seg <= segments; seg++) {
      const theta = (seg / segments) * Math.PI * 2;
      const nx = sinPhi * Math.cos(theta);
      const ny = cosPhi;
      const nz = sinPhi * Math.sin(theta);
      positions.push(nx * radius, ny * radius + offset, nz * radius);
      normals.push(nx, ny, nz);
    }
  }

  const stride = segments + 1;
  for (let ring = 0; ring < rings; ring++) {
    for (let seg = 0; seg < segments; seg++) {
      const a = ring * stride + seg;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  return toMesh(positions, normals, indices);
}

/**
 * Subdivided ground plane in the XZ axis. `heightAt` displaces each vertex,
 * which is how hills and dunes are made; normals are derived by sampling it.
 */
export function ground(
  size: number, subdivisions = 24, heightAt: (x: number, z: number) => number = () => 0,
): Mesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const step = size / subdivisions;
  const epsilon = step * 0.5;

  for (let iz = 0; iz <= subdivisions; iz++) {
    for (let ix = 0; ix <= subdivisions; ix++) {
      const x = -size / 2 + ix * step;
      const z = -size / 2 + iz * step;
      positions.push(x, heightAt(x, z), z);

      // Central differences give a smooth normal without a second pass.
      const dx = heightAt(x + epsilon, z) - heightAt(x - epsilon, z);
      const dz = heightAt(x, z + epsilon) - heightAt(x, z - epsilon);
      const n = normalize([-dx, 2 * epsilon, -dz]);
      normals.push(n[0], n[1], n[2]);
    }
  }

  const stride = subdivisions + 1;
  for (let iz = 0; iz < subdivisions; iz++) {
    for (let ix = 0; ix < subdivisions; ix++) {
      const a = iz * stride + ix;
      const b = a + stride;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }

  return toMesh(positions, normals, indices);
}

// --------------------------------------------------------------- utilities

function toMesh(positions: number[], normals: number[], indices: number[]): Mesh {
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

/** Bakes a transform into a copy of the mesh. */
export function transformMesh(mesh: Mesh, matrix: Mat4): Mesh {
  const positions = new Float32Array(mesh.positions.length);
  const normals = new Float32Array(mesh.normals.length);

  for (let i = 0; i < mesh.positions.length; i += 3) {
    const p = transformPoint(matrix, [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]);
    positions[i] = p[0];
    positions[i + 1] = p[1];
    positions[i + 2] = p[2];

    // Non-uniform scaling would need the inverse transpose; scene transforms
    // are uniform-scale plus rotation, so renormalising is enough.
    const n = normalize(
      transformDirection(matrix, [mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]]),
    );
    normals[i] = n[0];
    normals[i + 1] = n[1];
    normals[i + 2] = n[2];
  }

  return { positions, normals, indices: mesh.indices.slice() };
}

/** Concatenates meshes, offsetting indices. */
export function mergeMeshes(meshes: Mesh[]): Mesh {
  const totalVerts = meshes.reduce((sum, m) => sum + m.positions.length, 0);
  const totalIndices = meshes.reduce((sum, m) => sum + m.indices.length, 0);

  const positions = new Float32Array(totalVerts);
  const normals = new Float32Array(totalVerts);
  const indices = new Uint32Array(totalIndices);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const mesh of meshes) {
    positions.set(mesh.positions, vertexOffset);
    normals.set(mesh.normals, vertexOffset);
    for (let i = 0; i < mesh.indices.length; i++) {
      indices[indexOffset + i] = mesh.indices[i] + vertexOffset / 3;
    }
    vertexOffset += mesh.positions.length;
    indexOffset += mesh.indices.length;
  }

  return { positions, normals, indices };
}
