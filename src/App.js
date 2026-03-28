import React, { useState, useEffect } from 'react';
import './App.css';
import { createLobby, joinLobby, subscribeToLobby, subscribeToPlayers, leaveLobby } from './services/lobbyService';

function App() {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [currentLobby, setCurrentLobby] = useState(null);
  const [currentPlayer, setCurrentPlayer] = useState(null);
  const [players, setPlayers] = useState([]);
  const [lobbyData, setLobbyData] = useState(null);

  // Subscribe to lobby updates when in a lobby
  useEffect(() => {
    if (!currentLobby) return;

    // Subscribe to lobby data
    const unsubscribeLobby = subscribeToLobby(currentLobby, (data) => {
      if (data) {
        setLobbyData(data);
      } else {
        // Lobby was deleted
        setError('Room no longer exists');
        setCurrentLobby(null);
        setCurrentPlayer(null);
      }
    });

    // Subscribe to players list
    const unsubscribePlayers = subscribeToPlayers(currentLobby, (playerList) => {
      setPlayers(playerList || []);
    });

    // Cleanup subscriptions when leaving lobby
    return () => {
      unsubscribeLobby();
      unsubscribePlayers();
    };
  }, [currentLobby]);

  const handleCreateRoom = async () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    setIsCreating(true);
    setError('');
    
    try {
      const { lobbyId, playerId } = await createLobby(nickname.trim());
      setCurrentLobby(lobbyId);
      setCurrentPlayer(playerId);
      console.log('Room created:', lobbyId);
    } catch (err) {
      setError(err.message || 'Failed to create room');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }
    
    if (!roomCode.trim()) {
      setError('Please enter a room code');
      return;
    }

    setIsJoining(true);
    setError('');
    
    try {
      const { playerId } = await joinLobby(roomCode.trim().toUpperCase(), nickname.trim());
      setCurrentLobby(roomCode.trim().toUpperCase());
      setCurrentPlayer(playerId);
      console.log('Joined room:', roomCode);
    } catch (err) {
      setError(err.message || 'Failed to join room');
    } finally {
      setIsJoining(false);
    }
  };

  const handleLeaveLobby = async () => {
    if (currentLobby && currentPlayer) {
      await leaveLobby(currentLobby, currentPlayer);
      setCurrentLobby(null);
      setCurrentPlayer(null);
      setPlayers([]);
      setLobbyData(null);
    }
  };

  // If in a lobby, show lobby view
  if (currentLobby) {
    const isHost = lobbyData?.hostId === currentPlayer;
    
    return (
      <div className="lobby-container">
        <div className="lobby-card">
          <h1 className="game-title">PLACEHOLDER</h1>
          
          <div className="room-info">
            <p className="room-code-label">Room Code:</p>
            <h2 className="room-code-display">{currentLobby}</h2>
          </div>
          
          <div className="player-info">
            <p>Welcome, <strong>{nickname}</strong>!</p>
            {isHost && <p className="host-badge">👑 Host</p>}
          </div>
          
          <div className="players-list">
            <h3>Players ({players.length}/99)</h3>
            <ul>
              {players.map((player) => (
                <li key={player.id}>
                  {player.nickname} 
                  {player.id === lobbyData?.hostId && ' 👑'}
                  {player.isReady && ' ✓'}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="button-group">
            <button 
              className="btn btn-leave"
              onClick={handleLeaveLobby}
            >
              Leave Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Show lobby creation/joining screen
  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1 className="game-title">PLACEHOLDER</h1>
        
        <div className="input-group">
          <input
            type="text"
            className="nickname-input"
            placeholder="Enter your nickname"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            maxLength={20}
          />
        </div>

        <div className="input-group">
          <input
            type="text"
            className="roomcode-input"
            placeholder="Enter room code"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            maxLength={6}
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="button-group">
          <button
            className="btn btn-create"
            onClick={handleCreateRoom}
            disabled={isCreating || isJoining}
          >
            {isCreating ? 'Creating...' : 'Create Room'}
          </button>
          
          <button
            className="btn btn-join"
            onClick={handleJoinRoom}
            disabled={isCreating || isJoining}
          >
            {isJoining ? 'Joining...' : 'Join Room'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;