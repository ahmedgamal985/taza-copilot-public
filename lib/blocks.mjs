// Split page text into short, citable blocks (1-3 sentences, about 350 characters).
// Shared by the index builder and by research uploaded from the admin page.
export function toBlocks(text) {
  const paragraphs = text.replace(/\r/g, '').split(/\n\s*\n/)
    .map(p => p.replace(/\s*\n\s*/g, ' ').replace(/[ \t ​]+/g, ' ').trim())
    .filter(p => p.length > 2 && !/^\d{1,3}$/.test(p));
  const blocks = [];
  for (const p of paragraphs) {
    const sentences = p.match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) || [p];
    let cur = '';
    for (const s of sentences) {
      if (cur && (cur + s).length > 350) { blocks.push(cur.trim()); cur = ''; }
      cur += s;
    }
    if (cur.trim()) blocks.push(cur.trim());
  }
  // Merge tiny fragments (headings, table cells) into the next block
  const merged = [];
  for (const b of blocks) {
    if (merged.length && merged[merged.length - 1].length < 60) merged[merged.length - 1] += ' ' + b;
    else merged.push(b);
  }
  return merged.filter(b => b.length >= 15);
}
