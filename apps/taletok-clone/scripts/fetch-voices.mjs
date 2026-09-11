#!/usr/bin/env node
/**
 * Downloads Piper voice models for local speech synthesis.
 *
 * Voices are ~60MB each and are never committed — they land in
 * STORAGE_DIR/voices, which is gitignored. Without them the TTS provider falls
 * back to espeak-ng, which needs no download but sounds robotic.
 *
 *   npm run fetch-voices
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const VOICE_DIR = process.env.PIPER_VOICE_DIR
  || path.join(process.env.STORAGE_DIR || './storage', 'voices');

// Hosted on GitHub releases rather than the usual Hugging Face mirror, which
// many locked-down networks block.
const BASE = 'https://github.com/rhasspy/piper/releases/download/v0.0.2';
const VOICES = [
  { file: 'voice-en-us-amy-low.tar.gz', model: 'en-us-amy-low.onnx' },
  { file: 'voice-en-us-ryan-low.tar.gz', model: 'en-us-ryan-low.onnx' },
  { file: 'voice-en-gb-alan-low.tar.gz', model: 'en-gb-alan-low.onnx' },
];

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

function extract(archive, dir) {
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['xzf', archive, '-C', dir], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar exited ${code}`))));
  });
}

async function main() {
  await mkdir(VOICE_DIR, { recursive: true });
  console.log(`Voice directory: ${path.resolve(VOICE_DIR)}\n`);

  for (const voice of VOICES) {
    const target = path.join(VOICE_DIR, voice.model);
    if (await exists(target)) {
      console.log(`  ${voice.model} — already present, skipping`);
      continue;
    }

    const archive = path.join(VOICE_DIR, voice.file);
    process.stdout.write(`  ${voice.model} — downloading… `);

    const response = await fetch(`${BASE}/${voice.file}`);
    if (!response.ok || !response.body) {
      console.log(`failed (${response.status})`);
      continue;
    }
    await pipeline(response.body, createWriteStream(archive));
    await extract(archive, VOICE_DIR);
    await rm(archive, { force: true });
    console.log('done');
  }

  const models = (await readdir(VOICE_DIR)).filter((f) => f.endsWith('.onnx'));
  console.log(`\n${models.length} voice model(s) installed.`);
  if (!models.length) {
    console.log('Speech will fall back to espeak-ng (no download needed, robotic).');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
