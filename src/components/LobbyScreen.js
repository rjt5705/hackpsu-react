import React, { useState, useEffect, useRef } from 'react';
import { subscribeToPlayers, kickPlayer, leaveLobby } from '../services/lobbyService';
import { updateSettings, startGame, markPlayerReturned, updateGameMode, DEFAULT_TASKS } from '../services/gameService';
import { ref, onValue, remove } from 'firebase/database';
import { database } from '../firebase';

const GAME_MODES = [
  { id: 'gartic_phone',  name: 'Gartic Phone',       icon: '🎨', desc: 'Code the prompt, guess the code' },
  { id: 'team_vs_team',  name: 'Team vs Team',        icon: '⚔️',  desc: 'Coming soon' },
  { id: 'battle_royal',  name: 'Battle Royal Coding', icon: '🏆', desc: 'Coming soon' },
];

function LobbyScreen({ lobbyId, playerId, nickname, onGameStart, onLeave }) {
  const [players, setPlayers]     = useState([]);
  const [settings, setSettings]   = useState({ codingTime: 60, guessingTime: 30, taskBank: DEFAULT_TASKS });
  const [gameMode, setGameMode]   = useState('gartic_phone');
  const [isHost, setIsHost]       = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError]         = useState('');
  const [newTask, setNewTask]     = useState('');
  const [showTasks, setShowTasks] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [returnedIds, setReturnedIds] = useState(new Set());
  const [graceExpired, setGraceExpired] = useState(false);

  const [codingTimeRaw, setCodingTimeRaw]     = useState('60');
  const [guessingTimeRaw, setGuessingTimeRaw] = useState('30');

  useEffect(() => {
    setCodingTimeRaw(String(settings.codingTime));
    setGuessingTimeRaw(String(settings.guessingTime));
  }, [settings.codingTime, settings.guessingTime]);

  const isLeavingRef  = useRef(false);
  const graceTimerRef = useRef(null);

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

    const unsubSettings = onValue(ref(database, `lobbies/${lobbyId}/settings`), (snap) => {
      if (snap.exists()) setSettings(snap.val());
    });

    const unsubLobby = onValue(ref(database, `lobbies/${lobbyId}`), (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setIsHost(data.hostId === playerId);
        setGameMode(data.gameMode || 'gartic_phone');
        if (data.status === 'playing') onGameStart();
      }
    });

    const unsubReturned = onValue(ref(database, `lobbies/${lobbyId}/returnedPlayers`), (snap) => {
      setReturnedIds(snap.exists() ? new Set(Object.keys(snap.val())) : new Set());
    });

    const unsubResetAt = onValue(ref(database, `lobbies/${lobbyId}/resetAt`), (snap) => {
      clearTimeout(graceTimerRef.current);
      setGraceExpired(false);
      if (!snap.exists()) return;
      const remaining = Math.max(0, 60000 - (Date.now() - snap.val()));
      graceTimerRef.current = setTimeout(() => setGraceExpired(true), remaining);
    });

    return () => {
      unsubPlayers(); unsubSettings(); unsubLobby(); unsubReturned(); unsubResetAt();
      clearTimeout(graceTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, playerId, onGameStart]);

  // 10-minute idle cleanup (host only)
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

  const waitingOn      = players.filter((p) => !returnedIds.has(p.id));
  const notAllReturned = !graceExpired && waitingOn.length > 0;

  // ── Handlers ──────────────────────────────────────────────

  const handleStart = async () => {
    if (players.length < 2)  { setError('Need at least 2 players to start'); return; }
    if (notAllReturned)      { setError(`Waiting for ${waitingOn.length} player(s) to return`); return; }
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

  const handleKick = async (targetId) => await kickPlayer(lobbyId, targetId);

  const handleSettingChange = async (key, value) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await updateSettings(lobbyId, updated);
  };

  const handleTimeBlur = (key, rawValue) => {
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

  const handleGameModeChange = async (modeId) => {
    if (!isHost) return;
    setGameMode(modeId);
    await updateGameMode(lobbyId, modeId);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(lobbyId).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const taskBank = Array.isArray(settings.taskBank)
    ? settings.taskBank
    : Object.values(settings.taskBank || {});

  const currentMode = GAME_MODES.find((m) => m.id === gameMode) || GAME_MODES[0];

  const startLabel = isStarting
    ? 'Starting...'
    : notAllReturned
      ? `Waiting (${waitingOn.length})...`
      : 'Start';

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="lobby-page">

      {/* ── LEFT COLUMN: Gamemode + Settings ── */}
      <div className="lobby-col lobby-col-left">

        <div className="lobby-panel">
          <div className="panel-label">Gamemode</div>
          <div className="current-mode">
            <span className="mode-icon">{currentMode.icon}</span>
            <span className="mode-name">{currentMode.name}</span>
          </div>
        </div>

        <div className="lobby-panel lobby-panel-grow">
          <div className="panel-label">Settings</div>

          {gameMode === 'gartic_phone' ? (
            <div className="settings-content">
              <div className="setting-row">
                <label>Coding time (s)</label>
                {isHost ? (
                  <input
                    type="number"
                    min="1"
                    value={codingTimeRaw}
                    onChange={(e) => setCodingTimeRaw(e.target.value)}
                    onBlur={() => handleTimeBlur('codingTime', codingTimeRaw)}
                  />
                ) : (
                  <span className="setting-value">{settings.codingTime}s</span>
                )}
              </div>
              <div className="setting-row">
                <label>Guessing time (s)</label>
                {isHost ? (
                  <input
                    type="number"
                    min="1"
                    value={guessingTimeRaw}
                    onChange={(e) => setGuessingTimeRaw(e.target.value)}
                    onBlur={() => handleTimeBlur('guessingTime', guessingTimeRaw)}
                  />
                ) : (
                  <span className="setting-value">{settings.guessingTime}s</span>
                )}
              </div>

              {isHost && (
                <div className="task-bank-toggle">
                  <button className="btn btn-outline btn-sm" onClick={() => setShowTasks((v) => !v)}>
                    {showTasks ? 'Hide Tasks' : `Task Bank (${taskBank.length})`}
                  </button>
                  {showTasks && (
                    <div className="task-list-wrap">
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
                          placeholder="Add a task..."
                          value={newTask}
                          onChange={(e) => setNewTask(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
                        />
                        <button className="btn btn-blue btn-sm" onClick={handleAddTask}>Add</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="coming-soon-text">Settings for this mode coming soon.</p>
          )}
        </div>

      </div>

      {/* ── CENTER COLUMN: Code + Players ── */}
      <div className="lobby-col lobby-col-center">

        <div className="lobby-panel code-panel" onClick={copyCode} title="Click to copy">
          <div className="panel-label">Code</div>
          <div className="lobby-room-code">{lobbyId}</div>
          <div className="copy-hint-small">{copied ? '✓ Copied!' : 'Click to copy'}</div>
        </div>

        <div className="lobby-panel lobby-panel-grow">
          <div className="panel-label">Players in Lobby ({players.length})</div>
          <ul className="player-list-new">
            {players.map((p) => (
              <li key={p.id} className="player-item-new">
                <div className="player-info-row">
                  <span className="player-avatar">{p.nickname[0].toUpperCase()}</span>
                  <span className="player-name-lobby">
                    {p.nickname}
                    {p.id === playerId && <span className="you-tag"> (you)</span>}
                  </span>
                  {!returnedIds.has(p.id) && p.id !== playerId && (
                    <span className="not-returned">returning...</span>
                  )}
                </div>
                {isHost && p.id !== playerId && (
                  <button className="btn-kick" onClick={() => handleKick(p.id)}>Kick</button>
                )}
              </li>
            ))}
          </ul>
          {!isHost && (
            <p className="waiting-msg">Waiting for the host to start...</p>
          )}
        </div>

      </div>

      {/* ── RIGHT COLUMN: Change Gamemode + Start ── */}
      <div className="lobby-col lobby-col-right">

        <div className="lobby-panel lobby-panel-grow">
          <div className="panel-label">Change Gamemode</div>
          <div className="gamemode-list">
            {GAME_MODES.map((mode) => (
              <button
                key={mode.id}
                className={`gamemode-option ${gameMode === mode.id ? 'gamemode-active' : ''} ${!isHost ? 'gamemode-readonly' : ''}`}
                onClick={() => handleGameModeChange(mode.id)}
                disabled={!isHost}
              >
                <span className="gm-icon">{mode.icon}</span>
                <div className="gm-text">
                  <span className="gm-name">{mode.name}</span>
                  <span className="gm-desc">{mode.desc}</span>
                </div>
              </button>
            ))}
          </div>
          {!isHost && <p className="readonly-hint">Only the host can change the game mode.</p>}
        </div>

        <div className="lobby-right-bottom">
          {error && <div className="error-msg">{error}</div>}
          {isHost && (
            <button
              className="btn-start-big"
              onClick={handleStart}
              disabled={isStarting || players.length < 2 || notAllReturned}
            >
              {startLabel}
            </button>
          )}
          <button className="btn-leave-small" onClick={handleLeave}>Leave Room</button>
        </div>

      </div>
    </div>
  );
}

export default LobbyScreen;
