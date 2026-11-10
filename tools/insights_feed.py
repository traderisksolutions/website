"""Renders the Insights articles published in the TRS dashboard (Marketing → Articles) as static
pages under /insights/, next to the hand-written posts in insights_content.py, and rebuilds the
Insights index and the sitemap so both sets are listed together.

Run from the repo root after build_site.py (build_site.py rewrites insights/index.html from the
hand-written posts only):  python3 tools/insights_feed.py

Source: GET https://trs-dashboard-pi.vercel.app/api/public/blog?site=traderisksolutions.com.sg
Only published articles are served, so nothing here needs a key.
"""
import datetime, html, json, os, re, sys, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from insights_content import POSTS  # noqa: E402

API = os.environ.get('BLOG_API_URL', 'https://trs-dashboard-pi.vercel.app/api/public/blog') + '?site=traderisksolutions.com.sg'
SITE = 'https://www.traderisksolutions.com.sg'
CATS = ['Workforce', 'Liability', 'Property and projects', 'Claims', 'Working with a broker']
WA = 'https://wa.me/6589386813?text=' + 'Hi%20TRS%2C%20I%27d%20like%20to%20talk%20to%20a%20broker.'
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com" />\n'
         '  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />\n'
         '  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500&family=Archivo:wdth,wght@62..125,400..900&family=Zhi+Mang+Xing&display=swap" />')
ARROW = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 12 12 4M6 4h6v6"/></svg>'


def e(x):
    return html.escape(x, quote=False)


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'trs-insights-build'}), timeout=60) as r:
        return json.load(r)


def close_band():
    return ('<section class="s-sec s-tint"><div class="s-w s-close"><p class="s-pill">Next step</p><h2 class="s-h2">Find out what the right coverage looks like for you.</h2>'
            '<p class="s-sub">A broker reads your current schedule against your operations and replies within two working days.</p>'
            f'<div class="s-acts"><a class="s-btn s-p" href="{WA}" target="_blank" rel="noopener" data-track="whatsapp_direct">Talk to a broker {ARROW}</a>'
            '<a href="#" class="s-btn s-o" data-ctac-modal data-track="page_get_quote">Get a quote</a></div></div></section>')


def ins_head(title, desc, url, jsonld):
    t = e(title)
    return ('<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n'
            '  <link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png" />\n  <link rel="shortcut icon" href="/favicon.ico" />\n'
            '  <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />\n'
            f'  <title>{t}</title>\n  <meta name="description" content="{html.escape(desc)}" />\n  <link rel="canonical" href="{url}" />\n'
            f'  <meta property="og:type" content="article" />\n  <meta property="og:url" content="{url}" />\n  <meta property="og:title" content="{t}" />\n'
            f'  <meta property="og:description" content="{html.escape(desc)}" />\n  <meta property="og:image" content="https://www.traderisksolutions.com.sg/og-image-2026.png" />\n'
            '  <meta property="og:site_name" content="Trade Risk Solutions" />\n  <meta name="twitter:card" content="summary_large_image" />\n'
            '  ' + FONTS + '\n  <link rel="stylesheet" href="/styles/main.css" />\n  <link rel="stylesheet" href="/styles/site.css" />\n'
            '  <script defer src="/_vercel/insights/script.js"></script>\n'
            '  <script type="application/ld+json">' + json.dumps(jsonld, ensure_ascii=False) + '</script>\n</head>')


def ins_page(head, body):
    return ('<!DOCTYPE html>\n<html lang="en">\n' + head + '\n<body class="s-site">\n  <div id="nav-root"></div>\n' + body +
            '\n  <div id="footer-root"></div>\n  <script src="/scripts/product-taxonomy.js"></script>\n  <script src="/scripts/nav.js"></script>\n'
            '  <script src="/scripts/analytics.js" defer></script>\n  <script src="/scripts/site.js" defer></script>\n</body>\n</html>\n')


