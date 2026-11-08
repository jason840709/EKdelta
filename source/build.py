#!/usr/bin/env python3
"""Assemble EKdelta's single HTML file without changing classic-script order."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent
VERSION = '1.2.8'
CHECKPOINT = 'CP188'
BUILD = 'CP188-INTERFACE-PAPERTOOLS-DESKTOP-1.2.8'

def sha(data):
    return hashlib.sha256(data).hexdigest()

def js_value(value):
    # Markdown may contain closing HTML tags; escape before placing in a script.
    return json.dumps(value, ensure_ascii=False).replace('</', '<\\/')

def assemble():
    sources = {}
    modules = []
    def read(name):
        path = ROOT / name
        path.resolve().relative_to(ROOT)
        data = path.read_bytes()
        sources[name] = {'bytes': len(data), 'sha256': sha(data)}
        return data.decode('utf-8')
    def document(match):
        kind, name = match.group(1, 2)
        raw = read(name)
        return js_value(json.loads(raw) if kind == 'json' else raw.rstrip('\n'))
    def script(match):
        name = match.group(1)
        raw = read(name)
        raw = re.sub(r'/\*@(text|json):([^@]+)@\*/', document, raw)
        if re.search(r'</script\s*>', raw, re.I):
            raise ValueError('Unescaped closing script tag: ' + name)
        modules.append({'file': name, 'bytes': len(raw.encode()), 'sha256': sha(raw.encode())})
        return raw
    html = read('src/template.html')
    vendor = json.loads(read('src/vendor-hashes.json'))
    for name, expected in vendor.items():
        if sha((ROOT/name).read_bytes()) != expected:
            raise ValueError('Upstream vendor changed: ' + name)
    html = re.sub(r'/\*@script:([^@]+)@\*/', script, html)
    # Hash the assembler as well as all runtime inputs; no wall-clock timestamp.
    read('build.py')
    manifest = {'build': CHECKPOINT, 'name': 'PDF-VIEW-EKDELTA', 'app_version': VERSION,
                'checkpoint': CHECKPOINT, 'app_build': BUILD,
                'source_truth': 'src/template.html + src/scripts + docs + templates + build.py',
                'modules': modules, 'sources': dict(sorted(sources.items())),
                'verification_status': 'See VALIDATION.md for executed checks and limits.'}
    assert html.count('/*@manifest@*/') == 1
    html = html.replace('/*@manifest@*/', js_value(manifest))
    if re.search(r'/\*@(?:script|text|json|manifest)', html):
        raise ValueError('Unresolved source marker')
    assert f"const APP_VERSION = '{VERSION}';" in html
    assert f'name="ekdeta-version" content="{VERSION}"' in html
    return html, manifest

def check_syntax(html):
    scripts = []
    for opening, body in re.findall(r'(<script\b[^>]*>)([\s\S]*?)</script\s*>', html, re.I):
        # text/plain blocks carry vendor ES modules as data (PDF.js); their bytes are fixed by vendor-hashes.json
        if 'application/json' not in opening and 'text/plain' not in opening:
            scripts.append(body)
    probe = "const vm=require('vm'),fs=require('fs');const s=JSON.parse(fs.readFileSync(0,'utf8'));s.forEach((v,i)=>new vm.Script(v,{filename:'inline-'+i+'.js'}));console.log(s.length+' executable scripts parse successfully');"
    subprocess.run([os.environ.get('EKDETA_NODE','node'), '-e', probe], input=json.dumps(scripts), text=True, check=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Verify existing product matches sources; do not write it.')
    parser.add_argument('--output', type=Path, help='Output file (for a handoff, use its single root product).')
    args=parser.parse_args()
    html, manifest=assemble()
    check_syntax(html)
    data=html.encode('utf-8')
    default_output = (ROOT.parent.parent/f'02_目前程式碼_v{VERSION}.html'
                      if ROOT.parent.name == '08_測試工具' else ROOT/f'EKdelta_v{VERSION}.html')
    path=args.output.resolve() if args.output else default_output
    path.parent.mkdir(parents=True, exist_ok=True)
    if args.check:
        if not path.exists() or path.read_bytes()!=data:
            raise SystemExit('Product differs from current sources. Run python3 build.py.')
    else:
        # Replace only after complete assembly and syntax validation have succeeded.
        with tempfile.NamedTemporaryFile(dir=path.parent, suffix='.html', delete=False) as f:
            f.write(data); staging=Path(f.name)
        staging.replace(path)
    print(path.name, len(data), sha(data))

if __name__=='__main__':
    main()
