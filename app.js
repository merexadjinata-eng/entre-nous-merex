
const $ = id => document.getElementById(id);

let currentUser = null;
let currentRoom = null;
let roomRef = null;
let roomListener = null;
let selectedMode = "duo";
let isHost = false;
let latestRoom = null;
let busy = false;

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3000);
}

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });
  $(screenId)?.classList.add("active");
}

function setBusy(value) {
  busy = value;
  ["createBtn", "joinBtn", "startBtn", "submitAnswer", "nextRound"].forEach(id => {
    const button = $(id);
    if (button) button.disabled = value;
  });
}

async function ensureAuth() {
  if (auth.currentUser) {
    currentUser = auth.currentUser;
    return currentUser;
  }

  const result = await auth.signInAnonymously();
  currentUser = result.user;
  return currentUser;
}

function getNickname() {
  const name = $("nickname")?.value.trim();
  if (!name) throw new Error("Entre un pseudonyme.");
  if (name.length > 18) throw new Error("Maximum 18 caractères pour le pseudonyme.");
  return name;
}

function randomCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

function getMaxPlayers(mode) {
  return mode === "duo" ? 2 : 12;
}

function stopRoomListener() {
  if (roomRef && roomListener) {
    roomRef.off("value", roomListener);
  }
  roomListener = null;
}

function enterRoom(code) {
  stopRoomListener();

  currentRoom = code;
  roomRef = db.ref("rooms/" + code);

  roomListener = snapshot => {
    if (!snapshot.exists()) {
      toast("Ce salon n'existe plus.");
      stopRoomListener();
      currentRoom = null;
      latestRoom = null;
      showScreen("homeScreen");
      return;
    }

    latestRoom = snapshot.val();
    isHost = latestRoom.meta?.host === currentUser.uid;

    const phase = latestRoom.meta?.phase;

    if (phase === "lobby") {
      showScreen("lobbyScreen");
      renderRoom();
    } else if (phase === "playing") {
      showScreen("gameScreen");
      renderGame();
    } else if (phase === "finished") {
      showScreen("resultsScreen");
      renderResults();
    }
  };

  roomRef.on("value", roomListener);
}

async function createRoom() {
  if (busy) return;

  setBusy(true);

  try {
    await ensureAuth();

    const name = getNickname();
    const maxPlayers = getMaxPlayers(selectedMode);
    let created = false;
    let code = "";
    let ref = null;

    for (let attempt = 0; attempt < 8; attempt++) {
      code = randomCode();
      ref = db.ref("rooms/" + code);

      const result = await ref.child("meta").transaction(current => {
        if (current === null) {
          return {
            host: currentUser.uid,
            mode: selectedMode,
            phase: "lobby",
            maxPlayers,
            createdAt: firebase.database.ServerValue.TIMESTAMP
          };
        }
        return;
      });

      if (result.committed) {
        created = true;
        break;
      }
    }

    if (!created) {
      throw new Error("Impossible de créer un salon. Réessaie.");
    }

    try {
      // La première place est réservée à l'hôte.
      const seatResult = await ref.child("seats/1").transaction(current => {
        return current === null ? currentUser.uid : current;
      });

      if (!seatResult.committed || seatResult.snapshot.val() !== currentUser.uid) {
        throw new Error("Impossible de réserver la place de l'hôte.");
      }

      await ref.child("players/" + currentUser.uid).set({
        uid: currentUser.uid,
        name,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      });

      await ref.child("state").set({
        category: "all",
        index: 0,
        deck: [],
        answers: {}
      });

      toast("Salon créé !");
      enterRoom(code);

    } catch (error) {
      await ref.remove();
      throw error;
    }

  } catch (error) {
    toast(error.message || "Une erreur est survenue.");
  } finally {
    setBusy(false);
  }
}

