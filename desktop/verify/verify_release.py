#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ekdeta 1.2.5 desktop static release gate; does not launch Electron."""
from pathlib import Path
import json, re, subprocess, sys, os
ROOT=Path(__file__).resolve().parent.parent
cases=[]
def check(name,ok,detail=''):
    cases.append({'name':name,'ok':bool(ok),'detail':str(detail)[:500]})
    print(('PASS ' if ok else 'FAIL ')+name+((' — '+str(detail)[:180]) if detail else ''))

pkg=json.loads((ROOT/'package.json').read_text(encoding='utf-8'))
lock=json.loads((ROOT/'package-lock.json').read_text(encoding='utf-8'))
check('product name = Ekdeta',pkg.get('productName')=='Ekdeta' and pkg.get('build',{}).get('productName')=='Ekdeta')
check('application ID = org.ekdeta.app',pkg.get('build',{}).get('appId')=='org.ekdeta.app')
check('lockfile root matches package',all(lock.get(k)==pkg.get(k) and lock['packages'][''].get(k)==pkg.get(k) for k in ['name','version']))
check('shell version = 1.2.5',pkg.get('version')=='1.2.5',pkg.get('version'))
check('electron direct version pinned',pkg.get('devDependencies',{}).get('electron')=='33.4.11',pkg.get('devDependencies',{}).get('electron'))
check('electron-builder direct version pinned',pkg.get('devDependencies',{}).get('electron-builder')=='25.0.0',pkg.get('devDependencies',{}).get('electron-builder'))
check('asar enabled',pkg.get('build',{}).get('asar') is True)
files=pkg.get('build',{}).get('files',[])
check('build whitelist excludes node_modules','src/**/*.js' in files and 'resources/default/app.html' in files and '!**/node_modules/**' in files,files)
mac_targets=pkg.get('build',{}).get('mac',{}).get('target',[])
check('mac targets include dmg/zip/pkg',all(x in mac_targets for x in ['dmg','zip','pkg']),mac_targets)
pkgcfg=pkg.get('build',{}).get('pkg',{})
check('PKG installs to /Applications',pkgcfg.get('installLocation')=='/Applications',pkgcfg)
check('PKG schema has no unsupported readme key','readme' not in pkgcfg,pkgcfg)
for rel in ['installer/pkg/welcome.html','installer/pkg/conclusion.html']:
    check(rel+' exists',(ROOT/rel).is_file())

html=(ROOT/'resources/default/app.html').read_text(encoding='utf-8',errors='replace')
m=re.search(r"const APP_VERSION\s*=\s*'([^']+)'",html)
check('factory HTML = package version',bool(m and m.group(1)==pkg['version']),m.group(1) if m else 'missing')
product = Path(os.environ['EKDETA_APP_HTML']) if os.environ.get('EKDETA_APP_HTML') else ROOT.parent/'EKdelta.html'
if not product.is_file() and not os.environ.get('EKDETA_APP_HTML'):
    legacy = ROOT.parent/('Ekdeta_v'+pkg['version']+'.html')
    if legacy.is_file(): product = legacy
check('factory HTML matches root artifact', product.is_file() and (ROOT/'resources/default/app.html').read_bytes()==product.read_bytes())
check('factory HTML has shared math-source parser','function mathSourceParts(source, context)' in html and '__CP171_MATH_SOURCE_AUTHORITY_RELEASE__' in html)
check('factory HTML removed CP5 strip-rewrap-strip preview path',"showMathPreview(editor.children[activeIndex], '$$' + tex + '$$')" not in html and 'showMathPreviewTex(mpAnchor, mpTex, mpDisplay, mpText);' in html)
check('factory HTML has per-document REVTeX settings schema','ekdeta-html-revtex-settings/1' in html and 'cp171-57a-revtex-document-settings' in html)
check('factory HTML excludes document REVTeX keys from global snapshots','function persistentSettingsSnapshot()' in html and 'isRevtexDocumentSettingKey' in html)
check('factory HTML flushes outgoing paper before switch',"flushRuntime('before-file-switch')" in html)
check('factory HTML parser absorbs settings fences','stripLeadingRevtexSettings(all)' in html and 'REVTEX_SETTINGS_LANGS.has(lang)' in html)
check('factory HTML keeps ordinary/臺灣論文 modes isolated',"otherModesUntouched:true" in html and 'function intlActive()' in html and 'K.isIntlMode()' in html)
check('factory HTML has CJK semantic preflight','cp169CjkPreflightMessage' in html and 'CJK BusyTeX 預覽已安全阻擋' in html)
check('factory HTML has no Engine-profile branch',all(x not in html for x in ['ENGINE_PROFILES','busytex-slim-v1-cp171','Lite／CP171','Full／Lite']))
check('factory HTML has no Cloudflare Insights','static.cloudflareinsights.com' not in html)
check('factory HTML contains MathLive','MathLive 0.110.0' in html or 'mathlive 0.110.0' in html.lower())
check('factory HTML has direct-package-url transport',"engineTransport:'direct-package-url'" in html or "engineTransport='direct-package-url'" in html)
check('factory HTML streams direct SHA verification','cp169VerifyDirectRoot' in html and 'cp169HashResponse' in html and 'response.body.getReader' in html)
check('worker accepts direct packageDataUrl','packageDataUrl=data.packageDataUrl||makeUrl(data.packageData' in html)
check('worker network allowlist is scoped to engine root','allowedEngineRoot&&u.startsWith(allowedEngineRoot)' in html)
check('Chrome fallback File/Blob path retained','const blob=await response.blob();' in html and "files.push(new File([blob],name" in html)
check('ordinary Markdown direct autoload is lazy','Engine 已登記；進入 REVTeX 時載入' in html and 'cp169RevtexContextActive' in html)
check('TeX panel starts deferred direct Engine','function openPanel()' in html and 'void cp169StartDirect(state.directRoot)' in html)
check('manual init can retry from directRoot',"state.directRoot?cp169StartDirect(state.directRoot):initEngine()" in html)

