# JAR-039 — Contrôle des données : conception en cours

Statut : conception, aucune fonctionnalité d’export/suppression livrée.

## Architecture existante vérifiée

AccountController utilise exclusivement request.identity.userId pour le profil et
les préférences. Les sessions sont vérifiées sans cache de désactivation du compte.
Les données métiers sont liées au propriétaire ; plusieurs clés étrangères sont
RESTRICT. Les historiques et commandes sont liés par owner/conversation composites.
CommandTransition est append-only : un trigger BEFORE UPDATE OR DELETE rejette
la suppression normale. Un simple user.delete ne peut donc pas réaliser un oubli.

## Contrat de livraison

- Export authentifié du propriétaire courant, versionné, collections paginées et
  bornées, snapshot cohérent ; aucune clé API, cookie, hash, jeton OAuth ou secret.
- Suppression avec confirmation explicite de l’identité courante ; aucun ownerId
  fourni par le client. Désactiver les nouveaux accès avant traitement, refuser
  les opérations dangereuses encore en exécution, purger les références en mémoire
  et révoquer les autorisations fournisseur sans exécuter une commande métier.
- Suppression transactionnelle de toutes les tables retenues, dans l’ordre des
  dépendances. Prévoir une voie SQL dédiée pour le journal append-only, bornée au
  propriétaire et utilisable uniquement dans la transaction d’effacement ; ne
  jamais désactiver globalement les triggers.
- Disposer de preuves PostgreSQL : second utilisateur intact, commandes/historique/
  brouillons/secrets effacés, session inutilisable, crash et concurrence maîtrisés.
- Exporter avant effacement uniquement sur demande ; ne pas créer une copie
  conservée implicitement pour les besoins de diagnostic.

## Politique proposée à implémenter et vérifier

Données choisies par l’utilisateur (tâches, notes, mémoire explicite) : jusqu’à
suppression. Historique conversationnel et résultats terminaux : 90 jours.
Journaux techniques minimisés : 14 jours, sans contenu brut ni secret. OAuth state
et sessions : expiration existante, nettoyage des entrées expirées. Les opérations
non terminales ou de résultat inconnu ne doivent jamais être purgées au milieu
 d’une reprise. La politique doit être appliquée par des traitements bornés et
 testés, pas seulement annoncée dans l’interface.

Aucune sauvegarde de production n’est configurée ni aucun déploiement autorisé.
Documenter que les sauvegardes gérées par l’opérateur ont un délai d’expiration
séparé ; lors d’une restauration, réappliquer les demandes de suppression avant
réouverture. Ne pas promettre l’effacement immédiat de copies non maîtrisées.

## Transparence des fournisseurs

Afficher les fournisseurs réellement configurés et les catégories transférées :
Google pour les fonctionnalités autorisées, modèle local/distant selon configuration,
recherche Web uniquement si activée. Ne pas présenter un fournisseur distant comme
local. Afficher les contrôles d’export/effacement et limites de sauvegarde dans les
réglages de compte, sans exposer les paramètres sensibles de l’installation.

## Prochaine étape

Inventorier chaque modèle retenu et chaque cache/provider ; définir contrats
canoniques et tests d’accès/export ; implémenter le cycle durable d’effacement et
la migration SQL spécifique après revue des contraintes et courses d’exécution.

## Implémentation engagée

Export profil : projection User explicite. Pages locales tâches/notes/shopping/calendar : ownerId de l’identité signée, curseur UUID strict, take51/items50. Mémoire : jointure SQL paramétrée JarvisMemoryFact.sessionId vers Conversation.id, ownerId obligatoire sans liste de conversations non bornée. Inventaire HTTP privé et matrice de sécurité mis à jour.

Ces pages lisent l’état courant à chaque requête : elles ne garantissent pas encore un snapshot cohérent multi-pages/multi-collections sous mutations concurrentes. La cohérence de l’export complet reste à implémenter et tester avant livraison. Historique, Inbox et autres modèles retenus doivent être couverts. Aucun test PostgreSQL d’export encore exécuté.

## Inventaire complet et copies historiques

Tous les modèles Prisma ont une portée de propriété et une disposition export explicites dans api/src/privacy/data-inventory.ts. Le test de couverture compare les noms au schéma pour échouer dès qu’un modèle futur est oublié. Les métadonnées auth restent distinctes des secrets non exportables. Les archives LegacyOwnershipRecord.original et LegacyOwnershipBatch.manifest peuvent contenir des copies de données utilisateur : leur purge ciblée fait partie de l’effacement, en préservant les copies des autres propriétaires. Cet inventaire ne constitue pas encore une implémentation d’effacement.
