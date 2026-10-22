# Unique Art Visuel Studio

## Lancer le site avec son backend

Le site ne doit plus être ouvert directement avec `file://` pour utiliser les comptes, discussions, commandes et publications partagées.

1. Installer Node.js LTS depuis https://nodejs.org/.
2. Copier `.env.example` vers `.env`, puis définir une clé `ADMIN_API_KEY` longue et aléatoire (elle sert de mot de passe administrateur). Il n’existe pas de mot de passe par défaut. Pour la générer, exécutez `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` et conservez-la dans un gestionnaire de mots de passe. Le serveur charge `.env` automatiquement ; ne le publiez jamais.
3. Ouvrir PowerShell dans ce dossier et lancer :

```powershell
npm start
```

4. Sur l’ordinateur, ouvrir http://localhost:3000.

### Version de référence et aperçu local

La version à conserver est celle du dossier contenant `server.js`, `package.json`, `index.html`, `script.js`, `style.css` et `assets/`. Le lien `http://127.0.0.1:5501/index.html` actuellement ouvert par l’extension Live Server affiche bien le `index.html` de ce dossier, mais cette extension ne lance pas l’API. Elle sert aussi des fichiers qui ne sont pas destinés au site (notamment `.git/config` et `data/store.json`). Arrêtez Live Server et utilisez `Lancer le site.bat` ou `npm start`, puis ouvrez `http://localhost:3000` : le serveur du site ne publie que les pages et ressources autorisées, et les API fonctionnent.

L’ancienne page isolée a été archivée hors du dépôt ; elle ne contenait pas ses dépendances `style.css`, `script.js` et `assets/`. Ne l’utilisez pas comme version de référence.

### Ouvrir le site sur un téléphone ou une tablette

Le fichier `index.html` ne peut pas fournir seul les comptes, formulaires et échanges du site. Lancez plutôt `Lancer le site.bat` sur l’ordinateur, puis :

1. Connectez l’ordinateur et le téléphone au même réseau Wi-Fi.
2. Dans la fenêtre du serveur, relevez l’adresse réseau affichée, par exemple `http://192.168.1.20:3000`, puis saisissez-la dans le navigateur du téléphone. L’adresse réelle dépend de votre réseau.
3. Si Windows affiche une demande de pare-feu, autorisez Node.js sur les réseaux privés uniquement.
4. Gardez l’ordinateur allumé et la fenêtre du serveur ouverte pendant l’utilisation.

Cette méthode fonctionne sur le même réseau local. Pour ouvrir le site depuis n’importe quel réseau, il faut le déployer sur une adresse publique HTTPS ; l’adresse de production et les services de courriel et de paiement doivent alors être configurés.

En local, les données sont enregistrées dans `data/store.json`, qui n’est pas servi au public. Le serveur ne publie que les pages du site et les images autorisées sous `assets/`. Il expose notamment :

- `GET /api/health`
- `GET /api/creations` et `GET /api/actualites` (publics) ; leurs routes `POST` nécessitent une session administrateur.
- `GET|POST /api/discussions`
- `DELETE /api/discussions/:id`
- `POST /api/discussions/:id/reply`
- `POST /api/discussions/:id/block`
- `POST /api/clients`
- `POST /api/login` (session client sécurisée par cookie `HttpOnly`)
- `GET|POST|DELETE /api/admin/session` (session administrateur sécurisée par cookie `HttpOnly`)
- `GET|DELETE /api/client/session`
- `GET /api/client/orders` et `GET /api/client/discussions` (données privées du compte connecté)
- `POST /api/orders` (création de commande et initialisation CinetPay)
- `POST /api/payments/notify` (notification vérifiée auprès de CinetPay)
- `GET /api/payments/status?transaction_id=…` (confirmation de commande)
- `POST /api/contact` (envoi de courriels via Resend)
- `GET /api/admin/inbox` (boîte de réception, accès administrateur)
- `POST /api/webhooks/resend` (réception des courriels entrants)
- `POST /api/translate`
- `POST /api/assistant` (assistant éditorial, après configuration d’un fournisseur compatible OpenAI)

### Base documentaire de l’assistant éditorial

L’assistant utilise une recherche augmentée par récupération (RAG) : le serveur découpe les manuscrits indexés en passages, retrouve les extraits les plus proches de la question et transmet ces sources au modèle. Ce n’est pas un entraînement ni une modification des paramètres du modèle. Il peut citer le titre et la page des passages PDF retrouvés, et doit signaler lorsque la base ne permet pas de vérifier une réponse.

