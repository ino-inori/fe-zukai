/* ===== 共通処理：テーマ切替・確認問題エンジン ===== */
(function () {
  const STORE = 'fe-zukai:';

  const store = {
    get(key) {
      try { return JSON.parse(localStorage.getItem(STORE + key)); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(STORE + key, JSON.stringify(value)); } catch (e) { /* 保存できない環境では無視 */ }
    }
  };

  // ---- テーマ（ライト/ダーク） ----
  const savedTheme = store.get('theme');
  if (savedTheme) document.documentElement.dataset.theme = savedTheme;

  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    if (t) return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const label = () => { btn.textContent = currentTheme() === 'dark' ? '☀ ライト' : '☾ ダーク'; };
    label();
    btn.addEventListener('click', () => {
      const next = currentTheme() === 'dark' ? 'light' : 'dark';
      document.documentElement.dataset.theme = next;
      store.set('theme', next);
      label();
    });
  });

  // ---- 確認問題 ----
  // questions: [{ q, choices: [..], answer: 正解のindex, explain }]
  function quiz(container, topicId, questions) {
    const marks = ['ア', 'イ', 'ウ', 'エ', 'オ'];
    let answered = 0, correct = 0;
    container.innerHTML = '';

    questions.forEach((orig, qi) => {
      // 正解の位置が偏らないよう、選択肢を毎回シャッフルする
      const order = orig.choices.map((_, i) => i);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      const item = { ...orig, choices: order.map(i => orig.choices[i]), answer: order.indexOf(orig.answer) };
      const box = document.createElement('div');
      box.className = 'card quiz-q';
      box.innerHTML = `<div class="qtext"><span class="qnum">問${qi + 1}</span>${item.q}</div>`;
      const list = document.createElement('div');
      list.className = 'quiz-choices';
      const explain = document.createElement('div');
      explain.className = 'quiz-explain';
      explain.hidden = true;

      item.choices.forEach((c, ci) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `<span class="mark">${marks[ci]}</span>${c}`;
        b.addEventListener('click', () => {
          const buttons = list.querySelectorAll('button');
          buttons.forEach(x => { x.disabled = true; });
          buttons[item.answer].classList.add('correct');
          const ok = ci === item.answer;
          if (!ok) b.classList.add('wrong');
          answered++;
          if (ok) correct++;
          explain.innerHTML = `<span class="verdict ${ok ? 'ok' : 'ng'}">${ok ? '○ 正解！' : '× 不正解'}</span>　正解は「${marks[item.answer]}」<br>${item.explain}`;
          explain.hidden = false;
          if (answered === questions.length) finish();
        });
        list.appendChild(b);
      });

      box.appendChild(list);
      box.appendChild(explain);
      container.appendChild(box);
    });

    function finish() {
      const prev = store.get('quiz:' + topicId);
      if (!prev || correct >= prev.correct) store.set('quiz:' + topicId, { correct, total: questions.length });
      const res = document.createElement('div');
      res.className = 'quiz-result';
      const msg = correct === questions.length ? '全問正解！この分野はバッチリです。'
        : correct >= questions.length * 0.6 ? 'あと少し！間違えた問題の解説を読み直しましょう。'
        : '図解をもう一度触ってから再挑戦してみましょう。';
      res.innerHTML = `<div class="score">${correct} / ${questions.length} 問正解</div><p>${msg}</p>`;
      const again = document.createElement('button');
      again.className = 'btn primary';
      again.textContent = 'もう一度解く';
      again.addEventListener('click', () => {
        quiz(container, topicId, questions);
        container.scrollIntoView({ behavior: 'smooth' });
      });
      res.appendChild(again);
      container.appendChild(res);
    }
  }

  window.FE = { store, quiz };
})();
