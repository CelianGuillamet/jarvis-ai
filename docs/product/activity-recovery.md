# Activité et récupération

Activité lit le journal durable du compte et de la conversation. L’API renvoie au maximum une page bornée et vérifie que le curseur appartient à cette même conversation ; elle n’expose ni arguments privés ni prose du modèle. Les états affichés viennent des commandes enregistrées. Les simulations sont identifiées explicitement.

Une issue inconnue invite à vérifier le service concerné, sans proposer de relance aveugle. Les confirmations se relisent dans le chat, les réponses Inbox dans la boîte de réception. Une compensation enregistrée indique qu’un inverse local existe ; le chat doit encore vérifier la dernière action et les éléments avant de proposer et confirmer le retour arrière. Cette indication ne promet pas qu’un ancien inverse reste applicable.

Une panne réseau ou réponse serveur 5xx affiche une seule voie de reconnexion dans l’application. Les notifications génériques de danger sont supprimées pendant cette panne. La reconnexion relit uniquement le statut : elle ne rejoue aucune mutation. Le contenu des écrans reste monté et inaccessible pendant la panne, puis réapparaît après une lecture réussie, préservant les formulaires.

Les écrans distinguent les lectures en cours, les données indisponibles et les collections réellement vides. Google déconnecté est un état propre à ses fonctions : les tâches, notes, conversations et leur activité locale restent utilisables sans Google.

Validation : tests unitaires du journal/ownership/curseur/erreur, tests DOM de résultats durables, pagination, unavailable versus vide, panne unique et reconnexion sans remplacement du contenu ; tests PostgreSQL du journal après redémarrage et pagination sans doublons. Aucun appel fournisseur réel ni déploiement.
