import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getVideo } from '@/providers/registry';
import { blenderVideo } from '@/providers/video/blender';
import { proceduralVideo } from '@/providers/video/procedural';

const SCRIPT = readFileSync(
  path.join(process.cwd(), 'src/providers/video/blender/build_scene.py'),
  'utf8',
);

describe('renderer selection', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env.VIDEO_RENDERER = original.VIDEO_RENDERER;
    delete process.env.VIDEO_PROVIDER;
  });

  it('defaults to the fast renderer so nobody waits by accident', () => {
    delete process.env.VIDEO_RENDERER;
    expect(getVideo('auto').info.id).toBe(proceduralVideo.info.id);
  });

  it('uses Blender when a video explicitly asks for it', () => {
    expect(getVideo('blender').info.id).toBe('blender');
  });

  it('honours an explicit fast setting over the env default', () => {
    process.env.VIDEO_RENDERER = 'blender';
    expect(getVideo('fast').info.id).toBe(proceduralVideo.info.id);
  });

  it('lets the env flip what auto means', () => {
    process.env.VIDEO_RENDERER = 'blender';
    expect(getVideo('auto').info.id).toBe('blender');
  });

  it('is not marked as placeholder output', () => {
    // Unlike the gradient and cel renderers, this is real path-traced output.
    expect(blenderVideo.info.placeholder).toBe(false);
  });
});

describe('build_scene.py invariants', () => {
  // The script runs inside Blender, so the TS suite cannot execute it. These
  // guard the specific bugs that cost the most time to find.

  it('scales cubes by their edge length, not half of it', () => {
    // Halving here silently made every box half-size, which detached the
    // wheels from a body that had shrunk out from under them.
    expect(SCRIPT).toContain('obj.scale = (size[0], size[1], size[2])');
    expect(SCRIPT).not.toContain('obj.scale = (size[0] / 2');
  });

  it('pins the camera FOV to the vertical axis', () => {
    // Under the default AUTO sensor fit, `angle` means whichever render
    // dimension is larger, so it flips meaning between portrait and landscape.
    expect(SCRIPT).toContain('sensor_fit = "VERTICAL"');
    expect(SCRIPT).toContain('camera.data.angle_y = fov');
  });

  it('probes for a denoiser instead of assuming one', () => {
    // Distribution builds are frequently compiled without OpenImageDenoise,
    // and requesting it then hard-fails the whole render.
    expect(SCRIPT).toContain('scene.cycles.use_denoising = False');
    expect(SCRIPT).toMatch(/except \(TypeError, AttributeError\)/);
  });

  it('clamps bevel width against the object it is applied to', () => {
    expect(SCRIPT).toContain('smallest * 0.22');
  });

  it('renders on CPU, the only device guaranteed headless', () => {
    expect(SCRIPT).toContain('scene.cycles.device = "CPU"');
  });

  it('closes the camera path so a clip loops', () => {
    expect(SCRIPT).toContain('math.sin(2 * math.pi * t)');
  });

  it('solves framing for whichever axis is tighter', () => {
    expect(SCRIPT).toContain('min(half_vertical, half_horizontal)');
  });

  it('builds every set the provider can ask for', () => {
    for (const fn of ['build_vehicle', 'build_machine', 'build_landscape']) {
      expect(SCRIPT, fn).toContain(`def ${fn}(`);
    }
  });

  it('generates all geometry rather than importing assets', () => {
    // No model files ship with the repo; everything is built from parameters.
    expect(SCRIPT).not.toMatch(/import_scene|wm\.obj_import|bpy\.ops\.import/);
  });
});

describe('colour handling', () => {
  it('converts sRGB to linear for Blender', async () => {
    // Blender works in linear light; feeding it sRGB washes everything out.
    const mod = await import('@/providers/video/blender');
    const source = readFileSync(
      path.join(process.cwd(), 'src/providers/video/blender.ts'), 'utf8',
    );
    expect(source).toContain('srgbToLinear');
    expect(source).toContain('2.4');
    expect(mod.blenderVideo).toBeDefined();
  });

  it('falls back rather than failing a render', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/providers/video/blender.ts'), 'utf8',
    );
    expect(source).toContain('proceduralVideo.generate(req)');
    expect(source).toContain('BLENDER_TIMEOUT_MS');
  });
});
