# Writes build3.mjs (the 3:28 cut) from build.mjs: other lines, timeline, cues and effects; same picture and sound code.
#   python video/story/make-build3.py
import os
here = os.path.dirname(os.path.abspath(__file__))
s = open(os.path.join(here, 'build.mjs'), encoding='utf-8').read()

def R(a, b):
    global s
    assert s.count(a) == 1, (a, s.count(a))
    s = s.replace(a, b)

R("// The story video (\"One day in Almaty\"): timeline from the voice lengths",
  "// The 3:28 cut of the story video (exactly 208 s): timeline from the voice lengths")
R("node video/story/build.mjs preview 5,30,60   -> out/p-*.png", "node video/story/build3.mjs preview 5,30,60  -> out/p-*.png")
R("node video/story/build.mjs                   -> out/taza-story.mp4", "node video/story/build3.mjs                  -> out/taza-story-328.mp4")
R("node video/story/build.mjs audio             -> remix the sound only", "node video/story/build3.mjs audio            -> remix the sound only")
R("join(here, 'vo', 'lines.json')", "join(here, 'vo', 'lines3.json')")
R("join(here, 'call.json')", "join(here, 'call3.json')")

start = s.index('const PLAN = [')
end = s.index("writeFileSync(join(out, 'timeline.json')")
s = s[:start] + r"""const LENGTH = 208; // 3:28, exactly
const PLAN = [
  ['hook', [['x_hook1', .4], ['x_hook2', 1.6]], 1.2],
  ['intro', [['x_intro', 1.6]], .4],
  ['dana', [['x_dana1', .4], ['x_dana2', 1.4]], .5],
  ['aliya', [['x_aliya1', 'chat'], ['x_aliya2', 4.0], ['c_en_q', .4], ['c3_en_a', .5], ['c_ru_q', .4], ['c3_ru_a', .5], ['c_kk_q', .4], ['c_kk_a', 2.2]], .5],
  ['tg', [['x_tg', 13]], .5],
  ['arman', [['x_arman1', .6], ['x_arman2', .8], ['x_arman3', 1.6]], .5],
  ['admin', [['x_admin1', .5], ['x_admin2', 1.2]], .5],
  ['proof', [['x_proof', 1.4]], .5],
  ['metric', [['metric', 1.0]], .5],
  ['thanks', [['thanks', 0]], .6],
];
const CHAT = 18; // the WhatsApp chat: the narration line, then the three exchanges, before "she just calls"
const TLvo = {}, TLsc = {};
let t = 0;
for (const [sc, lines, pre] of PLAN) {
  const s = t; t += pre;
  for (const [id, post] of lines) { TLvo[id] = { s: +t.toFixed(3), d: +dur(id).toFixed(3) }; t += post === 'chat' ? CHAT : dur(id) + post; }
  TLsc[sc] = { s: +s.toFixed(3), e: +t.toFixed(3) };
}
// the closing card holds until the video is exactly LENGTH seconds
const hold = LENGTH - t;
if (hold < 2.5) throw new Error(`too long by ${(2.5 - hold).toFixed(2)} s`);
TLsc.thanks.e = LENGTH; t = LENGTH;
// one voice line, two pictures: the reports, then Taza and the three people
{ const i = TLsc.intro, cut = TLvo.x_intro.s + TLvo.x_intro.d * .52; TLsc.problem = { s: i.s, e: +cut.toFixed(3) }; TLsc.meet = { s: +cut.toFixed(3), e: i.e }; delete TLsc.intro; }
const TOTAL = LENGTH;
const V = id => TLvo[id], E = id => V(id).s + V(id).d;
const a1 = V('x_aliya1').s;
const cue = {
  chat: { q1: a1 + 1.0, a1: a1 + 3.6, q2: a1 + 6.4, a2: a1 + 8.6, q3: a1 + 11.2, a3: a1 + 13.8 },
  push: V('x_arman1').s + V('x_arman1').d * .5,
  jam: V('x_arman2').s + .2,
  ring: E('x_aliya2') + .1,
  pick: V('c_en_q').s - .45,
  hang: E('c_kk_a') + .55,
};
const TL = { total: TOTAL, vo: TLvo, sc: TLsc, cue, call: call.map(c => ({ id: c.id, who: c.who, lang: c.lang, say: c.say, sub: c.sub })) };
console.log(Object.entries(TLsc).map(([k, v]) => `${k.padEnd(8)} ${v.s.toFixed(1)}–${v.e.toFixed(1)}`).join('\n'));
console.log(`total ${TOTAL} s (3:28), closing hold ${hold.toFixed(1)} s`);
""" + s[end:]
R("writeFileSync(join(out, 'timeline.json')", "writeFileSync(join(out, 'timeline3.json')")
R("join(out, 'story-silent.mp4')", "join(out, 'story3-silent.mp4')")
R("join(here, 'story.html')", "join(here, 'story3.html')")
R("join(out, 'story-audio.m4a')", "join(out, 'story3-audio.m4a')")
R("join(out, 'taza-story.mp4')", "join(out, 'taza-story-328.mp4')")
R("'.card, .tick, .head, .title,", "'.card, .tick, .head, .title, .wcap,")

fs_start = s.index("add(0, 'smog', .55);")
fs_end = s.index("const inputs = [], parts = [], voL = [], fxL = [];")
s = s[:fs_start] + r"""add(0, 'smog', .55); add(.3, 'heartbeat', .95); add(6.3, 'heartbeat', .75);
add(V('x_hook1').s - .1, 'braam', .9);
add(S('meet').s - 2.0, 'riser', .45); add(S('meet').s, 'logo', .7);
for (const sc of ['dana', 'aliya', 'tg', 'arman', 'admin', 'proof']) add(S(sc).s + .1, 'whoosh', .35);
add(V('x_dana2').s + .7, 'stamp', .6);
for (const k of [1, 2, 3]) { const q = cue.chat['q' + k], a = cue.chat['a' + k]; add(q - 1.2, 'typing', .5); add(q, 'sent', .5); add(a, 'notif', .6); }
add(cue.ring, 'ring', .6); add(cue.pick, 'pickup', .6); add(cue.hang, 'hangup', .6);
{ const g = S('tg'), F = f => g.s + (g.e - g.s) * f; [.03, .17, .30, .46, .54, .60, .86].forEach(f => add(F(f), 'notif', .45)); [.12, .25, .42].forEach(f => add(F(f), 'sent', .45)); add(F(.75), 'typing', .45); }
add(cue.push, 'notif', .75);
add(cue.jam - 1.6, 'traffic', .5); add(cue.jam + .1, 'window', .8);
add(V('x_arman3').s + V('x_arman3').d * .45, 'notif', .5);
{ const a = S('admin'), gaps = V('x_admin2').s + V('x_admin2').d * .55; add(a.s + (gaps - a.s) / 4, 'upload', .6); add(gaps, 'whoosh', .3); }
{ const d = V('x_proof'); add(d.s + d.d * .12 + .9, 'stamp', .55); [.2, .3, .62].forEach(k => add(d.s + d.d * k, 'tick', .5)); for (let k = 0; k < 7; k++) add(d.s + d.d * .38 + k * .35, 'tick', .35); }
add(V('metric').s - .1, 'braam', .45);
add(S('thanks').s + .1, 'logo', .6);

""" + s[fs_end:]
open(os.path.join(here, 'build3.mjs'), 'w', encoding='utf-8').write(s)
print('build3.mjs written')
