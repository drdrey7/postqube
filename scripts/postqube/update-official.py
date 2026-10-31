#!/usr/bin/env python3
"""Update the official Postiz image while preserving the separate Postqube overlay.
Default: read-only release check. Apply explicitly: update.py --apply vX.Y.Z.
"""
import argparse,json,re,subprocess,time,urllib.request
from pathlib import Path
import yaml
from dotenv import dotenv_values
ROOT=Path('/opt/postiz')
def run(*args,**kw):return subprocess.run(list(args),check=True,**kw)
def fetch(url):return urllib.request.urlopen(url,timeout=30).read()
p=argparse.ArgumentParser();p.add_argument('--apply',metavar='VERSION');a=p.parse_args()
c=yaml.safe_load((ROOT/'compose.yaml').read_text());current=c['services']['postiz']['image']
release=json.loads(fetch('https://api.github.com/repos/gitroomhq/postiz-app/releases/latest'))
latest=release['tag_name'];print('Installed:',current);print('Latest official release:',latest)
if not a.apply:raise SystemExit(0)
version=a.apply
if not re.fullmatch(r'v\d+\.\d+\.\d+',version):raise SystemExit('Use a stable official version such as v2.25.3')
image='ghcr.io/gitroomhq/postiz-app:'+version
if image==current:print('Already on that release');raise SystemExit(0)
upstream=yaml.safe_load(fetch('https://raw.githubusercontent.com/gitroomhq/postiz-app/'+version+'/docker-compose.yaml'))
baseline=yaml.safe_load((ROOT/'upstream-compose.yaml').read_text())
def infra(doc):return {k:v.get('image') for k,v in doc['services'].items() if k!='postiz'}
if infra(upstream)!=infra(baseline):raise SystemExit('Upstream infrastructure changed. Review the official Compose changes before updating; no app/data changes made.')
run('docker','pull',image)
registry="const m=require('/app/apps/backend/dist/libraries/nestjs-libraries/src/integrations/integration.manager.js');console.log(JSON.stringify(m.socialIntegrationList.map(p=>p.identifier)));"
ids=json.loads(subprocess.check_output(['docker','run','--rm','--entrypoint','node','--workdir','/app',image,'-e',registry],text=True))
if not {'x','instagram-standalone'}.issubset(ids):raise SystemExit('Provider registry changed; review before updating')
run('/opt/postiz/backup.sh')
c['services']['postiz']['image']=image
c['services']['postiz']['environment']['HIDDEN_PROVIDERS']=','.join(i for i in ids if i not in {'x','instagram-standalone'})
(ROOT/'compose-before-last-update.yaml').write_text((ROOT/'compose.yaml').read_text())
(ROOT/'compose.yaml').write_text(yaml.safe_dump(c,sort_keys=False))
run('docker','compose','-f',str(ROOT/'compose.yaml'),'config','--quiet')
run('docker','compose','-f',str(ROOT/'compose.yaml'),'up','-d','--no-deps','postiz')
for _ in range(24):
 try:
  url=dotenv_values(ROOT/'.env').get('FRONTEND_URL')
  if not url:raise ValueError('Set FRONTEND_URL in protected environment')
  r=json.loads(fetch(url.rstrip('/')+'/api/auth/can-register'))
  if 'register' in r:break
 except Exception:pass
 time.sleep(5)
else:raise SystemExit('Readiness check failed. Pre-update backup is available; inspect logs before any rollback.')
(ROOT/'upstream-compose.yaml').write_text(yaml.safe_dump(upstream,sort_keys=False))
print('Official image updated. Check the logo, sign-in, two-channel picker, and one workspace before accepting the release.')