async function joinRoom() {
  if (busy) return;

  setBusy(true);

  let claimedSeatRef = null;
  let seatWasAlreadyOwned = false;

  try {
    await ensureAuth();

    const name = getNickname();
    const code = $("joinCode")?.value.trim().toUpperCase();

    if (!code || code.length !== 6) {
      throw new Error("Entre un code de salon valide.");
    }

    const ref = db.ref("rooms/" + code);
    const metaSnapshot = await ref.child("meta").once("value");

    if (!metaSnapshot.exists()) {
      throw new Error("Salon introuvable.");
    }

    const meta = metaSnapshot.val();

    if (meta.phase !== "lobby") {
      throw new Error("Cette partie a déjà commencé ou est terminée.");
    }

    const playerRef = ref.child("players/" + currentUser.uid);
    const existingPlayer = await playerRef.once("value");

    // Un joueur déjà inscrit peut revenir dans son salon.
    if (existingPlayer.exists()) {
      await playerRef.update({ name });
      toast("Reconnexion au salon...");
      enterRoom(code);
      return;
    }

    const maxPlayers = Number(meta.maxPlayers);

    if (![2, 12].includes(maxPlayers)) {
      throw new Error("Configuration du salon invalide.");
    }

    let reserved = false;

    // Chaque place est réservée individuellement par transaction.
    // Deux joueurs ne peuvent donc pas obtenir la même place.
    for (let seat = 2; seat <= maxPlayers; seat++) {
      const seatRef = ref.child("seats/" + seat);
      const before = await seatRef.once("value");

      if (before.exists() && before.val() !== currentUser.uid) {
        continue;
      }

      const result = await seatRef.transaction(current => {
        if (current === null || current === currentUser.uid) {
          return currentUser.uid;
        }
        return;
      });

      if (result.committed && result.snapshot.val() === currentUser.uid) {
        claimedSeatRef = seatRef;
        seatWasAlreadyOwned = before.val() === currentUser.uid;
        reserved = true;
        break;
      }
    }

    if (!reserved) {
      throw new Error("Ce salon est complet.");
    }

    await playerRef.set({
      uid: currentUser.uid,
      name,
      joinedAt: firebase.database.ServerValue.TIMESTAMP
    });

    toast("Tu as rejoint le salon !");
    enterRoom(code);

  } catch (error) {
    if (claimedSeatRef && !seatWasAlreadyOwned) {
      await claimedSeatRef.remove().catch(() => {});
    }
    toast(error.message || "Impossible de rejoindre le salon.");
  } finally {
    setBusy(false);
  }
}

function renderRoom() {
  if (!latestRoom) return;

  const meta = latestRoom.meta || {};
  const players = latestRoom.players || {};

  $("roomCode").textContent = currentRoom;
  $("roomModeLabel").textContent =
    meta.mode === "duo" ? "Duo" : "Groupe";

  const playerList = Object.values(players);
  $("playerCount").textContent =
    playerList.length + " / " + meta.maxPlayers;

  $("playersList").innerHTML = "";

  playerList.forEach(player => {
    const item = document.createElement("div");
    item.className = "player-item";
    item.textContent =
      player.name + (player.uid === meta.host ? " 👑" : "");
    $("playersList").appendChild(item);
  });

  const startButton = $("startBtn");
  const startHint = $("startHint");

  if (startButton) {
    startButton.style.display = isHost ? "block" : "none";
    startButton.disabled = !isHost || playerList.length < 2;
  }

  if (startHint) {
    startHint.textContent = isHost
      ? (playerList.length < 2
          ? "En attente d'un autre joueur..."
          : "Tous les joueurs sont prêts ? Lance la partie !")
      : "En attente du lancement par l'hôte...";
  }
}

async function copyCode() {
  if (!currentRoom) return;

  try {
    await navigator.clipboard.writeText(currentRoom);
    toast("Code copié !");
  } catch {
    toast("Code du salon : " + currentRoom);
  }
}

