#!/usr/bin/env python3
"""Set services.<service>.image in compose.override.yaml, preserving every other setting.

usage: pin-image.py <compose-dir> <service> <image>
"""
import os
import sys
from pathlib import Path
import yaml

directory, service, image = sys.argv[1:4]
path = Path(directory) / 'compose.override.yaml'
doc = yaml.safe_load(path.read_text()) if path.exists() else None
doc = doc or {}
doc.setdefault('services', {}).setdefault(service, {})
doc['services'][service] = doc['services'][service] or {}
doc['services'][service]['image'] = image
# Keep the existing file's mode (it may hold secrets); new files are 0600.
mode = path.stat().st_mode & 0o777 if path.exists() else 0o600
tmp = path.with_suffix('.yaml.tmp')
fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(yaml.safe_dump(doc, sort_keys=False))
os.chmod(tmp, mode)
tmp.replace(path)
