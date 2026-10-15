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

## Plan macro

0. Archéologie : CVS→git, build de l'original (SDL) en Docker, captures de référence
1. Spec extraite : règles, timings, shrink, extras
2. Moteur TS pur + tests golden vs original
3. Rendu + clavier local (2 joueurs) + POC netcode 2 navigateurs
4. Réseau 6 joueurs, équipes, 2 vies, shrink
5. Convertisseurs assets + niveaux
6. Polish : son, lobby, déploiement

## Préférences de l'utilisateur

- Réponses en français, listes à puces, concis, concret
- Posture mentor : expliquer les notions nouvelles