async function startGame() {
  if (busy || !isHost || !roomRef || !latestRoom) return;

  setBusy(true);

  try {
    const players = Object.values(latestRoom.players || {});

    if (players.length < 2) {
      throw new Error("Il faut au moins deux joueurs.");
    }

    const category = $("gameCategory")?.value || "all";
    const deck = makeDeck(category);

    if (!deck || deck.length === 0) {
      throw new Error("Aucun défi disponible dans cette catégorie.");
    }

    await roomRef.child("state").set({
      category,
      index: 0,
      deck,
      answers: {}
    });

    await roomRef.child("meta/phase").set("playing");

    toast("La partie commence !");
  } catch (error) {
    toast(error.message || "Impossible de lancer la partie.");
  } finally {
    setBusy(false);
  }
}

function renderGame() {
  if (!latestRoom) return;

  const state = latestRoom.state || {};
  const deck = state.deck || [];
  const index = Number(state.index || 0);
  const players = latestRoom.players || {};

  if (!deck.length || index >= deck.length) return;

  const challenge = deck[index];
  const answers = state.answers?.[index] || {};

  $("roundLabel").textContent =
    "Manche " + (index + 1) + " / " + deck.length;

  $("progressBar").style.width =
    ((index + 1) / deck.length * 100) + "%";

  $("categoryLabel").textContent =
    challenge.category || state.category || "Défi";

  $("playersInGame").textContent =
    Object.keys(players).length + " joueurs";

  $("challengeSymbol").textContent = challenge.symbol || "🎯";
  $("challengeTitle").textContent = challenge.title || "Défi";
  $("challengePrompt").textContent = challenge.prompt || challenge.text || "";
  $("challengeExtra").textContent = challenge.extra || "";

  const answerInput = $("answerInput");
  const submitButton = $("submitAnswer");
  const answerStatus = $("answerStatus");

  const alreadyAnswered = Boolean(answers[currentUser.uid]);

  if (answerInput) {
    answerInput.disabled = alreadyAnswered;
    if (alreadyAnswered) answerInput.value = "";
  }

  if (submitButton) {
    submitButton.disabled = alreadyAnswered;
  }

  if (answerStatus) {
    answerStatus.textContent = alreadyAnswered
      ? "Ta réponse a été enregistrée."
      : "Écris ta réponse pour continuer.";
  }

  const answersList = $("answersList");
  answersList.innerHTML = "";

  Object.entries(answers).forEach(([uid, answer]) => {
    const player = players[uid];
    if (!player) return;

    const item = document.createElement("div");
    item.className = "answer-item";

    const name = document.createElement("strong");
    name.textContent = player.name + " : ";

    const content = document.createElement("span");
    content.textContent = answer;

    item.append(name, content);
    answersList.appendChild(item);
  });

  const allAnswered =
    Object.keys(players).length > 0 &&
    Object.keys(players).every(uid => answers[uid]);

  const nextButton = $("nextRound");

  if (nextButton) {
    nextButton.style.display = isHost && allAnswered ? "block" : "none";
    nextButton.disabled = !isHost || !allAnswered;
  }
}

async function submitAnswer() {
  if (busy || !roomRef || !latestRoom) return;

  const answer = $("answerInput")?.value.trim();

  if (!answer) {
    toast("Écris d'abord ta réponse.");
    return;
  }

  if (answer.length > 240) {
    toast("Ta réponse ne doit pas dépasser 240 caractères.");
    return;
  }

  setBusy(true);

  try {
    const state = latestRoom.state || {};
    const index = Number(state.index || 0);

    const answerRef = roomRef.child(
      "state/answers/" + index + "/" + currentUser.uid
    );

    const result = await answerRef.transaction(current => {
      if (current === null) return answer;
      return;
    });

    if (!result.committed) {
      throw new Error("Tu as déjà répondu à cette manche.");
    }

    $("answerInput").value = "";
    toast("Réponse envoyée !");
  } catch (error) {
    toast(error.message || "Impossible d'envoyer ta réponse.");
  } finally {
    setBusy(false);
  }
}