def iso_of(static_date):
    return datetime.datetime.strptime(static_date, '%d %b %Y').date().isoformat()


def pretty(iso):
    d = datetime.date.fromisoformat(iso[:10])
    return f'{d.day} {d.strftime("%b %Y")}'


def row(x):
    return (f'<a class="s-row" data-cat="{e(x["cat"])}" href="/insights/{x["slug"]}/"><span class="s-rc">{e(x["cat"])}</span>'
            f'<b>{e(x["title"])}</b><span class="s-rd">{x["minutes"]} min read</span></a>')


def body_html(content_html):
    """The feed's HTML with the site's table wrapper and the mid-article CTA after the second section."""
    h = re.sub(r'<table>', '<div class="s-tbl"><table>', content_html)
    h = h.replace('</table>', '</table></div>')
    cta = (f'<div class="s-in-cta"><b>Want this checked against your own policies?</b>'
           f'<a class="s-btn s-on" href="{WA}" target="_blank" rel="noopener" data-track="whatsapp_direct">Talk to a broker</a></div>')
    parts = h.split('<h2 ')
    if len(parts) > 3:
        parts[3] = cta + '<h2 ' + parts[3]
        h = '<h2 '.join(parts[:3]) + parts[3] + ''.join('<h2 ' + p for p in parts[4:])
    return h


