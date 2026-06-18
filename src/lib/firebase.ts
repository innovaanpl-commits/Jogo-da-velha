import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, signInAnonymously, updateProfile, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

// Direct config from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyDtvDkQA0fmBwCMV4_ayD1pd4M4YSOK6E4",
  authDomain: "poised-theory-x9nlt.firebaseapp.com",
  projectId: "poised-theory-x9nlt",
  storageBucket: "poised-theory-x9nlt.firebasestorage.app",
  messagingSenderId: "366697160297",
  appId: "1:366697160297:web:a205b0a36c825229448cf8",
  firestoreDatabaseId: "ai-studio-4200013d-428f-436f-bf66-c911b55f9987"
};

const app = initializeApp(firebaseConfig);

// Initialize Firestore with custom database ID from config
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

export const auth = getAuth(app);

export { signInAnonymously, updateProfile, GoogleAuthProvider, signInWithPopup };
