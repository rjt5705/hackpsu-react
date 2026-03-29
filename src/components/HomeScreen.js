import React, { useState } from 'react';
import { createLobby, joinLobby } from '../services/lobbyService';
import { DEFAULT_TASKS } from '../services/gameService';
import { ref, set } from 'firebase/database';
import { database } from '../firebase';

function HomeScreen({ onEnterLobby }) {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    if (!nickname.trim()) { setError('Enter a nickname'); return; }
    setIsCreating(true);
    setError('');
    try {
      const { lobbyId, playerId } = await createLobby(nickname.trim());
      // Initialize default settings
      await set(ref(database, `lobbies/${lobbyId}/settings`), {
        codingTime: 60,
        guessingTime: 30,
        taskBank: DEFAULT_TASKS,
      });
      onEnterLobby(lobbyId, playerId, nickname.trim());
    } catch (err) {
      setError(err.message || 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async () => {
    if (!nickname.trim()) { setError('Enter a nickname'); return; }
    if (!roomCode.trim()) { setError('Enter a room code'); return; }
    setIsJoining(true);
    setError('');
    try {
      const { playerId } = await joinLobby(roomCode.trim().toUpperCase(), nickname.trim());
      onEnterLobby(roomCode.trim().toUpperCase(), playerId, nickname.trim());
    } catch (err) {
      setError(err.message || 'Failed to join room');
    } finally {
      setIsJoining(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      if (roomCode.trim()) handleJoin();
      else handleCreate();
    }
  };

  return (
    <div className="screen-center">
      <div className="card">
        <h1 className="game-title">Join A Game</h1>

        <div className="input-group">
          <label>Nickname</label>
          <input
            className="text-input"
            type="text"
            placeholder="Your Name"
            value={nickname}
            maxLength={20}
            onChange={(e) => setNickname(e.target.value)}
            onKeyDown={handleKey}
          />
        </div>

        <div className="input-group">
          <label>Room Code</label>
          <input
            className="text-input"
            type="text"
            placeholder="XXXXXX"
            value={roomCode}
            maxLength={6}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            onKeyDown={handleKey}
          />
        </div>

        {error && <div className="error-msg">{error}</div>}

        <div className="btn-row">
          <button className="btn btn-green" onClick={handleCreate} disabled={isCreating || isJoining}>
            {isCreating ? 'Creating...' : 'Create Room'}
          </button>
          <button className="btn btn-blue" onClick={handleJoin} disabled={isCreating || isJoining}>
            {isJoining ? 'Joining...' : 'Join Room'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default HomeScreen;
