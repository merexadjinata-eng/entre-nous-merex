
const $ = id => document.getElementById(id);

let currentUser = null;
let currentRoom = null;
let roomRef = null;
let roomListener = null;
let selectedMode = "duo";
let isHost = false;
let latestRoom = null;
let busy = false;

const MAX_CODE_LENGTH = 6;
const MAX_ANSWER_LENGTH = 240;

const CATEGORY_LABELS = {
  style: "DÉFIS DE STYLE",
  fun: "DÉLIRES & IMAGINATION",
  discover: "MIEUX SE DÉCOUVRIR",
  challenge: "DÉFIS À RÉALISER",
  mix: "SURPRISE",
  all: "SURPRISE"
};

function toast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.classList.remove("show");
  }, 3000);
}

function showScreen(screenId) {
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  $(screenId)?.classList.add("active");
}

function setBusy(value) {
  busy = value;

  ["createBtn", "joinBtn", "startBtn",
   "submitAnswer", "nextRound"].forEach(id => {
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
  let name = $("nickname")?.value.trim();

  // Les joueurs invités peuvent choisir leur pseudonyme
  // directement lorsqu'ils rejoignent une partie.
  if (!name) {
    name = window.prompt("Choisis ton pseudonyme :");

    if (name === null) {
      throw new Error("Connexion annulée.");
    }

    name = name.trim();

    if ($("nickname")) {
      $("nickname").value = name;
    }
  }

  if (!name) {
    throw new Error("Entre un pseudonyme.");
  }

  if (name.length > 18) {
    throw new Error("Maximum 18 caractères pour le pseudonyme.");
  }

  return name;
}

function randomCode(length = MAX_CODE_LENGTH) {
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

function resetRoom() {
  stopRoomListener();

  currentRoom = null;
  roomRef = null;
  latestRoom = null;
  isHost = false;
}

function enterRoom(code) {
  stopRoomListener();

  currentRoom = code;
  roomRef = db.ref("rooms/" + code);

  roomListener = snapshot => {
    if (!snapshot.exists()) {
      toast("Ce salon n'existe plus.");
      resetRoom();
      showScreen("homeScreen");
      return;
    }

    latestRoom = snapshot.val();
    isHost = latestRoom.meta?.host === currentUser?.uid;

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

  roomRef.on("value", roomListener, error => {
    toast("Erreur de synchronisation : " + error.message);
  });
}

// --------------------------------------------------
// CRÉATION D'UNE PARTIE
// --------------------------------------------------

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
      const seatResult = await ref.child("seats/1").transaction(current => {
        return current === null ? currentUser.uid : current;
      });

      if (!seatResult.committed ||
          seatResult.snapshot.val() !== currentUser.uid) {
        throw new Error("Impossible de réserver la place de l'hôte.");
      }

      await ref.child("players/" + currentUser.uid).set({
        uid: currentUser.uid,
        name,
        joinedAt: firebase.database.ServerValue.TIMESTAMP
      });

      await ref.child("state").set({
        category: "mix",
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

// --------------------------------------------------
// REJOINDRE UNE PARTIE
// --------------------------------------------------

async function joinRoom() {
  if (busy) return;

  setBusy(true);

  let claimedSeatRef = null;
  let seatWasAlreadyOwned = false;

  try {
    await ensureAuth();

    const name = getNickname();
    const code = $("joinCode")?.value.trim().toUpperCase();

    if (!code || code.length !== MAX_CODE_LENGTH) {
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

    const maxPlayers = Number(meta.maxPlayers);

    if (![2, 12].includes(maxPlayers)) {
      throw new Error("Configuration du salon invalide.");
    }

    const playerRef = ref.child("players/" + currentUser.uid);
    const existingPlayer = await playerRef.once("value");

    if (existingPlayer.exists()) {
      await playerRef.update({ name });
      toast("Reconnexion au salon...");
      enterRoom(code);
      return;
    }

    let reserved = false;

    // On vérifie toutes les places disponibles.
    // Cela permet aussi de réutiliser la place 1
    // si l'ancien hôte a quitté le salon.

    for (let seat = 1; seat <= maxPlayers; seat++) {
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

      if (result.committed &&
          result.snapshot.val() === currentUser.uid) {

        claimedSeatRef = seatRef;
        seatWasAlreadyOwned = before.val() === currentUser.uid;
        reserved = true;
        break;
      }
    }

    if (!reserved) {
      throw new Error("Ce salon est complet.");
    }

    // Nouvelle vérification avant l'inscription.
    const latestMeta = await ref.child("meta").once("value");
    const latestPlayers = await ref.child("players").once("value");

    if (!latestMeta.exists() ||
        latestMeta.val().phase !== "lobby") {
      throw new Error("La partie vient de commencer.");
    }

    if (Object.keys(latestPlayers.val() || {}).length >= maxPlayers) {
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

// --------------------------------------------------
// AFFICHAGE DE LA SALLE D'ATTENTE
// --------------------------------------------------

function renderRoom() {
  if (!latestRoom) return;

  const meta = latestRoom.meta || {};
  const players = latestRoom.players || {};

  $("roomCode").textContent = currentRoom;

  $("roomModeLabel").textContent =
    meta.mode === "duo" ? "DUO" : "GROUPE";

  const playerList = Object.values(players);

  $("playerCount").textContent =
    playerList.length + " / " + meta.maxPlayers;

  const container = $("playersList");
  container.innerHTML = "";

  playerList.forEach(player => {
    const item = document.createElement("div");
    item.className = "player";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = (player.name || "?").charAt(0).toUpperCase();

    const info = document.createElement("div");

    const name = document.createElement("strong");
    name.textContent = player.name || "Joueur";

    const status = document.createElement("small");
    status.textContent =
      player.uid === meta.host ? "Hôte de la partie" : "Participant";

    info.append(name, status);
    item.append(avatar, info);

    if (player.uid === meta.host) {
      const host = document.createElement("span");
      host.className = "host-tag";
      host.textContent = "HÔTE 👑";
      item.appendChild(host);
    }

    container.appendChild(item);
  });

  const startButton = $("startBtn");
  const startHint = $("startHint");

  if (startButton) {
    startButton.style.display = isHost ? "block" : "none";
    startButton.disabled = !isHost || playerList.length < 2;
  }

  if (startHint) {
    startHint.textContent = isHost
      ? playerList.length < 2
        ? "En attente d'un autre joueur..."
        : "Tous les joueurs sont prêts ? Lance la partie !"
      : "En attente du lancement par l'hôte...";
  }
}

// --------------------------------------------------
// COPIE DU CODE
// --------------------------------------------------

async function copyCode() {
  if (!currentRoom) return;

  try {
    await navigator.clipboard.writeText(currentRoom);
    toast("Code copié !");
  } catch {
    toast("Code du salon : " + currentRoom);
  }
}

// --------------------------------------------------
// LANCEMENT DE LA PARTIE
// --------------------------------------------------

async function startGame() {
  if (busy || !isHost || !roomRef || !latestRoom) return;

  setBusy(true);

  try {
    const roomSnapshot = await roomRef.once("value");

    if (!roomSnapshot.exists()) {
      throw new Error("Le salon n'existe plus.");
    }

    const room = roomSnapshot.val();

    if (room.meta?.host !== currentUser.uid ||
        room.meta?.phase !== "lobby") {
      throw new Error("Tu ne peux plus lancer cette partie.");
    }

    const players = Object.values(room.players || {});

    if (players.length < 2) {
      throw new Error("Il faut au moins deux joueurs.");
    }

    const category = $("gameCategory")?.value || "mix";
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

    // Le changement de phase est contrôlé par transaction.
    const phaseResult = await roomRef.child("meta/phase").transaction(current => {
      if (current === "lobby") {
        return "playing";
      }

      return;
    });

    if (!phaseResult.committed) {
      throw new Error("Cette partie a déjà été lancée.");
    }

    toast("La partie commence !");

  } catch (error) {
    toast(error.message || "Impossible de lancer la partie.");
  } finally {
    setBusy(false);
  }
}

// --------------------------------------------------
// AFFICHAGE DES DÉFIS
// --------------------------------------------------

function renderGame() {
  if (!latestRoom || !currentUser) return;

  const state = latestRoom.state || {};
  const deck = state.deck || [];
  const index = Number(state.index || 0);
  const players = latestRoom.players || {};

  if (!deck.length || index >= deck.length) return;

  const challenge = deck[index];
  const answers = state.answers?.[index] || {};

  $("roundLabel").textContent =
    "MANCHE " + (index + 1) + " / " + deck.length;

  $("progressBar").style.width =
    ((index + 1) / deck.length * 100) + "%";

  // Correspondance avec jeux.js :
  // cat, icon, title, prompt, extra.

  $("categoryLabel").textContent =
    CATEGORY_LABELS[challenge.cat] ||
    CATEGORY_LABELS[state.category] ||
    "DÉFI";

  $("playersInGame").textContent =
    Object.keys(players).length + " joueurs";

  $("challengeSymbol").textContent =
    challenge.icon || "🎯";

  $("challengeTitle").textContent =
    challenge.title || "Défi";

  $("challengePrompt").textContent =
    challenge.prompt || challenge.text || "";

  $("challengeExtra").textContent =
    challenge.extra || "";

  const answerInput = $("answerInput");
  const submitButton = $("submitAnswer");
  const answerStatus = $("answerStatus");

  const alreadyAnswered =
    Object.prototype.hasOwnProperty.call(answers, currentUser.uid);

  if (answerInput) {
    answerInput.disabled = alreadyAnswered;

    if (alreadyAnswered) {
      answerInput.value = "";
    }
  }

  if (submitButton) {
    submitButton.disabled = alreadyAnswered || busy;
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

    const content = document.createElement("p");
    content.textContent = answer;

    item.append(name, content);
    answersList.appendChild(item);
  });

  const playerIds = Object.keys(players);

  const allAnswered =
    playerIds.length > 0 &&
    playerIds.every(uid =>
      Object.prototype.hasOwnProperty.call(answers, uid)
    );

  const nextButton = $("nextRound");

  if (nextButton) {
    nextButton.style.display =
      isHost && allAnswered ? "block" : "none";

    nextButton.disabled =
      !isHost || !allAnswered || busy;
  }
}

// --------------------------------------------------
// ENVOI D'UNE RÉPONSE
// --------------------------------------------------

async function submitAnswer() {
  if (busy || !roomRef || !latestRoom || !currentUser) return;

  const answer = $("answerInput")?.value.trim();

  if (!answer) {
    toast("Écris d'abord ta réponse.");
    return;
  }

  if (answer.length > MAX_ANSWER_LENGTH) {
    toast("Ta réponse ne doit pas dépasser 240 caractères.");
    return;
  }

  setBusy(true);

  try {
    const state = latestRoom.state || {};
    const index = Number(state.index || 0);

    if (latestRoom.meta?.phase !== "playing") {
      throw new Error("Cette partie n'est plus en cours.");
    }

    const answerRef = roomRef.child(
      "state/answers/" + index + "/" + currentUser.uid
    );

    const result = await answerRef.transaction(current => {
      if (current === null) {
        return answer;
      }

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

// --------------------------------------------------
// PASSAGE À LA MANCHE SUIVANTE
// --------------------------------------------------

async function nextRound() {
  if (busy || !isHost || !roomRef || !latestRoom) return;

  setBusy(true);

  try {
    const result = await roomRef.child("state").transaction(state => {
      if (!state || !state.deck) return;

      const deck = state.deck;
      const index = Number(state.index || 0);
      const answers = state.answers?.[index] || {};

      // Vérification de la présence des joueurs.
      const players = latestRoom.players || {};
      const playerIds = Object.keys(players);

      const allAnswered =
        playerIds.length > 0 &&
        playerIds.every(uid =>
          Object.prototype.hasOwnProperty.call(answers, uid)
        );

      if (!allAnswered) return;

      if (index + 1 >= deck.length) {
        state.index = deck.length;
      } else {
        state.index = index + 1;
      }

      return state;
    });

    if (!result.committed) {
      throw new Error("Tous les joueurs doivent répondre avant de continuer.");
    }

    const state = result.snapshot.val();

    if (state.index >= state.deck.length) {
      await roomRef.child("meta/phase").transaction(current => {
        return current === "playing" ? "finished" : undefined;
      });

      toast("Partie terminée !");
      return;
    }

    toast("Manche suivante !");

  } catch (error) {
    toast(error.message || "Impossible de passer à la manche suivante.");
  } finally {
    setBusy(false);
  }
}

// --------------------------------------------------
// RÉSULTATS
// --------------------------------------------------

function renderResults() {
  if (!latestRoom) return;

  const players = latestRoom.players || {};
  const state = latestRoom.state || {};
  const deck = state.deck || [];

  const container = $("finalSummary");
  container.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = "La partie est terminée !";
  container.appendChild(title);

  const count = document.createElement("p");
  count.textContent =
    Object.keys(players).length +
    " joueurs ont participé à " +
    deck.length +
    " manches.";

  container.appendChild(count);

  deck.forEach((challenge, index) => {
    const answers = state.answers?.[index] || {};

    const item = document.createElement("div");
    item.className = "answer-item";

    const heading = document.createElement("strong");
    heading.textContent =
      (challenge.icon || "🎯") + " " + challenge.title;

    item.appendChild(heading);

    Object.entries(answers).forEach(([uid, answer]) => {
      const player = players[uid];
      if (!player) return;

      const response = document.createElement("p");
      response.textContent = player.name + " : " + answer;
      item.appendChild(response);
    });

    container.appendChild(item);
  });
}


// --------------------------------------------------
// QUITTER UNE PARTIE
// --------------------------------------------------

async function leaveRoom() {
  if (!currentRoom || !currentUser || !roomRef) {
    resetRoom();
    showScreen("homeScreen");
    return;
  }

  if (busy) return;

  setBusy(true);

  try {
    const snapshot = await roomRef.once("value");

    if (!snapshot.exists()) {
      resetRoom();
      showScreen("homeScreen");
      return;
    }

    const room = snapshot.val();
    const players = room.players || {};
    const seats = room.seats || {};
    const meta = room.meta || {};

    const remainingPlayers = Object.values(players)
      .filter(player => player.uid !== currentUser.uid);

    const mySeat = Object.entries(seats)
      .find(([, uid]) => uid === currentUser.uid)?.[0];

    // Si le joueur est le dernier, supprimer le salon.
    if (remainingPlayers.length === 0) {
      if (meta.host !== currentUser.uid) {
        throw new Error("Impossible de fermer ce salon.");
      }

      await roomRef.remove();

      toast("Salon fermé.");
    } else {
      // Transférer l'hébergement si l'hôte quitte.
      if (meta.host === currentUser.uid) {
        const nextHost = remainingPlayers[0].uid;

        await roomRef.child("meta/host").set(nextHost);
      }

      // Supprimer le joueur de la partie.
      await roomRef.child("players/" + currentUser.uid).remove();

      // Libérer sa place.
      if (mySeat) {
        await roomRef.child("seats/" + mySeat).remove();
      }

      toast("Tu as quitté le salon.");
    }

    resetRoom();
    showScreen("homeScreen");

  } catch (error) {
    toast(error.message || "Impossible de quitter le salon.");
  } finally {
    setBusy(false);
  }
}
