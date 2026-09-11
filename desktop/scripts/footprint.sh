#!/usr/bin/env bash
# 量測真實磁碟佔用。★ 只報告，不刪任何東西。
# 快取目錄是「跨專案共用」的，可能別的專案也在用；要不要清由你決定。
set -u
say(){ printf '%-52s %s\n' "$1" "$2"; }
sz(){ [ -e "$1" ] && du -sh "$1" 2>/dev/null | cut -f1 || echo "—"; }

echo "===== 專案內 ====="
say "原始碼 src/"            "$(sz src)"
say "出廠 HTML resources/"   "$(sz resources)"
say "node_modules（不進安裝檔）" "$(sz node_modules)"
say "打包產物 dist/"          "$(sz dist)"
[ -d dist ] && find dist -maxdepth 2 \( -name '*.dmg' -o -name '*.zip' -o -name '*.AppImage' -o -name '*.exe' \) -exec du -h {} \; 2>/dev/null

echo
echo "===== 使用者資料（app 執行後才會有）====="
case "$(uname -s)" in
  Darwin) UD="$HOME/Library/Application Support/Ekdeta" ;;
  *)      UD="${XDG_CONFIG_HOME:-$HOME/.config}/Ekdeta" ;;
esac
say "資料夾"                 "$UD"
say "HTML 版本庫"            "$(sz "$UD/html")"
say "引擎"                   "$(sz "$UD/engine")"
say "blob_storage（執行期暫存）" "$(sz "$UD/blob_storage")"
say "Cache"                    "$(sz "$UD/Cache")"
say "Code Cache"               "$(sz "$UD/Code Cache")"
say "GPUCache"                  "$(sz "$UD/GPUCache")"
[ -d "$UD/html" ] && ls -1sh "$UD/html" 2>/dev/null | tail -n +2

echo
echo "===== 共用快取（不會進安裝檔；★ 本腳本不會刪）====="
case "$(uname -s)" in
  Darwin) say "Electron 下載快取" "$(sz "$HOME/Library/Caches/electron")"
          say "electron-builder 快取" "$(sz "$HOME/Library/Caches/electron-builder")" ;;
  *)      say "Electron 下載快取" "$(sz "$HOME/.cache/electron")"
          say "electron-builder 快取" "$(sz "$HOME/.cache/electron-builder")" ;;
esac
echo
echo "提示：快取可安全刪除（下次打包會重新下載），但那是跨專案共用的目錄，"
echo "      如果你電腦上還有別的 Electron 專案，刪掉會讓它們也要重下。要刪請自己動手。"