Pour alimenter le corpus, ouvrez une session administrateur, choisissez **Ajouter une création**, puis utilisez la section **Base de lecture de l’assistant IA**. Importez un manuscrit PDF contenant du texte sélectionnable, ou un fichier UTF-8 TXT/Markdown. L’import est privé : le manuscrit n’est pas publié dans le portfolio. Les documents sont enregistrés avec les données applicatives (fichier JSON local ou PostgreSQL), indexés en passages, consultables et supprimables depuis cette même section. Un même titre remplace sa version antérieure. La limite est de 16 Mo par fichier, 3 Mo de texte extrait par œuvre et 20 Mo de corpus total. Les PDF de pages scannées ne sont pas lisibles sans OCR préalable ; extrayez le texte par OCR puis importez-le en TXT/Markdown.

**Aucun manuscrit complet n’est fourni avec le dépôt** : le corpus est donc vide tant que le studio n’a pas importé ses œuvres. Les résumés du site restent disponibles, mais ne remplacent pas les textes sources.

Configurez un fournisseur compatible avec l’API de conversation OpenAI dans `.env` ou dans les variables d’environnement de l’hébergeur :

- `AI_API_URL` : URL complète du point de terminaison `/chat/completions`.
- `AI_API_KEY` : clé secrète du fournisseur (facultative pour Ollama local ; gardez-la côté serveur).
- `AI_MODEL` : identifiant du modèle disponible chez ce fournisseur.

Exemple avec Ollama : installez Ollama, téléchargez le modèle avec `ollama pull qwen2.5:7b`, puis configurez `AI_API_URL=http://127.0.0.1:11434/v1/chat/completions`, `AI_MODEL=qwen2.5:7b` et laissez la clé vide. Ollama doit rester démarré sur l’ordinateur qui héberge le site. Pour Render ou un autre hébergement public, utilisez une URL HTTPS et un fournisseur accessible depuis cet hébergeur. Les manuscrits et l’index sont stockés par le backend. Les questions, l’historique limité et les passages retrouvés sont transmis au fournisseur IA, qui peut appliquer ses propres règles de conservation. Importez uniquement des textes pour lesquels le studio a les droits nécessaires.

Les lecteurs peuvent **terminer et enregistrer** une discussion, puis la retrouver dans l’historique local du même navigateur. Les notes restent dans le stockage local de cet appareil, pas dans le compte client ni dans la base de données du studio ; elles ne se synchronisent donc pas entre appareils. Le bouton **Effacer l’historique** supprime les notes locales. Le navigateur n’enregistre pas plus de 12 discussions et conserve jusqu’à 40 messages par discussion.

Le bouton micro utilise la reconnaissance vocale française de Windows via l’application de bureau **Assistant personnel** (dossier `assistant-windows`). Lancez la version 0.4.1 sur le même ordinateur que le navigateur ; elle ouvre un service local limité à `127.0.0.1`. La dictée reste active jusqu’au second appui, tolère les pauses de 3 à 4 secondes, attend jusqu’à 5 minutes le début de la parole et accepte jusqu’à 8 000 caractères. Le texte reconnu est envoyé automatiquement à l’assistant IA à l’arrêt. L’audio est traité localement par Windows, n’est pas stocké par le site et n’est pas transmis à un prestataire vocal ; seul le texte reconnu est envoyé au fournisseur IA configuré. Autorisez aussi l’accès au réseau local si le navigateur le demande. Le site doit être ouvert en HTTPS ou sur `localhost`. En production, l’origine du site est autorisée par défaut pour `https://unique-art-visuel-studio.onrender.com` ; si le domaine est différent, ajoutez-le à `ASSISTANT_ALLOWED_ORIGINS` (liste séparée par des virgules) dans l’environnement Windows avant de démarrer l’application. La synthèse vocale des réponses reste assurée par le navigateur.

La version portable Windows 0.4.1 est générée avec `npm.cmd --prefix assistant-windows run portable -- --config.directories.output=release-0.4.1-portable --config.electronDist=./node_modules/electron/dist`. Lancez ensuite `assistant-windows/release-0.4.1-portable/win-unpacked/Assistant personnel.exe`. L’installateur NSIS (`npm run dist`) peut nécessiter un environnement Windows autorisé à exécuter ses outils de génération.

## Mise en production

Le parcours de paiement CinetPay est intégré : le serveur fixe les prix, crée la commande, redirige vers le paiement hébergé et confirme le règlement en vérifiant la transaction auprès de CinetPay. L’administration vérifie maintenant son mot de passe côté serveur et utilise un cookie de session `HttpOnly`.

## Hébergement recommandé : Render

Le fichier `render.yaml` prépare le déploiement du site et de son serveur Node sur Render.

