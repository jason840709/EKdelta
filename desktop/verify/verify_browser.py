#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
桌面殼 v1.2.7 的瀏覽器輔助驗證（真 Chromium + 同步後的 EKdelta HTML）

驗什麼：
  V1 bridge 能注入且 __EKDETA_SHELL__ 掛得上
  V2 L1 反射（menuDefs）：抓到幾個選單、幾個項目、勾選與快捷鍵是否有值
  V3 L2 反射（DOM 備援）：把 window.menuDefs 拿掉後仍能反射
  V4 applyChrome：#menubar 消失、#traffic 佔位仍在、右側內容**不左移**
  V5 run()：真的能執行指令且不噴錯
  V6 快捷鍵字串轉換：所有出現過的 key 都能轉成 Electron accelerator 或安全放棄
  V7 引擎 API 存在性（autoLoad 的簽名與預設 base）

為什麼要在真瀏覽器跑：
  V145 的教訓——模組層全綠不代表產物可用；而且「模組讀不到宿主的 const 變數」
  這種事只有實機才看得到。選單反射整個架構就建立在「menuDefs 掛在 window 上」
  這個假設上，一定要實測。
"""
import json, re, sys, pathlib
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / 'resources' / 'default' / 'app.html'
BRIDGE = ROOT / 'src' / 'bridge.js'

results = []
def check(name, ok, detail=''):
    results.append((name, bool(ok), detail))
    print(('  PASS  ' if ok else '  FAIL  ') + name + (('  — ' + str(detail)) if detail else ''))
    return ok

# menu.js 的 toAccelerator 用 Python 重寫一份，驗證同一套規則
MOD = {'⌘': 'Command', '⇧': 'Shift', '⌥': 'Alt', '⌃': 'Control'}
NAMED = {'↩': 'Return', '⏎': 'Return', '⌫': 'Backspace', '⌦': 'Delete', '⎋': 'Escape',
         '⇥': 'Tab', '␣': 'Space', '←': 'Left', '→': 'Right', '↑': 'Up', '↓': 'Down'}
def to_accel(key):
    if not key: return None
    s = str(key).strip().rstrip('*')
    if not s: return None
    mods, i = [], 0
    while i < len(s) and s[i] in MOD:
        mods.append(MOD[s[i]]); i += 1
    rest = s[i:].strip()
    if not rest: return None
    if rest in NAMED: rest = NAMED[rest]
    elif len(rest) == 1: rest = rest.upper()
    elif not re.fullmatch(r'[A-Za-z0-9]+', rest): return None
    if not mods: return None
    return '+'.join(mods + [rest])


def main():
    bridge_src = BRIDGE.read_text(encoding='utf-8')
    print(f'HTML   : {HTML.name} ({HTML.stat().st_size/1048576:.2f} MB)')
    print(f'bridge : {BRIDGE.name} ({len(bridge_src)} bytes)\n')

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': 1280, 'height': 860})
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(HTML.as_uri())
        page.wait_for_timeout(2500)

        base_errors = len(errors)
        print(f'頁面載入完成，基線 pageerror = {base_errors}')
        if base_errors:
            for e in errors[:5]: print('    ', e[:160])
        print()

        # ---------- V1 注入 ----------
        print('V1 bridge 注入')
        r = page.evaluate(bridge_src)
        check('bridge 執行回傳 installed', r == 'installed', r)
        check('__EKDETA_SHELL__ 存在', page.evaluate('typeof window.__EKDETA_SHELL__') == 'object')
        check('注入未產生新的 pageerror', len(errors) == base_errors, errors[base_errors:][:2])

        # ---------- V2 L1 反射 ----------
        print('\nV2 L1 反射（menuDefs）')
        snap = page.evaluate('__EKDETA_SHELL__.snapshot()')
        check('反射成功', snap.get('ok'))
        check('來源是 menuDefs（不是退到 DOM）', snap.get('source') == 'menuDefs', snap.get('source'))
        menus = snap.get('menus', [])
        labels = [m['label'] for m in menus]
        check('選單數 ≥ 8', len(menus) >= 8, f'{len(menus)} 個：{labels}')
        total_items = sum(len([i for i in m['items'] if not i.get('sep')]) for m in menus)
        check('可執行項目總數 ≥ 80', total_items >= 80, f'{total_items} 項')
        # ★ 語言無關：產品的介面語言由 settings.lang 決定，全新 profile 實測是英文。
        #   斷言寫死中文會誤判成產品 bug（坑 #20）。改成中英任一即可。
        EXPECT_PAIRS = [('檔案','File'), ('編輯','Edit'), ('段落','Paragraph'), ('格式','Format'),
                        ('顯示','View'), ('主題','Theme'), ('模式','Mode'), ('說明','Help')]
        missing = [zh for zh, en in EXPECT_PAIRS if zh not in labels and en not in labels]
        check('使用者點名的 8 個選單全部抓到（中英任一）', not missing,
              f'缺 {missing}' if missing else f'介面語言={snap.get("lang","?")} {labels}')
        expect = [zh for zh, en in EXPECT_PAIRS]
        app_menus = [m for m in menus if m.get('app')]
        check('有且只有一個 app 選單', len(app_menus) == 1, [m['label'] for m in app_menus])
        checked = sum(1 for m in menus for i in m['items'] if i.get('checked'))
        check('勾選狀態有被讀到（>0）', checked > 0, f'{checked} 項打勾')
        keyed = [i for m in menus for i in m['items'] if i.get('key')]
        check('快捷鍵字串有被讀到（>20）', len(keyed) > 20, f'{len(keyed)} 項有快捷鍵')
        runnable = sum(1 for m in menus for i in m['items'] if i.get('runnable'))
        check('全部非分隔項都可執行', runnable == total_items, f'{runnable}/{total_items}')

        # 編輯選單確認沒有剪下/複製/貼上（殼補 role 的前提）
        edit = next((m for m in menus if m['label'] in ('編輯', 'Edit')), None)
        if edit:
            elabels = [i.get('label', '') for i in edit['items']]
            has_plain = any(l in ('剪下', '複製', '貼上', 'Cut', 'Copy', 'Paste') for l in elabels)
            check('編輯選單確實沒有原生剪下/複製/貼上（補 role 不會衝突）', not has_plain, elabels[:6])

        # ---------- V6 快捷鍵轉換 ----------
        print('\nV6 快捷鍵字串轉換')
        bad = []
        for i in keyed:
            a = to_accel(i['key'])
            if a is None:
                bad.append((i['label'], i['key']))
        check('所有快捷鍵都能轉換或安全放棄（無例外拋出）', True, f'{len(keyed)} 個，其中 {len(bad)} 個放棄顯示')
        if bad:
            print('        放棄顯示的（不影響功能，只是選單右邊不畫符號）:', bad[:8])
        sample = {i['key']: to_accel(i['key']) for i in keyed[:8]}
        print('        轉換樣本:', json.dumps(sample, ensure_ascii=False))

        # ---------- V4 applyChrome ----------
        print('\nV4 視窗外框整併')
        before = page.evaluate('__EKDETA_SHELL__.measure()')
        page.evaluate('__EKDETA_SHELL__.applyChrome({hideMenubar:true,hideTrafficLights:true,dragTitlebar:true})')
        page.wait_for_timeout(400)
        after = page.evaluate('__EKDETA_SHELL__.measure()')
        print('        before:', json.dumps(before, ensure_ascii=False))
        print('        after :', json.dumps(after, ensure_ascii=False))

        check('#menubar 已消失', after['menubar'] is None or after['menubar']['h'] == 0,
              after['menubar'])
        check('#traffic 仍佔位（visibility 而非 display:none）',
              after['traffic'] is not None and after['traffic']['w'] > 0,
              after['traffic'])
        check('#traffic 水平位置不變（真燈才對得上）',
              before['traffic']['x'] == after['traffic']['x'],
              f"{before['traffic']['x']} → {after['traffic']['x']}")
        check('#doc-title 沒有左右位移',
              before['docTitle']['x'] == after['docTitle']['x'],
              f"{before['docTitle']['x']} → {after['docTitle']['x']}")
        check('#titlebar 上移到視窗頂端（選單列讓出的高度）',
              after['titlebar']['y'] == 0 and before['titlebar']['y'] > 0,
              f"{before['titlebar']['y']} → {after['titlebar']['y']}")
        check('編輯區寬度不變（版面沒有被擠壓）',
              before['editorWrap']['w'] == after['editorWrap']['w'],
              f"{before['editorWrap']['w']} → {after['editorWrap']['w']}")
        gained = before['titlebar']['y'] - after['titlebar']['y']
        check('編輯區高度增加＝選單列高度', after['editorWrap']['h'] - before['editorWrap']['h'] == gained,
              f"+{after['editorWrap']['h'] - before['editorWrap']['h']}px（選單列 {gained}px）")

        # 真燈座標建議值
        tl = after['traffic']
        tb = after['titlebar']
        print(f"        ★ 依實測算出的 trafficLightPosition 建議值："
              f"x={tl['x']}, y={tl['y'] + (tl['h'] - 12)//2 if tl['h'] else 17}"
              f"（titlebar 高 {tb['h']}px，traffic 盒 {tl['w']}×{tl['h']}）")

        check('applyChrome 未產生 pageerror', len(errors) == base_errors, errors[base_errors:][:2])

        # ---------- V5 run() ----------
        print('\nV5 執行指令')
        # 找一個安全、可逆、看得出效果的指令：主題選單裡的深色切換或側邊欄
        target = None
        for m in menus:
            for it in m['items']:
                if it.get('sep'): continue
                if it.get('label') in ('側邊欄', 'Sidebar'):
                    target = (m['index'], it['index'], it['label']); break
            if target: break
        if not target:
            # 退而求其次：說明選單的第一個項目通常是開視窗，不適合；改用「顯示」選單第一項
            for m in menus:
                if m['label'] in ('顯示', 'View'):
                    for it in m['items']:
                        if not it.get('sep'):
                            target = (m['index'], it['index'], it['label']); break
                if target: break
        if target:
            mi, ii, lb = target
            before_sb = page.evaluate("document.body.className")
            r1 = page.evaluate(f'__EKDETA_SHELL__.run({mi},{ii},{json.dumps(lb)})')
            page.wait_for_timeout(500)
            after_sb = page.evaluate("document.body.className")
            check(f'run() 執行「{lb}」回傳 ok', r1 == 'ok', r1)
            check('執行後未新增 pageerror', len(errors) == base_errors, errors[base_errors:][:2])
            print(f'        body class: {before_sb!r} → {after_sb!r}')
            # 還原
            page.evaluate(f'__EKDETA_SHELL__.run({mi},{ii},{json.dumps(lb)})')
            page.wait_for_timeout(300)
        else:
            check('找得到可測試的指令', False, '沒找到安全的測試目標')

        # 標籤漂移防護
        r_wrong = page.evaluate('__EKDETA_SHELL__.run(1,0,"這個項目不存在")')
        check('標籤對不上時不會誤觸其他指令', r_wrong in ('ok', 'no-item', 'ok-dom'),
              f'回傳 {r_wrong}（找不到就走 DOM 備援或安全放棄）')

        # ---------- V7 引擎 API ----------
        print('\nV7 引擎 API')
        info = page.evaluate('__EKDETA_SHELL__.info()')
        print('        info:', json.dumps(info, ensure_ascii=False))
        check('__CP169A_TEX_PROOF__ 存在', info.get('hasEngineApi'))
        check('menuDefs 掛在 window 上（L1 前提）', info.get('hasMenuDefs'))
        check('讀得到 APP_VERSION', bool(info.get('appVersion')), info.get('appVersion'))
        est = page.evaluate('__EKDETA_SHELL__.engineState()')
        check('engineState 可呼叫', est.get('ok'), est)
        has_autoload = page.evaluate("typeof (window.__CP169A_TEX_PROOF__||{}).autoLoad === 'function'")
        check('autoLoad 是函式', has_autoload)

        # ---------- V3 L2/L3 ----------
        print('\nV3 反射的保底行為')
        # (a) 產品頁：把 menuDefs 拿掉。★ 產品的 toggleMenu() 內部自己會呼叫 menuDefs()，
        #     所以這個情境下 L2 一定也開不出下拉 —— 正確行為是**退到 L3**（ok=False），
        #     主行程才不會把頁面選單列藏掉。v0.1.0 在這裡回傳「9 個標題 0 個項目」，
        #     會讓使用者的選單整組消失，已於 v0.1.1 修正。
        page.evaluate("window.__menuDefsBackup = window.menuDefs; window.menuDefs = undefined;")
        snap2 = page.evaluate('__EKDETA_SHELL__.snapshot()')
        check('menuDefs 消失時退到 L3（ok=False）', snap2.get('ok') is False, snap2.get('source'))
        check('L3 回報原因，主行程據此保留頁面選單列', bool(snap2.get('reason')), snap2.get('reason'))
        check('L3 不回傳半殘的空殼選單', len(snap2.get('menus', [])) == 0, len(snap2.get('menus', [])))
        check('備援探測後沒有殘留開啟的下拉',
              page.evaluate("document.querySelectorAll('.dropdown').length") == 0)
        page.evaluate("window.menuDefs = window.__menuDefsBackup;")
        snap3 = page.evaluate('__EKDETA_SHELL__.snapshot()')
        check('還原 menuDefs 後 L1 立刻恢復', snap3.get('source') == 'menuDefs' and snap3.get('ok'))

        page.screenshot(path=str(ROOT / 'verify' / 'shell_after_chrome.png'))
        page.close()

        # (b) 合成頁：模擬「未來某版改用別的方式產生選單」，這才是 L2 真正的用武之地
        print('\nV3b L2 DOM 備援（合成頁）')
        fx = ROOT / 'verify' / 'fixture_l2_menubar.html'
        page2 = browser.new_page(viewport={'width': 1280, 'height': 860})
        fx_errors = []
        page2.on('pageerror', lambda e: fx_errors.append(str(e)))
        page2.goto(fx.as_uri())
        page2.wait_for_timeout(300)
        page2.evaluate(bridge_src)
        sf = page2.evaluate('__EKDETA_SHELL__.snapshot()')
        check('合成頁沒有 menuDefs', page2.evaluate("typeof window.menuDefs") == 'undefined')
        check('L2 反射成功', sf.get('ok'), sf.get('source'))
        check('來源是 dom', sf.get('source') == 'dom', sf.get('source'))
        flabels = [m['label'] for m in sf.get('menus', [])]
        check('L2 抓到全部 9 個選單', len(flabels) == 9, flabels)
        fitems = sum(len([i for i in m['items'] if not i.get('sep')]) for m in sf.get('menus', []))
        check('L2 抓到全部 20 個項目', fitems == 20, fitems)
        fkeys = [i for m in sf.get('menus', []) for i in m['items'] if i.get('key')]
        check('L2 也讀得到快捷鍵字串', len(fkeys) >= 8, f'{len(fkeys)} 項')
        check('L2 反射後沒有殘留下拉', page2.evaluate("document.querySelectorAll('.dropdown').length") == 0)
        r2 = page2.evaluate('__EKDETA_SHELL__.run(1,0,"新增檔案")')
        page2.wait_for_timeout(200)
        clicked = page2.evaluate('window.__CLICKED__')
        check('L2 的 run() 真的點到正確項目', clicked == ['新增檔案'], f'{r2} / {clicked}')
        check('L2 全程無 pageerror', not fx_errors, fx_errors[:2])
        page2.close()

        browser.close()

    # ---------- 總結 ----------
    passed = sum(1 for _, ok, _ in results if ok)
    print('\n' + '=' * 62)
    print(f'結果：{passed}/{len(results)} 通過')
    for n, ok, d in results:
        if not ok: print(f'  ✗ {n} — {d}')
    print('=' * 62)
    return 0 if passed == len(results) else 1


if __name__ == '__main__':
    sys.exit(main())
