import { database } from '../firebase';
import { ref, set, get, update, onValue, remove, runTransaction } from 'firebase/database';

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

  // Reset isReady for all players so the next play-again cycle works correctly
  await Promise.all(players.map((p) =>
    set(ref(database, `lobbies/${lobbyId}/players/${p.id}/isReady`), false)
  ));

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

export const updateGameMode = async (lobbyId, gameMode) => {
  await set(ref(database, `lobbies/${lobbyId}/gameMode`), gameMode);
};

export const getSettings = async (lobbyId) => {
  const snap = await get(ref(database, `lobbies/${lobbyId}/settings`));
  return snap.exists() ? snap.val() : { codingTime: 60, guessingTime: 30, taskBank: DEFAULT_TASKS };
};

// Reset lobby back to waiting state after a game ends (for play-again)
export const resetLobby = async (lobbyId) => {
  if (!lobbyId) return;
  await remove(ref(database, `lobbies/${lobbyId}/game`));
  await remove(ref(database, `lobbies/${lobbyId}/returnedPlayers`));
  await remove(ref(database, `lobbies/${lobbyId}/teamAssignments`));
  await remove(ref(database, `lobbies/${lobbyId}/battleRoyale`));
  await update(ref(database, `lobbies/${lobbyId}`), { status: 'waiting', resetAt: Date.now() });
};

// ── Team vs Team ──────────────────────────────────────────────────────────────

export const setTeamAssignment = async (lobbyId, playerId, team) => {
  if (!lobbyId || !playerId) return;
  await set(ref(database, `lobbies/${lobbyId}/teamAssignments/${playerId}`), team);
};

export const startTeamGame = async (lobbyId, teamAssignments, settings) => {
  const playerIds = Object.keys(teamAssignments);

  // Reset isReady for all players so the next play-again cycle works correctly
  await Promise.all(playerIds.map((pid) =>
    set(ref(database, `lobbies/${lobbyId}/players/${pid}/isReady`), false)
  ));

  const task = shuffle(toArray(settings.taskBank))[0];
  const members = { A: {}, B: {} };
  Object.entries(teamAssignments).forEach(([pid, team]) => {
    if (team === 'A' || team === 'B') members[team][pid] = true;
  });

  const gameData = {
    task,
    startedAt: Date.now(),
    winner: null,
    teams: {
      A: { code: '', language: 'JavaScript', submitted: false, submittedAt: null, members: members.A, collab: { version: 0, steps: { _init: true } } },
      B: { code: '', language: 'JavaScript', submitted: false, submittedAt: null, members: members.B, collab: { version: 0, steps: { _init: true } } },
    },
  };

  await set(ref(database, `lobbies/${lobbyId}/game`), gameData);
  await set(ref(database, `lobbies/${lobbyId}/status`), 'playing');
};

export const updateTeamCode = async (lobbyId, team, code) => {
  await set(ref(database, `lobbies/${lobbyId}/game/teams/${team}/code`), code);
};

export const setTeamLanguage = async (lobbyId, team, language) => {
  await set(ref(database, `lobbies/${lobbyId}/game/teams/${team}/language`), language);
};

export const submitTeam = async (lobbyId, team) => {
  await update(ref(database, `lobbies/${lobbyId}/game/teams/${team}`), {
    submitted: true,
    submittedAt: Date.now(),
  });
  const winnerRef = ref(database, `lobbies/${lobbyId}/game/winner`);
  await runTransaction(winnerRef, (current) => (current === null ? team : current));
  await update(ref(database, `lobbies/${lobbyId}`), { status: 'finished' });
};

// Mark a player as ready (called when they click "Back to Lobby" on any result screen)
export const markPlayerReady = async (lobbyId, playerId) => {
  if (!lobbyId || !playerId) return;
  await set(ref(database, `lobbies/${lobbyId}/players/${playerId}/isReady`), true);
};

// ── Battle Royale ─────────────────────────────────────────────────────────────

export const BR_STAGE_COUNT = 5;
export const BR_STAGE_TIME_MS = 60000; // 60 seconds per stage

export const startBattleRoyale = async (lobbyId, players, settings) => {
  // Reset isReady for all players
  await Promise.all(players.map((p) =>
    set(ref(database, `lobbies/${lobbyId}/players/${p.id}/isReady`), false)
  ));

  const taskBank = toArray(settings.taskBank);
  const tasks = shuffle(taskBank).slice(0, BR_STAGE_COUNT);

  const now = Date.now();
  const playerData = {};
  players.forEach((p) => {
    playerData[p.id] = {
      nickname: p.nickname,
      stage: 0,
      eliminated: false,
      stageStartedAt: now,
      timeBank: BR_STAGE_TIME_MS,
      completedAt: null,
      charCount: 0,
      code: '',
    };
  });

  await set(ref(database, `lobbies/${lobbyId}/battleRoyale`), {
    tasks,
    gameStartedAt: now,
    winner: null,
    finished: false,
    players: playerData,
  });
  await set(ref(database, `lobbies/${lobbyId}/status`), 'playing');
};

export const updateBRCode = async (lobbyId, playerId, code) => {
  await update(ref(database, `lobbies/${lobbyId}/battleRoyale/players/${playerId}`), {
    code,
    charCount: code.length,
  });
};

export const completeBRStage = async (lobbyId, playerId, currentStage, timeRemaining) => {
  const nextStage = currentStage + 1;
  const now = Date.now();

  if (nextStage >= BR_STAGE_COUNT) {
    // Finished all stages!
    await update(ref(database, `lobbies/${lobbyId}/battleRoyale/players/${playerId}`), {
      stage: nextStage,
      completedAt: now,
      charCount: 0,
      code: '',
    });
  } else {
    await update(ref(database, `lobbies/${lobbyId}/battleRoyale/players/${playerId}`), {
      stage: nextStage,
      stageStartedAt: now,
      timeBank: BR_STAGE_TIME_MS + Math.max(0, timeRemaining),
      charCount: 0,
      code: '',
    });
  }
};

export const eliminateBRPlayer = async (lobbyId, playerId) => {
  await update(ref(database, `lobbies/${lobbyId}/battleRoyale/players/${playerId}`), {
    eliminated: true,
  });
};

export const setBRWinner = async (lobbyId, winnerId) => {
  // Use a transaction so multiple clients don't overwrite each other
  await runTransaction(ref(database, `lobbies/${lobbyId}/battleRoyale/winner`), (current) =>
    current !== null ? current : (winnerId ?? null)
  );
  await update(ref(database, `lobbies/${lobbyId}/battleRoyale`), { finished: true });
  await update(ref(database, `lobbies/${lobbyId}`), { status: 'finished' });
};

export const endBattleRoyale = async (lobbyId) => {
  await update(ref(database, `lobbies/${lobbyId}/battleRoyale`), { finished: true });
  await update(ref(database, `lobbies/${lobbyId}`), { status: 'finished' });
};
