const $ = id => document.getElementById(id);
let currentUser = null, currentRoom = null, roomRef = null, roomListener = null;
let selectedMode = "duo", isHost = false, latestRoom = null, busy = false;

function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => el.classList.remove("show"), 2400);
}
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $(id).classList.add("active"); window.scrollTo({top:0,behavior:"smooth"});
}
function cleanName(value) { return String(value || "").trim().replace(/[<>]/g,"").slice(0,18); }
function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i=0;i<6;i++) bytes[i] = Math.floor(Math.random()*256);
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}
async function ensureAuth() {
  if (!auth.currentUser) await auth.signInAnonymously();
  currentUser = auth.currentUser;
}
function detachRoom() {
  if (roomRef && roomListener) roomRef.off("value", roomListener);
  roomListener = null; roomRef = null;
}
function enterRoom(code) {
  detachRoom(); currentRoom = code; roomRef = db.ref("rooms/" + code);
  roomListener = snap => {
    const data = snap.val();
    if (!data) { toast("Cette partie n'existe plus."); currentRoom=null; showScreen("homeScreen"); detachRoom(); return; }
    latestRoom = data; renderRoom(data);
  };
  roomRef.on("value", roomListener, err => toast("Connexion interrompue : " + err.message));
}
function playerEntries(room) { return Object.entries(room.players || {}).filter(([,p]) => p && p.uid); }
function renderRoom(room) {
  const meta = room.meta || {}, players = playerEntries(room), host = meta.host === currentUser.uid;
  isHost = host;
  $("roomCode").textContent = currentRoom;
  $("roomModeLabel").textContent = meta.mode === "duo" ? "DUO" : "GROUPE";
  $("playerCount").textContent = `${players.length}/${meta.maxPlayers}`;
  $("playersList").innerHTML = "";
  players.forEach(([uid,p]) => {
    const div = document.createElement("div"); div.className = "player";
    const avatar = document.createElement("span"); avatar.className = "avatar"; avatar.textContent = (p.name || "?").charAt(0).toUpperCase();
    const name = document.createElement("div"); const strong = document.createElement("strong"); strong.textContent = p.name || "Joueur";
    const small = document.createElement("small"); small.textContent = uid === meta.host ? "Créateur de la partie" : "Participant";
    name.append(strong,small); div.append(avatar,name);
    if (uid === meta.host) { const tag = document.createElement("span"); tag.className="host-tag"; tag.textContent="HÔTE"; div.append(tag); }
    $("playersList").append(div);
  });
  if (meta.phase === "lobby") {
    showScreen("lobbyScreen");
    $("startBtn").disabled = !host || players.length < (meta.mode === "duo" ? 2 : 2);
    $("startBtn").textContent = host ? (players.length >= 2 ? "Lancer la partie →" : "En attente des joueurs…") : "En attente de l'hôte…";
    $("startHint").textContent = meta.mode === "duo" ? "Le Mode Duo démarre à 2 joueurs." : "Le Mode Groupe démarre à partir de 2 joueurs, jusqu'à 12.";
    $("lobbyNotice").textContent = players.length >= 2 ? "Tout le monde est presque prêt. L'hôte peut lancer la partie." : "En attente des autres joueurs…";
  } else if (meta.phase === "playing") {
    showScreen("gameScreen"); renderGame(room);
  } else if (meta.phase === "finished") {
    showScreen("resultsScreen"); renderResults(room);
  }
}
function renderGame(room) {
  const state = room.state || {}, deck = state.deck || [], index = state.index || 0, card = deck[index];
  if (!card) return;
  $("roundLabel").textContent = `MANCHE ${index+1} / ${deck.length}`;
  $("progressBar").style.width = `${((index+1)/deck.length)*100}%`;
  $("categoryLabel").textContent = CATEGORY_NAMES[card.cat] || "SURPRISE";
  $("playersInGame").textContent = `${playerEntries(room).length} joueurs`;
  $("challengeSymbol").textContent = card.icon || "✦";
  $("challengeTitle").textContent = card.title;
  $("challengePrompt").textContent = card.prompt;
  $("challengeExtra").textContent = card.extra || "";
  const submitted = state.answers && state.answers[index] && state.answers[index][currentUser.uid];
  $("answerInput").value = submitted || "";
  $("answerInput").disabled = !!submitted;
  $("submitAnswer").disabled = !!submitted;
  $("submitAnswer").textContent = submitted ? "Réponse envoyée ✓" : "Envoyer ma réponse";
  $("answerStatus").textContent = submitted ? "Ta réponse est enregistrée. Tu peux découvrir celles des autres." : "Envoie ta réponse pour participer à cette manche.";
  $("answersList").innerHTML = "";
  const answers = state.answers && state.answers[index] || {};
  const people = room.players || {};
  Object.entries(answers).forEach(([uid,value]) => {
    const p = people[uid]; if (!p) return;
    const item = document.createElement("div"); item.className="answer-item";
    const strong = document.createElement("strong"); strong.textContent=p.name || "Joueur";
    const para = document.createElement("p"); para.textContent=value;
    item.append(strong,para); $("answersList").append(item);
  });
  const allAnswered = playerEntries(room).every(([uid]) => answers[uid]);
  $("nextRound").classList.toggle("hidden", !isHost || !allAnswered);
  $("nextRound").textContent = index === deck.length-1 ? "Terminer la partie ✦" : "Manche suivante →";
}
function renderResults(room) {
  $("finalSummary").innerHTML = "";
  const state = room.state || {}, deck = state.deck || [], answers = state.answers || {}, players = room.players || {};
  deck.forEach((card,i) => {
    const wrap = document.createElement("div"); wrap.className="answer-item";
    const title = document.createElement("strong"); title.textContent = `${i+1}. ${card.title}`;
    wrap.append(title);
    Object.entries(answers[i] || {}).forEach(([uid,val]) => {
      const p=document.createElement("p"); p.textContent=`${players[uid]?.name || "Joueur"} : ${val}`; wrap.append(p);
    });
    $("finalSummary").append(wrap);
  });
}
async function createRoom() {
  if (busy) return; busy=true;
  try {
    await ensureAuth();
    const name = cleanName($("nickname").value);
    if (!name) { toast("Choisis un pseudonyme."); return; }
    const category = $("gameCategory").value;
    const maxPlayers = selectedMode === "duo" ? 2 : 12;
    let code, created=false;
    for (let i=0;i<10 && !created;i++) {
      code=randomCode();
      const ref=db.ref("rooms/"+code);
      const metaResult=await ref.child("meta").transaction(current => current===null ? {
        host:currentUser.uid,mode:selectedMode,phase:"lobby",maxPlayers,createdAt:firebase.database.ServerValue.TIMESTAMP
      } : undefined);
      if (metaResult.committed) {
        await ref.child("players/"+currentUser.uid).set({uid:currentUser.uid,name,joinedAt:Date.now()});
        await ref.child("state").set({category,index:0,deck:[],answers:{}});
        created=true;
      }
    }
    if (!created) throw new Error("Impossible de générer un code disponible. Réessaie.");
    enterRoom(code);
  } catch(e) { toast(e.message || "Erreur lors de la création."); }
  finally { busy=false; }
}
async function joinRoom() {
  if (busy) return; busy=true;
  try {
    await ensureAuth();
    const code=$("joinCode").value.toUpperCase().replace(/[^A-Z0-9]/g,"");
    const name=cleanName($("nickname").value) || cleanName(prompt("Quel pseudonyme veux-tu utiliser ?"));
    if (code.length!==6) { toast("Entre un code de 6 caractères."); return; }
    if (!name) { toast("Choisis un pseudonyme avant de rejoindre."); return; }
    const ref=db.ref("rooms/"+code);
    const snap=await ref.child("meta").once("value"), meta=snap.val();
    if (!meta) { toast("Code inconnu. Vérifie-le avec ton ami."); return; }
    if (meta.phase!=="lobby") { toast("Cette partie a déjà commencé."); return; }
    const playerRef=ref.child("players/"+currentUser.uid);
    const result=await playerRef.transaction(old => old ? {...old,name} : {
      uid:currentUser.uid,name,joinedAt:Date.now()
    });
    if (!result.committed) { toast("Cette salle est complète ou n'accepte plus de joueurs."); return; }
    const countSnap=await ref.child("players").once("value");
    if (countSnap.numChildren() > meta.maxPlayers) {
      await playerRef.remove();
      toast("Cette salle vient d'être complète. Essaie une autre partie.");
      return;
    }
    enterRoom(code);
  } catch(e) { toast("Impossible de rejoindre : " + e.message); }
  finally { busy=false; }
}
async function startGame() {
  if (!isHost || !latestRoom) return;
  const room=latestRoom, players=playerEntries(room);
  if (players.length<2) return toast("Il faut au moins deux joueurs.");
  const deck=makeDeck(room.state?.category || "mix");
  try {
    await roomRef.child("state").set({category:room.state?.category || "mix",index:0,deck,answers:{}});
    await roomRef.child("meta/phase").set("playing");
  } catch(e) { toast("Impossible de lancer : "+e.message); }
}
async function submitAnswer() {
  if (!latestRoom || !currentUser) return;
  const value=String($("answerInput").value || "").trim();
  if (!value) return toast("Écris une réponse avant d'envoyer.");
  const index=latestRoom.state?.index || 0;
  try {
    const ref=roomRef.child(`state/answers/${index}/${currentUser.uid}`);
    const result=await ref.transaction(old => old===null ? value.slice(0,240) : undefined);
    if (!result.committed) toast("Ta réponse est déjà enregistrée.");
  } catch(e) { toast("Réponse non envoyée : "+e.message); }
}
async function nextRound() {
  if (!isHost || !latestRoom) return;
  const state=latestRoom.state || {}, deck=state.deck || [], next=(state.index||0)+1;
  try {
    if (next>=deck.length) await roomRef.child("meta/phase").set("finished");
    else await roomRef.child("state/index").set(next);
  } catch(e) { toast("Impossible de continuer : "+e.message); }
}
async function leaveRoom() {
  if (!currentRoom || !currentUser) { showScreen("homeScreen"); return; }
  const room=latestRoom, players=room?.players || {}, meta=room?.meta || {};
  try {
    if (meta.host===currentUser.uid) {
      const remaining=Object.keys(players).filter(uid=>uid!==currentUser.uid);
      if (remaining.length) {
        const nextHost=remaining[0];
        await roomRef.child("meta/host").set(nextHost);
      } else {
        await roomRef.remove();
      }
    }
    await roomRef.child("players/"+currentUser.uid).remove();
  } catch(e) { toast("Déconnexion de la salle : "+e.message); }
  detachRoom(); currentRoom=null; latestRoom=null; showScreen("homeScreen");
}
$("chooseDuo").onclick=()=>{selectedMode="duo";$("setupTitle").textContent="Mode Duo";$("setupDescription").textContent="Une expérience à deux, pour se découvrir et s'amuser.";showScreen("setupScreen");};
$("chooseGroup").onclick=()=>{selectedMode="group";$("setupTitle").textContent="Mode Groupe";$("setupDescription").textContent="Réunissez jusqu'à 12 joueurs pour une partie pleine de surprises.";showScreen("setupScreen");};
$("createBtn").onclick=createRoom; $("joinBtn").onclick=joinRoom; $("startBtn").onclick=startGame;
$("submitAnswer").onclick=submitAnswer; $("nextRound").onclick=nextRound;
$("copyCode").onclick=async()=>{try{await navigator.clipboard.writeText(currentRoom);toast("Code copié !");}catch(e){toast("Code : "+currentRoom);}};
$("lobbyBack").onclick=leaveRoom; $("leaveGame").onclick=leaveRoom;
$("backHome").onclick=()=>{detachRoom();currentRoom=null;latestRoom=null;showScreen("homeScreen");};
document.querySelectorAll("[data-go]").forEach(btn=>btn.onclick=()=>showScreen(btn.dataset.go));
$("joinCode").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,6));
auth.onAuthStateChanged(user=>{currentUser=user;});
