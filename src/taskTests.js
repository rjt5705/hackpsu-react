// ── Test cases ────────────────────────────────────────────────────────────────
// Each entry maps a task string → array of { label, input[], expected }.

export const TASK_TESTS = {
  'Write a function that checks if a number is even': [
    { label: 'even number (2)',     input: [2],   expected: true },
    { label: 'odd number (3)',      input: [3],   expected: false },
    { label: 'zero (0)',            input: [0],   expected: true },
    { label: 'negative even (-4)',  input: [-4],  expected: true },
  ],
  'Write a function that reverses a string': [
    { label: '"hello" → "olleh"', input: ['hello'], expected: 'olleh' },
    { label: '"abc" → "cba"',     input: ['abc'],   expected: 'cba' },
    { label: 'empty string',      input: [''],      expected: '' },
  ],
  'Write a function that finds the maximum in an array': [
    { label: '[1,3,2] → 3',     input: [[1, 3, 2]],     expected: 3 },
    { label: '[-1,-3,-2] → -1', input: [[-1, -3, -2]],  expected: -1 },
    { label: '[5] → 5',         input: [[5]],            expected: 5 },
  ],
  'Write a function that counts vowels in a string': [
    { label: '"hello" → 2',  input: ['hello'],  expected: 2 },
    { label: '"aeiou" → 5',  input: ['aeiou'],  expected: 5 },
    { label: '"rhythm" → 0', input: ['rhythm'], expected: 0 },
  ],
  'Write a function that checks if a string is a palindrome': [
    { label: '"racecar" → true',  input: ['racecar'], expected: true },
    { label: '"hello" → false',   input: ['hello'],   expected: false },
    { label: '"a" → true',        input: ['a'],        expected: true },
  ],
  'Write a function that sums all numbers in an array': [
    { label: '[1,2,3] → 6',  input: [[1, 2, 3]], expected: 6 },
    { label: '[] → 0',       input: [[]],         expected: 0 },
    { label: '[-1,1] → 0',   input: [[-1, 1]],    expected: 0 },
  ],
  'Write a function that removes duplicates from an array': [
    { label: '[1,2,2,3] → [1,2,3]', input: [[1, 2, 2, 3]], expected: [1, 2, 3] },
    { label: '[1,1,1] → [1]',        input: [[1, 1, 1]],    expected: [1] },
    { label: '[] → []',              input: [[]],           expected: [] },
  ],
  'Write a function that converts Celsius to Fahrenheit': [
    { label: '0°C → 32°F',   input: [0],   expected: 32 },
    { label: '100°C → 212°F', input: [100], expected: 212 },
    { label: '-40°C → -40°F', input: [-40], expected: -40 },
  ],
  'Write a function that calculates factorial of a number': [
    { label: '0! = 1',   input: [0], expected: 1 },
    { label: '1! = 1',   input: [1], expected: 1 },
    { label: '5! = 120', input: [5], expected: 120 },
  ],
  'Write a function that returns the nth Fibonacci number': [
    { label: 'fib(0) = 0', input: [0], expected: 0 },
    { label: 'fib(1) = 1', input: [1], expected: 1 },
    { label: 'fib(6) = 8', input: [6], expected: 8 },
  ],
  'Write a function that sorts an array of numbers': [
    { label: '[3,1,2] → [1,2,3]', input: [[3, 1, 2]], expected: [1, 2, 3] },
    { label: '[] → []',           input: [[]],         expected: [] },
    { label: '[1] → [1]',         input: [[1]],         expected: [1] },
  ],
  'Write a function that capitalizes the first letter of each word': [
    { label: '"hello world" → "Hello World"', input: ['hello world'], expected: 'Hello World' },
    { label: '"foo bar baz" → "Foo Bar Baz"', input: ['foo bar baz'], expected: 'Foo Bar Baz' },
    { label: '"a" → "A"',                     input: ['a'],           expected: 'A' },
  ],
};

// ── Language helpers ──────────────────────────────────────────────────────────

