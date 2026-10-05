# JAR-039 — Contrôle des données : conception en cours

Statut : implémentation en cours, aucune fonctionnalité livrée ou fusionnée.

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

Ces pages lisent l’état courant à chaque requête : elles ne garantissent pas encore un snapshot cohérent multi-pages/multi-collections sous mutations concurrentes. La cohérence de l’export complet reste à implémenter et tester avant livraison. Historique, Inbox et autres modèles retenus doivent être couverts. Les tests PostgreSQL de ces exports sont désormais validés par la CI sur le commit 2e0cd93.

## Inventaire complet et copies historiques

Tous les modèles Prisma ont une portée de propriété et une disposition export explicites dans api/src/privacy/data-inventory.ts. Le test de couverture compare les noms au schéma pour échouer dès qu’un modèle futur est oublié. Les métadonnées auth restent distinctes des secrets non exportables. Les archives LegacyOwnershipRecord.original et LegacyOwnershipBatch.manifest peuvent contenir des copies de données utilisateur : leur purge ciblée fait partie de l’effacement, en préservant les copies des autres propriétaires. Cet inventaire ne constitue pas encore une implémentation d’effacement.


## Téléchargement cohérent engagé

GET /account/export/snapshot produit un fichier NDJSON sans copie persistée.
Une transaction PostgreSQL REPEATABLE READ en lecture seule couvre tous les modèles
exportables de l’inventaire. Des curseurs SQL lisent 50 lignes à la fois ; le flux
HTTP attend le consommateur, et une déconnexion interrompt le traitement. Les
projections de colonnes sont des listes statiques, pas une sérialisation automatique
de futurs champs Prisma. OAuth/Verification et manifests de migration sont exclus ;
les métadonnées Session/Account excluent les identifiants secrets. Les clés de secrets
dans les objets et payloads JSON hérités sont filtrées récursivement. Les archives
originales de tables de credentials sont omises.

Le premier enregistrement est `header` (version, date, compte), puis viennent les
`record` (collection, data). Le dernier `complete` donne le nombre total de lignes,
uniquement après réussite de la transaction. Sans ce marqueur, le téléchargement
est incomplet et doit être rejeté ; une panne après envoi des headers produit
`incomplete`, sans détail interne. La transaction est bornée à 60 secondes : une
expiration exige un nouveau téléchargement, aucune copie partielle n’est annoncée
complète. Les anciennes pages restent des lectures de l’état courant.

Tests unitaires : isolation demandée, couverture de projections, redaction,
annulation et absence de marqueur complet si commit échoue. Tests PostgreSQL ajoutés
pour isolation entre comptes, pagination et mutations concurrentes pendant le
snapshot. Ils ont été validés en CI (voir preuves ci-dessous) ; Docker local
répond HTTP 500, et le runner de base jetable local a échoué avant les tests. La suppression, rétention et interface restent à faire.


## Preuves CI et frontière de suppression

Sur 2e0cd93, les quatre contrôles de PR31 sont SUCCESS (runs 37356557497 et
37356524670). Le log API de 37356524670 contient PASS app.integration-spec.ts
et 16 suites / 117 tests PostgreSQL. Le test ajouté exécute le téléchargement
réel, vérifie son marqueur complet, exclut le jeton de session et les données
d’un autre compte, puis modifie et insère des notes après le début de la
transaction : le snapshot conserve les 51 notes originales. L’indisponibilité
Docker locale reste une limitation locale, sans empêcher cette preuve CI.

Avant toute suppression, la simple désactivation de User ne suffit pas : une
requête déjà authentifiée peut encore commencer un effet fournisseur. Il faut
synchroniser la désactivation avec les transitions Command -> executing et
InboxReplyOperation -> sending au niveau PostgreSQL, par verrouillage du compte
et refus des nouveaux départs lorsque disabled=true. Les états executing/unknown,
sending/unknown et les suites Inbox encore incomplètes exigent une réconciliation
avant purge. Une désactivation durable doit précéder le travail d’effacement ;
ce cycle, sa reprise après crash et son journal minimal restent à implémenter.

StatusResourceCache dispose maintenant d’une invalidation ciblée qui retire
l’entrée et empêche un refresh en vol de republier son résultat. Le test préserve
le cache d’un autre compte et vérifie la libération de capacité après fin du
refresh. Cette primitive n’est pas encore raccordée au cycle d’effacement ; les
maps convo/recentMemory de JarvisService doivent aussi être vidées pour chaque
conversation appartenant au compte. Aucune suppression de compte n’est livrée.


## Préparation SQL de l’effacement engagée

La migration account_execution_fence ajoute un compteur interne executionEpoch
sur User. Les propositions Command/Inbox et départs executing/sending doivent
incrémenter ce compteur sur un compte actif dans la même transaction que la
transition. Cette écriture sérialise la préparation de suppression et invalide
une transaction REPEATABLE READ qui aurait lu le compte avant un nouveau départ.
Les transitions de résultat restent permises après révocation pour enregistrer
une réception et conserver la possibilité de réconciliation.

prepare_account_erasure verrouille le compte, refuse les Command executing/unknown,
Inbox sending/unknown et les envois sent dont localComplete est faux, puis
désactive le compte. Cette fonction est réservée à la préparation d’effacement ;
la révocation administrative directe reste possible même en cas d’opération
incertaine. Aucun trigger global ne bloque cette révocation. Aucun effacement de
journal append-only ni suppression de données n’est encore implémenté.

Huit tests PostgreSQL couvrent refus des nouveaux départs, conservation des
résultats inconnus, propriétaire distinct, course désactivation/exécution avec
observation d’un vrai verrou SQL, ancien snapshot, Inbox et révocation immédiate.
Ils doivent encore être exécutés par la CI de cette migration. La prochaine
étape est d’appeler cette préparation dans la transaction créant le travail
d’effacement durable et invalidant sessions/OAuth state, avant la purge et la
révocation fournisseur avec reprise après crash.
