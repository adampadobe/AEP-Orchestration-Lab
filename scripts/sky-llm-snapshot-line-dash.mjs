/**
 * Strip Recharts line animation dash attributes from frozen snapshot HTML.
 */
export function stripLineDash(html) {
  html = html.replace(
    /(<path[^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*)\sstroke-dasharray="[^"]*"/g,
    '$1',
  );
  html = html.replace(
    /(<path[^>]*)\sstroke-dasharray="[^"]*"([^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*>)/g,
    '$1$2',
  );
  html = html.replace(
    /(<path[^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*)\sstroke-dashoffset="[^"]*"/g,
    '$1',
  );
  html = html.replace(
    /(<path[^>]*)\sstroke-dashoffset="[^"]*"([^>]*class="[^"]*recharts-(?:line-)?curve[^"]*"[^>]*>)/g,
    '$1$2',
  );
  return html;
}
