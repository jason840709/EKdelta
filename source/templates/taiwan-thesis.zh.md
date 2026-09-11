<!-- 臺灣論文模板（中文）。內文、章節、目錄、引用、圖表目錄、附錄與紙本 openright 規則依照臺灣論文；封面使用國立中山大學範例的中山制式格式。把下方 twthesis-titlepage 欄位與各章內容換成自己的，再從「模式」選 臺灣論文（中文）的電子版 1、電子版 2 或紙本版。章標題不必寫「第X章」；引用用 [[1]]、[[2, 3]]、[[5–7]]；圖說寫「**圖 2.1：**說明」、表說寫「**表 2.1：**說明」；附錄放在 ```twthesis-appendix``` 之後。摘要關鍵字原始碼仍寫成單行「**關鍵字：** 詞列」／「**Keywords:** terms」。封面後必須保留 ```twthesis-approval``` 審定書頁，填入口試日期與審定書圖片；正文前頁碼由該頁 i 起算。致謝置於中文摘要之前；中英文關鍵詞各 5–7 個。★ 標題、姓名、指導教授、日期與摘要都是範例佔位文字，請自行替換。此註解不會顯示。 -->

```twthesis-titlepage
校名中文: 國立中山大學
系所中文: 物理學系
論文類型中文: 碩士論文
系所英文: Department of Physics
大學英文: National Sun Yat-sen University
論文類型英文: Master’s Thesis
中文標題: （範例）低維材料表面局部電子結構之掃描穿隧能譜研究
英文標題: (Example) A Scanning Tunneling Spectroscopy Study of Local Electronic Structure on Low-Dimensional Surfaces
研究生中文: 王小明
研究生英文: Xiao-Ming Wang
指導教授中文: 指導教授範例
指導教授英文: Dr. Advisor Name
日期中文: 中華民國 115 年 8 月
日期英文: August 2026
```

```twthesis-approval
圖片:
口試日期: YYYY/MM/DD
移除白底: 是
目錄名稱: 論文審定書
```

# 致謝

（致謝範例——請替換。）在此感謝指導教授的指導，以及研究夥伴在實驗、數據處理與討論上的協助，並感謝家人的支持。

# 中文摘要

（中文摘要範例——請替換成你的內容。）在此以約 200–300 字概述你的研究背景、目的、方法、主要結果與結論。行文中若要引用文獻，用雙括號標註即可，例如 [[1]] 或 [[2, 3]]，會自動變綠並連到最後的參考文獻清單。行內公式用單一錢字號，例如 $alpha approx 1.5$；本段只是示範排版與功能，內容請自行填寫。

**關鍵字：** 關鍵字一、關鍵字二、關鍵字三、關鍵字四、關鍵字五

# 英文摘要

(Abstract example — please replace.) Write a 200–300 word summary of your background, objective, methods, main results, and conclusions here. Cite references with double brackets such as [[1]] or [[2, 3]]; they turn green and link to the reference list. Inline math uses single dollar signs, e.g. $alpha approx 1.5$. This paragraph only demonstrates layout and features.

**Keywords:** keyword one, keyword two, keyword three, keyword four, keyword five

```twthesis-toc
```

```twthesis-lof
```

```twthesis-lot
```

# 緒論 (Introduction)

## 研究背景

（在此說明研究背景與重要性。）以下示範引用寫法:本主題已有許多前人研究 [[1, 2]]，並延伸出不同的方向與方法 [[3, 4]]。你可以把每一句換成自己的論述，引用編號對應到最後的參考文獻。

### 相關文獻回顧（小節示範）

（這是一個小節 `###` 的示範。）在此回顧與本研究相關的既有工作，例如量測技術與分析方法的發展 [[5–7]]。目錄會自動列到這一層（例如 1.1.1）。

## 研究目的與方法概述

（在此說明研究目的、假設與整體方法。）下面示範獨立公式的寫法——用兩個錢字號把公式包起來:

$$
\frac{dI}{dV}(V) = C_1 + C_2\,|V - V_0|^{\alpha} + M\,(V - V_0)
$$

其中各符號的意義請在此說明。行文中可再引用相關理論依據 [[3, 4]]。

# 原理與方法 (Principles and Methods)

## 量測原理

（在此說明量測或分析的物理原理。）需要放圖時，先插入圖片，再在下一行寫圖說；圖號請自行編（如 2.1、2.2），系統會自動收進「圖目錄」。相關背景可引用文獻 [[8]]。

