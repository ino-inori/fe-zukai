/* ===== SQLクイズ 画面（ホーム・出題・セット終了） =====
 * 画面の切り替えは URL の # で行う（ブラウザの「戻る」も使える）。
 *   #/          … ホーム
 *   #/q/問題id  … 出題
 *   #/done      … セット（ひとまとまりの問題）を解き終えたとき
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const CATEGORIES = [
    ['基本のSELECT', 'SELECT / FROM / * / WHERE / ORDER BY / DISTINCT / AS'],
    ['条件指定', '= <> < > <= >= / AND OR NOT / BETWEEN / IN'],
    ['あいまい検索', "LIKE（% と _）"],
    ['NULL', 'IS NULL / IS NOT NULL'],
    ['集計関数', 'COUNT SUM AVG MAX MIN'],
    ['グループ化', 'GROUP BY / HAVING'],
    ['結合', 'INNER JOIN / LEFT JOIN / ON'],
    ['副問合せ', 'WHERE や FROM の中の SELECT'],
    ['データの変更', 'INSERT / UPDATE / DELETE'],
    ['表の定義', 'CREATE TABLE（PRIMARY KEY / FOREIGN KEY / NOT NULL）'],
    ['ビュー', 'CREATE VIEW … AS SELECT'],
  ];

  let problems = [];
  let byId = new Map();
  let grader = null;
  let current = null;        // 表示中の問題
  let solvedHere = false;    // 表示中の問題を、今回⭕にしたか
  let shownHere = false;     // 表示中の問題で、答えを見たか

  // ---------- 小さな保存（失敗しても動くように） ----------
  const session = {
    get(k) { try { return JSON.parse(sessionStorage.getItem('fe-zukai:sql:' + k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem('fe-zukai:sql:' + k, JSON.stringify(v)); } catch (e) { /* 無視 */ } },
  };
  const local = {
    get(k) { try { return JSON.parse(localStorage.getItem('fe-zukai:sql:' + k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('fe-zukai:sql:' + k, JSON.stringify(v)); } catch (e) { /* 無視 */ } },
  };

  // ---------- セット（いま解いている問題のまとまり） ----------
  // { title, ids: [...], results: { id: 'ok' | 'ng' } }
  let set = null;
  function startSet(title, ids, firstId) {
    if (!ids.length) return;
    set = { title, ids, results: {} };
    session.set('set', set);
    go('#/q/' + encodeURIComponent(firstId || ids[0]));
  }
  function markInSet(id, v) {
    if (!set || !set.ids.includes(id)) return;
    if (v === 'ok' && set.results[id] !== 'ng') set.results[id] = 'ok';
    if (v === 'ng') set.results[id] = 'ng';
    session.set('set', set);
  }

  // ---------- 難易度の絞り込み ----------
  let diffs = local.get('diff') || [1, 2, 3];
  const pass = p => diffs.includes(p.difficulty);

  function shuffle(a) {
    const b = a.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    return b;
  }

  // ---------- 表の描画 ----------
  function cell(v) {
    const td = el('td');
    if (v === null || v === undefined) {
      td.appendChild(el('span', 'null', 'NULL'));
    } else if (typeof v === 'number') {
      td.className = 'num';
      td.textContent = Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
    } else {
      td.textContent = String(v);
    }
    return td;
  }

  // result: { columns, rows }。markAgainst があれば、そちらに無い行に印を付ける
  function tableBox(caption, note, result, markAgainst) {
    const box = el('div', 'sq-table-box');
    const cap = el('div', 'cap', caption);
    if (note) cap.appendChild(el('span', 'note', note));
    box.appendChild(cap);
    const wrap = el('div', 'table-wrap');
    const t = el('table', 'sq');
    const trh = el('tr');
    result.columns.forEach(c => trh.appendChild(el('th', '', c)));
    const thead = el('thead'); thead.appendChild(trh); t.appendChild(thead);
    const tbody = el('tbody');
    // 列の数が同じときだけ、欲しい結果に無い行に印を付ける
    const pool = markAgainst && markAgainst.columns.length === result.columns.length ? countKeys(markAgainst.rows) : null;
    result.rows.forEach(r => {
      const tr = el('tr');
      r.forEach(v => tr.appendChild(cell(v)));
      if (pool) {
        const k = keyOf(r);
        if (pool.get(k)) pool.set(k, pool.get(k) - 1); else tr.className = 'diff';
      }
      tbody.appendChild(tr);
    });
    if (!result.rows.length) {
      const tr = el('tr');
      const td = el('td', 'empty-row', '（0 行）');
      td.colSpan = Math.max(1, result.columns.length);
      tr.appendChild(td); tbody.appendChild(tr);
    }
    t.appendChild(tbody);
    wrap.appendChild(t);
    box.appendChild(wrap);
    return box;
  }
  const keyOf = r => JSON.stringify(r.map(v => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v)));
  function countKeys(rows) {
    const m = new Map();
    rows.forEach(r => { const k = keyOf(r); m.set(k, (m.get(k) || 0) + 1); });
    return m;
  }
  // 外部キーが1つも無いときは、その表を表示しない
  const isEmptyFk = res => /の外部キー$/.test(res.name || '') && !res.missing && res.rows && !res.rows.length;

  const numOf = p => problems.indexOf(p) + 1; // 全体の中での問題番号
  const mark = s => (s === 'ok' ? '⭕' : s === 'ng' ? '❌' : '');
  function fmtDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  // ---------- 画面の切り替え ----------
  function showScreen(name) {
    ['home', 'quiz', 'done'].forEach(n => { $(n).hidden = n !== name; });
  }
  function go(hash) {
    if (location.hash === hash) route(); else location.hash = hash;
  }
  function route() {
    const h = location.hash;
    let m = h.match(/^#\/q\/(.+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (byId.has(id)) return showProblem(byId.get(id));
    }
    // 以前の形式（#3 = 3問目）にも対応
    m = h.match(/^#(\d+)$/);
    if (m && problems[Number(m[1]) - 1]) return go('#/q/' + encodeURIComponent(problems[Number(m[1]) - 1].id));
    if (h === '#/done' && set) return showDone();
    return showHome();
  }

  // ---------- ホーム ----------
  function showHome() {
    showScreen('home');
    document.title = 'SQLクイズ | 触って理解する基本情報';
    SQLProgress.reload();
    SQLProgress.saveSummary(problems);

    const st = p => SQLProgress.statusOf(p.id);
    const ok = problems.filter(p => st(p) === 'ok').length;
    const ng = problems.filter(p => st(p) === 'ng').length;
    $('sum-ok').textContent = ok;
    $('sum-ng').textContent = ng;
    $('sum-new').textContent = problems.length - ok - ng;
    $('sum-bar').style.width = (problems.length ? ok / problems.length * 100 : 0) + '%';
    $('sum-note').textContent = `全 ${problems.length} 問。` + (SQLProgress.canSave()
      ? '成績はこのブラウザに保存され、閉じても残ります。'
      : 'このブラウザでは成績を保存できません（プライベートモードなど）。');

    document.querySelectorAll('#diff-filter button').forEach(b => b.setAttribute('aria-pressed', String(diffs.includes(Number(b.dataset.d)))));
    const pool = problems.filter(pass);
    const review = pool.filter(p => st(p) === 'ng');
    $('random-btn').textContent = `全カテゴリからランダム（${pool.length}問）`;
    $('random-btn').disabled = !pool.length;
    $('review-btn').textContent = `間違えた問題だけ復習（${review.length}問）`;
    $('review-btn').disabled = !review.length;

    const list = $('cat-list');
    list.innerHTML = '';
    CATEGORIES.forEach(([cat, syn]) => {
      const all = problems.filter(p => p.category === cat);
      const items = all.filter(pass);
      const okN = items.filter(p => st(p) === 'ok').length;
      const card = el('div', 'sq-cat' + (items.length ? '' : ' empty'));
      const head = el('button', 'sq-cat-head');
      head.type = 'button';
      head.appendChild(el('span', 't', cat));
      head.appendChild(el('span', 'cnt', `⭕ ${okN} / ${items.length} 問`));
      head.disabled = !items.length;
      head.addEventListener('click', () => startSet(cat, items.map(p => p.id)));
      card.appendChild(head);
      card.appendChild(el('div', 'syn', syn));
      const bar = el('div', 'sq-bar'); const fill = el('i');
      fill.style.width = (items.length ? okN / items.length * 100 : 0) + '%';
      bar.appendChild(fill); card.appendChild(bar);
      const chips = el('div', 'sq-chips');
      items.forEach(p => {
        const s = st(p);
        const c = el('button', 'sq-chip' + (s ? ' ' + s : ''), `${numOf(p)}${mark(s)}`);
        c.type = 'button';
        c.title = `問${numOf(p)}（${'★'.repeat(p.difficulty)}）${s === 'ok' ? '正解済み' : s === 'ng' ? '要復習' : '未挑戦'}：${p.question}`;
        c.setAttribute('aria-label', c.title);
        c.addEventListener('click', () => startSet(cat, items.map(x => x.id), p.id));
        chips.appendChild(c);
      });
      if (!items.length) chips.appendChild(el('span', 'note', all.length ? 'この難易度の問題はありません' : '問題はまだありません'));
      card.appendChild(chips);
      list.appendChild(card);
    });
  }

  // ---------- 出題 ----------
  function showProblem(p) {
    // セットに入っていない問題を直接開いたときは、全問題を順番に解くセットにする
    if (!set || !set.ids.includes(p.id)) {
      set = { title: '全問題', ids: problems.map(x => x.id), results: {} };
      session.set('set', set);
    }
    current = p;
    solvedHere = false;
    shownHere = false;
    showScreen('quiz');
    document.title = `問${numOf(p)} | SQLクイズ`;

    const pos = set.ids.indexOf(p.id);
    $('set-label').textContent = `${set.title}　${pos + 1} / ${set.ids.length}`;
    $('prev-btn').disabled = pos === 0;
    $('next-nav-btn').textContent = pos === set.ids.length - 1 ? '終了 →' : '次へ →';

    $('q-num').textContent = `問${numOf(p)}`;
    $('q-cat').textContent = p.category;
    $('q-diff').textContent = '★'.repeat(p.difficulty);
    $('q-diff').title = `難易度 ${p.difficulty}`;
    $('q-text').textContent = p.question;
    renderStatus();

    const src = $('source-tables');
    src.innerHTML = '';
    (p.tables || []).forEach(t => {
      src.appendChild(tableBox(t.name, `（${t.rows.length} 行）`, { columns: t.columns.map(c => c[0]), rows: t.rows }));
    });
    if (!(p.tables || []).length) src.appendChild(el('p', 'note', '（元の表はありません。新しく表を作る問題です）'));

    const expected = grader.expectedFor(p);
    const expBox = $('expected');
    expBox.innerHTML = '';
    $('expected-title').textContent = { select: '欲しい出力結果', content: '欲しい出力結果（実行後の表）', structure: '欲しい出力結果（作る表の構造）' }[expected.mode];
    if (expected.main.error) expBox.appendChild(el('div', 'card sq-error', '模範解答を実行できませんでした（問題データの誤り）: ' + expected.main.error));
    else expected.main.results.forEach(res => {
      if (isEmptyFk(res)) return;
      expBox.appendChild(tableBox(res.name || '欲しい出力結果', `（${res.rows.length} 行）`, res));
    });
    const notes = [];
    if (expected.mode === 'select') {
      notes.push(p.orderMatters ? '行の並び順も採点します。' : '行の並び順は問いません。');
      if (p.compareColumnNames) notes.push('列名（見出し）も採点します。');
      else notes.push('列名（見出し）は問いません。列の順番は合わせてください。');
    } else if (expected.mode === 'content') {
      notes.push('SQL を実行した後の表の中身を比べます。行の並び順は問いません。');
      if (p.compareColumnNames) notes.push('ビューの列名も採点します。');
    } else {
      notes.push('作った表の列名・型・主キー・NOT NULL（と外部キー）を比べます。主キーの列は自動的に NOT NULL として扱います。');
    }
    $('order-note').textContent = notes.join(' ');

    $('sql-input').value = '';
    $('hint').hidden = true;
    $('hint').textContent = '';
    $('result').innerHTML = '';
    $('answer-box').hidden = true;
    $('next-btn').hidden = true;
    $('next-btn').textContent = pos === set.ids.length - 1 ? '結果を見る →' : '次の問題へ →';
    window.scrollTo(0, 0);
  }

  // 前回までの成績を問題の上に表示する
  function renderStatus() {
    const meta = document.querySelector('#quiz .sq-meta');
    let s = meta.querySelector('.sq-status');
    if (!s) { s = el('span'); meta.appendChild(s); }
    const e = SQLProgress.entryOf(current.id);
    if (!e || !e.s) { s.className = 'sq-status'; s.textContent = '未挑戦'; return; }
    s.className = 'sq-status ' + e.s;
    s.textContent = `${e.s === 'ok' ? '⭕ 正解済み' : '❌ 要復習'}（${fmtDate(e.at)}）`;
  }

  function nextInSet(step) {
    const pos = set.ids.indexOf(current.id) + step;
    if (pos < 0) return;
    if (pos >= set.ids.length) return go('#/done');
    go('#/q/' + encodeURIComponent(set.ids[pos]));
  }

  // ---------- 採点結果の表示 ----------
  function renderResult(r, p) {
    const out = $('result');
    out.innerHTML = '';
    const box = el('div', 'sq-verdict ' + r.verdict);
    if (r.verdict === 'empty') {
      box.appendChild(el('div', '', r.message));
      out.appendChild(box);
      return;
    }
    if (r.verdict === 'ok') {
      box.appendChild(el('div', 'v', '⭕ 正解！'));
      if (shownHere) box.appendChild(el('p', 'note', '答えを見た後の正解なので、この問題は「間違えた問題」に残ります。次は見ないで解いてみましょう。'));
      box.appendChild(explanation(p));
      $('next-btn').hidden = false;
      $('next-btn').focus();
    } else if (r.verdict === 'close') {
      box.appendChild(el('div', 'v', '△ 惜しい！'));
      box.appendChild(el('div', '', '考え方は合っています。次の書き方のミスを直して、もう一度回答してください。'));
      const ul = el('ul');
      r.messages.forEach(m => ul.appendChild(el('li', '', m)));
      box.appendChild(ul);
    } else {
      box.appendChild(el('div', 'v', '❌ 不正解'));
      box.appendChild(el('div', '', r.message));
      if (r.error) {
        const d = el('details');
        d.appendChild(el('summary', '', 'エラーの原文（SQLite の英語メッセージ）'));
        d.appendChild(el('pre', '', r.error));
        box.appendChild(d);
      }
      r.expected.forEach((exp, i) => {
        const user = r.user && r.user[i];
        if (isEmptyFk(exp) && (!user || isEmptyFk(user))) return;
        const label = exp.name ? `：${exp.name}` : '';
        const cmp = el('div', 'sq-compare');
        if (user && user.missing) cmp.appendChild(tableBox('あなたの結果' + label, '', { columns: ['（なし）'], rows: [['見つかりません']] }));
        else if (user) cmp.appendChild(tableBox('あなたの結果' + label, `（${user.rows.length} 行）`, user, exp));
        else cmp.appendChild(tableBox('あなたの結果', '', { columns: ['エラー'], rows: [['実行できませんでした']] }));
        cmp.appendChild(tableBox('欲しい結果' + label, `（${exp.rows.length} 行）`, exp));
        box.appendChild(cmp);
      });
      if (box.querySelector('tr.diff')) box.appendChild(el('p', 'note', '色の付いた行は、欲しい出力結果にない行です。'));
      box.appendChild(el('p', 'note', '「答えを見る」で模範解答と解説を確認できます。'));
    }
    out.appendChild(box);
  }

  function explanation(p) {
    const d = el('div', 'sq-explain');
    d.appendChild(el('div', '', '模範解答の例：'));
    d.appendChild(el('pre', 'sq-code', p.answerSql));
    d.appendChild(el('div', '', p.explanation));
    return d;
  }

  // 成績の記録：⭕・❌・△ を保存する。答えを見た後の⭕は「要復習」のまま残す
  function submit() {
    const p = current;
    const r = grader.grade(p, $('sql-input').value);
    renderResult(r, p);
    if (r.verdict === 'ok') {
      if (!shownHere) SQLProgress.record(p.id, 'ok');
      markInSet(p.id, shownHere ? 'ng' : 'ok');
      solvedHere = true;
    } else if (r.verdict === 'ng') {
      SQLProgress.record(p.id, 'ng');
      markInSet(p.id, 'ng');
    } else if (r.verdict === 'close') {
      SQLProgress.record(p.id, 'close');
    }
    renderStatus();
  }

  // ---------- セット終了 ----------
  function showDone() {
    showScreen('done');
    document.title = '結果 | SQLクイズ';
    const okN = set.ids.filter(id => set.results[id] === 'ok').length;
    $('done-title').textContent = `「${set.title}」おつかれさまでした`;
    $('done-score').textContent = `⭕ ${okN} / ${set.ids.length} 問`;
    const ul = $('done-list');
    ul.innerHTML = '';
    set.ids.forEach(id => {
      const p = byId.get(id);
      const r = set.results[id];
      const li = el('li');
      li.appendChild(el('span', '', (r === 'ok' ? '⭕ ' : r === 'ng' ? '❌ ' : '－ ') + `問${numOf(p)}　`));
      const a = el('a', '', p.question.length > 40 ? p.question.slice(0, 40) + '…' : p.question);
      a.href = '#/q/' + encodeURIComponent(id);
      li.appendChild(a);
      if (!r) li.appendChild(el('span', 'note', '（未回答）'));
      ul.appendChild(li);
    });
    const retry = set.ids.filter(id => set.results[id] !== 'ok');
    $('done-retry').disabled = !retry.length;
    $('done-retry').textContent = retry.length ? `ここで間違えた・飛ばした問題をもう一度（${retry.length}問）` : 'ぜんぶ正解です';
    $('done-retry').onclick = () => startSet(set.title + '（やり直し）', retry);
  }

  // ---------- 起動 ----------
  async function start() {
    try {
      const base = 'vendor/sql.js-1.10.3/';
      const [wasm, data] = await Promise.all([
        fetch(base + 'sql-wasm.wasm').then(res => { if (!res.ok) throw new Error('sql-wasm.wasm ' + res.status); return res.arrayBuffer(); }),
        fetch('data/problems.json', { cache: 'no-cache' }).then(res => { if (!res.ok) throw new Error('problems.json ' + res.status); return res.json(); }),
      ]);
      // wasm を先に読み込んで渡すと、サーバーの MIME 設定に左右されずに起動できる
      const SQL = await initSqlJs({ wasmBinary: wasm });
      grader = SQLGrader.createGrader(SQL);
      problems = data.problems;
      byId = new Map(problems.map(p => [p.id, p]));
    } catch (e) {
      $('loading').hidden = true;
      const err = $('load-error');
      err.hidden = false;
      err.textContent = '読み込みに失敗しました。ファイルを直接開いた場合は、簡易サーバ（python -m http.server）経由で開いてください。詳細: ' + (e && e.message || e);
      return;
    }
    set = session.get('set');
    if (set && !(set.ids || []).every(id => byId.has(id))) set = null;

    // ホーム
    document.querySelectorAll('#diff-filter button').forEach(b => b.addEventListener('click', () => {
      const d = Number(b.dataset.d);
      diffs = diffs.includes(d) ? diffs.filter(x => x !== d) : diffs.concat(d).sort();
      local.set('diff', diffs);
      showHome();
    }));
    $('random-btn').addEventListener('click', () => startSet('ランダム', shuffle(problems.filter(pass).map(p => p.id))));
    $('review-btn').addEventListener('click', () => startSet('間違えた問題の復習', problems.filter(p => pass(p) && SQLProgress.statusOf(p.id) === 'ng').map(p => p.id)));
    $('reset-btn').addEventListener('click', () => {
      if (!confirm('このブラウザに保存した SQLクイズの成績をすべて消します。元に戻せません。よろしいですか？')) return;
      SQLProgress.clear();
      showHome();
    });

    // 出題
    $('home-btn').addEventListener('click', () => go('#/'));
    $('prev-btn').addEventListener('click', () => nextInSet(-1));
    $('next-nav-btn').addEventListener('click', () => nextInSet(1));
    $('next-btn').addEventListener('click', () => { nextInSet(1); if (!$('quiz').hidden) $('sql-input').focus(); });
    $('answer-btn').addEventListener('click', submit);
    $('hint-btn').addEventListener('click', () => {
      const h = $('hint');
      h.textContent = '';
      h.appendChild(el('b', '', 'ヒント'));
      h.appendChild(document.createTextNode('　' + current.hint));
      h.hidden = false;
    });
    $('show-btn').addEventListener('click', () => {
      if (!solvedHere && !shownHere) {
        SQLProgress.record(current.id, 'shown');
        markInSet(current.id, 'ng');
        renderStatus();
      }
      shownHere = true;
      const box = $('answer-box');
      box.innerHTML = '';
      box.appendChild(el('h3', '', '模範解答と解説'));
      box.appendChild(explanation(current));
      if (!solvedHere) box.appendChild(el('p', 'note', '答えを見た問題は「間違えた問題」に入ります。あとで復習しましょう。'));
      box.hidden = false;
      box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    // Enter で回答、Shift+Enter で改行。
    // 日本語入力の変換を確定する Enter は isComposing が true（Safari では keyCode 229）になるので送信しない。
    $('sql-input').addEventListener('keydown', e => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      submit();
    });

    // セット終了
    $('done-home').addEventListener('click', () => go('#/'));

    window.addEventListener('hashchange', route);
    $('loading').hidden = true;
    route();
  }

  start();
})();
