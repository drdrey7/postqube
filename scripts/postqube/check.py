#!/usr/bin/env python3
"""Validate the public customization and documentation, not the entire upstream app."""
from pathlib import Path
import re,subprocess,json,ast,sys
ROOT=Path(__file__).resolve().parents[2];errors=[]
for p in (ROOT/'scripts/postqube').glob('*.py'):
    ast.parse(p.read_text(),filename=str(p))
subprocess.run(['node','--check',str(ROOT/'postqube/branding/brand.js')],check=True)
for p in (ROOT/'postqube/ideas').rglob('*'):
    if p.suffix in ['.js', '.mjs']:
        subprocess.run(['node','--check',str(p)],check=True)
release=json.loads((ROOT/'postqube/release.json').read_text())
assert release['upstreamTag']=='v2.25.3'
for p in [ROOT/'README.md',ROOT/'UPSTREAM.md',ROOT/'NOTICE.md',*(ROOT/'docs/postqube').glob('*.md')]:
    # Original upstream README is preserved, including links relative to upstream root.
    if p.name=='UPSTREAM-README.md':continue
    for url in re.findall(r'!?\[[^\]]*\]\(([^)]+)\)',p.read_text()):
        if url.startswith(('https://','http://','#','mailto:')):continue
        target=p.parent/url.split('#')[0]
        if not target.exists():errors.append(f'{p.relative_to(ROOT)}: missing local link {url}')
# Block common live credential formats in newly maintained text; never emit matches.
patterns=[r'gh[pousr]_[A-Za-z0-9]{30,}',r'github_pat_[A-Za-z0-9_]{30,}',r'sk-(?:proj-)?[A-Za-z0-9_-]{24,}',r'-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----']
for parent in [ROOT/'postqube',ROOT/'scripts/postqube',ROOT/'docs/postqube']:
    for p in parent.rglob('*'):
        if not p.is_file() or p.suffix.lower() in ['.png','.jpg','.ico']:continue
        if p.name.startswith('.env') and p.name!='.env.example':errors.append('Real environment file in maintained source')
        text=p.read_text(errors='replace')
        if p.name=='check.py':continue
        if any(re.search(pattern,text) for pattern in patterns):errors.append(f'Possible credential in {p.relative_to(ROOT)} (value omitted)')
if errors:
    print('\n'.join(errors));sys.exit(1)
print('PASS: Python syntax, branding JS syntax, release metadata, local Markdown links and maintained-file credential-pattern scan')
print('Scope: no full product build, exhaustive license review or complete-history secret audit claimed')
