# JAR-034 — Vérification navigateur locale

Statut : contrôles automatisables terminés le 7 octobre 2026 ; seul le test VoiceOver réel reste à faire par le propriétaire.

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

Tons partagés : badges succès/avertissement/critique et bouton danger utilisent désormais les teintes800 en thèmeclair,300 conservées sombre. Navigateurclair confirme danger rgb153,27,27 sur fondred15%, badgeGmail rgb6,95,70 sur emerald10%. Thèmes changés uniquement sur comptefictif, sombre restauré. Les fonds transparents nécessitent composition des ancêtres pour rapport exact ; aucune conformitéglobale prétendue.

Transport réseau : test TypeError fetch sur mutation => événement api-unavailable unique, aucun retry, puis lecture explicite réussie ; annulation utilisateur ne produit pas d’alerte indisponibilité. Test unitaire seulement, pas preuve réseauoffline navigateur. Audit DOM Réglages sombre : couleurs texte composées sur fonds des ancêtres, aucun p/label/bouton actif/h1/h2 sous4.5 ; exclut gradients, disabled, pseudoéléments et autresécrans. Browser reduced-motion actuellementfalse ; règle CSS mediareduce présente dans CSSOM. Pas d’émulationmedia/réseau annoncée par capacité navigateur, pas de smoke VoiceOver réel : contrôles toujoursouverts.

## Audit complet du 7 octobre 2026 (Playwright + axe-core 4.10.2)

Banc local fictif, Chromium piloté par Playwright. Aucun compte réel, aucune donnée réelle.

- Fournisseur fictif complété par `/account/privacy` (écran Réglages de JAR-039), qui renvoyait 404.
- Proxy Vite : une navigation directe vers `/inbox-zero` était envoyée à l’API (JSON « Unsupported verification route ») au lieu de l’application. Les requêtes HTML reçoivent désormais `index.html` ; les appels API restent proxifiés.
- axe-core (wcag2a, wcag2aa, wcag21aa) sur Aujourd’hui, Inbox, Chat, Activité et Réglages, en thèmes sombre et clair, à 390x844, 768x1024 et 1440x900 (30 combinaisons). Premier passage : `aria-prohibited-attr` (pastille « Connecté » sans rôle), contraste 1.8/1.72 (`text-muted-foreground/40` dans Chat, widgets et focus Aujourd’hui), contraste 4.46/4.45 (indication de l’étape Inbox active) et débordement de 23 px dans Réglages à 390 px (boutons Google). Après corrections : **0 violation, aucun débordement horizontal** sur les 30 combinaisons. Les éléments « incomplete » restants sont des contenus trop courts ou non textuels, plus `#note-text` partiellement masqué ; ils ont été contrôlés à la main.
- Étape Inbox active exposée par `aria-pressed`.
- Réduction des mouvements émulée (`prefers-reduced-motion: reduce`) : media query vraie, 0 élément avec animation ou transition supérieure à 10 ms, `scroll-behavior: auto`.
- Mode hors ligne réel du navigateur (`context.setOffline`) : Actualiser affiche l’alerte globale et masque le contenu (inert). Défaut trouvé : Aujourd’hui affichait le message anglais brut « Failed to fetch » et le conservait après reconnexion. Il affiche désormais « Connexion au serveur impossible. » et relit automatiquement après « Réessayer la connexion » ; les avertissements de mutation incertaine ne sont pas effacés. Revérifié dans le navigateur : aucune alerte et tâches visibles après reprise. Test de régression ajouté dans `test/today-flow.test.mjs`.
- Structure accessible : `lang="fr"`, un seul `h1` par écran, repères main/nav/aside/header, aucun contrôle interactif visible sans nom accessible. Ordre Tab sur Aujourd’hui : Se déconnecter, Aller au contenu, navigation, Actualiser ; anneau de focus visible sur chacun. Le bouton Se déconnecter précède le lien d’évitement (mineur, non corrigé).

Reste : test VoiceOver réel sur macOS/iOS (non automatisable ici) par le propriétaire.
