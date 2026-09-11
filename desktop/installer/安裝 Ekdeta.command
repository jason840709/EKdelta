#!/bin/bash
# Ekdeta 基礎安裝器（macOS）
# 使用方式：把這支 .command 與「Ekdeta.app」放在同一個發佈資料夾，雙擊即可。
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SEARCH_ROOT="$(cd "$HERE/.." && pwd)"

# 找預先建置好的 app。優先同層，其次發佈資料夾內三層。
APP=""
for c in \
  "$HERE/Ekdeta.app" \
  "$SEARCH_ROOT/Ekdeta.app" \
  "$SEARCH_ROOT/dist/mac/Ekdeta.app" \
  "$SEARCH_ROOT/dist/mac-arm64/Ekdeta.app" \
  "$SEARCH_ROOT/dist/mac-x64/Ekdeta.app" \
  "$SEARCH_ROOT/dist/mac-universal/Ekdeta.app"; do
  if [ -d "$c" ]; then APP="$c"; break; fi
done
if [ -z "$APP" ]; then
  APP="$(/usr/bin/find "$SEARCH_ROOT" -maxdepth 4 -type d -name 'Ekdeta.app' -print -quit 2>/dev/null || true)"
fi

if [ -z "$APP" ] || [ ! -d "$APP" ]; then
  /usr/bin/osascript <<'APPLESCRIPT'
display dialog "找不到「Ekdeta.app」。\n\n這支是安裝器，不是建置工具。請把它和預先建置好的 Ekdeta.app 放在同一個發佈資料夾後再雙擊。" buttons {"好"} default button 1 with icon stop
APPLESCRIPT
  exit 2
fi

TARGET="/Applications/Ekdeta.app"
export EKDETA_HTML_SOURCE="$APP"
export EKDETA_HTML_TARGET="$TARGET"

# 先確認是否覆蓋舊版。
if [ -d "$TARGET" ]; then
  set +e
  /usr/bin/osascript <<'APPLESCRIPT'
set r to display dialog "「應用程式」裡已經有 Ekdeta。要用這個版本取代嗎？\n\n文件與 HTML 版本庫存在使用者資料夾，不會因為取代 App 而刪除。" buttons {"取消", "取代"} default button "取代" cancel button "取消" with icon caution
APPLESCRIPT
  rc=$?
  set -e
  [ "$rc" -eq 0 ] || exit 0
fi

# 用 macOS 原生管理員授權對話框安裝到 /Applications，不要求使用者學 sudo。
set +e
/usr/bin/osascript <<'APPLESCRIPT'
set sourcePath to system attribute "EKDETA_HTML_SOURCE"
set targetPath to system attribute "EKDETA_HTML_TARGET"
try
  do shell script "/bin/rm -rf " & quoted form of targetPath & " && /usr/bin/ditto " & quoted form of sourcePath & " " & quoted form of targetPath with administrator privileges
on error errMsg number errNum
  if errNum is -128 then error number -128
  display dialog "安裝失敗：" & errMsg buttons {"好"} default button 1 with icon stop
  error number -128
end try
APPLESCRIPT
rc=$?
set -e
[ "$rc" -eq 0 ] || exit 0

if [ -d "$TARGET" ]; then
  /usr/bin/osascript <<'APPLESCRIPT'
display dialog "Ekdeta 已安裝完成。\n\n第一次開啟時，程式會引導你是否要安裝 LaTeX Engine Pack；一般 Markdown 與公式輸入不需要先裝引擎。" buttons {"打開 Ekdeta"} default button 1 with icon note
APPLESCRIPT
  /usr/bin/open "$TARGET"
else
  /usr/bin/osascript -e 'display dialog "安裝沒有完成，請再試一次。" buttons {"好"} default button 1 with icon stop'
  exit 3
fi
