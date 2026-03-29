import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';
import { updateTeamCode, setTeamLanguage, submitTeam } from '../services/gameService';
import { TASK_TESTS, runTests } from '../taskTests';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { oneDark } from '@codemirror/theme-one-dark';

const LANGUAGES = ['JavaScript', 'Python', 'Java', 'C++'];

const getExtensions = (lang) => {
  switch (lang) {
    case 'Python': return [python()];
    case 'Java':   return [java()];
    case 'C++':    return [cpp()];
    default:       return [javascript({ jsx: false })];
  }
};

function TeamVsTeamGame({ lobbyId, playerId, onGameEnd }) {
  const [myTeam, setMyTeam]           = useState(null);
  const [task, setTask]               = useState('');
  const [code, setCode]               = useState('');
  const [language, setLanguage]       = useState('JavaScript');
  const [teamMembers, setTeamMembers] = useState([]);
  const [playerMap, setPlayerMap]     = useState({});
  const [submitted, setSubmitted]     = useState(false);
  const [winner, setWinner]           = useState(null);

  // Test runner state
  const [testResults, setTestResults] = useState(null); // null = not run yet
  const [testsPassed, setTestsPassed] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [showTests, setShowTests]     = useState(false);

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

      // Only update code if it came from a teammate (prevent cursor jump on own writes)
      if (teamData.code !== lastWrittenCodeRef.current) {
        setCode(teamData.code || '');
      }
    });
    return () => unsub();
  }, [lobbyId]);

  // Navigate to result screen when game finishes
  useEffect(() => {
    const unsub = onValue(ref(database, `lobbies/${lobbyId}/status`), (snap) => {
      if (snap.exists() && snap.val() === 'finished') onGameEnd();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId]);

  const handleCodeChange = useCallback((value) => {
    if (submitted) return;
    setCode(value);
    lastWrittenCodeRef.current = value;
    // Reset test results whenever code changes
    setTestResults(null);
    setTestsPassed(false);
    setShowTests(false);

    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const team = myTeamRef.current;
      if (team) updateTeamCode(lobbyId, team, value);
    }, 300);
  }, [lobbyId, submitted]);

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    setLanguage(lang);
    setTestResults(null);
    setTestsPassed(false);
    setShowTests(false);
    if (myTeamRef.current) setTeamLanguage(lobbyId, myTeamRef.current, lang);
  };

  const handleRunTests = async () => {
    if (testLoading) return;
    setTestLoading(true);
    setShowTests(true);
    try {
      const { results, allPassed, noTests } = await runTests(code, task, language);
      if (noTests) {
        setTestResults([]);
        setTestsPassed(true);
      } else {
        setTestResults(results);
        setTestsPassed(allPassed);
      }
    } catch (e) {
      setTestResults([{ label: 'Connection error', pass: false, error: e.message }]);
      setTestsPassed(false);
    } finally {
      setTestLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!myTeamRef.current || submitted) return;
    await submitTeam(lobbyId, myTeamRef.current);
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

  const hasTestCases = !!TASK_TESTS[task];
  // Must pass tests before submitting (if test cases exist for this task)
  const submitBlocked = !submitted && hasTestCases && !testsPassed;

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

      {/* Test results panel */}
      {showTests && (
        <div className={`tvt-test-panel ${testLoading ? 'tests-loading' : testsPassed ? 'tests-pass' : 'tests-fail'}`}>
          <div className="tvt-test-header">
            {testLoading
              ? <span>Running tests...</span>
              : testResults && testResults.length === 0
                ? <span>No predefined tests for this task — submit when ready</span>
                : <span>{testsPassed ? '✓ All tests passed' : '✗ Some tests failed'}</span>
            }
            <button className="tvt-test-close" onClick={() => setShowTests(false)}>✕</button>
          </div>
          {!testLoading && testResults && testResults.length > 0 && (
            <div className="tvt-test-list">
              {testResults.map((r, i) => (
                <div key={i} className={`tvt-test-row ${r.pass ? 'test-pass' : 'test-fail'}`}>
                  <span className="test-icon">{r.pass ? '✓' : '✗'}</span>
                  <span className="test-label">{r.label}</span>
                  {!r.pass && (
                    <span className="test-detail">
                      {r.error
                        ? `Error: ${r.error}`
                        : `got ${r.got !== undefined ? JSON.stringify(r.got) : '?'}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="tvt-footer">
        <select
          className="lang-select"
          value={language}
          onChange={handleLanguageChange}
          disabled={submitted}
        >
          {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>

        {!submitted && hasTestCases && (
          <button
            className={`btn-run-tests ${testLoading ? 'btn-run-loading' : ''}`}
            onClick={handleRunTests}
            disabled={testLoading}
          >
            {testLoading ? 'Running...' : 'Run Tests'}
          </button>
        )}

        {winner ? (
          <span className={`tvt-winner-label ${winner === myTeam ? 'tvt-you-won' : 'tvt-you-lost'}`}>
            {winner === myTeam ? 'Your team won!' : `Team ${winner} won`}
          </span>
        ) : (
          <button
            className={`btn-tvt-submit ${submitted ? 'btn-tvt-submitted' : ''} ${submitBlocked ? 'btn-tvt-blocked' : ''}`}
            onClick={handleSubmit}
            disabled={submitted || submitBlocked}
            title={submitBlocked ? 'Run tests and pass them before submitting' : ''}
          >
            {submitted
              ? 'Submitted — waiting...'
              : submitBlocked
                ? 'Pass tests to submit'
                : 'Submit'}
          </button>
        )}
      </div>
    </div>
  );
}

export default TeamVsTeamGame;
