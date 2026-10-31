#!/usr/bin/env python3
"""Enable Instagram after its dedicated Meta app and tester roles are configured.
Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET in /opt/postiz/.env first.
Never put credentials in this script or the public branding directory.
"""
from pathlib import Path
import subprocess,json,re,yaml
from dotenv import dotenv_values
root=Path('/opt/postiz');env=dotenv_values(root/'.env')
assert env.get('INSTAGRAM_APP_ID') and env.get('INSTAGRAM_APP_SECRET'),'Configure both Instagram credentials in the protected VPS environment first'
assert re.fullmatch(r'\d+',env['INSTAGRAM_APP_ID']),'Meta App ID must be numeric'
c=yaml.safe_load((root/'compose.yaml').read_text());e=c['services']['postiz']['environment'];e.update({'INSTAGRAM_APP_ID':'${INSTAGRAM_APP_ID}','INSTAGRAM_APP_SECRET':'${INSTAGRAM_APP_SECRET}'})
(root/'compose.yaml').write_text(yaml.safe_dump(c,sort_keys=False))
subprocess.run(['docker','compose','-f',str(root/'compose.yaml'),'up','-d','--no-deps','postiz'],check=True)
p=Path('/etc/nginx/sites-available/postqube');s=p.read_text();s=re.sub(r'    # BEGIN META SETUP GUARD[^\n]*\n.*?    # END META SETUP GUARD\n','',s,flags=re.S);p.write_text(s)
Path('/opt/postqube/postqube.nginx.conf').write_text(s)
subprocess.run(['nginx','-t'],check=True);subprocess.run(['systemctl','reload','nginx'],check=True)
Path('/opt/postqube/branding/config.json').write_text(json.dumps({'name':'Postqube','instagramReady':True})+'\n')
print('Instagram connection flow enabled. Complete authorization with a Meta tester account and verify publishing; public use still depends on Meta app permissions/review.')
