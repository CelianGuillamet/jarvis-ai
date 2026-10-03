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

## Vérifications et travail restant

Les tests PostgreSQL couvrent une nouvelle instance du service, l’isolation des conversations et curseurs, la pagination avec dates identiques et insertion récente, les états interrompus et les contraintes SQL. Les tests web couvrent la projection, les confirmations expirées ou terminées, la pagination du store, une réponse tardive après réinitialisation, les erreurs de chargement et le résultat reçu malgré une panne de sauvegarde.

JAR-026 reste en cours : la séparation entre lecture du status et rafraîchissement des fournisseurs, ainsi que le cache borné associé, doivent encore être implémentés et vérifiés avant la fusion.
