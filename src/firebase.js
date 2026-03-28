// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from './firebase-config.json'; 

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const firestore = getFirestore(app);

export { database, firestore };