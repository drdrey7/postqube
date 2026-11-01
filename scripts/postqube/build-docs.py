#!/usr/bin/env python3
"""Build dependency-free, accessible static Postqube documentation."""
from pathlib import Path
import html,re,shutil
ROOT=Path(__file__).resolve().parents[2]
DOCS=ROOT/'docs/postqube'; OUT=ROOT/'.postqube-site'
NAV=[('INDEX','Overview'),('GETTING-STARTED','Getting started'),('USER-GUIDE','User guide'),('IDEAS','Ideas workspace'),('RELEASE-BETA','Release notes'),('STATUS','Beta status'),('CHANNELS','Channels'),('DEPLOYMENT','Deployment'),('OPERATIONS','Operations'),('ARCHITECTURE','Architecture'),('DEVELOPMENT','Development'),('UPDATES','Updates'),('SECURITY','Security'),('LEGAL','License & legal'),('PRIVACY','Privacy preparation'),('TERMS','Terms preparation'),('DATA-DELETION','Deletion preparation'),('LAUNCH','Launch checklist'),('FAQ','FAQ'),('CONTRIBUTING','Contributing')]
def filename(slug):return 'index.html' if slug=='INDEX' else slug.lower()+'.html'
def target(url):
    if re.fullmatch(r'[A-Z-]+\.md',url):return filename(url[:-3])
    return url

def inline(text):
    text=html.escape(text)
    text=re.sub(r'!\[([^\]]*)\]\(([^)]+)\)',lambda m:'<img loading="lazy" src="'+html.escape(target(html.unescape(m[2])),quote=True)+'" alt="'+m[1]+'">',text)
    text=re.sub(r'(?<!!)\[([^\]]+)\]\(([^)]+)\)',lambda m:'<a href="'+html.escape(target(html.unescape(m[2])),quote=True)+'">'+m[1]+'</a>',text)
    text=re.sub(r'`([^`]+)`',r'<code>\1</code>',text)
    text=re.sub(r'\*\*([^*]+)\*\*',r'<strong>\1</strong>',text)
    return text

def render(md):
    lines=md.splitlines(); out=[];para=[];i=0
    def flush():
        if para:out.append('<p>'+inline(' '.join(para))+'</p>');para.clear()
    while i<len(lines):
        l=lines[i]
        if l.startswith('```'):
            flush();code=[];i+=1
            while i<len(lines) and not lines[i].startswith('```'):code.append(lines[i]);i+=1
            out.append('<pre><code>'+html.escape('\n'.join(code))+'</code></pre>')
        elif re.match(r'^#{1,4} ',l):
            flush();level=len(l.split(' ')[0]);out.append(f'<h{level}>'+inline(l[level+1:])+f'</h{level}>')
        elif l.startswith('|'):
            flush();rows=[]
            while i<len(lines) and lines[i].startswith('|'):
                cells=[x.strip() for x in lines[i].strip('|').split('|')]
                if not all(re.fullmatch(r':?-+:?',x) for x in cells):rows.append(cells)
                i+=1
            i-=1;out.append('<div class="table-scroll"><table>')
            for n,cells in enumerate(rows):
                tag='th' if n==0 else 'td';out.append('<tr>'+''.join('<'+tag+'>'+inline(x)+'</'+tag+'>' for x in cells)+'</tr>')
            out.append('</table></div>')
        elif re.match(r'^([-*] |\d+\. )',l):
            flush();items=[]
            while i<len(lines) and re.match(r'^([-*] |\d+\. )',lines[i]):
                items.append(re.sub(r'^([-*] |\d+\. )','',lines[i]));i+=1
            i-=1;out.append('<ul>'+''.join('<li>'+inline(x)+'</li>' for x in items)+'</ul>')
        elif not l.strip():flush()
        else:para.append(l)
        i+=1
    flush();return '\n'.join(out)
