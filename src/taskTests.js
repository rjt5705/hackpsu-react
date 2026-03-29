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

// ── JavaScript test runner (instant, no API call) ────────────────────────────

export const runTests = (code, task) => {
  const testCases = TASK_TESTS[task];
  
  if (!testCases) {
    return { results: [], allPassed: true, noTests: true };
  }

  // Extract function names from code
  const functionNames = new Set();
  
  // Match function declarations: function name() or function name ()
  for (const match of code.matchAll(/function\s+(\w+)\s*\(/g)) {
    functionNames.add(match[1]);
  }
  
  // Match arrow functions and function expressions: const name = () => or const name = function()
  for (const match of code.matchAll(/(?:const|let|var)\s+(\w+)\s*=\s*(?:function|\(|[a-z_$])/g)) {
    functionNames.add(match[1]);
  }
  
  // Match class methods (simplified)
  for (const match of code.matchAll(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*{/g)) {
    functionNames.add(match[1]);
  }

  const results = testCases.map(({ label, input, expected }) => {
    // Try each detected function
    for (const name of functionNames) {
      try {
        // Create a function from the code and execute it
        // eslint-disable-next-line no-new-func
        const fn = new Function(code + `\n; return typeof ${name} === 'function' ? ${name} : undefined;`)();
        
        if (typeof fn !== 'function') continue;
        
        const result = fn(...input);
        
        // Compare results (deep comparison for arrays/objects)
        if (JSON.stringify(result) === JSON.stringify(expected)) {
          return { label, pass: true, got: result };
        }
      } catch (error) {
        // If this function fails, try the next one
        continue;
      }
    }
    
    // If we get here, no function passed the test
    // Try to get the actual result from the first function for error message
    for (const name of functionNames) {
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(code + `\n; return typeof ${name} === 'function' ? ${name} : undefined;`)();
        
        if (typeof fn !== 'function') continue;
        
        const result = fn(...input);
        return { label, pass: false, got: result };
      } catch (error) {
        return { label, pass: false, error: error.message };
      }
    }
    
    return { label, pass: false, error: 'No function found in code' };
  });

  return {
    results,
    allPassed: results.every(r => r.pass)
  };
};