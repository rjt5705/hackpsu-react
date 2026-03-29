import React, { useState, useEffect } from 'react';
import { ref, onValue } from 'firebase/database';
import { database } from '../firebase';

function BattleRoyaleScreen({ lobbyId, playerId, onGameEnd }) {
  const [players, setPlayers] = useState([]);

  // Get players from lobby
  useEffect(() => {
    const playersRef = ref(database, `lobbies/${lobbyId}/players`);
    const unsub = onValue(playersRef, (snap) => {
      if (snap.exists()) {
        const playersList = Object.values(snap.val());
        setPlayers(playersList);
      }
    });
    return () => unsub();
  }, [lobbyId]);

  return (
    <div className="battle-royale-screen">
      <div className="br-placeholder">
        <h1>Battle Royale Mode</h1>
        <p>PlaceHolder / Debug Screen</p>
        <p>Players in game: {players.length}</p>
      </div>
    </div>
  );
}

export default BattleRoyaleScreen;