async function nextRound() {
  if (busy || !isHost || !roomRef || !latestRoom) return;

  setBusy(true);

  try {
    const state = latestRoom.state || {};
    const deck = state.deck || [];
    const index = Number(state.index || 0);
    const players = latestRoom.players || {};
    const answers = state.answers?.[index] || {};

    const allAnswered =
      Object.keys(players).length > 0 &&
      Object.keys(players).every(uid => answers[uid]);

    if (!allAnswered) {
      throw new Error("Tous les joueurs doivent répondre avant de continuer.");
    }

    if (index + 1 >= deck.length) {
      await roomRef.child("meta/phase").set("finished");
      return;
    }

    await roomRef.child("state/index").set(index + 1);
    toast("Manche suivante !");
  } catch (error) {
    toast(error.message || "Impossible de passer à la manche suivante.");
  } finally {
    setBusy(false);
  }
}

function renderResults() {
  if (!latestRoom) return;

  const players = latestRoom.players || {};
  const state = latestRoom.state || {};
  const deck = state.deck || [];

  $("finalSummary").innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "La partie est terminée !";
  $("finalSummary").appendChild(title);

  const count = document.createElement("p");
  count.textContent =
    Object.keys(players).length + " joueurs ont participé à " +
    deck.length + " manches.";
  $("finalSummary").appendChild(count);
}

async function leaveRoom() {
  if (!currentRoom || !currentUser || !roomRef) {
    stopRoomListener();
    currentRoom = null;
    latestRoom = null;
    showScreen("homeScreen");
    return;
  }

  if (busy) return;
  setBusy(true);

  try {
    const snapshot = await roomRef.once("value");

    if (!snapshot.exists()) {
      throw new Error("Le salon n'existe plus.");
    }

    const room = snapshot.val();
    const players = room.players || {};
    const seats = room.seats || {};
    const meta = room.meta || {};

    const remainingPlayers = Object.values(players)
      .filter(player => player.uid !== currentUser.uid);

    const mySeat = Object.entries(seats)
      .find(([, uid]) => uid === currentUser.uid)?.[0];

    if (meta.host === currentUser.uid) {
      if (remainingPlayers.length > 0) {
        // Le nouvel hôte doit être choisi parmi les joueurs présents.
        const nextHost = remainingPlayers[0].uid;
        await roomRef.child("meta/host").set(nextHost);
      } else {
        // Le dernier joueur quitte : le salon est supprimé.
        await roomRef.remove();
        toast("Salon fermé.");
        return;
      }
    }

    await roomRef.child("players/" + currentUser.uid).remove();

    if (mySeat) {
      await roomRef.child("seats/" + mySeat).remove();
    }

    toast("Tu as quitté le salon.");

  } catch (error) {
    toast(error.message || "Erreur lors du départ.");
  } finally {
    stopRoomListener();
    currentRoom = null;
    latestRoom = null;
    roomRef = null;
    isHost = false;
    setBusy(false);
    showScreen("homeScreen");
  }
}

// Choix du mode de jeu.
$("chooseDuo")?.addEventListener("click", () => {
  selectedMode = "duo";
  $("chooseDuo").classList.add("selected");
  $("chooseGroup")?.classList.remove("selected");
  showScreen("setupScreen");
});

$("chooseGroup")?.addEventListener("click", () => {
  selectedMode = "group";
  $("chooseGroup").classList.add("selected");
  $("chooseDuo")?.classList.remove("selected");
  showScreen("setupScreen");
});

// Actions principales.
$("createBtn")?.addEventListener("click", createRoom);
$("joinBtn")?.addEventListener("click", joinRoom);
$("copyCode")?.addEventListener("click", copyCode);
$("startBtn")?.addEventListener("click", startGame);
$("submitAnswer")?.addEventListener("click", submitAnswer);
$("nextRound")?.addEventListener("click", nextRound);

$("lobbyBack")?.addEventListener("click", leaveRoom);
$("leaveGame")?.addEventListener("click", leaveRoom);
$("backHome")?.addEventListener("click", leaveRoom);

// Connexion Firebase.
auth.onAuthStateChanged(user => {
  currentUser = user;
  const connection = $("connection");

  if (connection) {
    connection.textContent = user
      ? "Connecté"
      : "Connexion en cours...";
  }
});
  
