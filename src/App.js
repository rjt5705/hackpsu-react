import React, { useState } from 'react';
import './App.css';
import HomeScreen from './components/HomeScreen';
import LobbyScreen from './components/LobbyScreen';
import GameScreen from './components/GameScreen';
import RevealScreen from './components/RevealScreen';
import TeamVsTeamGame from './components/TeamVsTeamGame';
import TeamVsTeamResult from './components/TeamVsTeamResult';

function App() {
  const [screen, setScreen] = useState('home'); // 'home' | 'lobby' | 'game' | 'reveal'
  const [lobbyId, setLobbyId] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [nickname, setNickname] = useState('');
  const [activeMode, setActiveMode] = useState('gartic_phone');

  const handleEnterLobby = (lid, pid, nick) => {
    setLobbyId(lid);
    setPlayerId(pid);
    setNickname(nick);
    setScreen('lobby');
  };

  const handleGameStart = (mode = 'gartic_phone') => { setActiveMode(mode); setScreen('game'); };

  const handleGameEnd = () => setScreen('reveal');

  const handleBackToLobby = () => setScreen('lobby');

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
    if (activeMode === 'team_vs_team') {
      return (
        <TeamVsTeamGame
          lobbyId={lobbyId}
          playerId={playerId}
          onGameEnd={handleGameEnd}
        />
      );
    }
    return (
      <GameScreen
        lobbyId={lobbyId}
        playerId={playerId}
        onGameEnd={handleGameEnd}
      />
    );
  }

  if (screen === 'reveal') {
    if (activeMode === 'team_vs_team') {
      return (
        <TeamVsTeamResult
          lobbyId={lobbyId}
          playerId={playerId}
          onBackToLobby={handleBackToLobby}
          onGoHome={handleLeave}
        />
      );
    }
    return (
      <RevealScreen
        lobbyId={lobbyId}
        playerId={playerId}
        onBackToLobby={handleBackToLobby}
        onGoHome={handleLeave}
      />
    );
  }

  return null;
}

export default App;
