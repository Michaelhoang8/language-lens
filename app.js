import { parseDFA, run, compare, minimize, toDot, examples } from './core.js';
const $ = (id) => document.getElementById(id),
  sides = ['a', 'b'];
const esc = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let analysis = null,
  revision = 0;
function notice(text, error = false) {
  $('notice').textContent = text;
  $('notice').className = error ? 'error' : '';
}
function controls(ready) {
  for (const id of [
    'report',
    'trace-word',
    'witness',
    ...sides.flatMap((s) => ['download-' + s, 'minimize-' + s, 'dot-' + s]),
  ])
    $(id).disabled = !ready;
}
function invalidate() {
  revision++;
  analysis = null;
  controls(false);
  $('verdict-title').textContent = 'Comparison pending';
  $('verdict-text').textContent =
    'Compare again to update the proof, transition tables, and minimizations.';
  $('symbol').textContent = '?';
  $('witness').hidden = true;
  $('paths').replaceChildren();
  $('word-notice').textContent = '';
  for (const side of sides) {
    $('table-' + side).replaceChildren();
    $('min-' + side).replaceChildren();
    $('summary-' + side).textContent = 'Awaiting validation';
    $('min-summary-' + side).textContent = 'Minimization · pending';
  }
  notice('Edits are pending. Compare the languages to continue.');
}
function renderMachine(side) {
  const dfa = analysis[side],
    min = analysis['min' + side];
  $('summary-' + side).textContent =
    `${dfa.states.length} states · ${dfa.alphabet.length} symbols · start ${dfa.start}`;
  $('table-' + side).innerHTML =
    `<table><caption>→ start state · * accepting state</caption><thead><tr><th scope="col">State</th>${dfa.alphabet.map((s) => `<th scope="col">${s}</th>`).join('')}</tr></thead><tbody>${dfa.states.map((state) => `<tr><td>${state === dfa.start ? '→ ' : ''}${dfa.accept.includes(state) ? '* ' : ''}${state}</td>${dfa.alphabet.map((symbol) => `<td>${dfa.transitions.find((t) => t[0] === state && t[1] === symbol)[2]}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  $('min-summary-' + side).textContent =
    `Minimization · ${dfa.states.length} → ${min.dfa.states.length} states`;
  $('min-' + side).innerHTML =
    `<p class="min-note">${min.unreachable.length} unreachable state${min.unreachable.length === 1 ? '' : 's'} removed${min.unreachable.length ? ': ' + min.unreachable.join(', ') : ''}. ${min.rounds.length - 1} refinement round${min.rounds.length === 2 ? '' : 's'} after the initial accepting/rejecting split.</p><ul class="group-list">${min.groups.map((g) => `<li><b>${g.state}</b> ← { ${g.members.join(', ')} }</li>`).join('')}</ul>`;
}
function traceWord() {
  if (!analysis) return;
  try {
    const word = $('word').value,
      results = sides.map((side) => run(analysis[side], word));
    $('word-notice').textContent = word.length
      ? `${Array.from(word).length} symbols · paths show the first 80 transitions.`
      : 'ε · no symbols consumed.';
    $('paths').innerHTML = results
      .map(
        (result, i) =>
          `<div class="path"><div class="path-head"><span>MACHINE ${sides[i].toUpperCase()}</span><strong>${result.accepted ? 'ACCEPTS' : 'REJECTS'}</strong></div><div class="path-track">${result.path
            .slice(0, 81)
            .map(
              (state, j) =>
                (j ? `<span class="edge">${esc(Array.from(word)[j - 1])} →</span>` : '') +
                `<span class="state ${analysis[sides[i]].accept.includes(state) ? 'final' : ''}">${esc(state)}</span>`,
            )
            .join(
              '',
            )}${result.path.length > 81 ? '<span class="edge">…</span>' : ''}</div>${result.path.length > 81 ? `<p>Final state after the complete word: ${esc(result.state)}.</p>` : ''}</div>`,
      )
      .join('');
  } catch (error) {
    $('word-notice').textContent = error.message;
    $('paths').replaceChildren();
  }
}
function build() {
  revision++;
  try {
    const a = parseDFA($('source-a').value),
      b = parseDFA($('source-b').value);
    analysis = {
      format: 'language-lens-v1',
      a,
      b,
      mina: minimize(a),
      minb: minimize(b),
      comparison: compare(a, b),
    };
    controls(true);
    for (const side of sides) renderMachine(side);
    const c = analysis.comparison;
    $('symbol').textContent = c.equivalent ? '≡' : '≠';
    $('verdict-title').textContent = c.equivalent ? 'Equivalent languages' : 'Different languages';
    $('verdict-text').textContent = c.equivalent
      ? `All ${c.visited} reachable state pairs agree on acceptance. This is an exhaustive equivalence check, not a sample of words.`
      : `Shortest counterexample: ${c.witness === '' ? 'ε (the empty string)' : JSON.stringify(c.witness)}. Machine A ${c.left.accepted ? 'accepts' : 'rejects'}; machine B ${c.right.accepted ? 'accepts' : 'rejects'}. Examined ${c.visited} state pairs in breadth-first order.`;
    $('witness').hidden = c.equivalent;
    notice('Both machines are valid. The comparison and minimizations are current.');
    traceWord();
  } catch (error) {
    invalidate();
    notice(error.message, true);
  }
}
function download(name, value, mime = 'application/json') {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    url = URL.createObjectURL(new Blob([text], { type: mime })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function loadExample() {
  const example = examples[$('example').value];
  $('source-a').value = JSON.stringify(example.left, null, 2);
  $('source-b').value = JSON.stringify(example.right, null, 2);
  build();
}
$('compare').addEventListener('click', build);
$('example').addEventListener('change', loadExample);
for (const side of sides) {
  $('source-' + side).addEventListener('input', invalidate);
  $('download-' + side).addEventListener('click', () => {
    if (analysis) download(`machine-${side}.json`, analysis[side]);
  });
  $('dot-' + side).addEventListener('click', () => {
    if (analysis) download(`machine-${side}.dot`, toDot(analysis[side]), 'text/plain');
  });
  $('minimize-' + side).addEventListener('click', () => {
    if (!analysis) return;
    const original = analysis[side].states.length,
      result = analysis['min' + side].dfa;
    $('source-' + side).value = JSON.stringify(result, null, 2);
    build();
    notice(
      `Machine ${side.toUpperCase()} replaced with its ${result.states.length}-state minimum (was ${original}). Comparison refreshed.`,
    );
  });
  $('import-' + side).addEventListener('change', async () => {
    const file = $('import-' + side).files[0];
    $('import-' + side).value = '';
    if (!file) return;
    const version = ++revision;
    try {
      if (file.size > 200000) throw Error('Machine file exceeds 200 KB.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
      const candidate = parseDFA(text);
      if (version !== revision) return;
      $('source-' + side).value = JSON.stringify(candidate, null, 2);
      build();
    } catch (error) {
      if (version === revision)
        notice('Import failed: ' + error.message + ' Existing machine text is unchanged.', true);
    }
  });
}
$('word-form').addEventListener('submit', (event) => {
  event.preventDefault();
  traceWord();
});
$('word').addEventListener('input', () => {
  $('paths').replaceChildren();
  $('word-notice').textContent = 'Word changed. Trace it to update the paths.';
});
$('witness').addEventListener('click', () => {
  if (analysis && !analysis.comparison.equivalent) {
    $('word').value = analysis.comparison.witness;
    traceWord();
  }
});
$('report').addEventListener('click', () => {
  if (analysis) download('language-analysis.json', analysis);
});
loadExample();
