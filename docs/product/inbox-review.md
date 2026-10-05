# Revue des réponses Inbox

Chaque réponse passe par une revue explicite du destinataire, de l’objet et du texte. Toute modification du texte invalide cette revue. Le serveur vérifie ces valeurs avant l’envoi et les lie à l’identité de la commande.

Les résultats partiels et inconnus restent visibles. Une réponse déjà envoyée reprend uniquement les étapes restantes ; une issue inconnue interdit un nouvel envoi aveugle.

Le bouton Enregistrer conserve le brouillon dans la base privée, lié au propriétaire, à la conversation et au message. Le contrôle de version refuse l’écrasement d’une sauvegarde concurrente. Fermer ou changer de message exige d’abord d’enregistrer les modifications. Aucun texte de brouillon n’est conservé dans localStorage.

L’historique permet de remettre les messages effectivement archivés dans la boîte de réception. Cette opération restaure le libellé INBOX ; elle ne rétablit pas le statut non lu. Les éléments avec une issue incertaine ne sont pas inclus.

La migration 27 ajoute InboxReplyDraft. Les prochains travaux d’export et de suppression des données personnelles doivent couvrir cette table. Les tests DOM utilisent des fournisseurs simulés, sans envoi réel ni déploiement.
