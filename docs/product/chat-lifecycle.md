# Cycle de vie du chat et du compte

Stop arrête la réception HTTP et invalide la génération de la requête. Une réponse tardive ne réapparaît pas et ne modifie pas une requête suivante. Cet arrêt ne garantit pas l’annulation d’une commande déjà transmise : le message affiché invite à vérifier son résultat dans l’historique et l’activité avant toute nouvelle action.

Le signal est transmis aux lectures d’historique, au chat et aux confirmations. Une annulation volontaire conserve AbortError ; une expiration conserve TimeoutError. Reset invalide également les requêtes et efface l’état local. L’historique demeure sur le serveur et se recharge dans un nouveau store.

Lorsqu’AuthGate revérifie une session expirée ou termine la déconnexion, une génération de compte invalide immédiatement les données de chat, statut, Inbox, brouillons en mémoire, préférences et notifications. Les réponses des requêtes précédentes sont ignorées. AuthGate ignore aussi les réponses de vérifications de connexion dépassées.

Validation : tests DOM de session expirée/nouveau compte, tests de réponses tardives après Stop/reset/invalidation, historique après rechargement et distinction annulation/expiration. Aucun envoi fournisseur réel ni déploiement.
