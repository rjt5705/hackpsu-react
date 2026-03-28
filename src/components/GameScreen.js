import React, { useState, useEffect, useRef } from 'react';
import { subscribeToGame, submitCode, submitGuess, advanceStep } from '../services/gameService';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';

const LANGUAGES = ['JavaScript', 'Python', 'Java', 'C++', 'C#', 'TypeScript', 'Go', 'Ruby', 'Rust', 'Other'];

const toArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
};

function GameScreen({ lobbyId, playerId, onGameEnd }) {
  const [gameData, setGameData] = useState(null);
  const [settings, setSettings] = useState({ codingTime: 60, guessingTime: 30 });
  const [isHost, setIsHost] = useState(false);
  const [playerCount, setPlayerCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);
  const [code, setCode] = useState('');
  const [guess, setGuess] = useState('');
  const [language, setLanguage] = useState('JavaScript');
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const codeRef = useRef('');
  const guessRef = useRef('');
  const submittedRef = useRef(false);
  const advancedRef = useRef(false);
  const prevStepRef = useRef(-1);
  const timerRef = useRef(null);
  const isHostRef = useRef(false);
  const settingsRef = useRef({ codingTime: 60, guessingTime: 30 });
  const playerCountRef = useRef(0);

  // Keep refs in sync
  useEffect(() => { codeRef.current = code; }, [code]);
  useEffect(() => { guessRef.current = guess; }, [guess]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { playerCountRef.current = playerCount; }, [playerCount]);

  // Subscribe to settings + host status + player count
  useEffect(() => {
    const settingsRef = ref(database, `lobbies/${lobbyId}/settings`);
    const unsubSettings = onValue(settingsRef, (snap) => {
      if (snap.exists()) setSettings(snap.val());
    });

    const lobbyRef = ref(database, `lobbies/${lobbyId}`);
    const unsubLobby = onValue(lobbyRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setIsHost(data.hostId === playerId);
        const count = data.players ? Object.keys(data.players).length : 0;
        setPlayerCount(count);
      }
    });

    return () => { unsubSettings(); unsubLobby(); };
  }, [lobbyId, playerId]);

  // Subscribe to game data
  useEffect(() => {
    const unsub = subscribeToGame(lobbyId, (data) => {
      if (!data) return;

      // Reset local state when step changes
      if (data.step !== prevStepRef.current) {
        prevStepRef.current = data.step;
        setHasSubmitted(false);
        setCode('');
        setGuess('');
        codeRef.current = '';
        guessRef.current = '';
        submittedRef.current = false;
        advancedRef.current = false;
      }

      setGameData(data);

      if (data.stepType === 'done') {
        onGameEnd();
        return;
      }

      // Bug 3: host advances immediately when all players have submitted
      if (isHostRef.current && !advancedRef.current) {
        const submissions = data.submissions
          ? Object.values(data.submissions).filter(Boolean)
          : [];
        const total = playerCountRef.current;
        if (total > 0 && submissions.length >= total) {
          advancedRef.current = true;
          advanceStep(lobbyId, data.step, total, settingsRef.current);
        }
      }
    });
    return unsub;
  }, [lobbyId, onGameEnd]);

  // Timer
  useEffect(() => {
    if (!gameData || !gameData.deadline) return;

    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((gameData.deadline - Date.now()) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        clearInterval(timerRef.current);

        // Auto-submit if not submitted
        if (!submittedRef.current) {
          submittedRef.current = true;
          handleAutoSubmit(gameData);
        }

        // Host advances after delay
        if (isHost && !advancedRef.current) {
          advancedRef.current = true;
          setTimeout(() => {
            advanceStep(lobbyId, gameData.step, playerCount, settings);
          }, 1500);
        }
      }
    }, 500);

    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameData?.deadline, gameData?.step, isHost, playerCount, settings, lobbyId]);

  const handleAutoSubmit = (data) => {
    const playerOrder = toArray(data.playerOrder);
    const N = playerOrder.length;
    const myIndex = playerOrder.indexOf(playerId);
    if (myIndex === -1) return;

    const step = data.step;
    const chainIndex = (myIndex - step + N) % N;
    const stepIndex = step + 1; // +1 because index 0 is the initial task

    if (data.stepType === 'coding') {
      submitCode(lobbyId, playerId, chainIndex, stepIndex, codeRef.current || '(no submission)', language);
    } else {
      submitGuess(lobbyId, playerId, chainIndex, stepIndex, guessRef.current || '(no submission)');
    }
  };

  const handleSubmit = () => {
    if (hasSubmitted || !gameData) return;
    const playerOrder = toArray(gameData.playerOrder);
    const N = playerOrder.length;
    const myIndex = playerOrder.indexOf(playerId);
    if (myIndex === -1) return;

    const step = gameData.step;
    const chainIndex = (myIndex - step + N) % N;
    const stepIndex = step + 1;

    submittedRef.current = true;
    setHasSubmitted(true);

    if (gameData.stepType === 'coding') {
      submitCode(lobbyId, playerId, chainIndex, stepIndex, code || '(no submission)', language);
    } else {
      submitGuess(lobbyId, playerId, chainIndex, stepIndex, guess || '(no submission)');
    }
  };

  // Get what the current player should be looking at
  const getPromptForPlayer = () => {
    if (!gameData) return '';
    const playerOrder = toArray(gameData.playerOrder);
    const N = playerOrder.length;
    const myIndex = playerOrder.indexOf(playerId);
    if (myIndex === -1) return '';

    const step = gameData.step;
    const chainIndex = (myIndex - step + N) % N;
    const chain = gameData.chains?.[chainIndex];
    if (!chain) return '';

    // The previous step in this chain is the prompt
    const prevStepIndex = step; // step 0 → read index 0 (task), step 1 → read index 1 (code), etc.
    const steps = chain.steps || {};
    return steps[prevStepIndex]?.content || '';
  };

  const getPrevStepType = () => {
    if (!gameData) return 'task';
    const playerOrder = toArray(gameData.playerOrder);
    const N = playerOrder.length;
    const myIndex = playerOrder.indexOf(playerId);
    if (myIndex === -1) return 'task';
    const step = gameData.step;
    const chainIndex = (myIndex - step + N) % N;
    const chain = gameData.chains?.[chainIndex];
    if (!chain) return 'task';
    const steps = chain.steps || {};
    return steps[step]?.type || 'task';
  };

  const getSubmissionCount = () => {
    if (!gameData?.submissions) return 0;
    return Object.values(gameData.submissions).filter(Boolean).length;
  };

  if (!gameData) {
    return (
      <div className="screen-center">
        <div className="card">
          <p>Loading game...</p>
        </div>
      </div>
    );
  }

  const prompt = getPromptForPlayer();
  const prevType = getPrevStepType();
  const submissionCount = getSubmissionCount();
  const totalPlayers = toArray(gameData.playerOrder).length;
  const timerClass = timeLeft !== null && timeLeft <= 10 ? 'timer urgent' : 'timer';

  return (
    <div className="game-screen">
      <div className="game-header">
        <div className={timerClass}>
          {timeLeft !== null ? `${timeLeft}s` : '...'}
        </div>
        <div className="step-info">
          Round {gameData.step + 1} / {totalPlayers} &nbsp;·&nbsp;
          {gameData.stepType === 'coding' ? '💻 Coding' : '💬 Guessing'}
        </div>
        <div className="submissions-count">
          {submissionCount}/{totalPlayers} submitted
        </div>
      </div>

      <div className="game-body">
        {/* Prompt panel */}
        <div className="prompt-panel">
          <h3 className="prompt-label">
            {prevType === 'task' && 'Your task:'}
            {prevType === 'code' && 'What does this code do?'}
            {prevType === 'guess' && 'Code this:'}
          </h3>
          {prevType === 'code' ? (
            <pre className="code-display">{prompt}</pre>
          ) : (
            <p className="task-display">{prompt}</p>
          )}
        </div>

        {/* Input panel */}
        <div className="input-panel">
          {gameData.stepType === 'coding' && (
            <>
              <div className="lang-row">
                <label>Language:</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={hasSubmitted}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <textarea
                className="code-editor"
                placeholder="Write your code here..."
                value={code}
                onChange={(e) => setCode(e.target.value)}
                disabled={hasSubmitted}
                spellCheck={false}
              />
            </>
          )}

          {gameData.stepType === 'guessing' && (
            <textarea
              className="guess-editor"
              placeholder="What do you think this code is supposed to do?"
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              disabled={hasSubmitted}
            />
          )}

          <button
            className={`btn ${hasSubmitted ? 'btn-submitted' : 'btn-green'}`}
            onClick={handleSubmit}
            disabled={hasSubmitted}
          >
            {hasSubmitted ? '✓ Submitted — waiting for others' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default GameScreen;
