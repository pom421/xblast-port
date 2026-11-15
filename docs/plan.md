# XBlast – reprise de contexte (depuis le chat claude.ai, 15/10/2026)

## Objectif

Porter XBlast (Bomberman LAN des facs françaises ~2000) en technos modernes.
Règles clés : 2D, 6 joueurs max, équipes de 2, 2 vies, "shrink" en fin de temps qui réduit la grille et tue les joueurs sur les cases qui disparaissent.

## Code source d'origine

- SourceForge : https://sourceforge.net/projects/xblast/ — GPLv2+, C, dernière release 2.10.4 (juin 2006)
- Historique : dépôt CVS (lecture seule), snapshot zip : https://sourceforge.net/code-snapshots/cvs/x/xb/xblast.zip → convertir en git avec cvs-fast-export
- Tarball analysé : http://archive.ubuntu.com/ubuntu/pool/universe/x/xblast-tnt/xblast-tnt_2.10.4.orig.tar.gz
- Données séparées (SourceForge files) : images, levels, models, musics, sounds

## Analyse du code 2.10.4

- ~70 k lignes C, 140 .c
- 783 commits 2004-2006 (lodott, iskywalker, fzago, alfie) ; avant 2004 absent du tarball
- Couches plateforme jetables : X11, SDL1, Win32 (~15 k lignes)
- Cœur gameplay : bomb.c, player.c, map.c, shrink.c (~30 types de shrink), func.c, level.c, bot.c
- Réseau : UDP, actions par frame relayées par le serveur → lockstep déterministe, RNG partagé GameRandomNumber
- ~60 % du code non pertinent (menus mi_*.c, ini, serveur central, son externe)

## Licence

- Traduire le C ou réutiliser assets/niveaux = œuvre dérivée → GPL obligatoire
- Client web distribué → sources à publier ; serveur non distribué → pas d'obligation
- Alternative clean-room : spec + réécriture + nouveaux assets → licence libre au choix
- Éviter le nom "Bomberman" (marque Konami)

## Décisions techniques

- TypeScript, simulation pure déterministe partagée client/serveur
- Simulation 100 % entiers, tick fixe
- RNG seedé maison (mulberry32 / xoshiro128**), jamais Math.random dans la simulation
- Netcode : lockstep à délai d'input d'abord, rollback si besoin
- Transport : WebSocket d'abord ; WebRTC DataChannel non fiable si perte de paquets gênante
- Boucle de jeu sans allocation (pas de pauses GC)
- Rendu Canvas2D ou PixiJS ; serveur Node/Bun ; Vite + Vitest
- Prototype netcode à 2 navigateurs AVANT les assets
- Le serveur ne fait confiance à aucun client (en lockstep il ne simule rien : tout ce qu'il sait vient d'eux) : chaque message est validé par un schéma zod strict (`packages/server/src/protocol.ts`), puis le salon vérifie ce qui dépend de son état (qui envoie, quelle manche, quelle frame). zod reste dans le serveur : `sim` sans dépendance, client léger
- Vainqueur d'une manche : le résultat rapporté par la majorité des clients ; sans majorité, personne ne gagne
- Un client muet ne gèle plus la manche : 5 s de grâce, 15 s de décompte affiché à tous, puis sa connexion est fermée (son joueur reste immobile, il revient au match suivant)

## Plan macro

0. Archéologie : CVS→git, build de l'original (X11) en Docker + noVNC, runner golden (dump d'état par frame) — **fait** (PR 1), voir `archeology/README.md`
1. Spec extraite — **remplacée** par une transcription fonction par fonction du C, vérifiée par les tests golden
2. Moteur TS + tests golden vs original — **fait** (PR 2) : 1188/1188 niveaux identiques (1187 avec touche spéciale)
3. Rendu + clavier local — **fait** (PR 3) : 2 à 4 joueurs, graphismes et sons d'origine décodés dans le navigateur
4. Réseau 6 joueurs, équipes, vies, shrink — **fait** (PR 4) : lockstep via serveur Bun, salon, détection de désynchronisation
5. Convertisseurs assets + niveaux — **remplacé** : fichiers d'origine servis tels quels, décodés côté client
6. Polish — **fait**, sauf l'intro animée de l'original : musique, bots (IA de `bot.c`), autres silhouettes de joueurs, configuration des touches, pause ; écrans de l'original entre les manches (présentation du niveau, fin de manche, scores, vainqueur) ; barre d'état
7. Mise en ligne — **en cours** :
   - image Docker, Caddy (HTTPS, WebSocket) et heartbeat — faits (PR 18)
   - durcissement du serveur après audit — fait (PR 19) : validation zod, rapports de fin de manche des seuls joueurs, fenêtre d'inputs bornée, limites (2 ko par message, 60 messages/s, 32 connexions), plus de page de debug Bun
   - délai de 15 s pour un client muet — fait (PR 20)
   - client découpé : `main.ts` → `match.ts`, `local.ts`, `online.ts`, `ui.ts` — fait (PR 21)
   - README : jouer en ligne, tester seul à 2 joueurs — fait (PR 22)
   - reste : choix de l'hébergeur (VPS avec `deploy/compose.yaml`, ou PaaS à conteneur avec le `Dockerfile` seul ; une seule instance, le salon vit en mémoire) puis mise en ligne

## Restes de l'audit (novembre 2026)

Par ordre de priorité :

1. Durcissement du déploiement : en-têtes de sécurité dans `deploy/Caddyfile` (CSP, `X-Content-Type-Options: nosniff` — le client écrit dans `innerHTML`) ; `deploy/compose.yaml` en `read_only`, `cap_drop: [ALL]`, `no-new-privileges`, limite mémoire ; actions de la CI épinglées par SHA
2. `SIM_VERSION` n'est vérifié nulle part : l'envoyer dans `join` et refuser un client d'une autre version (après un déploiement, un onglet resté sur l'ancien JS se désynchronise sans explication)
3. Limite de connexions globale (32), pas par adresse : derrière Caddy toutes les connexions viennent du proxy ; quelqu'un peut occuper toutes les places
4. Aucun test côté client : le scénario navigateur écrit pendant l'audit (Chromium headless, match local, match en ligne, décompte, partie pleine) n'est pas versionné
5. Retour d'un joueur retiré dans le match en cours (aujourd'hui : au match suivant)
6. Serveur arbitre : rejouer la simulation côté serveur pour vérifier le hash au lieu de croire la majorité (seulement si la triche devient un problème)
7. Petits défauts : `favicon.ico` absent (404) ; un onglet en arrière-plan ne joue plus (`requestAnimationFrame` suspendu), ce qui déclenche le décompte

## Préférences de l'utilisateur

- Réponses en français, listes à puces, concis, concret
- Posture mentor : expliquer les notions nouvelles
