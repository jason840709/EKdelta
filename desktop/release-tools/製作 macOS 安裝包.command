#!/bin/bash
# Electron 1.2.5 Full-only rebase：在 Mac 上雙擊，建立 .dmg / .pkg / .zip 與基礎 .command 安裝器。
set -Eeuo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUILD_STARTED=0
on_error() {
  rc=$?
  line="${BASH_LINENO[0]:-?}"
  echo
  echo "============================================================"
  echo "❌ macOS 安裝包製作失敗（exit $rc，line $line）"
  echo "專案：$ROOT"
  echo "若 dist/ 已有舊產物，請不要把它們當成這次成功產生的版本。"
  echo "============================================================"
  /usr/bin/osascript -e 'display dialog "macOS 安裝包製作失敗。\n\n請回到 Terminal 查看最後一段紅色／錯誤訊息。這次沒有完成新的安裝包。" buttons {"好"} default button 1 with icon stop' >/dev/null 2>&1 || true
  echo
  read -r -n 1 -s -p "按任意鍵關閉這個建置視窗…" || true
  echo
  exit "$rc"
}
trap on_error ERR

if [ "$(uname -s)" != "Darwin" ]; then
  echo "這支建置器只能在 macOS 執行。"
  exit 2
fi

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  /usr/bin/osascript <<'APPLESCRIPT'
set r to display dialog "這台 Mac 還沒有 Node.js。\n\n只有『製作安裝包的人』需要 Node.js；一般使用者不需要。" buttons {"取消", "打開 Node.js 下載頁"} default button 2 cancel button 1 with icon caution
if button returned of r is "打開 Node.js 下載頁" then open location "https://nodejs.org/en/download"
APPLESCRIPT
  exit 3
fi

node sync_app_html.js
APPVER="$(/usr/bin/grep -m1 "const APP_VERSION" resources/default/app.html | /usr/bin/sed -E "s/.*'([^']+)'.*/\1/")"
echo "Ekdeta 內建 HTML 版本：$APPVER"
echo "Node: $(node --version)"
echo "npm : $(npm --version)"
echo "專案：$ROOT"

# schema 預檢：防止再出現 pkg.readme 這種 electron-builder 25 不接受的欄位。
node - <<'NODE'
const p = require('./package.json');
const pkg = (p.build && p.build.pkg) || {};
if (Object.prototype.hasOwnProperty.call(pkg, 'readme')) {
  console.error('package.json 錯誤：build.pkg.readme 不受 electron-builder 25.0.0 支援。');
  process.exit(21);
}
console.log('PKG schema 預檢：OK（沒有 build.pkg.readme）');
NODE

# 如果已有 lockfile 就完全照 lockfile；第一次建立維護環境時才 npm install 並留下 lockfile。
if [ -f package-lock.json ]; then
  echo "偵測到 package-lock.json：使用 npm ci 重建固定版本依賴。"
  npm ci --no-audit --no-fund
else
  echo "第一次建立建置環境：產生 package-lock.json。完成後請把 lockfile 一起保存於原始碼版本庫。"
  npm install --no-audit --no-fund
fi
[ -f package-lock.json ] || { echo "建置依賴安裝後仍沒有 package-lock.json；拒絕繼續。"; exit 26; }
echo "lockfile SHA-256: $(/usr/bin/shasum -a 256 package-lock.json | awk '{print $1}')"

ARCH="$(uname -m)"
BUILD_STARTED=1
case "$ARCH" in
  arm64) npm run dist:mac:arm64 ;;
  x86_64) npm run dist:mac:x64 ;;
  *) echo "不支援的 Mac 架構：$ARCH"; exit 4 ;;
esac

# 整理「一般使用者」看到的基礎安裝資料夾：只有 App、雙擊安裝器、說明。
INSTALLDIR="dist/Ekdeta_基礎安裝"
rm -rf "$INSTALLDIR"
mkdir -p "$INSTALLDIR"
APP_PATH="$(find dist -maxdepth 3 -type d -name 'Ekdeta.app' -print -quit 2>/dev/null || true)"
if [ -n "$APP_PATH" ] && [ -d "$APP_PATH" ]; then
  /usr/bin/ditto "$APP_PATH" "$INSTALLDIR/Ekdeta.app"
else
  echo "找不到打包後的 Ekdeta.app。"
  exit 22
fi
cp "installer/安裝 Ekdeta.command" "$INSTALLDIR/"
cp "installer/README_給使用者.txt" "$INSTALLDIR/"

# 至少確認三種主要發佈物真的存在。
DMG_PATH="$(find dist -maxdepth 2 -type f -name '*.dmg' -print -quit 2>/dev/null || true)"
PKG_PATH="$(find dist -maxdepth 2 -type f -name '*.pkg' -print -quit 2>/dev/null || true)"
ZIP_PATH="$(find dist -maxdepth 2 -type f -name '*.zip' -print -quit 2>/dev/null || true)"
[ -n "$DMG_PATH" ] || { echo "找不到 .dmg 產物"; exit 23; }
[ -n "$PKG_PATH" ] || { echo "找不到 .pkg 產物"; exit 24; }
[ -n "$ZIP_PATH" ] || { echo "找不到 .zip 產物"; exit 25; }

npm run footprint || true

echo
echo "============================================================"
echo "✅ macOS 安裝包建立完成"
echo "產物資料夾：$ROOT/dist"
echo "DMG : $DMG_PATH"
echo "PKG : $PKG_PATH"
echo "ZIP : $ZIP_PATH"
echo "基礎安裝資料夾：$ROOT/$INSTALLDIR"
echo "============================================================"

/usr/bin/open "$ROOT/dist"
/usr/bin/osascript <<APPLESCRIPT
set msg to "macOS 安裝包已建立完成。\n\n產物在：\n$ROOT/dist\n\n給使用者時，可用 .dmg（拖入 Applications）、.pkg（逐步安裝精靈），或『Ekdeta_基礎安裝』裡的 App + .command。"
display dialog msg buttons {"打開產物資料夾"} default button 1 with icon note
APPLESCRIPT
