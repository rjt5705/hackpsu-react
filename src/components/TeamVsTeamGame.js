import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';
import { updateTeamCode, submitTeam } from '../services/gameService';
import { TASK_TESTS, runTests } from '../taskTests';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { Transaction } from '@codemirror/state';

// Annotation used to mark remote (Firebase-sourced) dispatches so onChange can ignore them
const REMOTE = Transaction.userEvent.of('remote');

function TeamVsTeamGame({ lobbyId, playerId, onGameEnd }) {
  const [myTeam, setMyTeam]           = useState(null);
  const [task, setTask]               = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [playerMap, setPlayerMap]     = useState({});
  const [submitted, setSubmitted]     = useState(false);
  const [winner, setWinner]           = useState(null);

  // Test runner state
  const [testResults, setTestResults] = useState(null);
  const [testsPassed, setTestsPassed] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [showTests, setShowTests]     = useState(false);

  // CodeMirror view ref — we manage code directly through the view instead of React state
  // so that remote updates can preserve the local cursor position.
  const editorViewRef       = useRef(null);
  const lastWrittenCodeRef  = useRef('');
  const lastSyncedCodeRef   = useRef('');
  const lastLocalTypeTimeRef = useRef(0); // timestamp of last local keystroke
  const debounceTimer       = useRef(null);
  const myTeamRef           = useRef(null);
  const submittedRef        = useRef(false);

  // How long (ms) after a local keystroke to block remote updates.
  // Prevents the teammate's code from jumping your cursor while you're actively typing.
  const TYPING_GRACE_MS = 1000;

  const getEditorCode = () => editorViewRef.current?.state.doc.toString() ?? '';

  // Apply a teammate's code update directly to the CodeMirror view.
  // Using view.dispatch (not the value prop) lets us:
  //   1. Annotate the transaction as 'remote' so onChange ignores it
  //   2. Preserve our cursor position instead of resetting it to 0
  //   3. Skip the update entirely if the local player is actively typing
  const applyRemoteCode = useCallback((remoteCode) => {
    // If the local player typed recently, don't overwrite their document —
    // it would move their cursor into the teammate's code mid-keystroke.
    if (Date.now() - lastLocalTypeTimeRef.current < TYPING_GRACE_MS) return;

    const view = editorViewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === remoteCode) return;
    // Clamp cursor so it stays valid inside the new (possibly shorter) document
    const cursorPos = Math.min(view.state.selection.main.head, remoteCode.length);
    view.dispatch({
      changes: { from: 0, to: current.length, insert: remoteCode },
      selection: { anchor: cursorPos },
      annotations: REMOTE,
    });
  }, [TYPING_GRACE_MS]);

  // Keep submittedRef in sync so the interval closure doesn't go stale
  useEffect(() => { submittedRef.current = submitted; }, [submitted]);

  // Periodic sync every 500ms — only fires when code actually changed since last push
  useEffect(() => {
    const id = setInterval(() => {
      if (submittedRef.current) return;
      const team = myTeamRef.current;
      const value = lastWrittenCodeRef.current;
      if (team && value !== lastSyncedCodeRef.current) {
        lastSyncedCodeRef.current = value;
        updateTeamCode(lobbyId, team, value);
      }
    }, 500);
    return () => clearInterval(id);
  }, [lobbyId]);

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
      setTeamMembers(Object.keys(teamData.members || {}));

      // Only apply if it came from a teammate, not our own write echoing back
      if (teamData.code !== lastWrittenCodeRef.current) {
        applyRemoteCode(teamData.code || '');
      }
    });
    return () => unsub();
  }, [lobbyId, applyRemoteCode]);

  // Navigate to result screen when game finishes
  useEffect(() => {
    const unsub = onValue(ref(database, `lobbies/${lobbyId}/status`), (snap) => {
      if (snap.exists() && snap.val() === 'finished') onGameEnd();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId]);

  const handleCodeChange = useCallback((value, viewUpdate) => {
    if (submitted) return;
    // If every transaction in this update is annotated as 'remote', it came from
    // applyRemoteCode — not a user keystroke. Skip it to prevent echo back to Firebase.
    const isRemote = viewUpdate?.transactions?.every(
      tr => tr.annotation(Transaction.userEvent) === 'remote'
    );
    if (isRemote) return;

    lastLocalTypeTimeRef.current = Date.now(); // record that the local player is actively typing
    lastWrittenCodeRef.current = value;
    setTestResults(null);
    setTestsPassed(false);
    setShowTests(false);

    clearTimeout(debounceTimer.current);

    const charsSinceSync = Math.abs(value.length - lastSyncedCodeRef.current.length);
    if (charsSinceSync >= 5) {
      lastSyncedCodeRef.current = value;
      const team = myTeamRef.current;
      if (team) updateTeamCode(lobbyId, team, value);
    } else {
      debounceTimer.current = setTimeout(() => {
        lastSyncedCodeRef.current = value;
        const team = myTeamRef.current;
        if (team) updateTeamCode(lobbyId, team, value);
      }, 300);
    }
  }, [lobbyId, submitted]);

  const handleRunTests = async () => {
    if (testLoading) return;
    setTestLoading(true);
    setShowTests(true);
    try {
      const { results, allPassed, noTests } = runTests(getEditorCode(), task);
      if (noTests) {
        setTestResults([]);
        setTestsPassed(true);
      } else {
        setTestResults(results);
        setTestsPassed(allPassed);
      }
    } catch (e) {
      setTestResults([{ label: 'Test error', pass: false, error: e.message }]);
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
          height="100%"
          theme={oneDark}
          extensions={[javascript({ jsx: false })]}
          onCreateEditor={(view) => { editorViewRef.current = view; }}
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
