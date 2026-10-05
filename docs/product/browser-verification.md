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
