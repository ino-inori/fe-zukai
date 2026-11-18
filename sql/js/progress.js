/* ===== SQLクイズ 成績の保存 =====
 * 問題ごとの最新の結果（正解・不正解）と日時を、ブラウザの localStorage に保存する。
 * アカウント不要・サーバーへの送信なし。保存できない環境（プライベートモードなど）でも画面は動く。
 *
 * 保存の形（キー fe-zukai:sql:progress）:
 *   { "問題id": { s: "ok" | "ng", at: "最後に解いた日時", ok: 正解回数, ng: 不正解回数, close: 惜しい回数,
 *                 shown: 答えを見た回数, log: [["日時", "ok" | "ng" | "close" | "shown"], …（新しい10件）] } }
 */
(function () {
  'use strict';
  const KEY = 'fe-zukai:sql:progress';
  const SUMMARY_KEY = 'fe-zukai:sql:summary'; // トップページのカードに出す「正解数 / 問題数」

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }

  let data = read();

  // verdict: 'ok'（正解）/ 'ng'（不正解）/ 'close'（惜しい）/ 'shown'（正解する前に答えを見た）
  // 惜しいは不正解に数えない。答えを見た問題は復習の対象（ng）にする。
  function record(id, verdict) {
    data = read(); // 別のタブで解いた結果も消さないように、書く直前に読み直す
    const now = new Date().toISOString();
    const e = data[id] || { s: null, at: null, ok: 0, ng: 0, close: 0, shown: 0, log: [] };
    if (verdict === 'ok') { e.s = 'ok'; e.ok++; }
    else if (verdict === 'ng') { e.s = 'ng'; e.ng++; }
    else if (verdict === 'shown') { e.s = 'ng'; e.shown++; }
    else if (verdict === 'close') { e.close++; }
    e.at = now;
    e.log = [[now, verdict]].concat(e.log || []).slice(0, 10);
    data[id] = e;
    return write(data);
  }

  const statusOf = id => (data[id] && data[id].s) || null; // 'ok' | 'ng' | null（未挑戦）
  const entryOf = id => data[id] || null;

  function saveSummary(problems) {
    const ok = problems.filter(p => statusOf(p.id) === 'ok').length;
    try { localStorage.setItem(SUMMARY_KEY, JSON.stringify({ ok, total: problems.length })); } catch (e) { /* 無視 */ }
  }

  function clear() {
    data = {};
    try { localStorage.removeItem(KEY); localStorage.removeItem(SUMMARY_KEY); } catch (e) { /* 無視 */ }
  }

  function canSave() {
    try { const k = KEY + ':test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch (e) { return false; }
  }

  window.SQLProgress = { record, statusOf, entryOf, saveSummary, clear, canSave, reload: () => { data = read(); } };
})();
