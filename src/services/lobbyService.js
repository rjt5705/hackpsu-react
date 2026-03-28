import { database } from '../firebase';
import { ref, set, get, onValue, remove, onDisconnect, update } from 'firebase/database';

// Helper function to generate a random 6-digit room code
export const generateLobbyId = () => {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

// Helper function to generate a unique player ID
export const generatePlayerId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

// Create a new lobby/room
export const createLobby = async (nickname) => {
  const lobbyId = generateLobbyId();
  const playerId = generatePlayerId();
  
  const lobbyRef = ref(database, `lobbies/${lobbyId}`);
  const playerRef = ref(database, `lobbies/${lobbyId}/players/${playerId}`);
  
  const lobbyData = {
    id: lobbyId,
    createdAt: Date.now(),
    status: 'waiting',
    hostId: playerId,
    players: {
      [playerId]: {
        id: playerId,
        nickname: nickname.trim(),
        joinedAt: Date.now(),
        isReady: false
      }
    }
  };
  
  await set(lobbyRef, lobbyData);
  
  // Auto-remove player if they disconnect
  onDisconnect(playerRef).remove();
  
  // If lobby becomes empty, remove it
  const lobbyPlayersRef = ref(database, `lobbies/${lobbyId}/players`);
  onDisconnect(lobbyRef).update({ 
    status: 'empty' 
  });
  
  return { lobbyId, playerId };
};

// Join an existing lobby
export const joinLobby = async (lobbyId, nickname) => {
  const lobbyRef = ref(database, `lobbies/${lobbyId}`);
  const snapshot = await get(lobbyRef);
  
  if (!snapshot.exists()) {
    throw new Error('Room not found');
  }
  
  const lobbyData = snapshot.val();
  
  if (lobbyData.status === 'playing') {
    throw new Error('Game already in progress');
  }
  
  if (lobbyData.status === 'empty') {
    throw new Error('Room no longer exists');
  }
  
  const playerCount = lobbyData.players ? Object.keys(lobbyData.players).length : 0;
  if (playerCount >= 99) {
    throw new Error('Room is full (max 99 players)');
  }
  
  const playerId = generatePlayerId();
  const playerRef = ref(database, `lobbies/${lobbyId}/players/${playerId}`);
  
  await set(playerRef, {
    id: playerId,
    nickname: nickname.trim(),
    joinedAt: Date.now(),
    isReady: false
  });
  
  // Auto-remove player if they disconnect
  onDisconnect(playerRef).remove();
  
  return { playerId };
};

// Get lobby data
export const getLobby = async (lobbyId) => {
  const lobbyRef = ref(database, `lobbies/${lobbyId}`);
  const snapshot = await get(lobbyRef);
  
  if (snapshot.exists()) {
    return snapshot.val();
  }
  return null;
};

// Subscribe to lobby updates (real-time)
export const subscribeToLobby = (lobbyId, callback) => {
  const lobbyRef = ref(database, `lobbies/${lobbyId}`);
  return onValue(lobbyRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    } else {
      callback(null);
    }
  });
};

// Subscribe to players list updates (real-time)
export const subscribeToPlayers = (lobbyId, callback) => {
  const playersRef = ref(database, `lobbies/${lobbyId}/players`);
  return onValue(playersRef, (snapshot) => {
    if (snapshot.exists()) {
      const players = Object.values(snapshot.val());
      callback(players);
    } else {
      callback([]);
    }
  });
};

// Update player ready status
export const setPlayerReady = async (lobbyId, playerId, isReady) => {
  const playerRef = ref(database, `lobbies/${lobbyId}/players/${playerId}/isReady`);
  await set(playerRef, isReady);
};

// Check if all players are ready
export const checkAllPlayersReady = async (lobbyId) => {
  const playersRef = ref(database, `lobbies/${lobbyId}/players`);
  const snapshot = await get(playersRef);
  
  if (!snapshot.exists()) return false;
  
  const players = Object.values(snapshot.val());
  return players.length > 0 && players.every(player => player.isReady === true);
};

// Start the game (host only)
export const startGame = async (lobbyId) => {
  const gameRef = ref(database, `lobbies/${lobbyId}/status`);
  await set(gameRef, 'playing');
};

// Send game state to all players in lobby
export const broadcastGameState = async (lobbyId, gameState) => {
  const gameStateRef = ref(database, `lobbies/${lobbyId}/gameState`);
  await set(gameStateRef, {
    ...gameState,
    timestamp: Date.now()
  });
};

// Subscribe to game state updates
export const subscribeToGameState = (lobbyId, callback) => {
  const gameStateRef = ref(database, `lobbies/${lobbyId}/gameState`);
  return onValue(gameStateRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    } else {
      callback(null);
    }
  });
};

// Leave lobby
export const leaveLobby = async (lobbyId, playerId) => {
  const playerRef = ref(database, `lobbies/${lobbyId}/players/${playerId}`);
  await remove(playerRef);
  
  // Check if lobby is empty after player leaves
  const playersRef = ref(database, `lobbies/${lobbyId}/players`);
  const snapshot = await get(playersRef);
  
  if (!snapshot.exists() || Object.keys(snapshot.val() || {}).length === 0) {
    // If no players left, delete the lobby
    const lobbyRef = ref(database, `lobbies/${lobbyId}`);
    await remove(lobbyRef);
  }
};

// Kick player from lobby (host only)
export const kickPlayer = async (lobbyId, playerId) => {
  const playerRef = ref(database, `lobbies/${lobbyId}/players/${playerId}`);
  await remove(playerRef);
};

// Get player count in lobby
export const getPlayerCount = async (lobbyId) => {
  const playersRef = ref(database, `lobbies/${lobbyId}/players`);
  const snapshot = await get(playersRef);
  
  if (!snapshot.exists()) return 0;
  return Object.keys(snapshot.val()).length;
};