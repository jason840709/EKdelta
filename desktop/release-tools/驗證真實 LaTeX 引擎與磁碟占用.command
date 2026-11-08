#!/bin/bash
# v1.2.7 真 Engine + direct-package-url + blob_storage 真機 gate。
# 完全不修改正式 EKdelta profile：測試用臨時 userData，只 symlink 真 Engine Pack。
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
clear
printf '%s\n' 'EKdelta 1.2.7 — 真實 LaTeX Engine / blob_storage 驗證'
printf '專案：%s\n\n' "$ROOT"

if [ "$(uname -s)" != "Darwin" ]; then
  echo 'FAIL：這支驗證器必須在 macOS 執行。'
  read -r -p '按 Enter 關閉…'; exit 2
fi
if [ ! -x node_modules/.bin/electron ]; then
  echo '找不到專案本地 Electron。請先雙擊「製作 macOS 安裝包.command」建立建置環境。'
  read -r -p '按 Enter 關閉…'; exit 3
fi
ENGINE="$HOME/Library/Application Support/EKdelta/engine"
echo "真 Engine：$ENGINE"
if [ ! -d "$ENGINE" ]; then
  echo 'FAIL：找不到已安裝的 Engine Pack。'
  read -r -p '按 Enter 關閉…'; exit 4
fi

echo
cat <<'TXT'
這次測試不會碰你的正式文件、設定、HTML 版本庫或現有 blob_storage。
它會建立一個臨時 Electron profile，只把上面的真 Engine 資料夾用 symlink 接進去，
因此不會再複製一份 232 MB Engine。測完由系統 temp 機制處理臨時目錄。
TXT
echo
rm -f /tmp/e2e_real_engine.json
node_modules/.bin/electron verify/e2e_real_engine_probe.js >/dev/null 2>&1
if [ ! -f /tmp/e2e_real_engine.json ]; then
  echo 'FAIL：沒有產生真引擎驗證結果。'
  read -r -p '按 Enter 關閉…'; exit 5
fi

python3 - <<'PY'
import json,sys
p='/tmp/e2e_real_engine.json'; d=json.load(open(p))
print('\n=== 結果 ===')
for x in d.get('steps',[]): print(('PASS  ' if x.get('ok') else 'FAIL  ')+x.get('n','')+(' — '+str(x.get('d','')) if x.get('d') else ''))
print('\n真 Engine：',d.get('realEngine',''))
print('隔離測試 profile：',d.get('testUserData',''))
print('blob baseline：%.1f MB' % (d.get('baselineBlobKB',0)/1024))
print('blob after   ：%.1f MB' % (d.get('afterBlobKB',0)/1024))
print('blob delta   ：%.1f MB' % (d.get('deltaBlobKB',0)/1024))
ok=bool(d.get('steps')) and all(x.get('ok') for x in d['steps'])
print('\nRESULT:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
PY
rc=$?
if [ "$rc" -eq 0 ]; then
  /usr/bin/osascript -e 'display dialog "1.2.5 真實引擎驗證通過。\n\nBusyTeX 已用 direct-package-url 初始化，且沒有再產生約 200 MB 的 blob_storage 第二份資料。" buttons {"好"} default button 1 with icon note' >/dev/null 2>&1 || true
else
  /usr/bin/osascript -e 'display dialog "1.2.5 真實引擎驗證有失敗項目。\n\n請保存驗證結果供維護者檢查；保留原 Engine。" buttons {"好"} default button 1 with icon caution' >/dev/null 2>&1 || true
fi
echo
read -r -p '按 Enter 關閉…'
exit "$rc"
