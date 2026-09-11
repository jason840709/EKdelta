#!/usr/bin/env python3
"""Audit the actual single-file product, its literal documents, and assets.

This is a static/source-content gate. It does not emulate browser layout,
filesystem permissions, IndexedDB, user interaction, or full application startup.
"""
from __future__ import annotations

import argparse
import base64
from collections import Counter
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import sys


class ProductParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.scripts = []
        self.handlers = []
        self.attributes = []
        self.visible = []
        self.ids = Counter()
        self.meta = {}
        self.title = ''
        self.active_script = None
        self.in_style = False
        self.in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        line = self.getpos()[0]
        if attrs.get('id'):
            self.ids[attrs['id']] += 1
        for key, value in attrs.items():
            if value is None:
                continue
            self.attributes.append({'tag': tag, 'attribute': key, 'text': value, 'line': line})
            if key.lower().startswith('on'):
                self.handlers.append({'attribute': key, 'text': value, 'line': line})
        if tag == 'script':
            self.active_script = {'attrs': attrs, 'line': line, 'text': ''}
            self.scripts.append(self.active_script)
        elif tag == 'style':
            self.in_style = True
        elif tag == 'title':
            self.in_title = True
        elif tag == 'meta' and attrs.get('name'):
            self.meta[attrs['name']] = attrs.get('content', '')

    def handle_endtag(self, tag):
        if tag == 'script':
            self.active_script = None
        elif tag == 'style':
            self.in_style = False
        elif tag == 'title':
            self.in_title = False

    def handle_data(self, data):
        if self.active_script is not None:
            self.active_script['text'] += data
        elif not self.in_style:
            self.visible.append(data)
            if self.in_title:
                self.title += data

    def handle_entityref(self, name):
        self.handle_data(unescape(f'&{name};'))

    def handle_charref(self, name):
        self.handle_data(unescape(f'&#{name};'))


DATA_URI = re.compile(r'data:([^\s,;"\'()<>]+)(?:;[^\s,"\'()<>]+)*;base64,([A-Za-z0-9+/]+={0,2})', re.I)
LONG_BASE64 = re.compile(r'(?<=[\'"`])[A-Za-z0-9+/]{120,}={0,2}(?=[\'"`])')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_product(path, constants):
    text = path.read_text(encoding='utf-8')
    parser = ProductParser()
    parser.feed(text)
    parser.close()
    payload = {'scripts': parser.scripts, 'handlers': parser.handlers, 'constants': constants}
    process = subprocess.run(
        ['node', '--experimental-vm-modules', str(Path(__file__).with_name('check_scripts.cjs'))],
        input=json.dumps(payload), text=True, capture_output=True, check=False)
    if process.returncode:
        raise RuntimeError(f'JavaScript audit failed: {process.stderr.strip()}')
    return text, parser, json.loads(process.stdout)


def assets(text, constants):
    uri_hashes = Counter()
    invalid = []
    for match in DATA_URI.finditer(text):
        try:
            data = base64.b64decode(match[2], validate=True)
        except ValueError as error:
            invalid.append({'mime': match[1], 'message': str(error)})
            continue
        uri_hashes[f'{match[1].lower()}:{digest(data)}'] += 1
    embedded = {}
    for name, value in constants.items():
        if not isinstance(value, dict) or not name.endswith('_B64'):
            continue
        for filename, encoded in value.items():
            try:
                data = base64.b64decode(encoded, validate=True)
                embedded[f'{name}/{filename}'] = digest(data)
            except (ValueError, TypeError) as error:
                invalid.append({'asset': f'{name}/{filename}', 'message': str(error)})
    return uri_hashes, embedded, invalid


def without_payloads(text):
    # Skip encoded bytes while still scanning MIME names, labels and references.
    text = DATA_URI.sub(lambda m: f'data:{m[1]};base64,[encoded asset]', text)
    return LONG_BASE64.sub('[encoded asset]', text)


def find_forbidden(text, forbidden, allow_matches, label):
    text = without_payloads(text)
    allowed_ranges = [(m.start(), m.end()) for value in allow_matches
                      for m in re.finditer(re.escape(value), text, flags=re.I)]
    found = []
    for needle in forbidden:
        for match in re.finditer(re.escape(needle), text, flags=re.I):
            if any(start <= match.start() and match.end() <= end for start, end in allowed_ranges):
                continue
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 65)
            found.append({'kind': 'forbidden-text', 'source': label, 'token': needle,
                          'line': text.count('\n', 0, match.start()) + 1,
                          'context': text[start:end].replace('\n', ' ')})
    return found