![示意圖範例](data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22520%22%20height%3D%22260%22%3E%3Crect%20width%3D%22520%22%20height%3D%22260%22%20fill%3D%22%23f0f0ee%22%20stroke%3D%22%23bbb%22%2F%3E%3Ctext%20x%3D%22260%22%20y%3D%22135%22%20font-size%3D%2220%22%20fill%3D%22%23888%22%20text-anchor%3D%22middle%22%20font-family%3D%22serif%22%3E%E5%9C%96%E7%89%87%E7%A4%BA%E4%BE%8B%20Figure%20placeholder%3C%2Ftext%3E%3C%2Fsvg%3E)

**圖 2.1：**（圖說範例）在此說明這張圖的內容與重點。把括號內的路徑換成你的圖檔（例如 `image/xxx.png`）即可。

## 分析方法

（在此說明資料處理或分析流程。）需要放表時，用 Markdown 表格，並在下一行寫表說；表號自行編（如 2.1），會自動收進「表目錄」:

| 參數 | 條件 A | 條件 B |
| :--: | :----: | :----: |
| 項目一 | 9  | 9  |
| 項目二 | 13 | 11 |
| 項目三 | 15 | 15 |

**表 2.1：**（表說範例）在此說明表格欄位與數據的意義。

### 方法細節（小節示範）

（可再用小節補充方法的細節、參數選擇或驗證方式。）

# 實驗結果與討論 (Results and Discussion)

## 主要結果

（在此呈現你的主要結果，可搭配圖表與引用 [[9, 10]]。）

## 討論

（在此討論結果的物理意義、與前人工作的比較與可能的限制 [[11]]。）

# 總結 (Conclusion)

## 研究總結

（在此以幾句話總結研究的主要發現。）

## 未來工作

（在此說明可延伸的方向或後續驗證。）

# 參考文獻

[1] Chhowalla, M. et al. The chemistry of two-dimensional layered transition metal dichalcogenide nanosheets. Nature Chemistry 5, 263–275 (2013).

[2] Manzeli, S. et al. 2D transition metal dichalcogenides. Nature Reviews Materials 2, 17033 (2017).

[3] Huang, H., Zhou, S. & Duan, W. Type-II Dirac fermions in the PtSe$_2$ class of TMDs. Physical Review B 94, 121117(R) (2016).

[4] Zhang, K. et al. Experimental evidence for type-II Dirac semimetal in PtSe$_2$. Physical Review B 96, 125102 (2017).

[5] Wiesendanger, R. Scanning Probe Microscopy and Spectroscopy. Cambridge University Press (1994).

[6] Tersoff, J. & Hamann, D. R. Theory of the scanning tunneling microscope. Physical Review B 31, 805–813 (1985).

[7] Zandvliet, H. J. W. & van Houselt, A. Scanning tunneling spectroscopy. Annual Review of Analytical Chemistry 2, 37–55 (2009).

[8] Binnig, G. & Rohrer, H. Scanning tunneling microscopy. Surface Science 126, 236–244 (1983).

[9] Feenstra, R. M. Tunneling spectroscopy of the (110) surface of direct-gap III-V semiconductors. Physical Review B 50, 4561 (1994).

[10] Savitzky, A. & Golay, M. J. E. Smoothing and differentiation of data by simplified least squares procedures. Analytical Chemistry 36, 1627–1639 (1964).

[11] Altshuler, B. L. & Aronov, A. G. Zero bias anomaly in tunnel resistance and electron-electron interaction. Solid State Communications 30, 115–117 (1979).

```twthesis-appendix
```

# 附錄 A：推導或補充材料（範例）

## A.1 問題設定

（附錄示範。）附錄的章號會自動變成字母 A、B、C，節號則是 A.1、A.2……可放詳細推導、程式碼說明或補充數據 [[6]]。

## A.2 推導（含公式示範）

附錄一樣可以放公式，例如:

$$
M_{\mu\nu} = -\frac{\hbar^2}{2m} \int_S \left( \psi^* \nabla\chi - \chi \nabla\psi^* \right) \cdot d\mathbf{S}
$$

# 附錄 B：其他補充（範例）

## B.1 補充項目

（第二個附錄示範，章號自動變 B。）例如可在此放一條估計式 $S_I = 4 k_B T / R$，或其他你需要補充的內容。

> 用法提醒:把上面各章內容換成你自己的論文即可。標題直接寫（不必加「第X章」）,節用 `##`、小節用 `###`,系統會自動編號並生成目錄。引用用 `[[1]]`、`[[2, 3]]`、`[[5–7]]`(綠色、連參考文獻);圖說 `**圖 2.1：**…`、表說 `**表 2.1：**…`(自動進圖/表目錄);附錄放 ```twthesis-appendix``` 之後。★ 封面標題、姓名、指導教授、摘要都是範例佔位文字,記得換成自己的。填好後在「模式」選單選擇 臺灣論文（中文）與適合的版型。
