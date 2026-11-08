ENTRE NOUS — PREMIÈRE VERSION MULTIJOUEUR
==========================================

CONTENU DU DOSSIER
- index.html : structure de l'application
- style.css : design mobile
- firebase.js : configuration Firebase
- games.js : bibliothèque de défis
- app.js : création, invitation, lobby et déroulement de partie
- database.rules.json : règles Realtime Database proposées

IMPORTANT AVANT PUBLICATION
1. Ouvre firebase.js.
2. Remplace les valeurs REMPLACE_PAR... par la configuration Web de ton projet Firebase.
3. Dans Firebase Console > Realtime Database > Règles, colle le contenu de database.rules.json puis publie.
4. Vérifie que l'authentification anonyme est activée.
5. Dans GitHub, téléverse les six fichiers à la racine du dépôt.
6. Ouvre l'adresse GitHub Pages / l'hébergement de ton site.

FONCTIONNALITÉS DE CETTE BASE
- Mode Duo : maximum 2 joueurs.
- Mode Groupe : maximum 12 joueurs.
- Codes distincts par salle, générés séparément.
- Salle d'attente et liste des participants.
- Hôte qui lance et fait avancer la partie.
- Défis de style, imagination, découverte et actions.
- Réponses synchronisées en direct.
- Aucun doublon de défi dans une même partie.
- Transfert du rôle d'hôte au prochain joueur lorsque l'hôte quitte.

LIMITES À CONNAÎTRE
- La bibliothèque de défis est actuellement locale et finie : les parties mélangent les cartes disponibles, mais cela ne garantit pas qu'une carte ne reviendra jamais dans une autre salle.
- Cette version est une première base fonctionnelle, pas encore un produit audité en sécurité.
- Les règles Realtime Database doivent être testées avec Firebase Emulator avant une ouverture publique. Le système de participation en groupe par transactions client doit être renforcé contre les arrivées simultanées et les abus.
- Le changement de manche et de phase reste piloté par le client de l'hôte. Pour une protection forte contre la triche, une prochaine version devra utiliser Cloud Functions ou un serveur de jeu.
- Aucun chat, appel vocal, classement compétitif, équipes ou modération n'est encore inclus.

CONSEIL
Ne supprime pas ton ancienne version avant d'avoir sauvegardé le dépôt. Fais les essais avec deux téléphones/comptes avant de partager publiquement.
