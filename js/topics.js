/* トピック一覧（トップページ用）。href があるものが公開済み */
window.FE_TOPICS = [
  {
    cat: '基礎理論', items: [
      { id: 'radix', title: '基数変換・2の補数', desc: '2進・10進・16進の変換、負の数の表し方、小数の誤差', freq: 3, href: 'topics/radix.html' },
      { id: 'logic', title: '論理回路', desc: 'AND/OR/NOT/XOR、半加算器・全加算器、ド・モルガン', freq: 3, href: 'topics/logic-gates.html' },
      { id: 'shift', title: 'シフト演算・ビット演算', desc: '左シフトで2倍、マスクによるビットの取り出し', freq: 2 },
      { id: 'float', title: '浮動小数点数と誤差', desc: '仮数部・指数部、桁落ち・情報落ち・丸め誤差', freq: 2 },
      { id: 'encode', title: '情報量・符号化', desc: 'ハフマン符号、ビット数の計算', freq: 1 },
    ]
  },
  {
    cat: 'アルゴリズムとデータ構造', items: [
      { id: 'stack', title: 'スタックとキュー', desc: 'LIFOとFIFO、push/popの動き', freq: 3 },
      { id: 'tree', title: '木構造・2分探索木', desc: '走査順（先行・中間・後行）、ヒープ', freq: 3 },
      { id: 'sort', title: '整列（ソート）アルゴリズム', desc: 'バブル・選択・挿入・クイック・マージの比較', freq: 2 },
      { id: 'search', title: '探索と計算量', desc: '線形探索・2分探索・ハッシュ、O記法', freq: 2 },
      { id: 'pseudo', title: '擬似言語のトレース（科目B）', desc: '1行ずつ実行して変数の変化を追う。合計・ソート・2分探索・再帰', freq: 3, href: 'topics/pseudo-code.html' },
    ]
  },
  {
    cat: 'コンピュータ構成・システム', items: [
      { id: 'cache', title: 'キャッシュと実効アクセス時間', desc: 'ヒット率を使った計算', freq: 3 },
      { id: 'availability', title: '稼働率（直列・並列）', desc: 'MTBF/MTTR、構成図で直列・並列を計算、面積図で式の意味', freq: 3, href: 'topics/availability.html' },
      { id: 'cpu', title: 'CPUとパイプライン', desc: '命令実行サイクル、MIPS・クロック', freq: 2 },
      { id: 'raid', title: 'RAID', desc: 'RAID0/1/5の仕組みと容量', freq: 2 },
    ]
  },
  {
    cat: 'OS', items: [
      { id: 'paging', title: 'ページング・ページ置換', desc: 'FIFO/LRUでページフォールトを数える', freq: 3 },
      { id: 'process', title: 'プロセスの状態遷移', desc: '実行・実行可能・待ち状態', freq: 2 },
    ]
  },
  {
    cat: 'データベース', items: [
      { id: 'normalize', title: '正規化', desc: '第1〜第3正規形、関数従属', freq: 3 },
      { id: 'sql', title: 'SQL', desc: 'SELECT・JOIN・GROUP BY の結果を図で確認', freq: 3 },
      { id: 'transaction', title: 'トランザクションと排他制御', desc: 'ACID特性、ロック、デッドロック', freq: 2 },
    ]
  },
  {
    cat: 'ネットワーク', items: [
      { id: 'osi', title: 'OSI基本参照モデル', desc: '7階層の役割、機器、カプセル化のアニメ', freq: 3, href: 'topics/osi.html' },
      { id: 'ip', title: 'IPアドレスとサブネット', desc: 'サブネット計算機、同一ネットワーク判定、分割、プライベートIP', freq: 3, href: 'topics/ip-subnet.html' },
      { id: 'protocol', title: '主なプロトコルとポート', desc: 'DNS・DHCP・NAT・HTTP・SMTP など', freq: 2 },
    ]
  },
  {
    cat: 'セキュリティ', items: [
      { id: 'pubkey', title: '公開鍵暗号・デジタル署名', desc: 'どの鍵を使うか、鍵の数、認証局', freq: 3, href: 'topics/public-key.html' },
      { id: 'attack', title: '攻撃手法と対策', desc: 'SQLインジェクション・XSS・CSRF など', freq: 3 },
      { id: 'auth', title: '認証技術', desc: '多要素認証、チャレンジレスポンス', freq: 2 },
    ]
  },
  {
    cat: 'マネジメント・ストラテジ', items: [
      { id: 'arrow', title: 'アローダイアグラム', desc: 'クリティカルパスと最短日数', freq: 3 },
      { id: 'test', title: 'テスト手法', desc: 'ブラックボックス／ホワイトボックス、網羅率', freq: 2 },
      { id: 'breakeven', title: '損益分岐点', desc: '固定費・変動費のグラフ', freq: 2 },
    ]
  },
];
