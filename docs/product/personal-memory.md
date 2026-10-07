# JAR-049 — Mémoire personnelle explicite

Jarvis ne retient que les faits approuvés par le propriétaire du compte. Aucun fait n’est déduit d’une conversation.

## Comportement

- **Retenir** : « Retiens que… » (ou « Souviens-toi que… », « Mémorise que… ») propose `memory.remember`. Rien n’est écrit avant la confirmation ; l’aperçu montre le fait, sa portée (le compte) et les faits proches déjà retenus pour repérer une contradiction. Réglages → Mémoire personnelle permet aussi d’ajouter un fait directement.
- **Consulter** : « Que sais-tu de moi ? » liste les faits avec leur provenance (chat ou Réglages) et leur date. Réglages affiche la même liste.
- **Corriger / oublier** : dans Réglages (oubli confirmé en deux temps), ou « Oublie #N » / « Oublie que… » dans le chat. L’oubli par chat est résolu avant la confirmation : l’identifiant et le texte exact sont figés dans l’action approuvée, et l’exécution échoue si le fait a changé entre-temps.
- **Contexte du modèle** : au plus 8 faits et environ 1 200 caractères, triés par mots communs avec la demande puis par date. Chaque fait est cité comme chaîne JSON sous un en-tête qui le déclare comme donnée, jamais comme instruction. Un fait non modifié depuis 180 jours est marqué « ancien : à confirmer ».

## Stockage et confidentialité

- Table `PersonalFact` liée au compte (`ownerId`, clé étrangère vers `User`), texte de 1 à 280 caractères sans caractère de contrôle, provenance `chat` ou `settings` (contraintes SQL), 200 faits au maximum par compte.
- Accès toujours filtré par propriétaire (`ownedDomainClient`) ; routes `/account/memory` derrière la session, l’invitation et le contrôle d’origine.
- Intégrée à JAR-039 : inventaire, export (`PersonalFact`), purge à la suppression du compte et blocage des écritures après une demande de suppression (déclencheur `guard_active_owner_write`).
- Aucun cache serveur des faits : chaque contexte relit la base. Les listes « #N » en mémoire vive sont invalidées à chaque ajout, correction ou oubli.

## Ancienne mémoire inférée

L’extraction automatique (`rememberFromUserText`) et l’outil `memory.set` sont supprimés. Les lignes `JarvisMemoryFact` existantes ne sont plus injectées dans le contexte du modèle ni modifiées ; elles restent exportables et supprimées avec le compte (JAR-039). La météo peut encore y lire une ville par défaut déjà enregistrée.

## Vérifications

- API : 549 tests unitaires (dont outils mémoire, contexte borné/injection, routage chat sans inférence), 22 suites / 155 tests d’intégration PostgreSQL (persistance après redémarrage, oubli retiré du contexte, isolation entre comptes en service et en HTTP, contraintes SQL, export, blocage après demande de suppression, purge).
- Web : 111 tests (dont le composant Réglages : provenance, ajout, correction, oubli confirmé), types, lint, build.
- Navigateur (banc local fictif, Playwright) : ajout puis oubli dans Réglages ; axe-core 0 violation WCAG A/AA et aucun débordement à 390 et 1440 px, thèmes sombre et clair.
- Non vérifié : comportement d’un modèle réel face à un fait contenant des instructions (le test couvre la construction du contexte, pas l’obéissance du modèle).
