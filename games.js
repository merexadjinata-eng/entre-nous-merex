/*
  Bibliothèque locale de défis.
  Chaque salle reçoit un paquet mélangé et ne répète pas une carte dans sa partie.
  Ajouter de nouvelles cartes ici permet d'agrandir le jeu sans changer le moteur.
*/
const GAME_LIBRARY = [
  {id:"s01",cat:"style",icon:"👗",title:"Le styliste sans limites",prompt:"Imagine une tenue avec une culotte portée par-dessus une chemise. Décris le look comme si tu le présentais à un grand défilé.",extra:"Créativité, humour et aucune obligation de porter réellement la tenue.",type:"text"},
  {id:"s02",cat:"style",icon:"🧦",title:"La mode à l'envers",prompt:"Compose un look avec un pantalon porté par-dessus un tee-shirt. Comment tu l'appellerais ?",extra:"Le ridicule n'existe pas dans ce défi : ose !",type:"text"},
  {id:"s03",cat:"style",icon:"✨",title:"Défilé du futur",prompt:"Invente une tenue que les humains porteront en 2050. Décris les vêtements, les chaussures et les accessoires.",extra:"Le plus original gagne les applaudissements.",type:"text"},
  {id:"s04",cat:"style",icon:"🎨",title:"Trois couleurs, un look",prompt:"Crée une tenue complète avec seulement trois couleurs : rouge, bleu et jaune. Explique ton choix.",extra:"À toi de devenir styliste.",type:"text"},
  {id:"s05",cat:"style",icon:"🕶️",title:"Le tapis rouge",prompt:"Tu dois habiller ton partenaire pour une cérémonie très prestigieuse. Quelle tenue lui proposes-tu ?",extra:"Gentillesse obligatoire, créativité recommandée.",type:"text"},
  {id:"f01",cat:"fun",icon:"😂",title:"Le super-pouvoir inutile",prompt:"Tu reçois un super-pouvoir complètement inutile. Lequel et comment comptes-tu l'utiliser ?",extra:"Fais-nous rire avec ton idée.",type:"text"},
  {id:"f02",cat:"fun",icon:"🎬",title:"Le film de ta vie",prompt:"Si ta vie devenait un film comique, quel serait son titre et qui jouerait ton rôle ?",extra:"Un titre mémorable est attendu.",type:"text"},
  {id:"f03",cat:"fun",icon:"🐘",title:"L'animal président",prompt:"Un animal devient président du monde. Lequel choisis-tu et quelle est sa première décision ?",extra:"L'imagination n'a pas de limites.",type:"text"},
  {id:"f04",cat:"fun",icon:"🗣️",title:"Le discours bizarre",prompt:"Écris une phrase très sérieuse pour annoncer quelque chose de totalement absurde.",extra:"Garde ton sérieux en l'écrivant !",type:"text"},
  {id:"f05",cat:"fun",icon:"🪄",title:"La machine à remonter",prompt:"Tu peux revivre une journée de ta vie ou découvrir une journée de ton futur. Que choisis-tu et pourquoi ?",extra:"Raconte ton choix.",type:"text"},
  {id:"d01",cat:"discover",icon:"💭",title:"Un rêve à partager",prompt:"Quel rêve aimerais-tu absolument réaliser dans les cinq prochaines années ?",extra:"Écoutez-vous sans vous juger.",type:"text"},
  {id:"d02",cat:"discover",icon:"🌱",title:"Une qualité cachée",prompt:"Quelle qualité chez toi les autres ne remarquent-ils pas assez ?",extra:"Le moment est venu de la révéler.",type:"text"},
  {id:"d03",cat:"discover",icon:"🤝",title:"La confiance",prompt:"Quel petit geste te fait comprendre qu'une personne tient vraiment à toi ?",extra:"Une réponse sincère vaut plus qu'une réponse parfaite.",type:"text"},
  {id:"d04",cat:"discover",icon:"🌍",title:"Une journée ailleurs",prompt:"Si tu pouvais passer une journée dans n'importe quel pays, où irais-tu et que ferais-tu ?",extra:"Fais voyager les autres avec toi.",type:"text"},
  {id:"d05",cat:"discover",icon:"⭐",title:"La fierté personnelle",prompt:"Cite une chose que tu as accomplie et dont tu es fier, même si elle paraît petite aux autres.",extra:"Chaque progrès compte.",type:"text"},
  {id:"c01",cat:"challenge",icon:"🎭",title:"La phrase dramatique",prompt:"Écris une phrase banale comme si tu étais dans la scène finale d'un grand film dramatique.",extra:"Exemple : « Il n'y avait plus de pain… »",type:"text"},
  {id:"c02",cat:"challenge",icon:"🧩",title:"Deux vérités, un mystère",prompt:"Donne deux faits vrais sur toi et un fait inventé. Les autres doivent deviner le mensonge.",extra:"Ne révèle pas la réponse tout de suite.",type:"text"},
  {id:"c03",cat:"challenge",icon:"🎤",title:"Le slogan publicitaire",prompt:"Invente un slogan publicitaire pour vendre un objet qui se trouve près de toi.",extra:"Vends-le comme si ta carrière en dépendait.",type:"text"},
  {id:"c04",cat:"challenge",icon:"🧠",title:"L'histoire en trois mots",prompt:"Raconte une mini-histoire en utilisant obligatoirement ces trois mots : banane, fusée, mariage.",extra:"Maximum cinq phrases.",type:"text"},
  {id:"c05",cat:"challenge",icon:"📸",title:"Le souvenir parfait",prompt:"Décris une photo que tu aimerais prendre avec les personnes présentes dans cette partie.",extra:"Précise le lieu, la pose et l'ambiance.",type:"text"}
];

const CATEGORY_NAMES = {style:"DÉFIS DE STYLE",fun:"DÉLIRES & IMAGINATION",discover:"MIEUX SE DÉCOUVRIR",challenge:"DÉFIS À RÉALISER",mix:"SURPRISE"};
function makeDeck(category) {
  let pool = category === "mix" ? [...GAME_LIBRARY] : GAME_LIBRARY.filter(x => x.cat === category);
  if (pool.length < 5) pool = [...GAME_LIBRARY];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(10, pool.length));
}
