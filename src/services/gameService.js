import { database } from '../firebase';
import { ref, set, get, update, onValue, remove } from 'firebase/database';

export const DEFAULT_TASKS = [
  'Write a function that checks if a number is even',
  'Write a function that reverses a string',
  'Write a function that finds the maximum in an array',
  'Write a function that counts vowels in a string',
  'Write a function that checks if a string is a palindrome',
  'Write a function that sums all numbers in an array',
  'Write a function that removes duplicates from an array',
  'Write a function that converts Celsius to Fahrenheit',
  'Write a function that calculates factorial of a number',
  'Write a function that returns the nth Fibonacci number',
  'Write a function that sorts an array of numbers',
  'Write a function that capitalizes the first letter of each word',
];

const toArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
};

// Shuffle array (Fisher-Yates)
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const startGame = async (lobbyId, players, settings) => {
  const N = players.length;
  const playerOrder = players.map((p) => p.id);

  // Pick N unique tasks
  const taskBank = toArray(settings.taskBank);
  const tasks = shuffle(taskBank).slice(0, N);

  // Build initial chains — each chain starts with a task
  const chains = {};
  for (let i = 0; i < N; i++) {
    chains[i] = {
      steps: {
        0: {
          type: 'task',
          content: tasks[i],
          authorId: null,
        },
      },
    };
  }

  const gameData = {
    step: 0,
    stepType: 'coding',
    deadline: Date.now() + settings.codingTime * 1000,
    playerOrder,
    chains,
    submissions: {},
  };

  await set(ref(database, `lobbies/${lobbyId}/game`), gameData);
  await set(ref(database, `lobbies/${lobbyId}/status`), 'playing');
};

export const submitCode = async (lobbyId, playerId, chainIndex, stepIndex, content, language) => {
  const stepRef = ref(database, `lobbies/${lobbyId}/game/chains/${chainIndex}/steps/${stepIndex}`);
  await set(stepRef, {
    type: 'code',
    content,
    language,
    authorId: playerId,
  });
  const submissionRef = ref(database, `lobbies/${lobbyId}/game/submissions/${playerId}`);
  await set(submissionRef, true);
};

export const submitGuess = async (lobbyId, playerId, chainIndex, stepIndex, content) => {
  const stepRef = ref(database, `lobbies/${lobbyId}/game/chains/${chainIndex}/steps/${stepIndex}`);
  await set(stepRef, {
    type: 'guess',
    content,
    authorId: playerId,
  });
  const submissionRef = ref(database, `lobbies/${lobbyId}/game/submissions/${playerId}`);
  await set(submissionRef, true);
};

export const advanceStep = async (lobbyId, currentStep, playerCount, settings) => {
  const totalSteps = playerCount; // each player does 1 step per round; N rounds total
  const nextStep = currentStep + 1;

  if (nextStep >= totalSteps) {
    // Game over
    await update(ref(database, `lobbies/${lobbyId}`), { status: 'finished' });
    await update(ref(database, `lobbies/${lobbyId}/game`), {
      step: nextStep,
      stepType: 'done',
      submissions: {},
    });
    return;
  }

  const nextStepType = nextStep % 2 === 0 ? 'coding' : 'guessing';
  const duration = nextStepType === 'coding' ? settings.codingTime : settings.guessingTime;

  await update(ref(database, `lobbies/${lobbyId}/game`), {
    step: nextStep,
    stepType: nextStepType,
    deadline: Date.now() + duration * 1000,
    submissions: {},
  });
};

export const subscribeToGame = (lobbyId, callback) => {
  const gameRef = ref(database, `lobbies/${lobbyId}/game`);
  return onValue(gameRef, (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : null);
  });
};

export const updateSettings = async (lobbyId, settings) => {
  await update(ref(database, `lobbies/${lobbyId}/settings`), settings);
};

export const getSettings = async (lobbyId) => {
  const snap = await get(ref(database, `lobbies/${lobbyId}/settings`));
  return snap.exists() ? snap.val() : { codingTime: 60, guessingTime: 30, taskBank: DEFAULT_TASKS };
};

// Reset lobby back to waiting state after a game ends (for play-again)
export const resetLobby = async (lobbyId) => {
  await remove(ref(database, `lobbies/${lobbyId}/game`));
  await update(ref(database, `lobbies/${lobbyId}`), { status: 'waiting' });
};
