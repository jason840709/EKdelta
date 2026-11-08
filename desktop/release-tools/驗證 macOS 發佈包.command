#!/bin/bash
# Electron 1.2.7 Full-only rebase — macOS release QA.
# source / dist / shell / fake Engine / direct stream / real Full Engine 一次驗完，最後封小型 QA ZIP。
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
mkdir -p verify/results
STAMP="$(date +%Y%m%d_%H%M%S)"
REPORT="verify/results/mac_release_report_${STAMP}.txt"
QA_DIR="verify/results/mac_qa_${STAMP}"
mkdir -p "$QA_DIR"
exec > >(tee "$REPORT") 2>&1
pass=0; fail=0
ok(){ echo "PASS  $*"; pass=$((pass+1)); }
bad(){ echo "FAIL  $*"; fail=$((fail+1)); }
info(){ echo "INFO  $*"; }
printf 'EKdelta Electron 1.2.7 Full-only macOS release verification\nDate: %s\nRoot: %s\n\n' "$(date)" "$ROOT"

if [ "$(uname -s)" = "Darwin" ]; then ok "macOS host"; else bad "這支驗證器必須在 macOS 執行"; fi

echo '=== Portable source gate ==='
if python3 verify/verify_release.py; then ok "v1.2.7 portable static gate"; else bad "v1.2.7 portable static gate"; fi
cp verify/results/static.json "$QA_DIR/static.json" 2>/dev/null || true
if [ -f package-lock.json ]; then
  ok "package-lock.json 已存在（後續 build 可 npm ci）"
  cp package-lock.json "$QA_DIR/package-lock.json"
  /usr/bin/shasum -a 256 package-lock.json > "$QA_DIR/package-lock_SHA256.txt" 2>/dev/null || true
else
  bad "package-lock.json 不存在；請先完成一次『製作 macOS 安裝包.command』"
fi

echo; echo '=== dist artifacts ==='
if [ -d dist ]; then
  find dist -maxdepth 3 \( -name '*.app' -o -name '*.dmg' -o -name '*.pkg' -o -name '*.zip' \) -print | while IFS= read -r f; do du -sh "$f" 2>/dev/null || true; done
else bad "dist/ 不存在；請先雙擊『製作 macOS 安裝包.command』"; fi
APP_PATH="$(find dist -maxdepth 3 -type d -name 'EKdelta Desktop.app' -print -quit 2>/dev/null || true)"
if [ -n "$APP_PATH" ] && [ -d "$APP_PATH" ]; then
  ok "找到 EKdelta Desktop.app"; echo "App: $APP_PATH"; du -sh "$APP_PATH" || true
  if /usr/bin/codesign --verify --deep --strict "$APP_PATH" >/dev/null 2>&1; then ok "codesign verify"; else info "codesign 尚未通過（內部 unsigned build 可接受；公開散布前要簽章/公證）"; fi
else bad "找不到 EKdelta Desktop.app"; fi
for ext in pkg dmg zip; do n=$(find dist -maxdepth 2 -type f -name "*.$ext" 2>/dev/null | wc -l | tr -d ' '); [ "$n" -gt 0 ] && ok "找到 .$ext 產物 ($n)" || bad "缺 .$ext 產物"; done
{
 echo '# dist SHA-256'
 find dist -maxdepth 2 -type f \( -name '*.dmg' -o -name '*.pkg' -o -name '*.zip' \) -print0 2>/dev/null | sort -z | while IFS= read -r -d '' f; do /usr/bin/shasum -a 256 "$f"; done
} > "$QA_DIR/dist_SHA256.txt" 2>/dev/null || true

USERDATA="$HOME/Library/Application Support/EKdelta"
ENGINE="$USERDATA/engine"
echo; echo '=== installed Full Engine ==='
if [ -d "$ENGINE" ]; then
  ok "找到單一 Engine 目錄：$ENGINE"
  python3 - "$ENGINE" > "$QA_DIR/engine_status.json" <<'PY2'
import json,sys,os,hashlib
names=['busytex.js','busytex.wasm','busytex_pipeline.js','texlive-recommended.js','texlive-recommended.data']
d=sys.argv[1]; out={'dir':d,'files':{}}
for n in names:
 p=os.path.join(d,n); row={'exists':os.path.isfile(p)}
 if row['exists']:
  row['bytes']=os.path.getsize(p); h=hashlib.sha256()
  with open(p,'rb') as f:
   for b in iter(lambda:f.read(4*1024*1024),b''): h.update(b)
  row['sha256']=h.hexdigest()
 out['files'][n]=row
print(json.dumps(out,ensure_ascii=False,indent=2))
PY2
else bad "找不到 $ENGINE；請先在 App 裡安裝 Full Engine Pack"; fi

