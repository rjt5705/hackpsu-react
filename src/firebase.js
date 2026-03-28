// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import firebaseConfig from './firebase-config.json';

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database };