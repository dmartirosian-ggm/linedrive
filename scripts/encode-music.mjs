// Prepares the game's music for the app: trims each track in game/music to the 2-minute
// loop the game plays (256 beats at 128 BPM), evens out loudness, and writes a compact MP3
// to assets/music/<id>.mp3. The app ships those files as native assets and hands one to the
// game when it is about to play it, so the JavaScript bundle stays small.
//
// Run after adding or changing tracks (needs ffmpeg on PATH):  node scripts/encode-music.mjs
// Then commit game/music/tracks.json and assets/music. Add new tracks to tracks.json first.
import { readFileSync, mkdirSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(root, 'game/music');
const outDir = path.join(root, 'assets/music');
const tracks = JSON.parse(readFileSync(path.join(srcDir, 'tracks.json'), 'utf8'));
const LOOP = 120.5; // the game loops at 120 s; keep a little extra so the loop point has audio
const force = process.argv.includes('--force');

const missing = tracks.filter((t) => !existsSync(path.join(srcDir, t.src)));
if (missing.length) throw new Error('Missing source files: ' + missing.map((t) => t.src).join(', '));
const listed = new Set(tracks.map((t) => t.src));
const unlisted = readdirSync(srcDir).filter((f) => f.endsWith('.mp3') && !listed.has(f));
if (unlisted.length) console.warn('Not in tracks.json (skipped): ' + unlisted.join(', '));

mkdirSync(outDir, { recursive: true });
for (const t of tracks) {
  const src = path.join(srcDir, t.src);
  const out = path.join(outDir, t.id + '.mp3');
  if (!force && existsSync(out) && statSync(out).mtimeMs > statSync(src).mtimeMs) continue;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-t', String(LOOP),
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11', '-ar', '44100', '-ac', '2',
    '-c:a', 'libmp3lame', '-b:a', '112k', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed on ' + t.src);
  console.log(`${t.id}.mp3  ${(statSync(out).size / 1024).toFixed(0)} KB`);
}
// Remove encoded files whose track was taken out of tracks.json.
const ids = new Set(tracks.map((t) => t.id + '.mp3'));
for (const f of readdirSync(outDir)) if (!ids.has(f)) rmSync(path.join(outDir, f));
