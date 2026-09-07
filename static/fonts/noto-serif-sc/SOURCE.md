# Noto Serif SC

Source: Google Fonts CSS API, retrieved 2026-09-07.
https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400..700&display=swap

The original WOFF2 files from fonts.gstatic.com are stored unchanged under content-hashed filenames. The unicode-range declarations retain the upstream subsets, so each browser downloads only the subsets needed by the displayed text. The variable files supply weights 400 through 700. This also covers future articles without extracting characters from article content or regenerating fonts.

License: SIL Open Font License 1.1, included in OFL.txt.
https://github.com/google/fonts/tree/main/ofl/notoserifsc

assets/css/fonts.css is processed by Hugo to resolve same-site font URLs and fingerprint the stylesheet. No visitor requests to Google are required.

## Compact home subset

`noto-serif-sc-home-18290f7048a2a593.woff2` contains 370 characters used by the current rendered home page, the navigation status, and printable ASCII. It is 106,192 bytes and retains variable weights 400–700. Its CSS follows the general subsets, so characters not in the compact subset continue to use the complete same-site subsets. Adding article text does not require rebuilding this file.

The home subset is derived locally from the upstream font at:
https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/NotoSerifSC%5Bwght%5D.ttf

Source SHA-256: `050080d9255a86808f2945bffac582b31ef32bc36411ce29563b4961670c66f9`.
The derived font retains the source copyright and license name records; the same OFL applies.

Optional regeneration after changing home-page copy:

```sh
python -m pip install 'fonttools[woff]==4.62.1'
hugo --minify
python scripts/build-home-font.py --font /path/to/NotoSerifSC.ttf --html public/index.html
hugo --minify
```

The script creates a content-hashed font and updates `assets/css/fonts-core.css`. Review any replaced subset files before removing them. Ordinary local builds and deployments need only Hugo; Python and the original TTF are not deployment dependencies. Do not commit the downloaded TTF or the Python environment.