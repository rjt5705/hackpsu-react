import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';
import { updateTeamCode, setTeamLanguage, submitTeam } from '../services/gameService';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';

const LANGUAGES = ['JavaScript', 'Python', 'Java', 'C++'];

const getExtensions = (lang) => {
  switch (lang) {
    case 'Python':     return [python()];
    case 'Java':       return [java()];
    case 'C++':        return [cpp()];
    default:           return [javascript({ jsx: false })];
  }
};

function TeamVsTeamGame({ lobbyId, playerId, onGameEnd }) {
  const [myTeam, setMyTeam]       = useState(null);
  const [task, setTask]           = useState('');
  const [code, setCode]           = useState('');
  const [language, setLanguage]   = useState('JavaScript');
  const [teamMembers, setTeamMembers] = useState([]);
  const [playerMap, setPlayerMap] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [winner, setWinner]       = useState(null);

  const lastWrittenCodeRef = useRef('');
  const debounceTimer      = useRef(null);
  const myTeamRef          = useRef(null);

  // Subscribe to team assignment
  useEffect(() => {
    const unsub = onValue(ref(database, `lobbies/${lobbyId}/teamAssignments/${playerId}`), (snap) => {
      if (snap.exists()) {
        myTeamRef.current = snap.val();
        setMyTeam(snap.val());
      }
    });
    return () => unsub();
  }, [lobbyId, playerId]);

  // Subscribe to player nicknames
  useEffect(() => {
    const unsub = onValue(ref(database, `lobbies/${lobbyId}/players`), (snap) => {
      if (!snap.exists()) return;
      const map = {};
      Object.values(snap.val()).forEach((p) => { map[p.id] = p.nickname; });
      setPlayerMap(map);
    });
    return () => unsub();
  }, [lobbyId]);

  // Subscribe to game data
  useEffect(() => {
    const unsub = onValue(ref(database, `lobbies/${lobbyId}/game`), (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();
      setTask(data.task || '');
      setWinner(data.winner || null);

      const team = myTeamRef.current;
      if (!team || !data.teams) return;

      const teamData = data.teams[team];
      if (!teamData) return;

      setSubmitted(teamData.submitted || false);
      setLanguage(teamData.language || 'JavaScript');
      setTeamMembers(Object.keys(teamData.members || {}));

      // Only update code if someone else wrote it (prevent cursor jump)
      if (teamData.code !== lastWrittenCodeRef.current) {
        setCode(teamData.code || '');
      }
    });
    return () => unsub();
  }, [lobbyId]);

  // Subscribe to lobby status for game end
  useEffect(() => {
    const unsub = onValue(ref(database, `lobbies/${lobbyId}/status`), (snap) => {
      if (snap.exists() && snap.val() === 'finished') {
        onGameEnd();
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId]);

  const handleCodeChange = useCallback((value) => {
    if (submitted) return;
    setCode(value);
    lastWrittenCodeRef.current = value;

    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const team = myTeamRef.current;
      if (team) updateTeamCode(lobbyId, team, value);
    }, 300);
  }, [lobbyId, submitted]);

  const handleLanguageChange = async (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    if (myTeam) setTeamLanguage(lobbyId, myTeam, lang);
  };

  const handleSubmit = async () => {
    if (!myTeam || submitted) return;
    await submitTeam(lobbyId, myTeam);
  };

  if (!myTeam) {
    return (
      <div className="screen-center">
        <div className="card"><p>Loading team...</p></div>
      </div>
    );
  }

  const teamLabel = myTeam === 'A' ? 'Team A' : 'Team B';
  const teamClass = myTeam === 'A' ? 'team-a' : 'team-b';

  return (
    <div className="tvt-game">
      <div className={`tvt-header ${teamClass}`}>
        <div className="tvt-header-left">
          <span className={`tvt-team-badge ${teamClass}`}>{teamLabel}</span>
          <span className="tvt-task">{task}</span>
        </div>
        <div className="tvt-members">
          {teamMembers.map((id) => (
            <span key={id} className="tvt-member-chip">
              {playerMap[id] || '...'}
              {id === playerId && ' (you)'}
            </span>
          ))}
        </div>
      </div>

      <div className="tvt-editor-wrap">
        <CodeMirror
          value={code}
          height="100%"
          theme={oneDark}
          extensions={getExtensions(language)}
          onChange={handleCodeChange}
          readOnly={submitted}
          basicSetup={{ lineNumbers: true, foldGutter: false, autocompletion: false }}
        />
      </div>

      <div className="tvt-footer">
        <select
          className="lang-select"
          value={language}
          onChange={handleLanguageChange}
          disabled={submitted}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>

        {winner ? (
          <span className={`tvt-winner-label ${winner === myTeam ? 'tvt-you-won' : 'tvt-you-lost'}`}>
            {winner === myTeam ? 'Your team won!' : `Team ${winner} won`}
          </span>
        ) : (
          <button
            className={`btn-tvt-submit ${submitted ? 'btn-tvt-submitted' : ''}`}
            onClick={handleSubmit}
            disabled={submitted}
          >
            {submitted ? 'Submitted — waiting...' : 'Submit'}
          </button>
        )}
      </div>
    </div>
  );
}

export default TeamVsTeamGame;
