export const DEAD = '∅';
const MAX_STATES = 32,
  MAX_ALPHABET = 6;

export function parseDFA(input) {
  if (typeof input === 'string') {
    if (input.length > 50000) throw Error('Machine JSON exceeds 50,000 characters.');
    try {
      input = JSON.parse(input);
    } catch {
      throw Error('Machine must be valid JSON.');
    }
  }
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (k) => !['states', 'alphabet', 'start', 'accept', 'transitions'].includes(k),
    )
  )
    throw Error('Use only states, alphabet, start, accept, and transitions.');
  const { states, alphabet, start, accept, transitions } = input;
  if (
    !Array.isArray(states) ||
    !states.length ||
    states.length > MAX_STATES ||
    states.some((s) => typeof s !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(s)) ||
    new Set(states).size !== states.length
  )
    throw Error(
      'Use 1–32 unique state names: a letter followed by up to 15 letters, digits, or underscores.',
    );
  if (
    !Array.isArray(alphabet) ||
    !alphabet.length ||
    alphabet.length > MAX_ALPHABET ||
    alphabet.some((a) => typeof a !== 'string' || !/^[A-Za-z0-9]$/.test(a)) ||
    new Set(alphabet).size !== alphabet.length
  )
    throw Error('Use 1–6 distinct single-letter or digit alphabet symbols.');
  if (
    !states.includes(start) ||
    !Array.isArray(accept) ||
    accept.some((s) => !states.includes(s)) ||
    new Set(accept).size !== accept.length
  )
    throw Error(
      'Start and accepting states must reference declared states; accepting states cannot repeat.',
    );
  if (!Array.isArray(transitions) || transitions.length !== states.length * alphabet.length)
    throw Error(
      'Provide exactly one [from, symbol, to] transition for each state and alphabet symbol.',
    );
  const seen = new Set();
  for (const t of transitions) {
    if (
      !Array.isArray(t) ||
      t.length !== 3 ||
      !states.includes(t[0]) ||
      !alphabet.includes(t[1]) ||
      !states.includes(t[2])
    )
      throw Error('Each transition must be [declared state, alphabet symbol, declared state].');
    const key = t[0] + '\0' + t[1];
    if (seen.has(key)) throw Error(`Duplicate transition from ${t[0]} on ${t[1]}.`);
    seen.add(key);
  }
  return structuredClone({ states, alphabet, start, accept, transitions });
}

function machine(input) {
  const dfa = parseDFA(input);
  return {
    dfa,
    accept: new Set(dfa.accept),
    edges: new Map(dfa.transitions.map(([a, s, b]) => [a + '\0' + s, b])),
  };
}
function next(m, state, symbol) {
  return state === DEAD ? DEAD : (m.edges.get(state + '\0' + symbol) ?? DEAD);
}

export function run(input, word) {
  if (typeof word !== 'string' || word.length > 2000)
    throw Error('Input words are limited to 2,000 characters.');
  const m = machine(input);
  let state = m.dfa.start;
  const path = [state];
  for (const symbol of word) {
    state = next(m, state, symbol);
    path.push(state);
  }
  return { word, accepted: m.accept.has(state), state, path };
}

export function compare(left, right) {
  const a = machine(left),
    b = machine(right),
    alphabet = [...new Set([...a.dfa.alphabet, ...b.dfa.alphabet])].sort();
  const key = (x, y) => JSON.stringify([x, y]);
  const queue = [{ a: a.dfa.start, b: b.dfa.start, parent: -1, symbol: '' }],
    seen = new Set([key(a.dfa.start, b.dfa.start)]);
  for (let head = 0; head < queue.length; head++) {
    const item = queue[head];
    if (a.accept.has(item.a) !== b.accept.has(item.b)) {
      const chars = [];
      let at = head;
      while (queue[at].parent !== -1) {
        chars.push(queue[at].symbol);
        at = queue[at].parent;
      }
      const witness = chars.reverse().join('');
      return {
        equivalent: false,
        witness,
        alphabet,
        visited: head + 1,
        discovered: queue.length,
        left: run(a.dfa, witness),
        right: run(b.dfa, witness),
      };
    }
    for (const symbol of alphabet) {
      const x = next(a, item.a, symbol),
        y = next(b, item.b, symbol),
        id = key(x, y);
      if (!seen.has(id)) {
        seen.add(id);
        queue.push({ a: x, b: y, parent: head, symbol });
      }
    }
  }
  return {
    equivalent: true,
    witness: null,
    alphabet,
    visited: queue.length,
    discovered: queue.length,
    left: null,
    right: null,
  };
}

