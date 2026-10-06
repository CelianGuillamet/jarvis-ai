# Suppressions et restauration des sauvegardes

Le journal de suppression est indépendant des dumps PostgreSQL. Chaque demande
admissible est chiffrée et publiée atomiquement avant l’engagement de la transaction
et la réponse202. Une seconde preuve immuable est écrite après la purge locale,
avant la finalisation des révocations. Les fichiers ne contiennent ni email, ni
contenu utilisateur, ni credential : seulement les identifiants opaques, le hash du
reçu et les dates nécessaires au rejeu.

## Stockage et clés

Configurer PRIVACY_LEDGER_DIR sur un stockage persistant séparé du chemin de
restauration de la base. Le répertoire doit exister en production, appartenir au
processus et avoir le mode0700 ; les fichiers ont le mode0600. Une absence ou une
corruption bloque le démarrage, plutôt que recréer silencieusement un journal vide.
Ne pas remplacer ce répertoire par sa copie issue d’une ancienne sauvegarde.

Par défaut, la clé est dérivée de AUTH_SECRET avec un domaine distinct. Pour une
rotation, PRIVACY_LEDGER_KEYS/PRIVACY_LEDGER_ACTIVE_KEY doivent conserver les
anciennes clés de déchiffrement jusqu’au retrait des sauvegardes concernées. Conserver
les clés séparément de la base. Aucun secret n’est imprimé par la validation.

## Procédure de restauration

1. Arrêter toutes les instances de l’application et les workers.
2. Vérifier la date du dump : les sauvegardes opérateur doivent expirer sous30jours.
   L’application ne gère pas elle-même l’effacement des dumps externes.
3. Restaurer uniquement la base et ses migrations compatibles ; conserver le journal
   indépendant le plus récent et ses clés.
4. Démarrer l’application : le rejeu est attendu avant l’ouverture des listeners,
   même si le traitement automatique est en pause. Les comptes retrouvés dans le
   journal sont désactivés, leurs sessions supprimées et leurs invitations révoquées.
5. Les données restaurées de ces comptes sont mises en file pour une nouvelle purge,
   sans réutiliser une ancienne fin de travail. Un autre compte reste inchangé.
   Les opérations restaurées au résultat inconnu restent conservées et demandent une
   réconciliation ; le rejeu ne leur invente pas un résultat.
6. Vérifier les journaux d’exploitation et les résultats avant de rouvrir l’accès.

Le champ retainedUntil est une date minimale de réexamen, pas une permission de
supprimer aveuglément le journal. Les identifiants chiffrés de protection restent
jusqu’à confirmation par l’opérateur que les sauvegardes susceptibles de réintroduire
le compte ont été retirées. Le suivi utilisateur expire après7jours ; les credentials
restant à révoquer expirent également, indépendamment de cette protection minimale.

Une panne SQL après publication d’une intention peut laisser une intention durable
sans ligne de travail. Elle reste une demande explicitement confirmée par son auteur ;
le rejeu doit la reprendre. Une panne du stockage avant publication annule l’admission
SQL et ne doit ni désactiver le compte ni révoquer son invitation.

## Vérification en cours

Les tests natifs de fichiers couvrent écritures concurrentes, chiffrement,
immutabilité, falsification, permissions et rotation de clés. Les nouveaux tests
PostgreSQL simulent le retour d’anciennes lignes/sessions avec disparition du tombstone
SQL, puis vérifient désactivation, nouvelle purge, isolation et idempotence. Ils
couvrent également l’annulation d’admission si le journal est indisponible et la
préservation d’une exécution non résolue. Leur CI doit encore être vérifiée.

Cette preuve ciblée ne prétend pas effectuer une restauration de production ni une
répétition complète pg_dump/pg_restore : cette répétition appartient à JAR-041.
