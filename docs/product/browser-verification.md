# JAR-034 — Vérification navigateur locale

Statut : en cours. Aucun critère global n’est encore validé.

Le banc exécute les composants de production contre un serveur HTTP jetable lié à
127.0.0.1. Il ne contacte ni Google ni un modèle. Ses données restent en mémoire.
Les réponses principales et les mutations Today sont validées par les contrats
canoniques Web. Ce serveur ne constitue pas une preuve de sécurité du backend.

Depuis `web/`, lancer séparément :

```sh
node --experimental-strip-types test/browser/local-provider.mjs
VITE_API_PROXY_TARGET=http://127.0.0.1:4319 npm run dev -- --port 5189 --host 127.0.0.1
```

Ouvrir http://127.0.0.1:5189 dans un navigateur. Redémarrer le fournisseur
réinitialise l’accueil et les données. `/__verification` expose uniquement le
journal des chemins/méthodes et permet de simuler une indisponibilité ou une
révocation. Aucune adresse, clé ou session réelle ne doit être introduite.

## Preuves obtenues le 5 octobre 2026

- Navigateur Codex : accueil affiché avec compte fictif et préférences ; cliquer
  « Enregistrer et commencer » affiche les vrais écrans et 50 tâches locales.
- Cliquer « Suivantes » affiche uniquement la tâche 51 ; « Précédentes » devient
  disponible et « Suivantes » devient désactivé. Les notes restent indépendantes.
- Défaut découvert : proxy Vite absent pour `/today`, corrigé pour permettre les
  lectures et mutations avec une API distincte en développement.
- Réduction des mouvements : correction CSS et défilement du chat implémentés.
  Types/lint/tests/build passés avant ajout du banc ; validation navigateur de la
  préférence système encore à effectuer.

## Contrôles restants

Mutations tâches/notes, calendrier, revue/envoi Inbox simulés, historique et
récupération ; clavier/focus, lecteur écran, contrastes, réduction des mouvements ;
mobile/tablette/desktop, rechargement, panne et scopes révoqués. Le banc doit encore
être enrichi pour Inbox, confirmations et historique avant ces contrôles.

## Vérifications supplémentaires

Création de note confirmée dans le vrai navigateur : titre « Note navigateur »
affiché après sauvegarde. Le fournisseur jetable signale désormais correctement
une modification locale réelle plutôt qu’une simulation sans effet.
Panne HTTP503 simulée : Actualiser affiche une seule alerte globale et le bouton
« Réessayer la connexion ». Après remise en service et clic sur ce bouton, la
note reste visible. Ceci vérifie la panne API, pas encore le mode réseau offline.

Today vérifié à 390x844, 768x1024 et1440x900 : scrollWidth385/763/1435 inférieur à innerWidth390/768/1440, sans débordement horizontal. Ceci ne valide pas encore les autres écrans. Navigation : conseils alpha0.5/0.6 mesurés rgba(128,132,147) sur fond sombre, contrastes estimés2.15/2.58 ; opacité supprimée (texte opaque5.03 sur rgb16,18,24). Vérification réelle du lien « Aller au contenu » via Enter : activeElement MAIN#main-content. Préférence viewport temporaire réinitialisée.

Inbox fictive : ouverture du message, saisie réponse, revue affichant destinataire/sujet/texte exacts, confirmation puis résultat par message « Action terminée » et compteur0 vérifiés dans navigateur. Aucun mail réel envoyé. Chat : réponse du fournisseur local visible ; rechargement puis accueil (préférences du banc réinitialisées au redémarrage) et retour Chat restaurent ce tour via endpoint history. Ceci ne valide pas la persistance PostgreSQL : elle a ses propres tests. Banc enrichi Inbox/session/message/draft/apply et chat/history ; calendrier/confirm et cas partial/unknown encore à compléter.

Scopes révoqués dans fournisseur fictif : Today indique « L’autorisation du calendrier est requise » tout en conservant les tâches locales ; Inbox indique Gmail non connecté. Aucun écran Google ouvert. À390x844, Inbox sans permission, Chat avec historique, Activité vide et Réglages n’ont pas de débordement horizontal (scrollWidth385,innerWidth390). Les états riches et tailles tablette/desktop de ces écrans restent à contrôler. Override viewport réinitialisé.

Correction Inbox clavier/lecteur écran : cases désormais nommées « Sélectionner : sujet », bouton natif « Ouvrir : sujet » accessible séparément des actions. Ouverture par Enter dans vrai navigateur confirmée par champ de réponse visible. Test DOM couvre libellé, cible message exacte et conservation des raccourcis natifs.

Calendrier fictif : confirmation affichée dans Chat puis « Rendez-vous fictif confirmé » visible dans Today. Aucune mutation Google réelle.

Dialogue Inbox désormais natif : showModal, nom accessible, fermeture via cancel/Échap et focus rendu après retrait du dialogue. Vérification navigateur : ouverture Enter, dialogue visible, Échap depuis champ Message, dialogue absent puis activeElement aria-label « Ouvrir : Question de vérification ». Le premier essai a révélé un retour de focus trop tôt ; watch flush post corrige ce défaut, revérifié. Aucun test VoiceOver réel encore effectué.

Dialogue Inbox riche à390/768/1440 : largeur interne/scroll361/361,739/739,768/768, aucun débordement. Défaut mobile visuel : header actions masquait Fermer et compressait le sujet ; header vertical sur mobile puis actions repliables corrigent le problème. Bouton Fermer entièrement dans viewport aux trois tailles puis clic ferme et rend focus. Libellés opaques calculés rgb128,132,147 après suppression des opacités faibles Inbox ; audit contraste complet des deux thèmes reste à effectuer.

Thème clair via réglages du banc : bouton Enregistrer mesuré blanc sur rgb4,145,210, ratio WCAG3.51 insuffisant. Token primaire clair assombri vers rgb3,103,150, mesure navigateur confirmée ; ratio6.20 (environ5.25 avec brightness110%). Libellés secondaires Chat/Réglages rendus opaques. Thème sombre restauré dans le banc. Ces corrections ne valent pas audit complet des badges, contrôles non-textuels ou messages d’erreur des deux thèmes.