# syntax
for rel in ['src/main.js','src/menu.js','src/store.js','src/protocol.js','src/bridge.js','verify/e2e_probe.js','verify/e2e_engine_probe.js','verify/e2e_direct_stream_probe.js','verify/e2e_real_engine_probe.js']:
    r=subprocess.run(['node','--check',str(ROOT/rel)],capture_output=True,text=True)
    check(rel+' node --check',r.returncode==0,r.stderr.strip())
for rel in ['installer/安裝 Ekdeta.command','release-tools/製作 macOS 安裝包.command','release-tools/驗證 macOS 發佈包.command','scripts/footprint.sh','build/pkg-scripts/postinstall','release-tools/驗證真實 LaTeX 引擎與磁碟占用.command']:
    p=ROOT/rel; r=subprocess.run(['bash','-n',str(p)],capture_output=True,text=True)
    check(rel+' bash -n',r.returncode==0,r.stderr.strip())
    check(rel+' executable',os.access(p,os.X_OK),oct(p.stat().st_mode & 0o777))

main=(ROOT/'src/main.js').read_text(encoding='utf-8'); menu=(ROOT/'src/menu.js').read_text(encoding='utf-8'); store=(ROOT/'src/store.js').read_text(encoding='utf-8'); protocol=(ROOT/'src/protocol.js').read_text(encoding='utf-8'); bridge=(ROOT/'src/bridge.js').read_text(encoding='utf-8')
check('application uses Ekdeta data directory',"app.setName('Ekdeta')" in main)
check('scheme = ekdeta',"const SCHEME = 'ekdeta'" in protocol)
check('bridge API is consistent','window.__EKDETA_SHELL__ =' in bridge and '__EKDETA_SHELL__.snapshot()' in main)
check('first-run onboarding implemented','async function showOnboarding' in main and 'onboardingState()' in main)
check('Shell menu exposes Initial Setup',"T('初始設定…', 'Initial Setup…')" in menu)
check('onboarding state outside HTML','onboarding.json' in store and 'markOnboardingDone' in store)
check('single engine directory only',"engines/lite" not in store and "engines/current.json" not in store and "function engineDir()" in store)
check('shell requires reference Full sizes','installed: missing.length === 0 && differs.length === 0' in store)
check('store has no slimming branch','st.slim' not in main and 'const slim =' not in store)
check('engine protocol response is streamed','Readable.toWeb(fs.createReadStream(filePath))' in protocol)
check('engine protocol cache-control no-store',"'cache-control': 'no-store'" in protocol)
check('engine status shows transport','engineTransport' in main)
check('bridge uses product engine API','__CP169A_TEX_PROOF__' in bridge and 'engineAutoLoad' in bridge)

inst=(ROOT/'installer/安裝 Ekdeta.command').read_text(encoding='utf-8')
check('basic installer uses native admin dialog','with administrator privileges' in inst)
check('basic installer does not teach sudo/xattr','sudo ' not in inst and 'xattr ' not in inst)
ver_text='\n'.join((ROOT/x).read_text(encoding='utf-8',errors='replace') for x in ['verify/e2e_probe.js','verify/e2e_engine_probe.js','verify/e2e_direct_stream_probe.js','verify/verify_browser.py'])
check('verifiers self-contained',"pkg/02_" not in ver_text and "require('./src/" not in ver_text)
eng=(ROOT/'verify/e2e_engine_probe.js').read_text(encoding='utf-8')
check('engine probe uses streaming, not response.blob()',re.search(r'\.blob\s*\(',eng) is None and '.body.getReader()' in eng)
check('engine probe asserts direct-package-url','direct-package-url' in eng)
direct=(ROOT/'verify/e2e_direct_stream_probe.js').read_text(encoding='utf-8')
check('direct probe streams 199MB sparse fixture','ftruncateSync(fd, 199273688)' in direct and 'r.body.getReader()' in direct)
check('direct probe has blob_storage cap','blob_storage' in direct and '32*1024' in direct)
real=(ROOT/'verify/e2e_real_engine_probe.js').read_text(encoding='utf-8')
check('real engine probe enters CP171 before explicit autoload','enterIntlMode' in real and "engineAutoLoad('./engine/')" in real)
check('real engine probe requires initialized direct transport','initialized' in real and 'direct-package-url' in real)
check('real engine probe caps blob delta at 64MB','delta<64*1024' in real)

buildcmd=(ROOT/'release-tools/製作 macOS 安裝包.command').read_text(encoding='utf-8')
check('build command preflights pkg.readme','PKG schema 預檢' in buildcmd and 'build.pkg.readme' in buildcmd)
check('build command failure dialog/pause','macOS 安裝包製作失敗' in buildcmd and '按任意鍵關閉' in buildcmd)
check('build command verifies dmg/pkg/zip','找不到 .dmg 產物' in buildcmd and '找不到 .pkg 產物' in buildcmd and '找不到 .zip 產物' in buildcmd)
check('build command opens dist','/usr/bin/open "$ROOT/dist"' in buildcmd)

passed=sum(c['ok'] for c in cases)
out={'version':'1.2.5','passed':passed,'total':len(cases),'all_green':passed==len(cases),'cases':cases}
(ROOT/'verify/results').mkdir(exist_ok=True)
(ROOT/'verify/results/static.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'\n★ {passed}/{len(cases)} passed')
sys.exit(0 if out['all_green'] else 1)
