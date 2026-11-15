"""Inline src/ into a single self-contained dist/firmware-explorer.html."""
import re, pathlib
src = pathlib.Path(__file__).parent / 'src'
html = (src / 'index.html').read_text()
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + (src / 'styles.css').read_text() + '\n</style>')
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>\n' + (src / m.group(1)).read_text().replace('</script', '<\\/script') + '\n</script>', html)
out = pathlib.Path(__file__).parent / 'dist' / 'firmware-explorer.html'
out.write_text(html)
print(out, len(html), 'bytes')
