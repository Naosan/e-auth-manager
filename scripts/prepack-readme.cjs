// Swaps README to a minimal variant for npm publish/pack, then restores.
// Usage: node scripts/prepack-readme.cjs prepare|restore
/* eslint-disable */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const README = path.join(ROOT, 'README.md');
const BACKUP_DIR = path.join(ROOT, '.internal-readme-backup');
const README_REPO = path.join(BACKUP_DIR, 'README.repo.md');
const README_NPM = path.join(ROOT, 'scripts', 'assets', 'README.npm.md');
const MARKER = path.join(ROOT, '.readme-swapped');

function exists(p) { try { fs.accessSync(p); return true; } catch { return false; } }

function prepare() {
  if (!exists(README_NPM)) return; // nothing to do
  if (exists(MARKER)) return; // already swapped
  if (!exists(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR);
  if (exists(README)) fs.renameSync(README, README_REPO);
  fs.copyFileSync(README_NPM, README);
  fs.writeFileSync(MARKER, 'ok');
}

function restore() {
  if (!exists(MARKER)) return;
  if (exists(README_REPO)) {
    // restore original README
    if (exists(README)) fs.unlinkSync(README);
    fs.renameSync(README_REPO, README);
  }
  try { fs.unlinkSync(MARKER); } catch {}
  try { fs.rmdirSync(BACKUP_DIR); } catch {}
}

const cmd = process.argv[2] || '';
if (cmd === 'prepare') prepare();
else if (cmd === 'restore') restore();
else process.exit(0);
