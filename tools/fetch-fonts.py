"""Regenerate fonts/ and css/fonts.css from Google Fonts.
1. curl -A "<a modern Chrome user agent>" -o gf.css "https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Bricolage+Grotesque:wght@500;700&family=Vazirmatn:wght@400;500;700&family=Lalezar&display=swap"
2. python3 tools/fetch-fonts.py gf.css fonts css/fonts.css
Keeps the latin, latin-ext and arabic subsets. Then run node tools/bump-sw-version.js.
"""
import re, sys, os, urllib.request, hashlib
src, outdir, cssout = sys.argv[1:4]
css = open(src).read()
blocks = re.findall(r'/\* ([\w-]+) \*/\s*@font-face \{(.*?)\}', css, re.S)
legacy = ('Inter', 'JetBrains Mono')
fam_of = lambda body: re.search(r"font-family: '([^']+)'", body).group(1)
blocks = [b for b in blocks if fam_of(b[1]) not in legacy] + [b for b in blocks if fam_of(b[1]) in legacy]
keep = {'latin', 'latin-ext', 'arabic'}
slug = lambda f: f.lower().replace(' ', '-')
seen = {}
out = ["/* Self-hosted web fonts: woff2, latin + latin-ext + arabic subsets, from Google Fonts.",
       "   Files live in fonts/. The service worker precaches every url() in this file,",
       "   so keep this list to faces the app actually uses. */", ""]
legacy_started = False
for subset, body in blocks:
    if subset not in keep:
        continue
    fam = fam_of(body)
    wt = re.search(r"font-weight: ([\d ]+);", body).group(1).strip()
    url = re.search(r"url\((https://[^)]+)\)", body).group(1)
    ur = re.search(r"unicode-range: ([^;]+);", body).group(1)
    if url not in seen:
        name = f"{slug(fam)}-{subset}-{hashlib.sha1(url.encode()).hexdigest()[:6]}.woff2"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        data = urllib.request.urlopen(req).read()
        open(os.path.join(outdir, name), 'wb').write(data)
        seen[url] = name
    if fam in legacy and not legacy_started:
        out += ["/* ---- Pre-restyle UI faces (Inter, JetBrains Mono): delete this block and",
                "   their files in fonts/ once css/app.css no longer uses them. ---- */", ""]
        legacy_started = True
    out += [f"/* {fam} {wt}, {subset} */", "@font-face {", f"  font-family: '{fam}';", "  font-style: normal;",
            f"  font-weight: {wt};", "  font-display: swap;", f"  src: url(../fonts/{seen[url]}) format('woff2');",
            f"  unicode-range: {ur};", "}", ""]
open(cssout, 'w').write("\n".join(out))
print(len(seen), 'files')
