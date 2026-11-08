/*
  ENTRE NOUS — Firebase
  Configuration du projet officiel.
*/

const firebaseConfig = {
  apiKey: "AIzaSyBiK2H2CnHlOFFl1SFfauamSUwahGvS3AY",
  authDomain: "entre-nous-merex.firebaseapp.com",
  databaseURL: "https://entre-nous-merex-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "entre-nous-merex",
  storageBucket: "entre-nous-merex.firebasestorage.app",
  messagingSenderId: "403764032249",
  appId: "1:403764032249:web:d13880680aeef0f5172828"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.database();
