import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBUXPOSUrNrYhFC1Wf3g-9lfJdh1DfvINE",
  authDomain: "web-copilot-c0a4a.firebaseapp.com",
  projectId: "web-copilot-c0a4a",
  storageBucket: "web-copilot-c0a4a.appspot.com", // Adjusted common typo: .appspot.com
  messagingSenderId: "138113051959",
  appId: "1:138113051959:web:7d68b497624205e3fe3eb2",
  // measurementId is optional, can be added if needed
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Cloud Firestore and get a reference to the service
const db = getFirestore(app);

export { db };
