"""Build brand-board.html from the mark SVGs, the lockups and names.json.
Run from docs/brand:  python3 tools/build-board.py"""
import json, re, html
def inner(path, colour=None, accent=None):
    src = open(path).read()
    if colour: src = src.replace('var(--logo-accent, currentColor)', accent or colour).replace('currentColor', colour)
    return src
CHOSEN = "cairn"
marks = [
    ("cairn", "Cairn of books", "A cairn is the stack of stones that marks a trail and the top of a climb. Here the stones are books, rising to a small amber one: the term’s work, stacked up to a peak. Drawn after the name Termtrail was chosen, for what the name brings to mind: climbing, endurance, and the relief of getting there."),
    ("book",  "Book that becomes a tick", "An open book whose right page lifts into a tick: study that ends in “got it”. The mark the app used before the name was chosen."),
    ("loop",  "Practice loop",           "A loop that closes with a tick: practise, repeat, know it. Clean and friendly, but check-in-a-circle marks are common in task apps."),
    ("cards", "Study cards",             "Two cards, the front one ticked: notes and flashcards done. Clear, but close to the standard “copy” and “checkbox” icons."),
]
names = json.load(open('names.json'))
chosen_icon = re.sub(r'<svg ', '<svg width="132" height="132" ', open(f'icon-{CHOSEN}.svg').read(), count=1)
def lockup(name, thai, dark=False):
    """The outlined logo-with-name files from docs/brand/lockups/, Latin then Thai."""
    slug = re.sub(r'[^a-z0-9]+', '-', name.lower())
    theme = "dark" if dark else "light"
    bg = "#12121c" if dark else "#ffffff"
    files = [f'lockups/{slug}-{theme}.svg'] + ([f'lockups/{slug}-th-{theme}.svg'] if thai else [])
    svgs = ''.join(re.sub(r' width="[^"]*" height="[^"]*"', ' height="64"', open(f).read(), count=1) for f in files)
    return f'<div class="lockup" style="background:{bg}">{svgs}</div>'
