import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue, runTransaction, set } from 'firebase/database';
import { database } from '../firebase';
import { submitTeam } from '../services/gameService';
import { TASK_TESTS, runTests } from '../taskTests';
import CodeMirror from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { collab, receiveUpdates, sendableUpdates, getSyncedVersion } from '@codemirror/collab';
import { ChangeSet, Text } from '@codemirror/state';

// Replay all stored steps onto an empty document to get current state + version.
// Skips the synthetic _init placeholder written by startTeamGame.
function buildDocFromSteps(steps) {
  let doc = Text.of(['']);
  const stepKeys = Object.keys(steps || {})
    .filter(k => k !== '_init')
    .map(Number)
    .sort((a, b) => a - b);
  for (const key of stepKeys) {
    const stepData = steps[key];
    try {
      const cs = ChangeSet.fromJSON(JSON.parse(stepData.changes));
      doc = cs.apply(doc);
    } catch (e) {
      console.error('OT: failed to apply step', key, e);
    }
  }
  return { doc: doc.toString(), version: stepKeys.length };
}

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

  // null = waiting for initial collab snapshot; { doc, version } = ready to mount editor
  const [collabInit, setCollabInit]   = useState(null);

  const editorViewRef          = useRef(null);
  const myTeamRef              = useRef(null);
  const submittedRef           = useRef(false);
  const isPushingRef           = useRef(false);
  const pushTimerRef           = useRef(null);
  const collabInitializedRef   = useRef(false); // true after first collab snapshot
  const latestCollabDataRef    = useRef(null);  // latest snapshot if editor wasn't mounted yet

  const getEditorCode = () => editorViewRef.current?.state.doc.toString() ?? '';

  useEffect(() => { submittedRef.current = submitted; }, [submitted]);

  // Push any locally pending collab steps to Firebase atomically.
  // Uses runTransaction so two clients can't commit the same version slot.
  const pushSteps = useCallback(async () => {
    if (isPushingRef.current) return;
    const view = editorViewRef.current;
    if (!view) return;
    const team = myTeamRef.current;
    if (!team || submittedRef.current) return;

    const updates = sendableUpdates(view.state);
    if (!updates.length) return;

    const localVersion = getSyncedVersion(view.state);

    isPushingRef.current = true;
    try {
      const collabRef = ref(database, `lobbies/${lobbyId}/game/teams/${team}/collab`);
      let committed = false;

      await runTransaction(collabRef, (current) => {
        if (!current) return undefined; // collab node missing — abort
        if (current.version !== localVersion) return undefined; // version mismatch — abort, wait for remote

        const newSteps = { ...(current.steps || {}) };
        updates.forEach((update, i) => {
          newSteps[current.version + i] = {
            changes: JSON.stringify(update.changes.toJSON()),
            clientID: update.clientID,
          };
        });
        committed = true;
        return {
          version: current.version + updates.length,
          steps: newSteps,
        };
      });

      if (committed) {
        // Keep the code snapshot up to date so TeamVsTeamResult can show it
        await set(
          ref(database, `lobbies/${lobbyId}/game/teams/${team}/code`),
          view.state.doc.toString()
        );
      }
    } catch (e) {
      console.error('OT push error', e);
    } finally {
      isPushingRef.current = false;
    }
  }, [lobbyId]);

  // Apply a new batch of collab steps to the mounted editor view.
  const applyCollabSnapshot = useCallback((data) => {
    const view = editorViewRef.current;
    if (!view) return;

    const localVersion = getSyncedVersion(view.state);
    const newStepKeys = Object.keys(data.steps || {})
      .filter(k => k !== '_init')
      .map(Number)
      .filter(k => k >= localVersion)
      .sort((a, b) => a - b);

    if (newStepKeys.length === 0) return;

    const updates = newStepKeys.map(k => ({
      changes: ChangeSet.fromJSON(JSON.parse(data.steps[k].changes)),
      clientID: data.steps[k].clientID,
    }));

    view.dispatch(receiveUpdates(view.state, updates));
    // After receiving remote steps, retry any rebased local pending steps
    pushSteps();
  }, [pushSteps]);

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

  // Subscribe to game data (task, winner, team metadata — NOT code, that's in collab now)
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
    });
    return () => unsub();
  }, [lobbyId]);

  // Subscribe to collab steps — handles both initial load and live updates
  useEffect(() => {
    if (!myTeam) return;
    const collabRef = ref(database, `lobbies/${lobbyId}/game/teams/${myTeam}/collab`);
    const unsub = onValue(collabRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();

      if (!collabInitializedRef.current) {
        // First snapshot — compute the initial doc+version to mount the editor with
        const init = buildDocFromSteps(data.steps);
        collabInitializedRef.current = true;
        setCollabInit(init);
        // If any steps arrive before the editor mounts, cache them here
        latestCollabDataRef.current = data;
        return;
      }

      // Subsequent snapshots — apply new steps to the mounted editor
      latestCollabDataRef.current = data;
      applyCollabSnapshot(data);
    });
    return () => unsub();
  }, [lobbyId, myTeam, applyCollabSnapshot]);

  // Navigate to result screen when game finishes
  useEffect(() => {
    const unsub = onValue(ref(database, `lobbies/${lobbyId}/status`), (snap) => {
      if (snap.exists() && snap.val() === 'finished') onGameEnd();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobbyId]);

  const handleCodeChange = useCallback(() => {
    if (submittedRef.current) return;
    setTestResults(null);
    setTestsPassed(false);
    setShowTests(false);
    // Debounce push so rapid keystrokes batch into fewer Firebase writes
    clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(() => pushSteps(), 200);
  }, [pushSteps]);

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

  if (!myTeam || !collabInit) {
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
          value={collabInit.doc}
          height="100%"
          theme={oneDark}
          extensions={[
            collab({ startVersion: collabInit.version, clientID: playerId }),
            javascript({ jsx: false }),
          ]}
          onCreateEditor={(view) => {
            editorViewRef.current = view;
            // Apply any collab updates that arrived before the editor mounted
            if (latestCollabDataRef.current) {
              applyCollabSnapshot(latestCollabDataRef.current);
            }
          }}
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
