/*
  ENTRE NOUS — Firebase
  Remplace les valeurs ci-dessous par celles de TON projet Firebase.
  Ne partage jamais de mot de passe ou de clé privée.
*/
const firebaseConfig = {
  apiKey: "REMPLACE_PAR_TON_API_KEY",
  authDomain: "REMPLACE_PAR_TON_PROJET.firebaseapp.com",
  databaseURL: "https://REMPLACE_PAR_TON_PROJET-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "REMPLACE_PAR_TON_PROJET",
  storageBucket: "REMPLACE_PAR_TON_PROJET.firebasestorage.app",
  messagingSenderId: "REMPLACE_PAR_TON_SENDER_ID",
  appId: "REMPLACE_PAR_TON_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
