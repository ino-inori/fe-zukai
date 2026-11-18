/* ===== SQLクイズ 採点のしくみ =====
 * 入力された SQL をブラウザ内の SQLite（sql.js）で実際に実行し、
 * 模範解答の実行結果と比べて ⭕正解 / △惜しい / ❌不正解 を決める。
 * 画面（app.js）と、あとで作る問題データの検査ページの両方から使う。
 */
(function () {
  'use strict';

  const MAX_ROWS = 500; // これを超える結果は打ち切る（無限に近い結果で固まらないように）

  // ---------- 字句の分解（トークン化） ----------
  // SQL を「語」「数」「文字列」「記号」「空白」などの部品に分ける。
  // 文字列リテラル（'...'）や引用符付きの名前（"..."）の中身は 1 つの部品として扱い、
  // 綴り補正やスペース補完が中身を壊さないようにする。
  function isWordStart(c) { return /[A-Za-z_]/.test(c) || c.charCodeAt(0) > 0x7f; }
  function isWordChar(c) { return /[A-Za-z0-9_$]/.test(c) || c.charCodeAt(0) > 0x7f; }

  function tokenize(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      const start = i;
      if (/\s/.test(c) && c.charCodeAt(0) <= 0x7f) {
        while (i < s.length && /\s/.test(s[i]) && s.charCodeAt(i) <= 0x7f) i++;
        out.push({ t: 'ws', v: s.slice(start, i) });
      } else if (c === '-' && s[i + 1] === '-') {
        while (i < s.length && s[i] !== '\n') i++;
        out.push({ t: 'comment', v: s.slice(start, i) });
      } else if (c === '/' && s[i + 1] === '*') {
        const end = s.indexOf('*/', i + 2);
        i = end < 0 ? s.length : end + 2;
        out.push({ t: 'comment', v: s.slice(start, i) });
      } else if (c === "'") {
        i++;
        while (i < s.length) {
          if (s[i] === "'") { if (s[i + 1] === "'") { i += 2; continue; } i++; break; }
          i++;
        }
        out.push({ t: 'str', v: s.slice(start, i) });
      } else if (c === '"' || c === '`' || c === '[') {
        const close = c === '[' ? ']' : c;
        const end = s.indexOf(close, i + 1);
        i = end < 0 ? s.length : end + 1;
        out.push({ t: 'qid', v: s.slice(start, i) });
      } else if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        while (i < s.length && /[0-9.]/.test(s[i])) i++;
        if (/[eE]/.test(s[i] || '') && /[0-9]/.test(s[i + 1] || '')) { i++; while (/[0-9]/.test(s[i] || '')) i++; }
        out.push({ t: 'num', v: s.slice(start, i) });
      } else if (isWordStart(c)) {
        while (i < s.length && isWordChar(s[i])) i++;
        out.push({ t: 'word', v: s.slice(start, i) });
      } else if (c === ';') {
        i++;
        out.push({ t: 'semi', v: ';' });
      } else {
        const two = s.slice(i, i + 2);
        i += ['<>', '<=', '>=', '!=', '==', '||'].includes(two) ? 2 : 1;
        out.push({ t: 'op', v: s.slice(start, i) });
      }
    }
    return out;
  }

  const isBlank = tk => tk.t === 'ws' || tk.t === 'comment';

  function countStatements(tokens) {
    let n = 0, has = false;
    for (const tk of tokens) {
      if (tk.t === 'semi') { if (has) n++; has = false; }
      else if (!isBlank(tk)) has = true;
    }
    return n + (has ? 1 : 0);
  }

  function endsWithSemicolon(tokens) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (isBlank(tokens[i])) continue;
      return tokens[i].t === 'semi';
    }
    return false;
  }

  const FORBIDDEN = ['ATTACH', 'DETACH', 'PRAGMA', 'LOAD_EXTENSION'];
  function findForbidden(tokens) {
    for (const tk of tokens) if (tk.t === 'word' && FORBIDDEN.includes(tk.v.toUpperCase())) return tk.v.toUpperCase();
    return null;
  }

  // 「HAVING を使って」のような構文指定。複数語（GROUP BY など）にも対応
  function hasKeyword(tokens, kw) {
    const want = kw.toUpperCase().split(/\s+/);
    const words = tokens.filter(tk => !isBlank(tk)).map(tk => tk.v.toUpperCase());
    for (let i = 0; i + want.length <= words.length; i++) {
      if (want.every((w, j) => words[i + j] === w)) return true;
    }
    return false;
  }

  // ---------- 全角 → 半角 ----------
  // 文字列リテラルの外にある全角スペース・全角英数記号・全角引用符を半角にする。
  // 文字列リテラルの中身（'東京　本社' など）は変えない。
  const FW_SINGLE_QUOTES = '‘’＇'; // ‘ ’ ＇
  const FW_DOUBLE_QUOTES = '“”＂'; // “ ” ＂
  function toHalfWidth(s) {
    let out = '', changed = false, i = 0;
    let inStr = null; // null | "'" | '"'
    while (i < s.length) {
      const c = s[i];
      if (inStr) {
        const isClose = c === inStr || (inStr === "'" ? FW_SINGLE_QUOTES : FW_DOUBLE_QUOTES).includes(c);
        if (isClose) {
          if (c === inStr && s[i + 1] === inStr) { out += c + c; i += 2; continue; } // '' のエスケープ
          if (c !== inStr) changed = true;
          out += inStr; inStr = null; i++; continue;
        }
        out += c; i++; continue;
      }
      // コメントの中はそのまま写す
      if (s.startsWith('--', i) || s.startsWith('/*', i)) {
        const end = s.startsWith('--', i) ? s.indexOf('\n', i) : s.indexOf('*/', i + 2);
        const stop = end < 0 ? s.length : (s[i] === '-' ? end : end + 2);
        out += s.slice(i, stop); i = stop; continue;
      }
      let h = c;
      const code = c.charCodeAt(0);
      if (c === '　') h = ' ';
      else if (code >= 0xFF01 && code <= 0xFF5E) h = String.fromCharCode(code - 0xFEE0);
      else if (FW_SINGLE_QUOTES.includes(c)) h = "'";
      else if (FW_DOUBLE_QUOTES.includes(c)) h = '"';
      else if (c === '、') h = ','; // 、
      if (h !== c) changed = true;
      if (h === "'" || h === '"') inStr = h;
      out += h; i++;
    }
    return { text: out, changed };
  }

  // ---------- 綴り補正とスペース補完 ----------
  const KEYWORDS = (
    'SELECT FROM WHERE AND OR NOT IN BETWEEN LIKE ESCAPE IS NULL ORDER BY GROUP HAVING ASC DESC AS DISTINCT ALL ' +
    'COUNT SUM AVG MAX MIN ROUND LENGTH UPPER LOWER SUBSTR COALESCE IFNULL ABS CAST ' +
    'JOIN INNER LEFT RIGHT OUTER CROSS NATURAL ON USING EXISTS ANY UNION EXCEPT INTERSECT CASE WHEN THEN ELSE END ' +
    'LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE VIEW DROP ALTER ADD COLUMN ' +
    'PRIMARY KEY FOREIGN REFERENCES UNIQUE DEFAULT CHECK CONSTRAINT ' +
    'INTEGER INT TEXT REAL VARCHAR CHAR CHARACTER DECIMAL NUMERIC DATE TRUE FALSE'
  ).split(' ');
  const KEYWORD_SET = new Set(KEYWORDS);

  const isAsciiChar = ch => ch.charCodeAt(0) <= 0x7f;
  const norm = w => (/^[\x00-\x7f]*$/.test(w) ? w.toUpperCase() : w);

  // 制限付きダメラウ・レーベンシュタイン距離（入れ替え1回も1文字の違いと数える）
  function editDistance(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
    return d[m][n];
  }

  function maxTypos(len) { return len >= 6 ? 2 : len >= 3 ? 1 : 0; }

  // 一番近い語がただ1つに決まるときだけ、その語を返す
  function closestWord(word, dict) {
    const w = norm(word);
    const limit = maxTypos([...w].length);
    if (!limit) return null;
    let best = null, bestD = Infinity, tie = false;
    for (const cand of dict) {
      if (Math.abs([...cand].length - [...w].length) > limit) continue;
      const dist = editDistance([...w], [...cand]);
      if (dist < bestD) { best = cand; bestD = dist; tie = false; }
      else if (dist === bestD && cand !== best) tie = true;
    }
    return bestD <= limit && !tie ? best : null;
  }

  // くっついた語（ORDERBY、SELECT氏名 など）を、知っている語の並びに分ける。
  // 知らない部分は「半角英字と日本語の境目」でだけ切り出してよい。
  function segmentWord(word, dict) {
    const chars = [...word];
    const n = chars.length;
    const upper = chars.map(ch => (isAsciiChar(ch) ? ch.toUpperCase() : ch));
    const boundary = i => i === 0 || i === n || isAsciiChar(chars[i - 1]) !== isAsciiChar(chars[i]);
    // best[i][k]: 位置 i までの最良の分け方。k=1 は直前の部品が「知らない語」
    const best = Array.from({ length: n + 1 }, () => [null, null]);
    best[0][0] = { cost: [0, 0], pieces: [] };
    const better = (a, b) => !b || a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 2; k++) {
        const cur = best[i][k];
        if (!cur) continue;
        for (const d of dict) {
          const dc = [...d];
          if (dc.length > n - i) continue;
          let ok = true;
          for (let j = 0; j < dc.length; j++) if (upper[i + j] !== dc[j]) { ok = false; break; }
          if (!ok) continue;
          const cost = [cur.cost[0], cur.cost[1] + 1];
          const e = i + dc.length;
          if (better(cost, best[e][0] && best[e][0].cost)) best[e][0] = { cost, pieces: cur.pieces.concat([{ text: d, known: true }]) };
        }
        if (k === 0 && boundary(i)) {
          for (let e = i + 1; e <= n; e++) {
            if (!boundary(e)) continue;
            const cost = [cur.cost[0] + (e - i), cur.cost[1] + 1];
            if (better(cost, best[e][1] && best[e][1].cost)) best[e][1] = { cost, pieces: cur.pieces.concat([{ text: chars.slice(i, e).join(''), known: false }]) };
          }
        }
      }
    }
    const a = best[n][0], b = best[n][1];
    const r = a && (!b || better(a.cost, b.cost)) ? a : b;
    return r ? r.pieces : [{ text: word, known: false }];
  }

  // 自動修正版を作る。返り値の kinds は直した箇所の種類
  function autoFix(sql, identifiers) {
    const kinds = new Set();
    const half = toHalfWidth(sql);
    if (half.changed) kinds.add('zenkaku');
    const tokens = tokenize(half.text);

    const dict = new Set(KEYWORDS);
    identifiers.forEach(id => dict.add(norm(id)));
    // AS の直後の語は自分で付けた別名なので、補正しない
    const aliases = new Set();
    let prev = null;
    for (const tk of tokens) {
      if (isBlank(tk)) continue;
      if (tk.t === 'word' && prev && prev.t === 'word' && prev.v.toUpperCase() === 'AS') aliases.add(norm(tk.v));
      prev = tk;
    }
    const dictArr = [...dict];

    const out = [];
    for (const tk of tokens) {
      if (tk.t !== 'word') { out.push(tk); continue; }
      const w = norm(tk.v);
      if (dict.has(w) || aliases.has(w)) { out.push(tk); continue; }
      const pieces = segmentWord(tk.v, dictArr);
      if (pieces.length > 1) kinds.add('space');
      pieces.forEach((p, idx) => {
        if (idx > 0) out.push({ t: 'ws', v: ' ' });
        let text = p.text;
        if (!p.known && !aliases.has(norm(text))) {
          const fix = closestWord(text, dictArr);
          if (fix) { text = fix; kinds.add('spell'); }
        }
        out.push({ t: 'word', v: text });
      });
    }

    // 「数字のすぐ後ろに語」（300000AND など）の間にスペースを入れる
    const joined = [];
    out.forEach((tk, i) => {
      const p = out[i - 1];
      if (p && p.t === 'num' && tk.t === 'word') {
        joined.push({ t: 'ws', v: ' ' });
        kinds.add('space');
      }
      joined.push(tk);
    });

    let text = joined.map(tk => tk.v).join('').replace(/\s+$/, '');
    if (!endsWithSemicolon(joined)) { text += ';'; kinds.add('semicolon'); }
    return { sql: text, kinds: [...kinds] };
  }

  // ---------- データベースの用意と実行 ----------
  const q = name => '"' + String(name).replace(/"/g, '""') + '"';

  // 元の表（tables）と、検証用の別データ（altTables）の行を組み合わせた表一覧を返す
  function tableSet(problem, useAlt) {
    return problem.tables.map(t => {
      if (!useAlt) return t;
      const alt = (problem.altTables || []).find(a => a.name === t.name);
      return alt ? { name: t.name, columns: alt.columns || t.columns, rows: alt.rows } : t;
    });
  }

  function buildDb(SQL, tables) {
    const db = new SQL.Database();
    for (const t of tables) {
      const cols = t.columns.map(([name, type]) => `${q(name)} ${type || ''}`.trim());
      if (t.primaryKey && t.primaryKey.length) cols.push(`PRIMARY KEY (${t.primaryKey.map(q).join(', ')})`);
      db.run(`CREATE TABLE ${q(t.name)} (${cols.join(', ')})`);
      if (t.rows.length) {
        const stmt = db.prepare(`INSERT INTO ${q(t.name)} VALUES (${t.columns.map(() => '?').join(', ')})`);
        for (const r of t.rows) stmt.run(r);
        stmt.free();
      }
    }
    return db;
  }

  // 1 回の実行ごとに新しい DB を作る（前の回答の影響を残さない）
  function runSql(SQL, tables, sql) {
    const db = buildDb(SQL, tables);
    try {
      const stmt = db.prepare(sql);
      try {
        const columns = stmt.getColumnNames();
        const rows = [];
        let truncated = false;
        while (stmt.step()) {
          if (rows.length >= MAX_ROWS) { truncated = true; break; }
          rows.push(stmt.get());
        }
        return { columns, rows, truncated };
      } finally { stmt.free(); }
    } catch (e) {
      return { error: String(e && e.message || e) };
    } finally {
      db.close();
    }
  }

  // ---------- 結果の比較 ----------
  // 小数は小数第2位で丸める。NULL 同士は一致。文字列は大文字小文字も区別して完全一致
  function cellKey(v) {
    if (v === null || v === undefined) return 'z';
    if (typeof v === 'number') return 'n' + (Number.isInteger(v) ? v : Math.round(v * 100) / 100);
    if (v instanceof Uint8Array) return 'b' + Array.from(v).join(',');
    return 's' + String(v);
  }
  const rowKey = r => JSON.stringify(r.map(cellKey));

  // 列ごとの値の組が同じで、並び順だけが違うか（SELECT の列の順番ミス）
  function sameColumnsOtherOrder(user, expected) {
    const sig = res => res.columns.map((_, ci) => res.rows.map(r => cellKey(r[ci])).sort().join('\u0001')).sort().join('\u0002');
    return sig(user) === sig(expected);
  }

  // 一致すれば null、違えば理由の種類を返す
  function compareResults(user, expected, opts) {
    if (user.truncated) return 'tooMany';
    if (user.columns.length !== expected.columns.length) return 'columns';
    if (user.rows.length !== expected.rows.length) return 'rowCount';
    const u = user.rows.map(rowKey), e = expected.rows.map(rowKey);
    if (opts.orderMatters) {
      if (u.some((k, i) => k !== e[i])) {
        return [...u].sort().join('\n') === [...e].sort().join('\n') ? 'order' : 'values';
      }
    } else if ([...u].sort().join('\n') !== [...e].sort().join('\n')) return sameColumnsOtherOrder(user, expected) ? 'columnOrder' : 'values';
    if (opts.compareColumnNames && user.columns.some((c, i) => c !== expected.columns[i])) return 'columnNames';
    return null;
  }

  // ---------- SQLite の英語エラーを日本語に ----------
  const ERROR_RULES = [
    [/incomplete input/, () => '文が途中で終わっています。カッコや引用符（\'）の閉じ忘れ、条件の書きかけがないか確認しましょう。'],
    [/near "(.*)": syntax error/s, m => `「${m[1]}」のあたりで文法の誤りがあります。キーワードの綴りや順番、カンマ・カッコを確認しましょう。`],
    [/unrecognized token: "?(.*?)"?$/s, m => `「${m[1]}」を SQL として読み取れません。語と語の間のスペース、引用符（'）の閉じ忘れ、全角文字が混ざっていないかを確認しましょう。`],
    [/no such table: (.*)/, m => `表「${m[1]}」はありません。表名の綴りを確認しましょう。`],
    [/no such column: (.*)/, m => `列「${m[1]}」はありません。列名の綴りや、文字の値を ' ' で囲み忘れていないか確認しましょう。`],
    [/ambiguous column name: (.*)/, m => `列「${m[1]}」が複数の表にあって、どれのことか決められません。「表名.列名」の形で書きましょう。`],
    [/misuse of aggregate(?: function)?:? ?(.*)/, () => '集計関数（COUNT・SUM・AVG など）の使い方が誤っています。WHERE の中では使えません。グループの条件は HAVING に書きます。'],
    [/aggregate functions are not allowed in the GROUP BY clause/, () => 'GROUP BY の中に集計関数は書けません。'],
    [/a GROUP BY clause is required before HAVING/, () => 'HAVING を使うには、その前に GROUP BY が必要です。'],
    [/wrong number of arguments to function (.*)\(\)/, m => `関数 ${m[1]} に渡す値（引数）の数が合っていません。`],
    [/no such function: (.*)/, m => `関数「${m[1]}」はありません。関数名の綴りを確認しましょう。`],
    [/(\d+) values for (\d+) columns/, m => `値の数（${m[1]}個）と列の数（${m[2]}個）が合っていません。`],
    [/do not have the same number of result columns/, () => 'UNION の前後で列の数が合っていません。'],
    [/ORDER BY term out of range/, () => 'ORDER BY の列番号が範囲外です。'],
    [/not an error/, () => '実行する文がありません。'],
  ];
  function explainError(msg) {
    for (const [re, f] of ERROR_RULES) {
      const m = msg.match(re);
      if (m) return f(m);
    }
    return 'SQL を実行できませんでした。書き方を見直してみましょう。';
  }

  const KIND_TEXT = {
    semicolon: '文の最後のセミコロン（;）が抜けています。',
    space: '語と語の間の半角スペースが足りないところがあります。',
    spell: 'キーワード・表名・列名のどこかに綴りミスがあります。',
    zenkaku: '全角の文字（スペース・記号・引用符など）が混ざっています。半角で書きましょう。',
  };
  const KIND_ORDER = ['semicolon', 'space', 'spell', 'zenkaku'];

  const MISMATCH_TEXT = {
    columns: (u, e) => `列の数が違います（あなたの結果は ${u.columns.length} 列、欲しい結果は ${e.columns.length} 列）。`,
    rowCount: (u, e) => `行の数が違います（あなたの結果は ${u.rows.length} 行、欲しい結果は ${e.rows.length} 行）。`,
    order: () => '行はそろっていますが、並び順が違います。ORDER BY の列と ASC / DESC を確認しましょう。',
    values: () => '値が違う行があります。条件や選んだ列を見直しましょう。',
    columnOrder: () => '選んだ列は合っていそうですが、列の順番が違います。SELECT の後ろに書く列の順番を確認しましょう。',
    columnNames: () => '値は合っていますが、列名が違います。AS で問題文どおりの列名を付けましょう。',
    tooMany: () => `結果の行が多すぎます（${MAX_ROWS} 行で打ち切りました）。`,
  };

  // ---------- 採点の本体 ----------
  function createGrader(SQL) {
    const cache = new Map();

    // 模範解答を本物のデータと別データの両方で実行しておく（欲しい出力結果の表になる）
    function expectedFor(problem) {
      if (cache.has(problem.id)) return cache.get(problem.id);
      const main = runSql(SQL, tableSet(problem, false), problem.answerSql);
      const alt = runSql(SQL, tableSet(problem, true), problem.answerSql);
      const r = { main, alt };
      cache.set(problem.id, r);
      return r;
    }

    function identifiersOf(problem) {
      const ids = new Set();
      problem.tables.forEach(t => { ids.add(t.name); t.columns.forEach(c => ids.add(c[0])); });
      return [...ids];
    }

    function missingKeyword(problem, tokens) {
      return (problem.requiredKeywords || []).find(kw => !hasKeyword(tokens, kw)) || null;
    }

    // ある SQL を両方のデータで試す
    function attempt(problem, sql) {
      const exp = expectedFor(problem);
      const opts = { orderMatters: !!problem.orderMatters, compareColumnNames: !!problem.compareColumnNames };
      const user = runSql(SQL, tableSet(problem, false), sql);
      if (user.error) return { user, mismatch: 'error' };
      const mm = compareResults(user, exp.main, opts);
      if (mm) return { user, mismatch: mm };
      const userAlt = runSql(SQL, tableSet(problem, true), sql);
      if (userAlt.error) return { user, mismatch: 'error', altError: userAlt.error };
      const mmAlt = compareResults(userAlt, exp.alt, opts);
      if (mmAlt) return { user, mismatch: 'altOnly' };
      return { user, mismatch: null };
    }

    function grade(problem, input) {
      const exp = expectedFor(problem);
      const base = { expected: exp.main };
      const raw = String(input || '');
      const rawTokens = tokenize(raw);
      if (!rawTokens.some(tk => !isBlank(tk) && tk.t !== 'semi')) {
        return { ...base, verdict: 'empty', message: 'SQL を入力してください。' };
      }
      const ng = (message, extra) => ({ ...base, verdict: 'ng', message, ...extra });

      if (countStatements(rawTokens) > 1) return ng('SQL は 1 文だけ書いてください（「;」で区切って 2 つ以上の文が書かれています）。');
      const bad = findForbidden(rawTokens);
      if (bad) return ng(`この練習では ${bad} は使えません。SELECT などの文で答えましょう。`);

      // 1) 入力をそのまま実行
      const first = attempt(problem, raw);
      if (!first.mismatch) {
        const kw = missingKeyword(problem, rawTokens);
        if (kw) return ng(`結果は合っていますが、この問題では ${kw} を使って書く必要があります。`, { user: first.user });
        const fixedKinds = autoFix(raw, identifiersOf(problem)).kinds.filter(k => k === 'zenkaku' || k === 'semicolon');
        if (!endsWithSemicolon(rawTokens) && !fixedKinds.includes('semicolon')) fixedKinds.push('semicolon');
        if (!fixedKinds.length) return { ...base, verdict: 'ok', user: first.user };
        return close(fixedKinds, first.user);
      }

      // 2) 自動修正版を作って実行
      const fixed = autoFix(raw, identifiersOf(problem));
      if (fixed.kinds.length) {
        const fixedTokens = tokenize(fixed.sql);
        if (countStatements(fixedTokens) > 1) return ng('SQL は 1 文だけ書いてください（「;」で区切って 2 つ以上の文が書かれています）。');
        if (!findForbidden(fixedTokens)) {
          const second = attempt(problem, fixed.sql);
          if (!second.mismatch && !missingKeyword(problem, fixedTokens)) return close(fixed.kinds, null);
        }
      }

      // 3) 不正解。理由を組み立てる
      const extra = { user: first.user };
      if (first.mismatch === 'error') {
        const msg = first.user.error || first.altError;
        return ng(explainError(msg), { ...extra, error: msg, user: null });
      }
      if (first.mismatch === 'altOnly') {
        return ng('表示中のデータでは結果が一致しますが、別のデータで確かめると結果が違います。値を直接書かずに、条件で行を選ぶ SQL にしましょう。', extra);
      }
      return ng(MISMATCH_TEXT[first.mismatch](first.user, exp.main), extra);

      function close(kinds, user) {
        const sorted = KIND_ORDER.filter(k => kinds.includes(k));
        return { ...base, verdict: 'close', kinds: sorted, messages: sorted.map(k => KIND_TEXT[k]), user };
      }
    }

    return { grade, expectedFor, run: (problem, sql, useAlt) => runSql(SQL, tableSet(problem, !!useAlt), sql) };
  }

  window.SQLGrader = { createGrader, tokenize, autoFix, toHalfWidth, explainError, editDistance, segmentWord };
})();
