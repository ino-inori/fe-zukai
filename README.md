# 触って理解する基本情報

基本情報技術者試験の頻出テーマを、クリックや入力で動く図解で学ぶ自分用の学習サイト。
HTML / CSS / JavaScript のみ（ビルド不要）。確認問題はすべてオリジナル。

- `index.html` … トップページ（トピック一覧は `js/topics.js`）
- `topics/` … 各トピックのページ
- `js/common.js` … テーマ切替と確認問題の仕組み
- `sql/` … SQLクイズ。入力した SQL をブラウザ内の SQLite（sql.js 1.10.3、`sql/vendor/` に同梱）で実行して採点。使い方・公開方法・問題の足し方は [sql/README.md](sql/README.md)

ローカルで見るときは、このフォルダで簡易サーバを起動してブラウザで開く。

```
py -m http.server 8780
```

http://localhost:8780/ を開く（このパソコンでは `python` ではなく `py` を使う。`python` だと Microsoft Store の案内が動く）。

公開は GitHub Pages（`main` ブランチのルート）。`git push` すると数分で https://ino-inori.github.io/fe-zukai/ に反映される。