cols = []
for key, title, why in marks:
    icon = re.sub(r'<svg ', '<svg width="132" height="132" ', open(f'icon-{key}.svg').read(), count=1)
    light = re.sub(r'<svg ', '<svg width="88" height="88" ', inner(f'mark-{key}.svg', '#4f46e5', '#d97706'), count=1)
    dark = re.sub(r'<svg ', '<svg width="88" height="88" ', inner(f'mark-{key}.svg', '#c7d2fe', '#fbbf24'), count=1)
    # the cairn has a solid drawing for sizes under 24 pixels
    small = lambda s: f'mark-{key}-small.svg' if key == CHOSEN and s < 24 else f'mark-{key}.svg'
    sizes = ''.join(re.sub(r'<svg ', f'<svg width="{s}" height="{s}" ', inner(small(s), '#4f46e5', '#d97706'), count=1) for s in (48, 32, 24, 16))
    extra = re.sub(r'<svg ', '<svg width="132" height="132" ', open('icon-book-warm.svg').read(), count=1) if key == "book" else ''
    cols.append(f'''<section class="concept{' wide' if key == CHOSEN else ''}"><h3>{html.escape(title)}{' <span class="rec">chosen</span>' if key == CHOSEN else ''}</h3>
<div class="row">{icon}{extra}<div class="tile light">{light}</div><div class="tile dark">{dark}</div></div>
<div class="sizes">{sizes}<span>48 · 32 · 24 · 16 px</span></div>
<p>{html.escape(why)}</p></section>''')
rows = []
for n in names:
    badge = "clear" if n.get("pick") else {"CLEAR": "clear", "CAUTION": "caution", "TAKEN": "taken"}[n["verdict"]]
    rows.append(f'''<tr><td class="nm"><strong>{html.escape(n["name"])}</strong>{(' <span class="th">' + html.escape(n["thai"]) + '</span>') if n.get("thai") else ''}<div class="mean">{html.escape(n["meaning"])}</div></td>
<td><span class="badge {badge}">{n["label"]}</span></td><td class="found">{n["found"]}</td></tr>''')
top = [n for n in names if n.get("pick")]
lock = ''.join(f'<div class="pair">{lockup(n["name"], n.get("thai",""))}{lockup(n["name"], n.get("thai",""), dark=True)}</div>' for n in top)
page = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Brand board: logo concepts and names</title>
<style>
:root{{color-scheme:light}} *{{box-sizing:border-box}}
body{{margin:0;padding:32px 28px 48px;font:16px/1.55 "IBM Plex Sans Thai Looped","IBM Plex Sans Thai","Sarabun",system-ui,-apple-system,"Segoe UI",sans-serif;color:#16162a;background:#f6f6fb}}
h1{{font-size:26px;margin:0 0 4px}} h2{{font-size:19px;margin:36px 0 12px}} h3{{font-size:16px;margin:0 0 12px}}
p{{margin:10px 0 0;color:#44445a;font-size:14.5px}} .lede{{max-width:70ch;font-size:15.5px}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}}
.rec{{font-size:12px;font-weight:600;background:#e0e7ff;color:#3730a3;border-radius:99px;padding:2px 9px;margin-left:6px;vertical-align:middle}}
.concept.wide{{grid-column:1/-1}}
.concept{{background:#fff;border:1px solid #e4e4ee;border-radius:18px;padding:18px}}
.row{{display:flex;gap:10px;align-items:center;flex-wrap:wrap}}
.tile{{width:132px;height:132px;border-radius:16px;display:flex;align-items:center;justify-content:center;border:1px solid #e4e4ee}}
.tile.dark{{background:#12121c;border-color:#12121c}} .tile.light{{background:#fff}}
.sizes{{display:flex;align-items:flex-end;gap:12px;margin-top:14px}} .sizes span{{font-size:12px;color:#77778c;margin-left:4px}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}}
.lockup{{display:flex;align-items:center;gap:8px 28px;padding:10px 12px;border-radius:16px;border:1px solid #e4e4ee;flex-wrap:wrap}}
.word{{font-size:30px;font-weight:700;letter-spacing:-.01em}} .thai{{font-size:17px}}
table{{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e4e4ee;border-radius:14px;overflow:hidden;font-size:14.5px}}
th,td{{text-align:left;padding:10px 12px;border-bottom:1px solid #eeeef5;vertical-align:top}} th{{font-size:12.5px;color:#66667c;font-weight:600;background:#fafaff}}
tr:last-child td{{border-bottom:0}} .nm{{min-width:150px}} .th{{color:#55556c;margin-left:6px}} .mean{{font-size:13px;color:#77778c}}
.badge{{display:inline-block;padding:2px 9px;border-radius:99px;font-size:12.5px;font-weight:600;white-space:nowrap}}
.clear{{background:#dcfce7;color:#166534}} .caution{{background:#fef3c7;color:#854d0e}} .taken{{background:#fee2e2;color:#991b1b}}
.found a{{color:#4338ca}} .note{{font-size:13px;color:#66667c;margin-top:10px;max-width:80ch}}
@media (max-width:640px){{.pair{{grid-template-columns:1fr}} body{{padding:20px 14px 40px}}}}
</style></head><body>
<h1>Brand board</h1>
<p class="lede"><strong>Chosen on 14 November 2026: the name Termtrail, the cairn-of-books mark, and indigo with an amber top book.</strong> Below: the brand as it is in the app, the logo with the three concepts explored before the name, and every name that was checked, with why the others were dropped.</p>
<div class="concept wide"><div class="row">{chosen_icon}</div><p>The app icon. Leaf green, tried for an earlier name, remains as a colour theme students can choose.</p></div>
<h2>Logo marks</h2>
<div class="grid">{''.join(cols)}</div>
<h2>The name with the mark</h2>
{lock}
<p class="note">These are the finished files in <code>lockups/</code>: the lettering (IBM Plex Sans Thai Looped, the app’s typeface) is converted to outlines, so they look the same on any device. Each name has a Latin and a Thai version, for light and dark backgrounds.</p>
<h2>Names checked</h2>
<table><thead><tr><th>Name</th><th>Result</th><th>What the search found</th></tr></thead><tbody>{''.join(rows)}</tbody></table>
<p class="note">“No similar product found” means none turned up in web, App Store and Google Play searches on 14 November 2026. It is not a trademark clearance; the chosen name still needs a check with the Thai trademark office (DIP) before launch.</p>
</body></html>'''
open('brand-board.html', 'w').write(page)
print('brand-board.html', len(page))
