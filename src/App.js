import React, { useState } from 'react';
import './App.css';

function App() {
  const [nickname, setNickname] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleCreateRoom = async () => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    setIsCreating(true);
    setError('');
    
    try {
      // Temporary: Just simulate for now
      setTimeout(() => {
        console.log('Room created with nickname:', nickname);
        setIsCreating(false);
        // Will connect to backend later
      }, 1000);
    } catch (err) {
      setError('Connection error. Please try again.');
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
      setTimeout(() => {
        console.log('Joining room:', roomCode, 'as:', nickname);
        setIsJoining(false);
        // Will connect to backend later
      }, 1000);
    } catch (err) {
      setError('Connection error. Please try again.');
      setIsJoining(false);
    }
  };

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1 className="game-title">PLACEHOLDER</h1>
        
        {/* Nickname Input */}
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

        {/* Room Code Input - Now between nickname and buttons */}
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

        {/* Error Message */}
        {error && <div className="error-message">{error}</div>}

        {/* Action Buttons */}
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