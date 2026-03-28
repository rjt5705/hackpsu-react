import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';

const toArray = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  return Object.values(val);
};

function RevealScreen({ lobbyId, playerId, onPlayAgain }) {
  const [chains, setChains] = useState([]);
  const [, setPlayerOrder] = useState([]);
  const [playerMap, setPlayerMap] = useState({});
  const [viewing, setViewing] = useState(0);

  useEffect(() => {
    const gameRef = ref(database, `lobbies/${lobbyId}/game`);
    const unsubGame = onValue(gameRef, (snap) => {
      if (!snap.exists()) return;
      const data = snap.val();
      setPlayerOrder(toArray(data.playerOrder));
      const chainsArr = toArray(data.chains);
      setChains(chainsArr);
    });

    const playersRef = ref(database, `lobbies/${lobbyId}/players`);
    const unsubPlayers = onValue(playersRef, (snap) => {
      if (!snap.exists()) return;
      const map = {};
      Object.values(snap.val()).forEach((p) => { map[p.id] = p.nickname; });
      setPlayerMap(map);
    });

    return () => { unsubGame(); unsubPlayers(); };
  }, [lobbyId]);

  if (!chains.length) {
    return (
      <div className="screen-center">
        <div className="card"><p>Loading results...</p></div>
      </div>
    );
  }

  const chain = chains[viewing];
  const steps = toArray(chain?.steps);

  const getNickname = (id) => playerMap[id] || 'Unknown';

  return (
    <div className="reveal-screen">
      <div className="reveal-header">
        <h1 className="game-title">Results</h1>
        <div className="chain-nav">
          {chains.map((_, i) => (
            <button
              key={i}
              className={`chain-dot ${i === viewing ? 'active' : ''}`}
              onClick={() => setViewing(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="reveal-chain">
        <h2 className="chain-title">Chain {viewing + 1}</h2>
        <div className="steps-list">
          {steps.map((step, i) => (
            <div key={i} className={`step-card step-${step.type}`}>
              <div className="step-meta">
                <span className={`step-badge badge-${step.type}`}>
                  {step.type === 'task' && 'Original Task'}
                  {step.type === 'code' && `💻 ${step.language || 'Code'}`}
                  {step.type === 'guess' && '💬 Guess'}
                </span>
                {step.authorId && (
                  <span className="step-author">by {getNickname(step.authorId)}</span>
                )}
              </div>
              {step.type === 'code' ? (
                <pre className="reveal-code">{step.content}</pre>
              ) : (
                <p className="reveal-text">{step.content}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="reveal-actions">
        {viewing > 0 && (
          <button className="btn btn-outline" onClick={() => setViewing((v) => v - 1)}>
            ← Previous Chain
          </button>
        )}
        {viewing < chains.length - 1 && (
          <button className="btn btn-blue" onClick={() => setViewing((v) => v + 1)}>
            Next Chain →
          </button>
        )}
        <button className="btn btn-green" onClick={onPlayAgain}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

export default RevealScreen;
