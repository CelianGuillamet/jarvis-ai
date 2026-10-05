# Se rapprocher de JARVIS — recherche et traduction produit

Demande utilisateur du 5 octobre 2026. Recherche en ligne réalisée ; les capacités
ci-dessous sont une traduction produit, pas une promesse de reproduire l’IA fictive.

## Ce que l’on cherche à reproduire

JARVIS est présenté comme l’assistant de Tony Stark et le contrôleur des systèmes
de ses bâtiments et armures dans les films ([synthèse des apparitions](https://en.wikipedia.org/wiki/J.A.R.V.I.S.)).
Pour notre produit : dialogue naturel, situation synthétique, contexte des projets,
alertes utiles, outils coordonnés et voix interruptible. Les interfaces futuristes
ne remplacent pas ces comportements.

## Écart avec notre code

Le backend possède déjà `daily.briefing`, les missions, une mémoire contextuelle,
`proactiveSuggestions` et des fournisseurs Ollama/OpenAI injectés. L’UI Today ne
présentait ni mission ni suggestions. Le premier lot JAR-047 expose ces données
existantes sans dupliquer un moteur de priorisation ni déclencher d’action.
La situation reste liée à la dernière lecture ; aucun polling fournisseur caché.

## Composants open source étudiés

| Projet | Utilité | Décision |
| --- | --- | --- |
| [whisper.cpp](https://github.com/ggml-org/whisper.cpp) | Transcription locale ; C/C++, CPU et Apple Silicon ; MIT | Candidat pour STT français, service local borné ; benchmark et version épinglée avant intégration |
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | Synthèse vocale locale ; GPL-3.0 | Candidat service TTS séparé ; examiner distribution et licence de chaque voix avant embarquement |
| [openWakeWord](https://github.com/dscripka/openWakeWord) | Détection locale d’un mot d’activation ; code Apache-2.0 | Option ultérieure ; modèles préentraînés/licences et français à vérifier séparément ; micro sur demande en premier |
| [Home Assistant](https://github.com/home-assistant/core) | Contrôle local de la maison ; Apache-2.0 | Adapter son API plutôt que réécrire une plateforme domotique ; outils explicitement autorisés |
| [Wyoming](https://www.home-assistant.io/integrations/wyoming/) | Protocole entre composants vocaux locaux | Option d’interopérabilité ; à comparer avec notre adaptateur HTTP local |

Home Assistant documente une [chaîne vocale entièrement locale](https://www.home-assistant.io/voice_control/voice_remote_local_assistant/).
Aucun code tiers, modèle, voix ou nouvelle dépendance n’est encore incorporé.
Les licences de code ne suffisent pas à autoriser tous les modèles/voix.
Les dépôts simplement nommés « Jarvis » ne sont pas choisis sur leur nom : leurs
permissions, gestion d’erreurs, contrats, dépendances et provenance doivent être examinés.

## Lots d’implémentation autorisés

1. JAR-047 — Radar Today : mission et suggestions existantes, états absents,
   texte échappé, aucune exécution automatique. En cours.
2. Voix locale français : push-to-talk, STT local, aperçu transcription avant
   envoi, TTS local facultatif, Stop et interruption, aucun enregistrement conservé
   par défaut, limites taille/durée/concurrence et purge après compte déconnecté.
3. Mémoire explicite : faits sourcés, consultation, modification et oubli par
   propriétaire ; articuler avec export/rétention JAR-039 existant.
4. Routines : séquence d’étapes avec aperçu, confirmations, journal et reprise ;
   réutiliser les commandes durables, arrêter sur résultat inconnu.
5. Maison connectée : première lecture d’états via adaptateur Home Assistant ;
   ajouter des actions limitées après contrat et tests, aucune commande arbitraire.

Chaque lot aura ses critères, tests, branche et PR. Le backlog bêta et JAR-034
restent ouverts ; cette extension ne transforme pas leurs critères en facultatifs.
Pas de déploiement, achat, fournisseur payant ou appel à des services réels.
