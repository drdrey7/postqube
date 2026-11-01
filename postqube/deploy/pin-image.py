#!/usr/bin/env python3
"""Set services.<service>.image in compose.override.yaml, preserving every other setting.

usage: pin-image.py <compose-dir> <service> <image>
"""
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
tmp = path.with_suffix('.yaml.tmp')
tmp.write_text(yaml.safe_dump(doc, sort_keys=False))
tmp.replace(path)
