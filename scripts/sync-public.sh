#!/usr/bin/env bash
# Makes the public repository (github.com/ahmedgamal985/taza-copilot-public) match this one exactly, file for
# file, at the commit that is checked out here. Only two things are left out on purpose:
#   - AAI's 4 written answers to the media, removed from data/chunks.json (their full text is not confirmed public)
#   - .github/ (the deploy workflow needs the team's Cloudflare secrets)
# It refuses to run with uncommitted changes, checks that no value from ../.env is in the files, then commits and pushes.
#   bash scripts/sync-public.sh
set -euo pipefail
PRIV=$(git rev-parse --show-toplevel)
PUB="$PRIV/../taza-copilot-public"
cd "$PRIV"
git diff --quiet && git diff --cached --quiet || { echo "Commit your changes first."; exit 1; }
SHA=$(git rev-parse --short HEAD); SUBJECT=$(git log -1 --format=%s)
[ -d "$PUB/.git" ] || { echo "No public repository at $PUB"; exit 1; }

# 1. replace every tracked file in the public copy with this commit's files
cd "$PUB"
git ls-files -z | xargs -0 rm -f
cd "$PRIV"
git archive HEAD | tar -x -C "$PUB"
rm -rf "$PUB/.github"

# 2. leave out AAI's media answers, and say so at the top of the README
cd "$PUB"
node -e "
const fs = require('fs');
const d = JSON.parse(fs.readFileSync('data/chunks.json', 'utf8'));
const drop = new Set(d.docs.filter(x => x.kind === 'press').map(x => x.id));
d.docs = d.docs.filter(x => !drop.has(x.id)); d.chunks = d.chunks.filter(c => !drop.has(c.doc));
fs.writeFileSync('data/chunks.json', JSON.stringify(d));
const note = '> **About this public copy.** This is the full source code of the live platform, kept identical to it. Its search index\n' +
  '> leaves out AAI\'s 4 written answers to the media (November 2026), because they are not confirmed as public yet; the live\n' +
  '> site uses them and quotes them with their title and date. The deploy workflow (\`.github/workflows/deploy.yml\`) is also\n' +
  '> left out, because it needs the team\'s Cloudflare secrets.\n\n';
let r = fs.readFileSync('README.md', 'utf8');
const at = r.indexOf('Ask AAI\'s research anything, in English');
if (at < 0) throw new Error('README anchor not found');
fs.writeFileSync('README.md', r.slice(0, at) + note + r.slice(at));
console.log('left out', drop.size, 'media answers;', d.docs.length, 'sources,', d.chunks.length, 'passages');
"

# 3. no secret from ../.env may be in the public files
node -e "
const fs = require('fs'), cp = require('child_process');
const env = fs.readFileSync('$PRIV/../.env', 'utf8').split(/\r?\n/).map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*['\"]?([^'\"#\s]+)/)).filter(Boolean).map(m => m[2]).filter(v => v.length >= 12 && !/^https?:/.test(v));
const files = cp.execSync('git ls-files --others --cached --exclude-standard', { encoding: 'utf8' }).split('\n').filter(Boolean);
const hit = files.filter(f => { try { const t = fs.readFileSync(f, 'latin1'); return env.some(v => t.includes(v)); } catch { return false; } });
if (hit.length) { console.error('A secret value is in:', hit.join(', ')); process.exit(1); }
console.log('no secrets in', files.length, 'files');
"

# 4. commit and push
git add -A
if git diff --cached --quiet; then echo "Public copy already matches $SHA"; exit 0; fi
git commit -q -m "Sync with the platform at $SHA: $SUBJECT" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -q origin main
echo "Public repo now matches $SHA"
