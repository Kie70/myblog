"""Optional font maintenance; normal Hugo builds do not require Python.

pip install 'fonttools[woff]==4.62.1'
python scripts/build-home-font.py --font /path/to/NotoSerifSC.ttf --html public/index.html
See static/fonts/noto-serif-sc/SOURCE.md for the upstream font.
"""
import argparse
import hashlib
import io
import json
from html.parser import HTMLParser
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont


class HomeText(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_body = False
        self.ignored = 0
        self.text = []

    def handle_starttag(self, tag, attrs):
        if tag == 'body':
            self.in_body = True
        if tag in ('script', 'style', 'svg'):
            self.ignored += 1

    def handle_endtag(self, tag):
        if tag == 'body':
            self.in_body = False
        if tag in ('script', 'style', 'svg'):
            self.ignored -= 1

    def handle_data(self, data):
        if self.in_body and not self.ignored:
            self.text.append(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--font', type=Path, required=True)
    parser.add_argument('--html', type=Path, required=True)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    home = HomeText()
    home.feed(args.html.read_text(encoding='utf-8'))
    codepoints = {ord(c) for c in ''.join(home.text) + '正在打开文章全部文章项目…'} | set(range(32, 127))
    font = TTFont(args.font, recalcTimestamp=False)
    codepoints &= set(font.getBestCmap())
    options = subset.Options()
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=codepoints)
    subsetter.subset(font)
    font = instantiateVariableFont(font, {'wght': (400, 700)}, inplace=True)
    font.flavor = 'woff2'
    output = io.BytesIO()
    font.save(output)
    data = output.getvalue()
    name = f'noto-serif-sc-home-{hashlib.sha256(data).hexdigest()[:16]}.woff2'
    (args.root / 'static/fonts/noto-serif-sc' / name).write_bytes(data)
    ranges = ','.join(f'U+{c:X}' for c in sorted(codepoints))
    css = """/* Generated home glyphs override the general subsets only for these characters. */
@font-face {
  font-family: 'Noto Serif SC';
  font-style: normal;
  font-weight: 400 700;
  font-display: swap;
  src: url('{{ "fonts/noto-serif-sc/FILENAME" | relURL }}') format('woff2');
  unicode-range: RANGES;
}
""".replace('FILENAME', name).replace('RANGES', ranges)
    (args.root / 'assets/css/fonts-core.css').write_text(css, encoding='utf-8')
    print(json.dumps({'homeCharacters': len(codepoints), 'bytes': len(data), 'file': name,
                      'sourceSHA256': hashlib.sha256(args.font.read_bytes()).hexdigest()}))


if __name__ == '__main__':
    main()
