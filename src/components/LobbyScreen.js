import React, { useState, useEffect, useRef } from 'react';
import { subscribeToPlayers, kickPlayer, leaveLobby } from '../services/lobbyService';
import { updateSettings, startGame, DEFAULT_TASKS } from '../services/gameService';
import { ref, onValue } from 'firebase/database';
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

  // Bug 1: track voluntary leaves so we don't mistake them for kicks
  const isLeavingRef = useRef(false);

  useEffect(() => {
    const unsubPlayers = subscribeToPlayers(lobbyId, (list) => {
      setPlayers(list || []);
      // If current player is no longer in the list and we didn't leave voluntarily → kicked
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

    return () => { unsubPlayers(); unsubSettings(); unsubLobby(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId, playerId, onGameStart]);

  const handleStart = async () => {
    if (players.length < 2) { setError('Need at least 2 players to start'); return; }
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
                      min="10"
                      max="300"
                      value={settings.codingTime}
                      onChange={(e) => handleSettingChange('codingTime', parseInt(e.target.value) || 60)}
                    />
                  </div>
                  <div className="setting-row">
                    <label>Guessing time (s)</label>
                    <input
                      type="number"
                      min="10"
                      max="300"
                      value={settings.guessingTime}
                      onChange={(e) => handleSettingChange('guessingTime', parseInt(e.target.value) || 30)}
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
              disabled={isStarting || players.length < 2}
            >
              {isStarting ? 'Starting...' : 'Start Game'}
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