def main():
    feed = get(API)['articles']
    posts = []  # unified records for the index: slug, cat, title, desc, minutes, iso
    for p in POSTS:
        posts.append(dict(slug=p['slug'], cat=p['cat'], title=p['title'], desc=p['desc'], minutes=p['minutes'], iso=iso_of(p['date'])))
    for a in feed:
        cat = a['topic'] if a['topic'] in CATS else 'Working with a broker'
        posts.append(dict(slug=a['slug'], cat=cat, title=a['title'], desc=a['meta_description'] or a['excerpt'] or '', minutes=max(3, a['reading_minutes']), iso=a['published_at'][:10], updated=a['updated_at'][:10]))

    for a in feed:
        one = get(API + '&slug=' + a['slug'])['article']
        cat = one['topic'] if one['topic'] in CATS else 'Working with a broker'
        url = f"{SITE}/insights/{one['slug']}/"
        desc = one['meta_description'] or one['excerpt'] or ''
        content = one['content_html']
        # First paragraph = the short answer; the rest = the prose.
        i = content.find('</p>')
        answer, rest = (content[:i + 4], content[i + 4:]) if i > 0 else ('', content)
        answer_text = re.sub(r'<[^>]+>', '', answer)
        more = [x for x in posts if x['cat'] == cat and x['slug'] != one['slug']][:3]
        morel = ''.join(row(x) for x in more)
        date = pretty(one['published_at'])
        body = (f'<article class="s-w s-art"><nav class="s-crumb" aria-label="Breadcrumb"><a href="/insights/">Insights</a><span>/</span>{e(cat)}</nav>'
                f'<h1 class="s-art-h">{e(one["title"])}</h1><div class="s-by"><span>By the TRS broking team</span><span>{date}</span><span>{max(3, one["reading_minutes"])} min read</span></div>'
                + (f'<div class="s-ans"><b>The short answer</b>{e(answer_text)}</div>' if answer_text else '')
                + f'<div class="s-prose s-prose-feed">{body_html(rest)}</div>'
                + '<p class="s-disc">General information only, not advice on any particular policy. Cover depends on the policy wording and the insurer\'s terms.</p>'
                + (f'<h2 class="s-art-sub">More in {e(cat.lower())}</h2><div class="s-list">{morel}</div>' if morel else '') + '</article>' + close_band())
        ld = [{'@context': 'https://schema.org', '@type': 'Article', 'headline': one['title'], 'description': desc, 'datePublished': one['published_at'][:10],
               'dateModified': one['updated_at'][:10], 'mainEntityOfPage': url, 'image': 'https://www.traderisksolutions.com.sg/og-image-2026.png',
               'author': {'@type': 'Organization', 'name': 'Trade Risk Solutions'}, 'publisher': {'@type': 'Organization', 'name': 'Trade Risk Solutions', 'logo': {'@type': 'ImageObject', 'url': 'https://www.traderisksolutions.com.sg/favicon-192.png'}}},
              {'@context': 'https://schema.org', '@type': 'BreadcrumbList', 'itemListElement': [
                  {'@type': 'ListItem', 'position': 1, 'name': 'Insights', 'item': SITE + '/insights/'},
                  {'@type': 'ListItem', 'position': 2, 'name': one['title'], 'item': url}]}]
        if one.get('faq'):
            ld.append({'@context': 'https://schema.org', '@type': 'FAQPage', 'mainEntity': [
                {'@type': 'Question', 'name': f['question'], 'acceptedAnswer': {'@type': 'Answer', 'text': f['answer']}} for f in one['faq']]})
        os.makedirs(f"insights/{one['slug']}", exist_ok=True)
        open(f"insights/{one['slug']}/index.html", 'w').write(ins_page(ins_head(one['title'] + ' | TRS', desc, url, ld), body))

    posts.sort(key=lambda x: x['iso'], reverse=True)
    feat = posts[0]
    rows_html = ''.join(row(x) for x in posts[1:])
    idx = ('<section class="s-w"><div class="s-bh"><div><h1 class="s-h1">Insights</h1><p class="s-lede">Guides, rule changes and claim lessons for Singapore businesses.</p></div>'
           '<div class="s-flt" role="group" aria-label="Filter by topic"><button type="button" aria-pressed="true" data-c="all">All</button>'
           + ''.join(f'<button type="button" aria-pressed="false" data-c="{e(c)}">{e(c)}</button>' for c in CATS) + '</div></div>'
           f'<a class="s-feat" data-cat="{e(feat["cat"])}" href="/insights/{feat["slug"]}/"><span class="s-feat-im">{e(feat["title"].split("?")[0].split(":")[0])}</span><span><span class="s-rc">{e(feat["cat"])}</span>'
           f'<b>{e(feat["title"])}</b><span class="s-feat-d">{e(feat["desc"])}</span><span class="s-rd">{feat["minutes"]} min read</span></span></a>'
           f'<div class="s-list" id="s-list">{rows_html}</div><p class="s-empty" hidden>No posts on this topic yet.</p></section>' + close_band())
    ld = {'@context': 'https://schema.org', '@type': 'Blog', 'name': 'TRS Insights', 'url': SITE + '/insights/',
          'blogPost': [{'@type': 'BlogPosting', 'headline': x['title'], 'url': f"{SITE}/insights/{x['slug']}/", 'datePublished': x['iso']} for x in posts]}
    open('insights/index.html', 'w').write(ins_page(ins_head('Insights: business insurance guides for Singapore | TRS',
         'Guides to WICA, foreign worker insurance, D&O, professional indemnity, cyber, construction, marine, trade credit and claims for Singapore businesses, from the TRS broking team.',
         SITE + '/insights/', ld).replace('<meta property="og:type" content="article" />', '<meta property="og:type" content="website" />'), idx))

    sm = open('sitemap.xml').read()
    add = ''
    for a in feed:
        loc = f'{SITE}/insights/{a["slug"]}/'
        if loc in sm or loc.replace('www.', '') in sm:
            continue
        add += f'  <url><loc>{loc}</loc><lastmod>{a["updated_at"][:10]}</lastmod></url>\n'
    if add:
        open('sitemap.xml', 'w').write(sm.replace('</urlset>', add + '</urlset>'))
    print('insights:', len(POSTS), 'hand-written +', len(feed), 'from the feed;', add.count('<url>'), 'sitemap entries added')


if __name__ == '__main__':
    main()
