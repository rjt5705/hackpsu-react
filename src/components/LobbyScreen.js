import React, { useState, useEffect, useRef } from 'react';
import { subscribeToPlayers, kickPlayer, leaveLobby } from '../services/lobbyService';
import { updateSettings, startGame, markPlayerReturned, DEFAULT_TASKS } from '../services/gameService';
import { ref, onValue, remove } from 'firebase/database';
import { database } from '../firebase';

function LobbyScreen({ lobbyId, playerId, nickname, onGameStart, onLeave }) {
  const [players, setPlayers] = useState([]);
  const [settings, setSettings] = useState({ codingTime: 60, guessingTime: 30, taskBank: DEFAULT_TASKS });
  const [isHost, setIsHost] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState('');
  const [newTask, setNewTask] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [copied, setCopied] = useState(false);

  // Bug 2: track returned player IDs (not just count) so disconnected players don't block start
  const [returnedIds, setReturnedIds] = useState(new Set());

  // Grace period: after resetAt, unblock Start after 60 s even if some players haven't returned
  const [graceExpired, setGraceExpired] = useState(false);
  const graceTimerRef = useRef(null);

  // Bug 1: raw string state for time inputs so the user can freely type and clear the field
  const [codingTimeRaw, setCodingTimeRaw] = useState('60');
  const [guessingTimeRaw, setGuessingTimeRaw] = useState('30');

  // Sync raw inputs when settings arrive from Firebase (e.g. another host session)
  useEffect(() => {
    setCodingTimeRaw(String(settings.codingTime));
    setGuessingTimeRaw(String(settings.guessingTime));
  }, [settings.codingTime, settings.guessingTime]);

  // Track voluntary leaves so we don't mistake them for kicks
  const isLeavingRef = useRef(false);

  // Register this player as returned to lobby as soon as they land here
  useEffect(() => {
    markPlayerReturned(lobbyId, playerId);
  }, [lobbyId, playerId]);

  useEffect(() => {
    const unsubPlayers = subscribeToPlayers(lobbyId, (list) => {
      setPlayers(list || []);
      if (!isLeavingRef.current) {
        const stillPresent = (list || []).some((p) => p.id === playerId);
        if (!stillPresent) onLeave();
      }
    });

    const settingsRef = ref(database, `lobbies/${lobbyId}/settings`);
    const unsubSettings = onValue(settingsRef, (snap) => {
      if (snap.exists()) setSettings(snap.val());
    });

    const lobbyRef = ref(database, `lobbies/${lobbyId}`);
    const unsubLobby = onValue(lobbyRef, (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setIsHost(data.hostId === playerId);
        if (data.status === 'playing') onGameStart();
      }
    });

    const returnedRef = ref(database, `lobbies/${lobbyId}/returnedPlayers`);
    const unsubReturned = onValue(returnedRef, (snap) => {
      setReturnedIds(snap.exists() ? new Set(Object.keys(snap.val())) : new Set());
    });

    // When resetAt changes (new game ended), start a 60-second grace period.
    // After it expires the host can start even if some players haven't returned yet
    // (they likely closed their tab — Firebase just hasn't removed them yet).
    const resetAtRef = ref(database, `lobbies/${lobbyId}/resetAt`);
    const unsubResetAt = onValue(resetAtRef, (snap) => {
      clearTimeout(graceTimerRef.current);
      setGraceExpired(false);
      if (!snap.exists()) return;
      const elapsed = Date.now() - snap.val();
      const remaining = Math.max(0, 60000 - elapsed);
      graceTimerRef.current = setTimeout(() => setGraceExpired(true), remaining);
    });

    return () => {
      unsubPlayers(); unsubSettings(); unsubLobby(); unsubReturned(); unsubResetAt();
      clearTimeout(graceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, playerId, onGameStart]);

  // Bug 3: host auto-deletes lobby after 10 minutes of inactivity
  useEffect(() => {
    if (!isHost) return;
    const timer = setTimeout(async () => {
      isLeavingRef.current = true;
      await remove(ref(database, `lobbies/${lobbyId}`));
      onLeave();
    }, 10 * 60 * 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, lobbyId]);

  // Bug 2: every player currently in Firebase must be in returnedIds — disconnected players
  // are already removed from `players`, so they don't block the count.
  // After the 60-second grace period we unblock Start anyway (Firebase disconnect lag).
  const waitingOn = players.filter((p) => !returnedIds.has(p.id));
  const notAllReturned = !graceExpired && waitingOn.length > 0;

  const handleStart = async () => {
    if (players.length < 2) { setError('Need at least 2 players to start'); return; }
    if (notAllReturned) { setError(`Waiting for ${waitingOn.length} player(s) to return`); return; }
    setIsStarting(true);
    setError('');
    try {
      await startGame(lobbyId, players, settings);
    } catch (err) {
      setError(err.message || 'Failed to start game');
      setIsStarting(false);
    }
  };

  const handleLeave = async () => {
    isLeavingRef.current = true;
    await leaveLobby(lobbyId, playerId);
    onLeave();
  };

  const handleKick = async (targetId) => {
    await kickPlayer(lobbyId, targetId);
  };

  const handleSettingChange = async (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await updateSettings(lobbyId, updated);
  };

  // Bug 1: validate time on blur instead of on every keystroke
  const handleTimeBlur = (key, rawValue, fallback) => {
    const val = parseInt(rawValue, 10);
    if (!val || val <= 0) {
      setError(`${key === 'codingTime' ? 'Coding' : 'Guessing'} time must be greater than 0`);
      if (key === 'codingTime') setCodingTimeRaw(String(settings.codingTime));
      else setGuessingTimeRaw(String(settings.guessingTime));
      return;
    }
    setError('');
    handleSettingChange(key, val);
  };

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    const taskBank = Array.isArray(settings.taskBank) ? settings.taskBank : Object.values(settings.taskBank || {});
    const updated = { ...settings, taskBank: [...taskBank, newTask.trim()] };
    setSettings(updated);
    await updateSettings(lobbyId, updated);
    setNewTask('');
  };

  const handleRemoveTask = async (index) => {
    const taskBank = Array.isArray(settings.taskBank) ? settings.taskBank : Object.values(settings.taskBank || {});
    const updated = { ...settings, taskBank: taskBank.filter((_, i) => i !== index) };
    setSettings(updated);
    await updateSettings(lobbyId, updated);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(lobbyId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const taskBank = Array.isArray(settings.taskBank)
    ? settings.taskBank
    : Object.values(settings.taskBank || {});

  return (
    <div className="screen-center">
      <div className="card lobby-card">
        <h1 className="game-title">Gartic Phone: Code Edition</h1>

        <div className="room-code-box" onClick={copyCode} title="Click to copy">
          <span className="room-code-label">Room Code</span>
          <span className="room-code">{lobbyId}</span>
          <span className="copy-hint">{copied ? '✓ Copied!' : 'Click to copy'}</span>
        </div>

        <div className="lobby-body">
          {/* Players */}
          <div className="section">
            <h3>Players ({players.length})</h3>
            <ul className="player-list">
              {players.map((p) => (
                <li key={p.id} className="player-item">
                  <span>
                    {p.nickname}
                    {p.id === playerId && ' (you)'}
                    {!returnedIds.has(p.id) && p.id !== playerId && (
                      <span className="not-returned"> · returning...</span>
                    )}
                  </span>
                  {isHost && p.id !== playerId && (
                    <button className="btn-kick" onClick={() => handleKick(p.id)}>Kick</button>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Settings (host only) */}
          {isHost && (
            <div className="section">
              <button
                className="btn btn-outline"
                onClick={() => setShowSettings((v) => !v)}
              >
                {showSettings ? 'Hide Settings' : 'Game Settings'}
              </button>

              {showSettings && (
                <div className="settings-panel">
                  <div className="setting-row">
                    <label>Coding time (s)</label>
                    <input
                      type="number"
                      min="1"
                      value={codingTimeRaw}
                      onChange={(e) => setCodingTimeRaw(e.target.value)}
                      onBlur={() => handleTimeBlur('codingTime', codingTimeRaw)}
                    />
                  </div>
                  <div className="setting-row">
                    <label>Guessing time (s)</label>
                    <input
                      type="number"
                      min="1"
                      value={guessingTimeRaw}
                      onChange={(e) => setGuessingTimeRaw(e.target.value)}
                      onBlur={() => handleTimeBlur('guessingTime', guessingTimeRaw)}
                    />
                  </div>

                  <div className="task-bank-section">
                    <h4>Task Bank ({taskBank.length} tasks)</h4>
                    <ul className="task-list">
                      {taskBank.map((task, i) => (
                        <li key={i} className="task-item">
                          <span>{task}</span>
                          <button className="btn-kick" onClick={() => handleRemoveTask(i)}>✕</button>
                        </li>
                      ))}
                    </ul>
                    <div className="add-task-row">
                      <input
                        className="text-input"
                        type="text"
                        placeholder="Add a custom task..."
                        value={newTask}
                        onChange={(e) => setNewTask(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                      />
                      <button className="btn btn-blue btn-sm" onClick={handleAddTask}>Add</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="btn-row">
          {isHost && (
            <button
              className="btn btn-green"
              onClick={handleStart}
              disabled={isStarting || players.length < 2 || notAllReturned}
            >
              {isStarting
                ? 'Starting...'
                : notAllReturned
                  ? `Waiting for ${waitingOn.length} player(s) to return...`
                  : 'Start Game'}
            </button>
          )}
          {!isHost && (
            <p className="waiting-msg">Waiting for the host to start the game...</p>
          )}
          <button className="btn btn-red" onClick={handleLeave}>Leave</button>
        </div>
      </div>
    </div>
  );
}

export default LobbyScreen;