if [ -x node_modules/.bin/electron ]; then
  echo; echo '=== Electron shell E2E ==='
  rm -f /tmp/e2e_result.json /tmp/e2e_engine.json /tmp/e2e_direct_stream.json /tmp/e2e_real_engine.json
  if node_modules/.bin/electron verify/e2e_probe.js >/dev/null 2>&1 && [ -f /tmp/e2e_result.json ]; then
    cp /tmp/e2e_result.json "$QA_DIR/e2e_shell.json"
    if python3 - <<'PY3'
import json,sys
d=json.load(open('/tmp/e2e_result.json'))
for x in d.get('steps',[]): print(('PASS ' if x.get('ok') else 'FAIL ')+x.get('n','')+' — '+str(x.get('d',''))[:180])
sys.exit(0 if d.get('steps') and all(x.get('ok') for x in d['steps']) else 1)
PY3
    then ok "shell E2E all green"; else bad "shell E2E has failures"; fi
  else bad "shell E2E 未完成"; fi

  if node_modules/.bin/electron verify/e2e_engine_probe.js >/dev/null 2>&1 && [ -f /tmp/e2e_engine.json ]; then
    cp /tmp/e2e_engine.json "$QA_DIR/e2e_engine_bridge.json"
    if python3 - <<'PY4'
import json,sys
d=json.load(open('/tmp/e2e_engine.json'))
for x in d.get('steps',[]): print(('PASS ' if x.get('ok') else 'FAIL ')+x.get('n','')+' — '+str(x.get('d',''))[:180])
sys.exit(0 if d.get('steps') and all(x.get('ok') for x in d['steps']) else 1)
PY4
    then ok "engine bridge E2E all green"; else bad "engine bridge E2E has failures"; fi
  else bad "engine bridge E2E 未完成"; fi

  if node_modules/.bin/electron verify/e2e_direct_stream_probe.js >/dev/null 2>&1 && [ -f /tmp/e2e_direct_stream.json ]; then
    cp /tmp/e2e_direct_stream.json "$QA_DIR/e2e_direct_stream.json"
    if python3 - <<'PY5'
import json,sys
d=json.load(open('/tmp/e2e_direct_stream.json'))
for x in d.get('steps',[]): print(('PASS ' if x.get('ok') else 'FAIL ')+x.get('n','')+' — '+str(x.get('d',''))[:180])
sys.exit(0 if d.get('steps') and all(x.get('ok') for x in d['steps']) else 1)
PY5
    then ok "direct 199MB stream regression gate all green"; else bad "direct 199MB stream regression gate has failures"; fi
  else bad "direct stream E2E 未完成"; fi

  if [ -d "$ENGINE" ]; then
    EKDETA_ENGINE_DIR="$ENGINE" node_modules/.bin/electron verify/e2e_real_engine_probe.js >/dev/null 2>&1 || true
    if [ -f /tmp/e2e_real_engine.json ]; then
      cp /tmp/e2e_real_engine.json "$QA_DIR/e2e_real_engine.json"
      if python3 - <<'PY6'
import json,sys
d=json.load(open('/tmp/e2e_real_engine.json'))
for x in d.get('steps',[]): print(('PASS ' if x.get('ok') else 'FAIL ')+x.get('n','')+' — '+str(x.get('d',''))[:220])
sys.exit(0 if d.get('steps') and all(x.get('ok') for x in d['steps']) else 1)
PY6
      then ok "real Full direct-stream initialization"; else bad "real Full direct-stream initialization"; fi
    else bad "real Full Engine probe 未產生結果"; fi
  fi
else
  info "node_modules/.bin/electron 不存在；不自動下載套件，略過 Electron E2E。"
fi

echo; echo "RESULT: PASS=$pass FAIL=$fail"; echo "Report: $REPORT"
cp "$REPORT" "$QA_DIR/" 2>/dev/null || true
QA_ZIP="verify/results/EKdelta_1.2.7_FULLONLY_Mac_QA_${STAMP}.zip"
/usr/bin/zip -q -r "$QA_ZIP" "$QA_DIR" "$REPORT" 2>/dev/null || true
[ -f "$QA_ZIP" ] && echo "QA package: $QA_ZIP"
/usr/bin/open "$(dirname "$REPORT")" 2>/dev/null || true
if [ "$fail" -eq 0 ]; then
 /usr/bin/osascript -e 'display dialog "macOS 發佈包驗證完成：全部通過。" buttons {"好"} default button 1 with icon note' >/dev/null 2>&1 || true
 exit 0
else
 /usr/bin/osascript -e 'display dialog "macOS 發佈包驗證完成，但有失敗項目。請查看 verify/results 裡的報告。" buttons {"好"} default button 1 with icon caution' >/dev/null 2>&1 || true
 exit 1
fi
