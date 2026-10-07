# JAR-043 — Préparation de la bêta privée

Préparé le 7 octobre 2026. Ce document prépare l’accueil, le support et la mesure de la bêta. Il **n’autorise aucune invitation** : la décision [JAR-010](../decisions/0001-private-beta-operating-model.md) maintient un fonctionnement local, sans déploiement ni dépense, et la [vérification Google](../security/google-beta-verification.md) (JAR-038) bloque toute invitation externe tant que la route Testing ou l’approbation n’est pas prouvée. Aucun retour utilisateur n’a été collecté ; aucune cible ci-dessous n’est un résultat mesuré.

## Cohorte et cibles

| Élément | Valeur | Statut |
| --- | --- | --- |
| Taille initiale | 5 personnes invitées individuellement | Hypothèse de planification JAR-010, réversible |
| Plafond avant revue | 10 personnes | Recommandation du plan de refonte, pas un engagement |
| Durée d’observation | 14 jours (JAR-045) | Plan de refonte |

Cibles **proposées**, à confirmer par le propriétaire avant la première invitation puis à réviser après observation (le plan prévoit de fixer les cibles définitives après les premiers usages) :

- Activation : au moins 4 personnes sur 5 terminent l’accueil et réalisent une première action utile dans les 24 heures, sans aide.
- Usage répété : au moins 3 personnes sur 5 actives sur 2 jours distincts ou plus pendant les 14 jours.
- Fiabilité : taux de commandes réussies parmi les commandes terminées suivi chaque jour ; tout résultat `unknown` est rapproché avant la revue hebdomadaire.

Conditions d’arrêt **non négociables** (plan, phase 6) : toute fuite entre comptes, tout effet dupliqué inexpliqué ou toute exposition de données sensibles non résolue suspend l’expansion et déclenche la procédure d’incident ci-dessous.

## Accueil

### Côté propriétaire, avant chaque invitation

1. Vérifier que les portes de lancement JAR-042 sont validées, y compris la route Google JAR-038 pour cette personne (ajout comme utilisateur de test si route Testing).
2. Créer l’invitation : `npm --prefix api run account:invite -- invite <adresse>`. Aucun email n’est envoyé par Jarvis ; le propriétaire contacte la personne lui-même.
3. Envoyer le message d’accueil ci-dessous et noter la date d’invitation hors du dépôt.

### Message d’accueil (à adapter)

> Bienvenue dans la bêta privée de Jarvis. Jarvis vous aide à organiser votre journée : tâches et notes, agenda Google, tri de votre boîte Gmail et préparation de réponses que vous relisez avant tout envoi.
>
> 1. Connectez-vous avec le compte Google invité. Cette connexion ne donne pas accès à Gmail ni à l’agenda.
> 2. Choisissez votre fuseau horaire, puis « Enregistrer et commencer ».
> 3. Facultatif : dans Réglages, autorisez Gmail et Google Agenda. Vous pouvez retirer cet accès à tout moment ; vos tâches locales restent disponibles.
> 4. Commencez par une tâche dans Aujourd’hui ou une demande dans Chat.
>
> Jarvis demande toujours votre confirmation avant d’envoyer un email ou de modifier votre agenda. Si un résultat est marqué « à vérifier », ne recommencez pas l’action : consultez Activité.

### Limites connues à communiquer

- Interface en français uniquement.
- Rappels, habitudes, dépenses, budgets, délégation et analyses : reportés après la bêta (refusés par le serveur).
- Suppression définitive d’emails : indisponible ; la corbeille reste possible.
- Recherche web : désactivée.
- Si la route Google Testing est retenue : avertissement « application non vérifiée » à l’autorisation et accès Gmail/Agenda à renouveler tous les 7 jours.
- Aucun envoi automatique : chaque email est relu et confirmé.

## Support

| Rôle | Responsable |
| --- | --- |
| Support et décisions de bêta | Propriétaire du projet (CelianGuillamet) |
| Canal de retour | **À choisir par le propriétaire avant la première invitation** (par exemple un échange direct). Aucun canal n’est inventé ici. |
| Délai de réponse visé | Proposition : un jour ouvré ; immédiat pour un incident de sécurité ou de données |

