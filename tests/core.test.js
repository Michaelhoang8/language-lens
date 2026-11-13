import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDFA, run, compare, minimize, toDot, examples, DEAD } from '../core.js';
test('validation requires a complete deterministic transition function', () => {
  assert.deepEqual(parseDFA(JSON.stringify(examples.equivalent.left)), examples.equivalent.left);
  for (const patch of [
    { states: ['x', 'x'] },
    { alphabet: ['ab'] },
    { start: 'missing' },
    { accept: ['missing'] },
    { transitions: [] },
    { unknown: true },
  ])
    assert.throws(() => parseDFA({ ...examples.equivalent.left, ...patch }));
  const bad = structuredClone(examples.equivalent.left);
  bad.transitions[1] = bad.transitions[0];
  assert.throws(() => parseDFA(bad), /Duplicate/);
  assert.throws(() => parseDFA('{'));
  assert.throws(() => parseDFA(' '.repeat(50001)));
});
test('execution includes the start state and rejects out-of-alphabet symbols', () => {
  assert.equal(run(examples.equivalent.left, '').accepted, true);
  assert.deepEqual(run(examples.equivalent.left, '101').path, ['E', 'O', 'O', 'E']);
  assert.deepEqual(run(examples.equivalent.left, 'x1').path, ['E', DEAD, DEAD]);
  assert.equal(run(examples.equivalent.left, 'x').accepted, false);
  assert.throws(() => run(examples.equivalent.left, '1'.repeat(2001)));
});
test('comparison produces the shortest witness and handles empty witnesses', () => {
  const diff = compare(examples.difference.left, examples.difference.right);
  assert.equal(diff.witness, '10');
  assert.equal(diff.left.accepted, false);
  assert.equal(diff.right.accepted, true);
  const empty = compare(examples.empty.left, examples.empty.right);
  assert.equal(empty.witness, '');
  assert.equal(empty.equivalent, false);
  assert.equal(compare(examples.equivalent.left, examples.equivalent.right).equivalent, true);
});
test('different alphabets are compared over their union with implicit rejecting sinks', () => {
  const a = {
    states: ['A'],
    alphabet: ['a'],
    start: 'A',
    accept: ['A'],
    transitions: [['A', 'a', 'A']],
  };
  const b = {
    states: ['B'],
    alphabet: ['b'],
    start: 'B',
    accept: ['B'],
    transitions: [['B', 'b', 'B']],
  };
  assert.equal(compare(a, b).witness, 'a');
  assert.equal(compare({ ...a, accept: [] }, { ...b, accept: [] }).equivalent, true);
});
test('minimization removes unreachable states and merges equivalent reachable states', () => {
  const result = minimize(examples.equivalent.right);
  assert.equal(result.dfa.states.length, 2);
  assert.equal(result.reachableStates, 4);
  assert.deepEqual(result.unreachable, ['Unused']);
  assert.deepEqual(result.groups, [
    { state: 'q0', members: ['E0', 'E1'] },
    { state: 'q1', members: ['O1', 'O0'] },
  ]);
  assert.equal(compare(examples.equivalent.right, result.dfa).equivalent, true);
  assert.deepEqual(minimize(result.dfa).dfa, result.dfa);
});
test('all accepting and all rejecting machines minimize to one state', () => {
  for (const accept of [[], examples.equivalent.left.states]) {
    const result = minimize({ ...examples.equivalent.left, accept });
    assert.equal(result.dfa.states.length, 1);
    assert.equal(result.dfa.accept.length, accept.length ? 1 : 0);
  }
});
function words(alphabet, max) {
  const all = [''];
  let layer = [''];
  for (let i = 0; i < max; i++) {
    layer = layer.flatMap((w) => alphabet.map((a) => w + a));
    all.push(...layer);
  }
  return all;
}
function independentAccept(dfa, word, start = dfa.start) {
  let current = start;
  for (const c of word) {
    const transition = dfa.transitions.find((t) => t[0] === current && t[1] === c);
    if (!transition) return false;
    current = transition[2];
  }
  return dfa.accept.includes(current);
}
test('generated minimized machines preserve language and have distinguishable state pairs', () => {
  let seed = 73;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed;
  };
  const inputs = words(['a', 'b'], 6);
  for (let sample = 0; sample < 80; sample++) {
    const states = Array.from({ length: 2 + (random() % 5) }, (_, i) => 's' + i);
    const dfa = {
      states,
      alphabet: ['a', 'b'],
      start: 's0',
      accept: states.filter(() => random() % 3 === 0),
      transitions: states.flatMap((s) =>
        ['a', 'b'].map((a) => [s, a, states[random() % states.length]]),
      ),
    };
    const min = minimize(dfa).dfa;
    for (const word of inputs)
      assert.equal(independentAccept(dfa, word), independentAccept(min, word));
    for (let i = 0; i < min.states.length; i++)
      for (let j = i + 1; j < min.states.length; j++)
        assert.ok(
          inputs.some(
            (word) =>
              independentAccept(min, word, min.states[i]) !==
              independentAccept(min, word, min.states[j]),
          ),
        );
    assert.equal(compare(dfa, min).equivalent, true);
  }
});
test('shortest witness agrees with independent length-ordered enumeration', () => {
  const machines = [];
  for (let mask = 0; mask < 16; mask++) {
    const states = ['A', 'B'];
    machines.push({
      states,
      alphabet: ['0'],
      start: 'A',
      accept: states.filter((_, i) => mask & (1 << i)),
      transitions: [
        ['A', '0', states[(mask >> 2) & 1]],
        ['B', '0', states[(mask >> 3) & 1]],
      ],
    });
  }
  const inputs = words(['0'], 5);
  for (const a of machines)
    for (const b of machines) {
      const witness = inputs.find(
        (word) => independentAccept(a, word) !== independentAccept(b, word),
      );
      const result = compare(a, b);
      assert.equal(result.witness, witness ?? null);
      assert.equal(result.equivalent, witness === undefined);
    }
});
test('DOT export is deterministic and model operations do not mutate inputs', () => {
  const dfa = structuredClone(examples.equivalent.right),
    copy = structuredClone(dfa);
  minimize(dfa);
  compare(dfa, examples.equivalent.left);
  run(dfa, '11');
  assert.deepEqual(dfa, copy);
  assert.match(toDot(dfa), /rankdir=LR/);
  assert.match(toDot(dfa), /shape=doublecircle/);
});
