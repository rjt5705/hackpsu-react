import React, { useState } from 'react';
import './App.css';
import HomeScreen from './components/HomeScreen';
import LobbyScreen from './components/LobbyScreen';
import GameScreen from './components/GameScreen';
import RevealScreen from './components/RevealScreen';

function App() {
  const [screen, setScreen] = useState('home'); // 'home' | 'lobby' | 'game' | 'reveal'
  const [lobbyId, setLobbyId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [nickname, setNickname] = useState('');

  const handleEnterLobby = (lid, pid, nick) => {
    setLobbyId(lid);
    setPlayerId(pid);
    setNickname(nick);
    setScreen('lobby');
  };

  const handleGameStart = () => setScreen('game');

  const handleGameEnd = () => setScreen('reveal');

  const handleLeave = () => {
    setLobbyId(null);
    setPlayerId(null);
    setNickname('');
    setScreen('home');
  };

  if (screen === 'home') {
    return <HomeScreen onEnterLobby={handleEnterLobby} />;
  }

  if (screen === 'lobby') {
    return (
      <LobbyScreen
        lobbyId={lobbyId}
        playerId={playerId}
        nickname={nickname}
        onGameStart={handleGameStart}
        onLeave={handleLeave}
      />
    );
  }

  if (screen === 'game') {
    return (
      <GameScreen
        lobbyId={lobbyId}
        playerId={playerId}
        onGameEnd={handleGameEnd}
      />
    );
  }

  if (screen === 'reveal') {
    return (
      <RevealScreen
        lobbyId={lobbyId}
        playerId={playerId}
        onPlayAgain={handleLeave}
      />
    );
  }

  return null;
}

export default App;