Le protocole d’entretien de [JAR-028](../design/private-beta-prototype.md#moderated-validation-protocol) sert de base aux retours : pseudonyme, tâche, aide nécessaire, confusion, gravité. Ne stocker aucune information identifiante dans ce dépôt.

## Déconnexion, export et suppression

- **Retirer l’accès Google** : Réglages → « Déconnecter Google ». Pour révoquer aussi côté Google : page Autorisations du compte Google, retirer Jarvis.
- **Exporter ses données** : Réglages → « Télécharger mes données ».
- **Supprimer son compte** : Réglages → « Supprimer mon compte Jarvis » → « Préparer la suppression » → « Confirmer la suppression de mon compte ». Conserver le reçu (« Télécharger mon reçu ») pour suivre la demande sur « Suivre une demande de suppression ».
- **Retirer une personne de la bêta** (propriétaire) : `npm --prefix api run account:invite -- revoke <adresse>` supprime ses sessions et bloque les nouvelles connexions ; ses données restent jusqu’à sa demande de suppression.

Durées de conservation : voir [contrôles des données](../privacy/data-controls-design.md).

## Incidents

| Gravité | Exemples | Action immédiate |
| --- | --- | --- |
| Critique | Données visibles par un autre compte, email envoyé sans confirmation, doublon d’action inexpliqué, fuite de secret | Arrêter l’application ; révoquer les invitations concernées ; suspendre l’expansion ; prévenir les personnes touchées |
| Majeure | Action au résultat `unknown` non rapprochable, échec répété d’un parcours principal | Prévenir la personne ; vérifier Activité et le journal de commandes ; corriger avant nouvelle invitation |
| Mineure | Libellé confus, lenteur ponctuelle | Noter et prioriser à la revue hebdomadaire (JAR-045) |

Procédure : (1) contenir — arrêter le serveur local ou, quand il existera, activer l’interrupteur des mutations (JAR-040) ; (2) établir les faits à partir du journal de commandes et d’Activité, sans copier de contenu privé ; (3) informer les personnes concernées ; (4) corriger avec un test de régression ; (5) consigner la chronologie expurgée et la décision de reprise. Les restaurations suivent [la procédure de sauvegarde](../privacy/backup-restoration.md).

## Métriques

`npm --prefix api run beta:metrics -- [--days 14]` produit un rapport JSON **agrégé**, en lecture seule, à partir des données durables. Il ne contient ni identifiant, ni adresse, ni argument, ni contenu de message. Avec une cohorte de cinq personnes, des agrégats restent réidentifiables : le rapport est réservé au propriétaire et ne doit pas être publié.

| Mesure | Définition | Source |
| --- | --- | --- |
| Invitations | Actives (non révoquées, non expirées) et révoquées | `BetaInvite` |
| Accueil terminé | Comptes avec préférences enregistrées | `User.onboardingCompleted` |
| Première action utile | Comptes ayant au moins une commande `completed` ; médiane en minutes entre création du compte et cette première commande | `CommandTransition` vers `completed` |
| Succès / échec | Commandes de la période par état final : `completed`, `failed`, `unknown`, `cancelled`, `expired`, ou ouvertes ; taux de succès = `completed` / commandes terminées | `Command.state` |
| Usage répété | Comptes actifs, comptes actifs sur 2 jours UTC distincts ou plus, médiane des jours actifs | `Command`, `ConversationTurn` |
| Latence | **Non instrumentée** — à fournir par la surveillance JAR-040 | — |
| Coût par compte | **Non instrumenté** — à fournir avec les quotas et budgets JAR-036 | — |

Le champ `notInstrumented` du rapport rappelle ces deux lacunes. Elles doivent être comblées avant la revue des portes JAR-042.

## Vérifications

- `npm --prefix api test` : 542 tests, dont 3 tests unitaires du calcul (agrégation, cohortes vides, fenêtre inversée).
- `npm --prefix api run test:integration` : 21 suites / 150 tests PostgreSQL, dont `beta-metrics.integration-spec.ts` (schéma réel, absence de contenu privé et d’identifiant dans le rapport).
- Types, lint, format : passés.
- Aucune invitation, aucun message, aucun déploiement ; aucune cible confirmée par le propriétaire à ce jour.