export function minimize(input) {
  const m = machine(input),
    alphabet = [...m.dfa.alphabet].sort(),
    reachable = [m.dfa.start],
    seen = new Set(reachable);
  for (let i = 0; i < reachable.length; i++)
    for (const symbol of alphabet) {
      const target = next(m, reachable[i], symbol);
      if (!seen.has(target)) {
        seen.add(target);
        reachable.push(target);
      }
    }
  let blocks = [
    reachable.filter((s) => m.accept.has(s)),
    reachable.filter((s) => !m.accept.has(s)),
  ].filter((b) => b.length);
  const rounds = [structuredClone(blocks)];
  while (true) {
    const membership = new Map(blocks.flatMap((block, i) => block.map((state) => [state, i])));
    const refined = [];
    for (const block of blocks) {
      const groups = new Map();
      for (const state of block) {
        const signature = alphabet
          .map((symbol) => membership.get(next(m, state, symbol)))
          .join(',');
        if (!groups.has(signature)) groups.set(signature, []);
        groups.get(signature).push(state);
      }
      refined.push(...groups.values());
    }
    if (refined.length === blocks.length) break;
    blocks = refined;
    rounds.push(structuredClone(blocks));
  }
  // Number minimized states in reachable BFS order, starting at q0.
  const membership = new Map(blocks.flatMap((block, i) => block.map((state) => [state, i]))),
    startBlock = membership.get(m.dfa.start),
    order = [startBlock],
    known = new Set(order);
  for (let i = 0; i < order.length; i++)
    for (const symbol of alphabet) {
      const target = membership.get(next(m, blocks[order[i]][0], symbol));
      if (!known.has(target)) {
        known.add(target);
        order.push(target);
      }
    }
  const names = new Map(order.map((block, i) => [block, 'q' + i]));
  const result = {
    states: order.map((block) => names.get(block)),
    alphabet,
    start: 'q0',
    accept: order
      .filter((block) => m.accept.has(blocks[block][0]))
      .map((block) => names.get(block)),
    transitions: order.flatMap((block) =>
      alphabet.map((symbol) => [
        names.get(block),
        symbol,
        names.get(membership.get(next(m, blocks[block][0], symbol))),
      ]),
    ),
  };
  return {
    dfa: result,
    groups: order.map((block) => ({ state: names.get(block), members: blocks[block] })),
    unreachable: m.dfa.states.filter((s) => !seen.has(s)),
    rounds,
    originalStates: m.dfa.states.length,
    reachableStates: reachable.length,
  };
}

export function toDot(input) {
  const dfa = parseDFA(input);
  return [
    'digraph DFA {',
    '  rankdir=LR;',
    '  __entry [shape=point];',
    `  __entry -> "${dfa.start}";`,
    ...dfa.states.map(
      (s) => `  "${s}" [shape=${dfa.accept.includes(s) ? 'doublecircle' : 'circle'}];`,
    ),
    ...dfa.transitions.map(([a, s, b]) => `  "${a}" -> "${b}" [label="${s}"];`),
    '}',
  ].join('\n');
}

const even = {
  states: ['E', 'O'],
  alphabet: ['0', '1'],
  start: 'E',
  accept: ['E'],
  transitions: [
    ['E', '0', 'E'],
    ['E', '1', 'O'],
    ['O', '0', 'O'],
    ['O', '1', 'E'],
  ],
};
const redundant = {
  states: ['E0', 'E1', 'O0', 'O1', 'Unused'],
  alphabet: ['0', '1'],
  start: 'E0',
  accept: ['E0', 'E1'],
  transitions: [
    ['E0', '0', 'E0'],
    ['E0', '1', 'O1'],
    ['E1', '0', 'E0'],
    ['E1', '1', 'O1'],
    ['O0', '0', 'O0'],
    ['O0', '1', 'E1'],
    ['O1', '0', 'O0'],
    ['O1', '1', 'E1'],
    ['Unused', '0', 'Unused'],
    ['Unused', '1', 'Unused'],
  ],
};
const endsOne = {
  states: ['No', 'Yes'],
  alphabet: ['0', '1'],
  start: 'No',
  accept: ['Yes'],
  transitions: [
    ['No', '0', 'No'],
    ['No', '1', 'Yes'],
    ['Yes', '0', 'No'],
    ['Yes', '1', 'Yes'],
  ],
};
const containsOne = {
  states: ['No', 'Yes'],
  alphabet: ['0', '1'],
  start: 'No',
  accept: ['Yes'],
  transitions: [
    ['No', '0', 'No'],
    ['No', '1', 'Yes'],
    ['Yes', '0', 'Yes'],
    ['Yes', '1', 'Yes'],
  ],
};
export const examples = {
  equivalent: { left: even, right: redundant },
  difference: { left: endsOne, right: containsOne },
  empty: { left: even, right: endsOne },
};