1. Créer un dépôt GitHub et y envoyer ce dossier.
2. Sur Render, choisir **New > Blueprint** puis sélectionner le dépôt.
3. Renseigner `ADMIN_API_KEY` dans les variables secrètes Render. Configurez aussi `CLIENT_SESSION_SECRET` avec une valeur aléatoire distincte d’au moins 32 octets ; s’il est absent, le serveur utilise `ADMIN_API_KEY` pour préserver les sessions existantes.
4. Renseigner aussi les identifiants CinetPay et `PUBLIC_BASE_URL` (voir ci-dessous), puis déployer et tester `https://votre-service.onrender.com/api/health`.

Le Blueprint crée aussi une base PostgreSQL et transmet automatiquement sa chaîne de connexion avec `DATABASE_URL`. Les comptes, commandes, discussions, actualités et créations sont conservés après les redéploiements. En local, sans `DATABASE_URL`, le serveur utilise `data/store.json`.

### Activer les paiements CinetPay

Dans les variables secrètes Render, renseignez `CINETPAY_API_KEY` et `CINETPAY_SITE_ID` depuis l’espace marchand CinetPay, puis `PUBLIC_BASE_URL` avec l’adresse publique HTTPS exacte du site (par exemple `https://votre-service.onrender.com`). Configurez également `https://votre-service.onrender.com/api/payments/notify` comme URL de notification dans CinetPay. Les identifiants restent côté serveur ; les prix ne sont jamais acceptés depuis le navigateur. Un paiement n’est marqué comme confirmé qu’après vérification de son identifiant, de son montant et de sa devise auprès de CinetPay. Les moyens disponibles (Mobile Money, carte, opérateurs) dépendent de l’activation du compte marchand.

## Préparation à une forte audience

Le serveur inclut maintenant une limite de débit, une limite de taille des requêtes, des écritures JSON atomiques et des en-têtes de sécurité. Cela protège le prototype contre les erreurs les plus courantes, mais ne suffit pas pour des millions d’utilisateurs.

Avant un lancement massif, il faut impérativement :

- remplacer `data/store.json` par PostgreSQL ou une base managée ;
- stocker les images, PDF et vidéos dans un stockage objet avec CDN, au lieu de les envoyer en base64 dans le JSON ;
- remplacer le limiteur de débit en mémoire par un service partagé adapté à plusieurs instances ;
- ajouter une protection anti-robot aux formulaires de création de compte et de contact ;
- placer Render derrière son autoscaling, un CDN et une protection anti-DDoS ;
- ajouter des files d’attente pour les e-mails, paiements et traitements vidéo ;
- surveiller les erreurs, les temps de réponse et les paiements avec des alertes ;
- tester la charge avant l’ouverture publique.

Le fichier JSON est donc utilisable pour une démonstration ou un petit lancement, mais pas comme base de données pour des millions de comptes.

Le traducteur des échanges prend en charge le français, l’anglais, l’espagnol, le portugais, l’allemand et l’arabe. Il nécessite une connexion internet et dépend d’un service externe de traduction ; pour une disponibilité mondiale garantie, il faudra utiliser un fournisseur de traduction avec quota et contrat de disponibilité.

`GET /api/health` indique si l’envoi d’e-mails, leur réception et CinetPay sont configurés, sans révéler de clé secrète. Tant que les variables correspondantes sont absentes, le site refuse honnêtement les envois et ne prétend pas qu’un paiement est confirmé.

## Envoi et réception des e-mails

Le formulaire de contact envoie les demandes à l’adresse du studio configurée et les archive dans le tableau de bord administrateur. Les réponses aux discussions clients utilisent également Resend. Configurez ces variables secrètes dans Render :

- `RESEND_API_KEY` : clé API Resend.
- `EMAIL_FROM` : adresse d’expédition vérifiée chez Resend, par exemple `Unique Art Studio <contact@votredomaine.com>`.
- `EMAIL_TO` : adresse qui reçoit les demandes du formulaire (facultatif ; par défaut `dieudonnejeannde@gmail.com`).
- `RESEND_WEBHOOK_SECRET` : secret de signature fourni par Resend.
- `CLIENT_SESSION_SECRET` : secret de signature des sessions client ; configurez une valeur aléatoire distincte de `ADMIN_API_KEY`. Si elle est absente, le serveur réutilise la clé administrateur ; en local, sans clé administrateur, une clé temporaire aléatoire est créée au démarrage.

Après confirmation effective d’un paiement, le serveur tente d’envoyer un reçu au client et une alerte au studio. Les envois sont réessayés lors d’une nouvelle vérification du statut si Resend était indisponible.

Pour recevoir les courriels envoyés directement à l’adresse du studio, activez la réception sur un domaine dans Resend puis créez un webhook vers `https://votre-service.onrender.com/api/webhooks/resend`, avec l’événement `email.received`. Copiez son secret de signature dans `RESEND_WEBHOOK_SECRET`. Les messages entrants apparaîtront dans la boîte de réception du tableau de bord. En local, configurez les mêmes variables d’environnement avant `npm start`.