const SKIP_NAMES = new Set([
  'main', 'if', 'for', 'while', 'switch', 'return', 'class', 'struct',
  'import', 'print', 'len', 'range', 'int', 'str', 'bool', 'list',
]);

const extractFnNames = (code, language) => {
  const names = new Set();
  if (language === 'Python') {
    for (const m of code.matchAll(/^def\s+(\w+)\s*\(/gm))
      if (!SKIP_NAMES.has(m[1])) names.add(m[1]);
  } else if (language === 'Java') {
    // Match: [modifiers] returnType methodName(
    for (const m of code.matchAll(/(?:(?:public|private|protected|static|final|synchronized)\s+)+[\w<>\[\]]+\s+(\w+)\s*\(/g))
      if (!SKIP_NAMES.has(m[1])) names.add(m[1]);
    // Also catch package-private methods: returnType methodName(
    for (const m of code.matchAll(/^\s{0,4}(?:int|boolean|double|float|long|String|void|char|[\w<>\[\]]+)\s+(\w+)\s*\(/gm))
      if (!SKIP_NAMES.has(m[1])) names.add(m[1]);
  } else if (language === 'C++') {
    for (const m of code.matchAll(/\b(?:int|bool|double|float|string|void|long|char|vector\s*<[^>]+>|auto)\s+(\w+)\s*\(/g))
      if (!SKIP_NAMES.has(m[1])) names.add(m[1]);
  }
  return [...names];
};

// Convert a JS value to a literal in the target language
const lit = (val, lang) => {
  if (typeof val === 'boolean') {
    return lang === 'Python' ? (val ? 'True' : 'False') : (val ? 'true' : 'false');
  }
  if (typeof val === 'number') return String(val);
  if (typeof val === 'string') return `"${val.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (Array.isArray(val)) {
    const items = val.map(v => lit(v, lang));
    if (lang === 'Python') return `[${items.join(', ')}]`;
    if (lang === 'Java') {
      if (val.length === 0) return 'new int[]{}';
      if (typeof val[0] === 'string') return `new String[]{${items.join(', ')}}`;
      return `new int[]{${items.join(', ')}}`;
    }
    if (lang === 'C++') {
      if (val.length === 0) return 'std::vector<int>{}';
      if (typeof val[0] === 'string') return `std::vector<std::string>{${items.join(', ')}}`;
      return `std::vector<int>{${items.join(', ')}}`;
    }
  }
  return JSON.stringify(val);
};

// The expected string the harness will compare output against.
// Uses Java Arrays.toString format for arrays: "[1, 2, 3]"
const expStr = (val) => {
  if (typeof val === 'boolean') return String(val);          // "true" / "false"
  if (typeof val === 'number')  return String(val);
  if (typeof val === 'string')  return val;
  if (Array.isArray(val))       return `[${val.join(', ')}]`;
  return String(val);
};

// C++ expression to convert result to std::string
const cppToStr = (expr, expected) => {
  if (typeof expected === 'boolean') return `(${expr} ? std::string("true") : std::string("false"))`;
  if (typeof expected === 'number')  return `std::to_string(${expr})`;
  if (typeof expected === 'string')  return expr;
  if (Array.isArray(expected))       return `__vecStr(${expr})`;
  return `std::to_string(${expr})`;
};

// ── Harness builders ──────────────────────────────────────────────────────────

const buildPythonHarness = (code, fnName, cases) => {
  const tests = cases.map(({ label, input, expected }, i) => {
    const args = input.map(v => lit(v, 'Python')).join(', ');
    const expLit = lit(expected, 'Python');
    // For arrays, wrap result in list() to handle any iterable
    const cmp = Array.isArray(expected)
      ? `list(__r${i}) == ${expLit}`
      : `__r${i} == ${expLit}`;
    return `try:\n    __r${i} = ${fnName}(${args})\n    print("T${i}:PASS" if ${cmp} else f"T${i}:FAIL|{__r${i}}")\nexcept Exception as __e${i}:\n    print(f"T${i}:ERR|{__e${i}}")`;
  }).join('\n');
  return `${code}\n\n${tests}`;
};

const buildJavaHarness = (code, fnName, cases) => {
  const pad = '        ';
  const tests = cases.map(({ input, expected }, i) => {
    const args = input.map(v => lit(v, 'Java')).join(', ');
    const exp = expStr(expected);
    // Use Object so we handle int[], boolean[], String[], ArrayList, primitives uniformly
    return `${pad}try {
${pad}    Object __o${i} = new Solution().${fnName}(${args});
${pad}    String __s${i};
${pad}    if (__o${i} instanceof int[]) __s${i} = java.util.Arrays.toString((int[])__o${i});
${pad}    else if (__o${i} instanceof boolean[]) __s${i} = java.util.Arrays.toString((boolean[])__o${i});
${pad}    else if (__o${i} instanceof String[]) __s${i} = java.util.Arrays.toString((String[])__o${i});
${pad}    else __s${i} = String.valueOf(__o${i});
${pad}    System.out.println(__s${i}.equals("${exp}") ? "T${i}:PASS" : "T${i}:FAIL|" + __s${i});
${pad}} catch (Exception __e${i}) {
${pad}    System.out.println("T${i}:ERR|" + __e${i}.getMessage());
${pad}}`;
  }).join('\n');

  const indented = code.split('\n').map(l => '    ' + l).join('\n');
  return `import java.util.*;
public class Solution {
${indented}

    public static void main(String[] args) {
${tests}
    }
}`;
};

const buildCppHarness = (code, fnName, cases) => {
  const needsVec = cases.some(c => Array.isArray(c.expected) || c.input.some(Array.isArray));

  const vecHelpers = needsVec ? `
std::string __vecStr(std::vector<int> v) {
    std::string s = "[";
    for (size_t i = 0; i < v.size(); i++) { if (i) s += ", "; s += std::to_string(v[i]); }
    return s + "]";
}
std::string __vecStr(std::vector<std::string> v) {
    std::string s = "[";
    for (size_t i = 0; i < v.size(); i++) { if (i) s += ", "; s += v[i]; }
    return s + "]";
}` : '';

  const tests = cases.map(({ input, expected }, i) => {
    // Declare local variables for array inputs to avoid brace-init ambiguity
    const argDecls = input.map((v, j) => {
      if (!Array.isArray(v)) return '';
      const cppT = (v.length === 0 || typeof v[0] === 'number')
        ? 'std::vector<int>'
        : 'std::vector<std::string>';
      return `    ${cppT} __a${i}_${j} = ${lit(v, 'C++')};\n`;
    }).join('');
    const callArgs = input.map((v, j) => Array.isArray(v) ? `__a${i}_${j}` : lit(v, 'C++')).join(', ');
    const exp = expStr(expected);
    const toStr = cppToStr(`__r${i}`, expected);
    return `${argDecls}    { auto __r${i} = ${fnName}(${callArgs}); std::string __s${i} = ${toStr}; std::cout << (__s${i} == "${exp}" ? "T${i}:PASS" : "T${i}:FAIL|" + __s${i}) << std::endl; }`;
  }).join('\n');

  return `#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
${vecHelpers}

${code}

int main() {
${tests}
    return 0;
}`;
};

// ── Piston API runner ─────────────────────────────────────────────────────────

const PISTON_URL = 'https://emkc.org/api/v2/piston/execute';
const PISTON_LANG = { Python: 'python', Java: 'java', 'C++': 'c++' };

const runViaAPI = async (code, language, fnName, cases) => {
  let harness;
  if      (language === 'Python') harness = buildPythonHarness(code, fnName, cases);
  else if (language === 'Java')   harness = buildJavaHarness(code, fnName, cases);
  else if (language === 'C++')    harness = buildCppHarness(code, fnName, cases);
  else throw new Error('Unsupported language: ' + language);

  const res = await fetch(PISTON_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language: PISTON_LANG[language],
      version: '*',
      files: [{ name: language === 'Java' ? 'Solution.java' : 'main', content: harness }],
    }),
  });

  if (!res.ok) throw new Error(`Piston API returned ${res.status}`);
  const data = await res.json();

  const compileErr = data.compile?.stderr?.trim();
  if (compileErr) {
    const msg = compileErr.split('\n')[0];
    return cases.map((c, i) => ({ label: c.label, pass: false, error: `Compile error: ${msg}` }));
  }

  const stdout = data.run?.stdout || '';
  const stderr = data.run?.stderr?.trim();

  // If nothing at all came out, report runtime error
  if (!stdout && stderr) {
    return cases.map((c) => ({ label: c.label, pass: false, error: stderr.split('\n')[0] }));
  }

  const lines = stdout.split('\n');
  return cases.map((c, i) => {
    const line = lines.find(l => l.startsWith(`T${i}:`));
    if (!line) return { label: c.label, pass: false, error: 'No output for this test' };
    const body = line.slice(`T${i}:`.length);
    if (body === 'PASS')              return { label: c.label, pass: true };
    if (body.startsWith('FAIL|'))     return { label: c.label, pass: false, got: body.slice(5) };
    if (body.startsWith('ERR|'))      return { label: c.label, pass: false, error: body.slice(4) };
    return { label: c.label, pass: false, error: body };
  });
};

// ── Client-side JavaScript runner (instant, no API call) ─────────────────────

export const runTestsJS = (code, testCases) => {
  const names = new Set();
  for (const m of code.matchAll(/function\s+(\w+)\s*\(/g))
    names.add(m[1]);
  for (const m of code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\(|[a-z_$])/g))
    names.add(m[1]);

  return testCases.map(({ label, input, expected }) => {
    // First pass: find a function that gives the right answer
    for (const name of names) {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(code + `\n; return typeof ${name} === 'function' ? ${name} : undefined;`)();
        if (typeof fn !== 'function') continue;
        const result = fn(...input);
        if (JSON.stringify(result) === JSON.stringify(expected))
          return { label, pass: true, got: result };
      } catch (_) { /* try next */ }
    }
    // Second pass: return the actual value from the first callable for failure detail
    for (const name of names) {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(code + `\n; return typeof ${name} === 'function' ? ${name} : undefined;`)();
        if (typeof fn !== 'function') continue;
        const result = fn(...input);
        return { label, pass: false, got: result };
      } catch (e) {
        return { label, pass: false, error: e.message };
      }
    }
    return { label, pass: false, error: 'No function found in code' };
  });
};

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Run tests for `task` against `code` written in `language`.
 * Returns { results: [...], allPassed: bool, noTests?: bool }.
 * Async because Python/Java/C++ use the Piston remote API.
 */
export const runTests = async (code, task, language) => {
  const cases = TASK_TESTS[task];
  if (!cases) return { results: [], allPassed: true, noTests: true };

  if (language === 'JavaScript') {
    const results = runTestsJS(code, cases);
    return { results, allPassed: results.every(r => r.pass) };
  }

  const fnNames = extractFnNames(code, language);
  if (fnNames.length === 0) {
    return {
      results: cases.map(c => ({ label: c.label, pass: false, error: 'No function detected in code' })),
      allPassed: false,
    };
  }

  // Try each detected function name; return on first full pass
  let bestResults = null;
  for (const fnName of fnNames) {
    try {
      const results = await runViaAPI(code, language, fnName, cases);
      if (results.every(r => r.pass)) return { results, allPassed: true };
      if (!bestResults) bestResults = results;
    } catch (e) {
      if (!bestResults)
        bestResults = cases.map(c => ({ label: c.label, pass: false, error: String(e) }));
    }
  }

  return {
    results: bestResults ?? cases.map(c => ({ label: c.label, pass: false, error: 'Unknown error' })),
    allPassed: false,
  };
};
