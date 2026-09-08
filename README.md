# Unique Art Visuel Studio

## Lancer le site avec son backend

Le site ne doit plus être ouvert directement avec `file://` pour utiliser les comptes, discussions, commandes et publications partagées.

1. Installer Node.js LTS depuis https://nodejs.org/.
2. Ouvrir PowerShell dans ce dossier.
3. Lancer :

```powershell
npm start
```

4. Ouvrir http://localhost:3000.

Les données sont enregistrées dans `data/store.json`. Le serveur expose notamment :

- `GET /api/health`
- `GET|POST /api/creations`
- `GET|POST /api/actualites`
- `GET|POST /api/discussions`
- `DELETE /api/discussions/:id`
- `POST /api/discussions/:id/reply`
- `POST /api/discussions/:id/block`
- `POST /api/clients`
- `POST /api/orders`
- `POST /api/translate`

## Mise en production

Ce backend local est une première base fonctionnelle. Avant une mise en ligne réelle, il faut remplacer le fichier JSON par une base de données, ajouter une authentification de session pour l’administrateur et connecter un vrai prestataire de paiement. Ne pas utiliser le mot de passe administrateur actuellement présent dans le JavaScript pour une production publique.

## Hébergement recommandé : Render

Le fichier `render.yaml` prépare le déploiement du site et de son serveur Node sur Render.

1. Créer un dépôt GitHub et y envoyer ce dossier.
2. Sur Render, choisir **New > Blueprint** puis sélectionner le dépôt.
3. Renseigner `ADMIN_API_KEY` dans les variables secrètes Render.
4. Déployer et tester `https://votre-service.onrender.com/api/health`.

Le Blueprint crée aussi une base PostgreSQL et transmet automatiquement sa chaîne de connexion avec `DATABASE_URL`. Les comptes, commandes, discussions, actualités et créations sont conservés après les redéploiements. En local, sans `DATABASE_URL`, le serveur utilise `data/store.json`.

## Préparation à une forte audience

Le serveur inclut maintenant une limite de débit, une limite de taille des requêtes, des écritures JSON atomiques et des en-têtes de sécurité. Cela protège le prototype contre les erreurs les plus courantes, mais ne suffit pas pour des millions d’utilisateurs.

Avant un lancement massif, il faut impérativement :

- remplacer `data/store.json` par PostgreSQL ou une base managée ;
- stocker les images, PDF et vidéos dans un stockage objet avec CDN, au lieu de les envoyer en base64 dans le JSON ;
- ajouter une authentification serveur avec sessions ou jetons sécurisés ;
- retirer le mot de passe et la clé d’administration présents dans le JavaScript ;
- placer Render derrière son autoscaling, un CDN et une protection anti-DDoS ;
- ajouter des files d’attente pour les e-mails, paiements et traitements vidéo ;
- surveiller les erreurs, les temps de réponse et les paiements avec des alertes ;
- tester la charge avant l’ouverture publique.

Le fichier JSON est donc utilisable pour une démonstration ou un petit lancement, mais pas comme base de données pour des millions de comptes.

Le traducteur des échanges prend en charge le français, l’anglais, l’espagnol, le portugais, l’allemand et l’arabe. Il nécessite une connexion internet et dépend d’un service externe de traduction ; pour une disponibilité mondiale garantie, il faudra utiliser un fournisseur de traduction avec quota et contrat de disponibilité.
