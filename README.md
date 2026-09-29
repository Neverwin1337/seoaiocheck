# 雙軌網站檢測

在本機輸入公開網站網址，並排顯示 [SEOmator](https://github.com/seo-skills/seo-audit-skill) 的 SEO 分數及 [GEO Optimizer](https://github.com/Auriti-Labs/geo-optimizer-skill) 的 AI 檢索準備度分數（各 0–100），並彙整分類分數與待改善項目。GEO 分數不是網站已被 AI 搜尋引用的實測比例。

## 啟動

需要 Node.js 20.3+ 及 Python 3.10+。在專案目錄執行：

```sh
npm install
python3 -m venv .venv
.venv/bin/python -m pip install geo-optimizer-skill==4.18.3
npm start
```

瀏覽器開啟 http://127.0.0.1:3000。若 3000 埠已被占用，可用 `PORT=4180 npm start`。

掃描完成後，報告網址旁可選擇「下載 HTML」或「下載 JSON」。HTML 是附帶樣式、可離線閱讀的唯讀報告；JSON 是包含網址、檢測時間、兩個分數、分類分數和建議的整合資料。重新掃描時下載鍵會暫時隱藏，以免誤存上一筆報告。

每項提示附建議做法與等級。SEO 的「未通過／注意」是 SEOmator 規則的原始狀態，不代表安全風險嚴重度；能取得工具的原生修正建議時直接使用，否則顯示常見規則的修正方法或檢查方向。GEO Optimizer 未提供逐條等級，因此「高／中／低」是本站依該建議所屬分類得分比例估算的改善優先順序（低於 40%、40–79%、80% 以上）；無法歸類時顯示「未分級」。GEO 建議文字保留工具原文。

檢測只在本機監聽，伺服器會向目標網站發送請求。SEOmator 使用單頁審核並關閉 Core Web Vitals 的瀏覽器量測以加速分析；兩個原始分數不混算，也不偽造失敗來源的分數。報告列出最多 30 項 SEO 問題及 30 項 GEO 建議。若要部署供其他人使用，需要另加使用者驗證、限流及更嚴格的出站網路隔離。
# seoaiocheck
