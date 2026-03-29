import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';
import { resetLobby } from '../services/gameService';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';

const getExtensions = (lang) => {
  switch (lang) {
    case 'Python': return [python()];
    case 'Java':   return [java()];
    case 'C++':    return [cpp()];
    default:       return [javascript({ jsx: false })];
  }
};

function TeamVsTeamResult({ lobbyId, playerId, onBackToLobby, onGoHome }) {
  const [game, setGame]         = useState(null);
  const [playerMap, setPlayerMap] = useState({});

  useEffect(() => {
    const unsubGame = onValue(ref(database, `lobbies/${lobbyId}/game`), (snap) => {
      if (snap.exists()) setGame(snap.val());
    });
    const unsubPlayers = onValue(ref(database, `lobbies/${lobbyId}/players`), (snap) => {
      if (!snap.exists()) return;
      const map = {};
      Object.values(snap.val()).forEach((p) => { map[p.id] = p.nickname; });
      setPlayerMap(map);
    });
    return () => { unsubGame(); unsubPlayers(); };
  }, [lobbyId]);

  if (!game) {
    return (
      <div className="screen-center">
        <div className="card"><p>Loading results...</p></div>
      </div>
    );
  }

  const winner = game.winner;
  const teams  = game.teams || {};

  const getTeamMembers = (team) =>
    Object.keys(teams[team]?.members || {}).map((id) => playerMap[id] || '?');

  const myTeamAssignment = game.teams
    ? Object.entries({ A: teams.A?.members, B: teams.B?.members }).find(
        ([, members]) => members && Object.keys(members).includes(playerId)
      )?.[0]
    : null;

  const iWon = winner === myTeamAssignment;

  return (
    <div className="tvt-result">
      <div className={`tvt-winner-banner ${winner === 'A' ? 'team-a' : 'team-b'}`}>
        <span className="tvt-winner-crown">🏆</span>
        <span className="tvt-winner-text">Team {winner} Wins!</span>
        {iWon && <span className="tvt-you-won-sub">That's your team!</span>}
      </div>

      <div className="tvt-result-task">
        <span className="tvt-task-label">Task</span>
        <p className="tvt-task-text">{game.task}</p>
      </div>

      <div className="teams-grid">
        {['A', 'B'].map((team) => {
          const teamData = teams[team] || {};
          return (
            <div key={team} className={`team-col ${team === winner ? 'team-col-winner' : ''}`}>
              <div className={`team-col-header ${team === 'A' ? 'team-a' : 'team-b'}`}>
                <span className="team-col-name">Team {team}</span>
                {team === winner && <span className="winner-crown-sm">🏆</span>}
              </div>
              <div className="team-members-list">
                {getTeamMembers(team).map((name, i) => (
                  <span key={i} className="team-player-row">{name}</span>
                ))}
              </div>
              <div className="tvt-code-preview">
                <CodeMirror
                  value={teamData.code || '// no code submitted'}
                  height="260px"
                  theme={oneDark}
                  extensions={getExtensions(teamData.language || 'JavaScript')}
                  readOnly
                  basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false }}
                />
              </div>
              <div className="team-lang-tag">{teamData.language || 'JavaScript'}</div>
            </div>
          );
        })}
      </div>

      <div className="reveal-actions">
        <button
          className="btn btn-green"
          onClick={async () => { await resetLobby(lobbyId); onBackToLobby(); }}
        >
          Back to Lobby
        </button>
        <button className="btn btn-outline" onClick={onGoHome}>
          Leave
        </button>
      </div>
    </div>
  );
}

export default TeamVsTeamResult;
