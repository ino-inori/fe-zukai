/* ===== SQLクイズ 出題画面 ===== */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  let problems = [];
  let grader = null;
  let index = 0;

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

  // result: { columns, rows }。markRows: 欲しい結果に無い行に印を付けるための集合
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

  // ---------- 問題の表示 ----------
  function show(i) {
    index = Math.max(0, Math.min(problems.length - 1, i));
    const p = problems[index];
    history.replaceState(null, '', '#' + (index + 1));
    $('problem-select').value = String(index);
    $('prev-btn').disabled = index === 0;
    $('next-nav-btn').disabled = index === problems.length - 1;

    $('q-num').textContent = `問${index + 1} / ${problems.length}`;
    $('q-cat').textContent = p.category;
    $('q-diff').textContent = '★'.repeat(p.difficulty);
    $('q-diff').title = `難易度 ${p.difficulty}`;
    $('q-text').textContent = p.question;

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
    $('next-btn').textContent = index === problems.length - 1 ? '最初の問題へ →' : '次の問題へ →';
  }

  // 外部キーが1つも無いときは、その表を表示しない
  const isEmptyFk = res => /の外部キー$/.test(res.name || '') && !res.missing && res.rows && !res.rows.length;

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

  function submit() {
    const p = problems[index];
    const r = grader.grade(p, $('sql-input').value);
    renderResult(r, p);
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
    } catch (e) {
      $('loading').hidden = true;
      const err = $('load-error');
      err.hidden = false;
      err.textContent = '読み込みに失敗しました。ファイルを直接開いた場合は、簡易サーバ（python -m http.server）経由で開いてください。詳細: ' + (e && e.message || e);
      return;
    }

    const sel = $('problem-select');
    problems.forEach((p, i) => {
      const o = el('option', '', `問${i + 1}　${p.category}　${'★'.repeat(p.difficulty)}　${p.question.slice(0, 28)}${p.question.length > 28 ? '…' : ''}`);
      o.value = String(i);
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => show(Number(sel.value)));
    $('prev-btn').addEventListener('click', () => show(index - 1));
    $('next-nav-btn').addEventListener('click', () => show(index + 1));
    $('next-btn').addEventListener('click', () => { show(index === problems.length - 1 ? 0 : index + 1); $('sql-input').focus(); });
    $('answer-btn').addEventListener('click', submit);
    $('hint-btn').addEventListener('click', () => {
      const h = $('hint');
      h.textContent = '';
      h.appendChild(el('b', '', 'ヒント'));
      h.appendChild(document.createTextNode('　' + problems[index].hint));
      h.hidden = false;
    });
    $('show-btn').addEventListener('click', () => {
      const box = $('answer-box');
      box.innerHTML = '';
      box.appendChild(el('h3', '', '模範解答と解説'));
      box.appendChild(explanation(problems[index]));
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

    $('loading').hidden = true;
    $('quiz').hidden = false;
    const fromHash = parseInt(location.hash.slice(1), 10);
    show(Number.isFinite(fromHash) ? fromHash - 1 : 0);
  }

  start();
})();
