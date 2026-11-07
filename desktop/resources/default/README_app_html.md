# 桌面版內嵌 HTML

`app.html` 是由上層正式產物複製而來的建置輸出，不單獨維護。

從桌面版目錄執行：

```bash
bash sync_app_html.sh
```

腳本會複製 `../EKdelta.html` 並核對 SHA-256。`npm start` 與各 `npm run dist...` 指令也會自動執行同步。
