# Historique des conversations

## Persistance et isolation

Chaque requête chat ou confirmation enregistre son entrée dans `ConversationTurn` avant de démarrer son traitement. La réponse validée est conservée telle qu’elle a été rendue. Les clés étrangères composites lient chaque échange à son propriétaire et sa conversation ; une référence de commande doit appartenir au même propriétaire et à la même conversation.

`GET /jarvis/history` exige une session authentifiée. Il résout l’alias de conversation pour ce compte et refuse les conversations et curseurs d’un autre compte. La limite par page est de 1 à 50 échanges, avec 20 par défaut. Le curseur utilise `(createdAt, id)` : les dates identiques ne perdent pas d’échanges et les insertions récentes ne déplacent pas les pages précédentes. Une page est rendue dans l’ordre chronologique, avec `nextCursor` et `fetchedAt`.

La réponse historique conserve l’état connu à cet instant. Le champ `command` indique séparément l’état courant de la commande et `pendingCommand` désigne uniquement une confirmation encore en attente et non expirée. Une ancienne réponse proposant une confirmation ne suffit donc pas à réactiver ses contrôles.

## Réponses manquantes

Les états `started` et `failed` décrivent l’enregistrement de la requête, pas l’effet métier. Une interruption peut survenir après un effet réel. Le chat l’indique sans proposer de relance automatique.

Si la sauvegarde échoue après réception d’un résultat, le serveur renvoie ce résultat avec `meta.historySaved=false`. L’interface conserve le résultat et avertit de ne pas renouveler une action déjà réalisée pour cette seule raison.

## Restauration dans le navigateur

Le chat charge 20 échanges et permet de charger les pages précédentes à la demande. Les identifiants de messages dérivent de l’échange persistant, ce qui évite les doublons lors de la restauration. Les confirmations ont un libellé humain plutôt qu’un identifiant technique. Un chargement échoué reste visible avec une action de reprise ; il ne représente jamais une conversation vide réussie.

Une réinitialisation du store invalide les réponses encore en vol. La déconnexion recharge l’application et efface les données des stores du compte précédent. Le client valide les requêtes et les réponses avec les contrats canoniques partagés.

## Lecture du tableau de bord et rafraîchissement

`GET /jarvis/status` consulte les données locales et le cache. Il ne lance aucun modèle ni transport fournisseur, y compris pour afficher une confirmation : sa prévisualisation provient de la réponse persistée, liée à la commande exacte. Les commandes antérieures à cette migration restent décrites par leur enveloppe figée, sans reconstruire leur prévisualisation à partir du fournisseur.

`POST /jarvis/status/refresh` rafraîchit explicitement les emails et le calendrier. Il exige la session propriétaire et une origine autorisée. Le bouton Sync du tableau de bord utilise cette route ; le montage des vues conserve une lecture passive. Aucun modèle n’est appelé par l’une ou l’autre route.

Chaque cache fournisseur conserve au maximum 100 conversations et autorise au maximum 20 lectures simultanées. Les rafraîchissements concurrents d’une même entrée sont partagés. Les données expirent après 60 secondes ; leur récupération est bornée à 5 emails et 12 événements. Le cache est isolé par propriétaire et conversation et invalidé si le jour, l’intégration Google, les scopes ou la version des credentials changent. Une modification détectée pendant le transport retire aussi le résultat avant son retour au navigateur.

Le status expose `fetchedAt` et `expiresAt` pour chaque fournisseur. Sans résultat frais, il indique `not_refreshed` et conserve des métriques nulles. Une panne fournisseur garde son état d’indisponibilité, sans se transformer en collection vide réussie. Les données du cache ne survivent volontairement pas au redémarrage ; les échanges et références de commande sont persistants.

## Vérifications et limites

Les tests PostgreSQL couvrent une nouvelle instance du service, l’isolation des conversations et curseurs, la pagination avec dates identiques et insertion récente, les états interrompus et les contraintes SQL. Les tests web couvrent la projection, les confirmations expirées ou terminées, la pagination du store, une réponse tardive après réinitialisation, les erreurs de chargement et le résultat reçu malgré une panne de sauvegarde.

Les tests de cache couvrent l’expiration, l’isolation, l’éviction, les changements de version, la déduplication, la limite des traitements simultanés et une invalidation pendant le transport. Les tests HTTP vérifient les lectures passives, le rafraîchissement explicite, l’absence d’appel au modèle, les origins et les conversations étrangères. Les tests du service vérifient la prévisualisation persistée et une déconnexion pendant le rafraîchissement.

Les transports de vérification sont des fournisseurs factices ; aucune connexion Google réelle ni déploiement n’a été effectué. Une réponse interrompue demeure une incertitude visible, avec les résultats métier conservés séparément par le journal de commandes. Aucune relance d’effet n’est automatisée.