CSS='''*{box-sizing:border-box}html{color-scheme:dark}body{margin:0;background:#0e0d12;color:#ece8f3;font:16px/1.7 system-ui,-apple-system,sans-serif}a{color:#c6b3ff;text-underline-offset:4px}a:hover{color:white}header{border-bottom:1px solid #2d2739;padding:19px 5vw;display:flex;align-items:center;justify-content:space-between;gap:20px;background:#15121c}header img{width:158px;display:block}header>a{font-size:13px}.layout{display:grid;grid-template-columns:245px minmax(0,850px);gap:56px;max-width:1220px;margin:auto;padding:38px 24px 70px}nav a{display:block;padding:7px 12px;text-decoration:none;color:#aaa2b8;font-size:14px;border-radius:7px}nav a[aria-current]{background:#2b1e43;color:#dfd2ff}nav strong{font-size:11px;letter-spacing:2px;display:block;padding:10px 12px;color:#82758e}h1{font-size:clamp(34px,5vw,52px);letter-spacing:-1.6px;line-height:1.1;margin:14px 0 30px}h2{font-size:25px;margin-top:40px;line-height:1.3}h3{font-size:19px}p{color:#c2bacd}main{min-width:0}main img{max-width:100%;height:auto;border:1px solid #342b43;border-radius:14px;margin:18px 0}pre{overflow:auto;padding:18px;border:1px solid #342b43;border-radius:10px;background:#18131f;font-size:13px}code{color:#d8c6ff;font-size:.88em}li{margin:9px 0;color:#c2bacd}.table-scroll{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}td,th{text-align:left;padding:13px;border-bottom:1px solid #342b43;vertical-align:top}th{color:#dfd2ff}footer{max-width:1220px;margin:auto;padding:24px;color:#8d819d;font-size:12px;border-top:1px solid #2d2739}.badge{display:inline-block;font-size:11px;letter-spacing:1.3px;padding:5px 10px;border:1px solid #634398;border-radius:99px;color:#c8adff}.skip{position:absolute;left:-1000px}.skip:focus{left:12px;top:12px;background:#21142e;padding:10px;z-index:99}.mobile-nav{display:none}@media(max-width:760px){.layout{display:block;padding:20px 20px 50px}nav{margin-bottom:32px;max-height:210px;overflow:auto;border:1px solid #342b43;border-radius:10px;padding:8px}header{padding:16px 20px}header img{width:135px}h1{font-size:36px}p{font-size:15px}.mobile-nav{display:block;font-size:12px;color:#8d819d;margin:0 0 8px}}'''
OUT.mkdir(exist_ok=True)
shutil.copytree(DOCS/'assets',OUT/'assets',dirs_exist_ok=True)
shutil.copytree(ROOT/'postqube/branding',OUT/'brand',dirs_exist_ok=True)
(OUT/'style.css').write_text(CSS)
(OUT/'.nojekyll').write_text('')
for slug,label in NAV:
    nav=''.join('<a href="'+filename(s)+'"'+(' aria-current="page"' if s==slug else '')+'>'+html.escape(t)+'</a>' for s,t in NAV)
    body=render((DOCS/(slug+'.md')).read_text())
    page='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Postqube open-source beta documentation, deployment and launch readiness"><title>'+html.escape(label)+' · Postqube</title><link rel="icon" href="brand/mark.svg"><link rel="stylesheet" href="style.css"></head><body><a class="skip" href="#content">Skip to content</a><header><a href="index.html"><img src="brand/wordmark.svg" alt="Postqube"></a><a href="https://github.com/drdrey7/postqube">View source ↗</a></header><div class="layout"><nav aria-label="Documentation"><strong>DOCUMENTATION</strong>'+nav+'</nav><main id="content"><span class="badge">OPEN SOURCE · PUBLIC BETA</span>'+body+'</main></div><footer>Postqube · Based on Postiz · <a href="https://github.com/drdrey7/postqube/blob/postqube-0.5.0-beta.1/LICENSE">AGPL license</a> · <a href="https://github.com/drdrey7/postqube/tree/postqube-0.5.0-beta.1">Release source</a><br>Documentation snapshot 2026-10-31. Legal preparation pages are drafts, not effective service policies.</footer></body></html>'
    (OUT/filename(slug)).write_text(page)
print(f'Built {len(NAV)} documentation pages; assets included; no external JavaScript dependencies')