def main():
    command = argparse.ArgumentParser(description=__doc__)
    command.add_argument('product', type=Path)
    command.add_argument('--baseline', type=Path, help='Original product, read only; compare embedded asset bytes')
    command.add_argument('--forbid', action='append', default=[], help='Case-insensitive forbidden text; repeatable')
    command.add_argument('--allow-match', action='append', default=[], help='Exact unrelated word exempted from substring matching')
    command.add_argument('--constant', action='append', default=[], help='Additional literal constant to extract')
    command.add_argument('--require-constant', action='append', default=[])
    command.add_argument('--vendor-index', type=int, action='append', default=[], help='One-based script index whose bytes must match baseline')
    command.add_argument('--vendor-id', action='append', default=[], help='Script ID whose bytes must match baseline')
    command.add_argument('--allow-removed-data-uri', action='append', default=[], help='Expected baseline data-URI digest removed during public-content cleanup')
    command.add_argument('--name', help='Required document title')
    command.add_argument('--version', help='Required APP_VERSION and leading version-history entry')
    command.add_argument('--report', type=Path, help='Write a JSON audit report')
    args = command.parse_args()
    text, parsed, javascript = read_product(args.product, args.constant)
    failures = list(javascript['failures'])
    constants = javascript['constants']
    if not javascript['scripts']:
        failures.append({'kind': 'missing-scripts'})
    if args.name and parsed.title != args.name:
        failures.append({'kind': 'title', 'expected': args.name, 'actual': parsed.title})
    for name in args.require_constant:
        if name not in constants:
            failures.append({'kind': 'missing-constant', 'name': name})
    if args.version:
        if constants.get('APP_VERSION') != args.version:
            failures.append({'kind': 'version', 'actual': constants.get('APP_VERSION'), 'expected': args.version})
        history = constants.get('VERSION_HISTORY')
        if not history or not str(history[0].get('v', '')).startswith(args.version):
            failures.append({'kind': 'version-history', 'expected': args.version})
    for name, count in parsed.ids.items():
        if count > 1:
            failures.append({'kind': 'duplicate-dom-id', 'id': name, 'count': count})
    failures += find_forbidden(text, args.forbid, args.allow_match, 'html-source')
    failures += find_forbidden(''.join(parsed.visible), args.forbid, args.allow_match, 'visible-html')
    for item in parsed.attributes:
        failures += find_forbidden(item['text'], args.forbid, args.allow_match,
                                   f"attribute:{item['tag']}:{item['attribute']}:{item['line']}")
    for name, value in constants.items():
        if name.endswith('_B64'):
            continue
        failures += find_forbidden(value if isinstance(value, str) else json.dumps(value, ensure_ascii=False),
                                   args.forbid, args.allow_match, f'constant:{name}')
    uris, embedded, invalid = assets(text, constants)
    failures += [{'kind': 'invalid-asset', **item} for item in invalid]
    asset_result = {'dataUriOccurrences': sum(uris.values()), 'uniqueDataUris': len(uris),
                    'embeddedFiles': len(embedded), 'baselineCompared': bool(args.baseline), 'vendors': []}
    if args.baseline:
        baseline_text, baseline_parser, baseline_js = read_product(args.baseline, args.constant)
        old_uris, old_embedded, old_invalid = assets(baseline_text, baseline_js['constants'])
        if old_invalid:
            failures.append({'kind': 'baseline-invalid-assets', 'count': len(old_invalid)})
        if old_uris != uris:
            removed = old_uris - uris
            for item in args.allow_removed_data_uri:
                removed.pop(item, None)
            added = uris - old_uris
            if removed or added:
                failures.append({'kind': 'data-uri-change', 'removed': dict(removed), 'added': dict(added)})
        if old_embedded != embedded:
            changed = [name for name in old_embedded.keys() | embedded.keys() if old_embedded.get(name) != embedded.get(name)]
            failures.append({'kind': 'embedded-file-change', 'files': changed})
        pairs = []
        for index in args.vendor_index:
            try:
                pairs.append((f'index:{index}', parsed.scripts[index - 1]['text'], baseline_parser.scripts[index - 1]['text']))
            except IndexError:
                failures.append({'kind': 'missing-vendor-script', 'index': index})
        for identity in args.vendor_id:
            new = next((s['text'] for s in parsed.scripts if s['attrs'].get('id') == identity), None)
            old = next((s['text'] for s in baseline_parser.scripts if s['attrs'].get('id') == identity), None)
            if new is None or old is None:
                failures.append({'kind': 'missing-vendor-script', 'id': identity})
            else:
                pairs.append((f'id:{identity}', new, old))
        for label, new, old in pairs:
            equal = new == old
            asset_result['vendors'].append({'label': label, 'unchanged': equal, 'sha256': digest(new.encode())})
            if not equal:
                failures.append({'kind': 'vendor-script-change', 'label': label})
    elif args.vendor_id or args.vendor_index:
        failures.append({'kind': 'baseline-required-for-vendor-check'})
    summary_constants = {name: {'type': type(value).__name__, 'length': len(value) if hasattr(value, '__len__') else None}
                         for name, value in constants.items()}
    report = {'product': args.product.name, 'passed': not failures,
              'scope': 'HTML structure, executable syntax, literal built-in content, configured branding, embedded asset bytes',
              'runtimeVerified': False, 'scripts': javascript['scripts'], 'handlerCount': len(javascript['handlers']),
              'constants': summary_constants, 'assets': asset_result, 'failures': failures}
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())
