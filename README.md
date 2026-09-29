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

伺服器會向目標網站發送請求。SEOmator 使用單頁審核並關閉 Core Web Vitals 的瀏覽器量測以加速分析；兩個原始分數不混算，也不偽造失敗來源的分數。報告列出全部未通過／警告的 SEO 規則和 GEO Optimizer 回傳的全部建議。SEO 修復方法優先採用規則回傳的建議，否則使用 SEOmator 自帶的規則修復對照表；GEO 建議保持工具原文。

## Coolify（Dockerfile）

在 Coolify 新增 Dockerfile 應用，來源指向本專案、Dockerfile 路徑設為 `Dockerfile`、容器連接埠設為 `3000`，健康檢查網址設為 `/healthz`。映像包含 Node 與 Python 兩個引擎，並以非 root 使用者執行。請透過 Coolify 反向代理設定 HTTPS；不要把 Docker socket、主機目錄或雲端服務密鑰掛載到掃描容器。

**公開部署注意：**網址是非信任輸入。Node 端限制外連於公開 IPv4 的 HTTP/HTTPS 80/443，逐次 DNS 驗證並阻擋內網／metadata 位址；GEO 工具本身檢查轉址及釘選位址，子程序不繼承代理變數。一次只執行一個掃描，超額回傳 429。這些是應用層防護，**不是完整的出站網路隔離**：Coolify／Docker 預設網路仍可能讓第三方套件直接連上主機、容器網段或內部服務。公開給陌生使用者前，務必在容器網路及主機防火牆封鎖對私有網段、Docker gateway、metadata 和管理介面的出站連線，並在代理層加入驗證及速率限制；若無法設置隔離，請僅供可信使用者使用。
# seoaiocheck
