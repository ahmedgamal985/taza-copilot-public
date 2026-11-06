// Reads the text of an air.org.kz page (research articles, external research, legislation).
// Shared by scripts/fetch-web.mjs (building the index) and lib/library.mjs (the daily check for new pages).
export const decode = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»');

export function pageText(html) {
  // The article lives in <main>; drop navigation, forms, scripts, modals and footers
  let m = html.match(/<main[\s\S]*?<\/main>/i)?.[0] || html.match(/<body[\s\S]*<\/body>/i)?.[0] || html;
  m = m.replace(/<(script|style|noscript|svg|form|nav|footer|header|button|iframe)[\s\S]*?<\/\1>/gi, '')
    .replace(/<div[^>]*class="(?:[^"]*\s)?(share-modal|search-results|search-form|mobile-search-results|cookies-notice|page-nav|research-image-modal)[^"]*"[\s\S]*?<\/div>/gi, '')
    .replace(/<img[^>]*>/gi, '');
  return decode(m
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|table)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<td[^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t ​]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
