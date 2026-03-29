import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';
import {
  updateBRCode,
  completeBRStage,
  eliminateBRPlayer,
  setBRWinner,
  endBattleRoyale,
  markPlayerReady,
  resetLobby,
  BR_STAGE_COUNT,
  BR_STAGE_TIME_MS,
} from '../services/gameService';
import { TASK_TESTS, runTests } from '../taskTests';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';

const MAX_CHARS_BAR = 300; // chars that fill the mini-panel bar to 100%

const formatTime = (ms) => {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

// Sort players for result screen: completers first (fastest), then by stage desc, then charCount desc
const getRankings = (players) =>
  Object.entries(players)
    .map(([id, p]) => ({ id, ...p }))
    .sort((a, b) => {
      if (a.completedAt && b.completedAt) return a.completedAt - b.completedAt;
      if (a.completedAt) return -1;
      if (b.completedAt) return 1;
      if (!a.eliminated && b.eliminated) return -1;
      if (a.eliminated && !b.eliminated) return 1;
      if (b.stage !== a.stage) return b.stage - a.stage;
      return (b.charCount || 0) - (a.charCount || 0);
    });

function BattleRoyaleScreen({ lobbyId, playerId, isHost, onGameEnd }) {
  const [brData, setBrData]         = useState(null);
  const [code, setCode]             = useState('');
  const [timeLeft, setTimeLeft]     = useState(BR_STAGE_TIME_MS);
  const [testResults, setTestResults] = useState(null);
  const [testsPassed, setTestsPassed] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [showTests, setShowTests]   = useState(false);
  const [advancing, setAdvancing]   = useState(false);

  const brDataRef      = useRef(null);
  const codeRef        = useRef('');
  const debounceRef    = useRef(null);
  const codeInitRef    = useRef(false); // have we loaded initial code from Firebase?
  const prevStageRef   = useRef(null);  // detect stage changes to reset editor

  // Keep brDataRef in sync for the host interval closure
  useEffect(() => { brDataRef.current = brData; }, [brData]);

  // Subscribe to battleRoyale data
  useEffect(() => {
    const unsub = onValue(ref(database, `lobbies/${lobbyId}/battleRoyale`), (snap) => {
      if (!snap.exists()) return;
      setBrData(snap.val());
    });
    return () => unsub();
  }, [lobbyId]);

  // One-time: initialise editor code from Firebase (handles page refresh mid-game)
  useEffect(() => {
    if (codeInitRef.current || !brData) return;
    const myData = brData.players?.[playerId];
    if (!myData) return;
    codeInitRef.current = true;
    const savedCode = myData.code || '';
    setCode(savedCode);
    codeRef.current = savedCode;
    prevStageRef.current = myData.stage;
  }, [brData, playerId]);

  // Reset editor when stage advances
  useEffect(() => {
    if (!brData) return;
    const myData = brData.players?.[playerId];
    if (!myData) return;
    if (prevStageRef.current === null) return; // not yet initialized
    if (myData.stage !== prevStageRef.current) {
      prevStageRef.current = myData.stage;
      setCode('');
      codeRef.current = '';
      setTestResults(null);
      setTestsPassed(false);
      setShowTests(false);
      setAdvancing(false);
    }
  }, [brData, playerId]);

  // Timer: recompute every 100ms from Firebase timestamps
  useEffect(() => {
    if (!brData) return;
    const myData = brData.players?.[playerId];
    if (!myData || myData.eliminated || myData.completedAt) return;

    const id = setInterval(() => {
      const tl = myData.timeBank - (Date.now() - myData.stageStartedAt);
      setTimeLeft(Math.max(0, tl));
    }, 100);
    return () => clearInterval(id);
  }, [brData, playerId]);

  // Host: run elimination + game-end checks every 500ms
  useEffect(() => {
    if (!isHost) return;
    const id = setInterval(() => {
      const data = brDataRef.current;
      if (!data || data.finished || data.winner) return;

      const players = data.players || {};
      const now = Date.now();

      // Eliminate any player whose time has run out
      Object.entries(players).forEach(([pid, p]) => {
        if (!p.eliminated && !p.completedAt) {
          const tl = p.timeBank - (now - p.stageStartedAt);
          if (tl <= 0) eliminateBRPlayer(lobbyId, pid);
        }
      });

      // Recompute who is still "alive" (not eliminated, time still positive)
      const alive = Object.entries(players).filter(([, p]) => {
        if (p.eliminated || p.completedAt) return false;
        return (p.timeBank - (now - p.stageStartedAt)) > 0;
      });

      const completers = Object.entries(players)
        .filter(([, p]) => !!p.completedAt)
        .sort(([, a], [, b]) => a.completedAt - b.completedAt);

      if (completers.length > 0) {
        // Fastest finisher wins
        setBRWinner(lobbyId, completers[0][0]);
      } else if (alive.length === 1) {
        setBRWinner(lobbyId, alive[0][0]);
      } else if (alive.length === 0) {
        endBattleRoyale(lobbyId);
      }
    }, 500);
    return () => clearInterval(id);
  }, [isHost, lobbyId]);

  const handleCodeChange = useCallback((val) => {
    const myData = brDataRef.current?.players?.[playerId];
    if (!myData || myData.eliminated || myData.completedAt) return;

    setCode(val);
    codeRef.current = val;
    setTestResults(null);
    setTestsPassed(false);
    setShowTests(false);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateBRCode(lobbyId, playerId, val);
    }, 500);
  }, [lobbyId, playerId]);

  const handleRunTests = async () => {
    if (testLoading) return;
    const myData = brDataRef.current?.players?.[playerId];
    if (!myData) return;
    const task = brDataRef.current?.tasks?.[myData.stage];
    if (!task) return;

    setTestLoading(true);
    setShowTests(true);
    try {
      const { results, allPassed, noTests } = runTests(codeRef.current, task);
      if (noTests) {
        setTestResults([]);
        setTestsPassed(true);
      } else {
        setTestResults(results);
        setTestsPassed(allPassed);
      }
    } catch (e) {
      setTestResults([{ label: 'Test error', pass: false, error: e.message }]);
      setTestsPassed(false);
    } finally {
      setTestLoading(false);
    }
  };

  const handleAdvanceStage = async () => {
    if (advancing) return;
    const myData = brDataRef.current?.players?.[playerId];
    if (!myData) return;

    setAdvancing(true);
    const timeRemaining = myData.timeBank - (Date.now() - myData.stageStartedAt);
    await completeBRStage(lobbyId, playerId, myData.stage, timeRemaining);
    // Firebase subscription will update stage → useEffect resets editor
  };

  const handleBackToLobby = async () => {
    await markPlayerReady(lobbyId, playerId);
    await resetLobby(lobbyId);
    onGameEnd();
  };

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (!brData) {
    return (
      <div className="screen-center">
        <div className="card"><p>Loading battle royale...</p></div>
      </div>
    );
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const players     = brData.players || {};
  const myData      = players[playerId];
  const isElim      = myData?.eliminated || false;
  const isFinished  = !!myData?.completedAt;
  const currentStage = myData?.stage ?? 0;
  const currentTask  = brData.tasks?.[Math.min(currentStage, BR_STAGE_COUNT - 1)] || '';

  const totalAlive   = Object.values(players).filter((p) => !p.eliminated && !p.completedAt).length;
  const totalPlayers = Object.values(players).length;
  const myRank       = getRankings(players).findIndex((p) => p.id === playerId) + 1;

  const hasTests    = !!TASK_TESTS[currentTask];
  const canAdvance  = testsPassed && !advancing && !isElim && !isFinished;

  // Timer urgency classes
  const timerClass =
    timeLeft <= 10000 ? 'br-timer urgent' :
    timeLeft <= 20000 ? 'br-timer warning' :
    'br-timer';

  // Other players for sidebar (everyone except me)
  const otherPlayers = Object.entries(players)
    .filter(([id]) => id !== playerId)
    .sort(([, a], [, b]) => {
      if (!a.eliminated && b.eliminated) return -1;
      if (a.eliminated && !b.eliminated) return 1;
      if (b.stage !== a.stage) return b.stage - a.stage;
      return (b.charCount || 0) - (a.charCount || 0);
    });

  // ── Result overlay ───────────────────────────────────────────────────────────

  if (brData.finished) {
    const rankings = getRankings(players);
    const winnerData = brData.winner ? players[brData.winner] : null;
    const iWon = brData.winner === playerId;

    return (
      <div className="br-result-screen">
        <div className="br-result-card">
          <div className={`br-result-banner ${iWon ? 'br-result-win' : 'br-result-loss'}`}>
            {brData.winner ? (
              <>
                <span className="br-result-crown">🏆</span>
                <span className="br-result-winner-name">{winnerData?.nickname || '?'} wins!</span>
                {iWon && <span className="br-result-you-won">That's you!</span>}
              </>
            ) : (
              <span className="br-result-winner-name">Everyone eliminated — no winner!</span>
            )}
          </div>

          <div className="br-rankings">
            {rankings.map((p, i) => (
              <div key={p.id} className={`br-rank-row ${p.id === playerId ? 'br-rank-me' : ''}`}>
                <span className="br-rank-pos">#{i + 1}</span>
                <span className="br-rank-name">{p.nickname}{p.id === playerId ? ' (you)' : ''}</span>
                <span className="br-rank-detail">
                  {p.completedAt
                    ? `Finished all ${BR_STAGE_COUNT} stages`
                    : p.eliminated
                      ? `Eliminated on stage ${p.stage + 1}`
                      : `Stage ${p.stage + 1}/${BR_STAGE_COUNT}`}
                </span>
                {p.id === brData.winner && <span className="br-rank-crown">🏆</span>}
              </div>
            ))}
          </div>

          <div className="br-result-actions">
            <button className="btn btn-green" onClick={handleBackToLobby}>
              Back to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Game screen ──────────────────────────────────────────────────────────────

  return (
    <div className="br-game">

      {/* Header */}
      <div className="br-header">
        <span className={`br-stage-badge ${isElim ? 'br-stage-badge-elim' : ''}`}>
          {isElim ? 'ELIMINATED' : isFinished ? 'FINISHED' : `Stage ${currentStage + 1} / ${BR_STAGE_COUNT}`}
        </span>
        <span className="br-header-task">{isElim || isFinished ? 'Waiting for others...' : currentTask}</span>
        <span className="br-alive-count">{totalAlive} / {totalPlayers} alive</span>
        {!isElim && !isFinished && (
          <span className={timerClass}>{formatTime(timeLeft)}</span>
        )}
        <span className="br-header-rank">#{myRank}</span>
      </div>

      {/* Body */}
      <div className="br-body">

        {/* Sidebar: other players */}
        <div className="br-sidebar">
          <div className="br-sidebar-label">Players</div>
          {otherPlayers.map(([id, p]) => {
            const barPct = Math.min(100, Math.round(((p.charCount || 0) / MAX_CHARS_BAR) * 100));
            return (
              <div key={id} className={`br-player-card ${p.eliminated ? 'br-card-elim' : ''} ${p.completedAt ? 'br-card-done' : ''}`}>
                <div className="br-card-top">
                  <span className="br-card-name">{p.nickname}</span>
                  <span className="br-card-stage">
                    {p.completedAt ? 'DONE' : p.eliminated ? `Stg ${p.stage + 1}` : `Stg ${p.stage + 1}/${BR_STAGE_COUNT}`}
                  </span>
                </div>
                <div className="br-char-bar">
                  <div className="br-char-fill" style={{ width: `${barPct}%` }} />
                </div>
                <div className="br-card-bottom">
                  {p.eliminated
                    ? <span className="br-elim-badge">✕ Eliminated</span>
                    : p.completedAt
                      ? <span className="br-done-badge">✓ Finished</span>
                      : <span className="br-chars-label">{p.charCount || 0} chars</span>
                  }
                </div>
              </div>
            );
          })}
        </div>

        {/* Main editor area */}
        <div className="br-main">
          <div className="br-editor-wrap">
            {(isElim || isFinished) && (
              <div className="br-editor-overlay">
                {isElim
                  ? <span className="br-overlay-text elim-text">ELIMINATED</span>
                  : <span className="br-overlay-text done-text">All stages complete! Waiting for others...</span>
                }
              </div>
            )}
            <CodeMirror
              value={code}
              height="100%"
              theme={oneDark}
              extensions={[javascript({ jsx: false })]}
              onChange={handleCodeChange}
              readOnly={isElim || isFinished}
              basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false }}
            />
          </div>

          {/* Test results panel */}
          {showTests && (
            <div className={`tvt-test-panel ${testLoading ? 'tests-loading' : testsPassed ? 'tests-pass' : 'tests-fail'}`}>
              <div className="tvt-test-header">
                {testLoading
                  ? <span>Running tests...</span>
                  : testResults && testResults.length === 0
                    ? <span>No predefined tests — advance when ready</span>
                    : <span>{testsPassed ? '✓ All tests passed' : '✗ Some tests failed'}</span>
                }
                <button className="tvt-test-close" onClick={() => setShowTests(false)}>✕</button>
              </div>
              {!testLoading && testResults && testResults.length > 0 && (
                <div className="tvt-test-list">
                  {testResults.map((r, i) => (
                    <div key={i} className={`tvt-test-row ${r.pass ? 'test-pass' : 'test-fail'}`}>
                      <span className="test-icon">{r.pass ? '✓' : '✗'}</span>
                      <span className="test-label">{r.label}</span>
                      {!r.pass && (
                        <span className="test-detail">
                          {r.error ? `Error: ${r.error}` : `got ${r.got !== undefined ? JSON.stringify(r.got) : '?'}`}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          {!isElim && !isFinished && (
            <div className="br-footer">
              {hasTests && (
                <button
                  className={`btn-run-tests ${testLoading ? 'btn-run-loading' : ''}`}
                  onClick={handleRunTests}
                  disabled={testLoading}
                >
                  {testLoading ? 'Running...' : 'Run Tests'}
                </button>
              )}
              <button
                className={`br-advance-btn ${canAdvance ? 'br-advance-ready' : ''}`}
                onClick={handleAdvanceStage}
                disabled={!canAdvance}
                title={hasTests && !testsPassed ? 'Pass all tests first' : ''}
              >
                {advancing
                  ? 'Advancing...'
                  : currentStage >= BR_STAGE_COUNT - 1
                    ? 'Finish!'
                    : hasTests && !testsPassed
                      ? 'Pass tests to advance'
                      : `Next Stage →`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BattleRoyaleScreen;
