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
- `GET|PUT /api/client/devices` (inventaire personnel du compte connecté)
- `POST|DELETE /api/client/devices/:id/location` (partage ou effacement de la dernière position d’un appareil de l’inventaire, compte connecté requis)
- `GET|POST /api/client/location-shares` et `DELETE /api/client/location-shares/:id` (création, suivi et révocation des invitations à usage unique du compte connecté)
- `POST /api/location-shares/accept` (acceptation volontaire d’une invitation ; crée une session limitée sans ouvrir le compte du propriétaire)
- `POST|DELETE /api/location-shares/position` (envoi ou arrêt d’une session invitée de partage de position)
- `POST /api/password/forgot` et `POST /api/password/reset` (réinitialisation à usage unique, lien valable 30 minutes)
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

Exemple avec Ollama : installez Ollama, téléchargez le modèle avec `ollama pull qwen2.5:7b`, puis configurez `AI_API_URL=http://127.0.0.1:11434/v1/chat/completions`, `AI_MODEL=qwen2.5:7b` et laissez la clé vide. Ollama doit rester démarré sur l’ordinateur qui héberge le site. Pour Railway ou un autre hébergement public, utilisez une URL HTTPS et un fournisseur accessible depuis cet hébergeur. Les manuscrits et l’index sont stockés par le backend. Les questions, l’historique limité et les passages retrouvés sont transmis au fournisseur IA, qui peut appliquer ses propres règles de conservation. Importez uniquement des textes pour lesquels le studio a les droits nécessaires.

Les lecteurs peuvent **terminer et enregistrer** une discussion, puis la retrouver dans l’historique local du même navigateur. Les notes restent dans le stockage local de cet appareil, pas dans le compte client ni dans la base de données du studio ; elles ne se synchronisent donc pas entre appareils. Le bouton **Effacer l’historique** supprime les notes locales. Le navigateur n’enregistre pas plus de 12 discussions et conserve jusqu’à 40 messages par discussion.

Le bouton micro utilise l’API de reconnaissance vocale intégrée au navigateur ; aucune application Windows auxiliaire n’est requise. Utilisez un navigateur compatible (notamment Chrome ou Microsoft Edge), ouvrez le site en HTTPS ou sur `localhost`, puis autorisez l’accès au microphone. Appuyez une première fois pour dicter et une seconde fois pour arrêter et envoyer la transcription à l’assistant. Une pause prolongée de cinq minutes arrête l’écoute. Selon le navigateur et son fournisseur, la reconnaissance vocale peut transmettre l’audio à un service externe ; seul le texte reconnu est ensuite envoyé au fournisseur IA configuré pour le site. Informez les lecteurs de ce traitement avant d’activer le micro. La synthèse vocale des réponses reste assurée par le navigateur.

## Assistance appareils

`/assistance-appareils.html` présente une offre d’accompagnement à la prévention et aux démarches officielles en cas de perte. Le formulaire de premier contact demande le nom, l’adresse e-mail et une description générale, puis utilise le point de contact existant `/api/contact`. Il ne demande ni IMEI, ni numéro de série, ni identifiant de compte, ni mot de passe ou code de récupération. Les demandes sont envoyées au studio et archivées dans sa boîte de réception applicative. Avant d’ouvrir ce service au public, définissez et publiez les frais éventuels, délais de réponse et règles de conservation applicables.

Le studio guide le propriétaire ; il ne contourne pas les mots de passe, ne prend pas le contrôle des comptes, ne promet pas de géolocaliser un appareil hors ligne et n’active pas secrètement micro ou caméra. Le propriétaire doit s’authentifier lui-même auprès du fabricant ou de l’opérateur. Aucune intégration ni aucun partenariat Orange n’est présumé par cette page.

## Mise en production

Le parcours de paiement CinetPay est intégré : le serveur fixe les prix, crée la commande, redirige vers le paiement hébergé et confirme le règlement en vérifiant la transaction auprès de CinetPay. L’administration vérifie maintenant son mot de passe côté serveur et utilise un cookie de session `HttpOnly`.

## Déployer le site sur Railway avec Supabase

Supabase héberge la base PostgreSQL ; le serveur Node.js du site doit tourner sur un hébergeur Node comme Railway. Le dépôt contient déjà la commande `npm start` et Railway fournit automatiquement le port `PORT`.

1. Dans Railway, créez un projet avec **Deploy from GitHub repo** et sélectionnez ce dépôt.
2. Dans **Variables** du service, ajoutez `NODE_ENV=production`, `ADMIN_API_KEY`, `CLIENT_SESSION_SECRET`, `DATABASE_URL` et `PUBLIC_BASE_URL`.
3. Pour `DATABASE_URL`, ouvrez votre projet Supabase, cliquez sur **Connect**, puis choisissez la chaîne PostgreSQL du **Session pooler**. Remplacez le mot de passe indicatif par le mot de passe de la base. Si celui-ci contient des caractères spéciaux, encodez-les pour une URL. Gardez cette chaîne secrète et ne la mettez jamais dans le code.
4. Générez `ADMIN_API_KEY` et `CLIENT_SESSION_SECRET` comme deux valeurs aléatoires distinctes d’au moins 32 octets. Par exemple, exécutez deux fois `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"` et copiez chaque résultat directement dans la variable correspondante de Railway.
5. Dans Railway, créez un domaine public HTTPS pour le service, puis définissez `PUBLIC_BASE_URL` sur cette adresse exacte, sans barre oblique finale.
6. Dans les réglages de déploiement Railway, définissez le chemin de vérification de santé sur `/api/health`, puis déployez. Vérifiez que `https://votre-domaine/api/health` renvoie un JSON avec `"ok": true`.

Au premier démarrage, le serveur crée la table `app_store` dans la base Supabase si elle n’existe pas encore. Dans le tableau de bord Supabase, utilisez **Connect** pour récupérer la chaîne de connexion ; n’utilisez pas la clé API publique à la place de `DATABASE_URL`. Sans `DATABASE_URL`, le serveur utilise un fichier local, qui n’est pas adapté à la conservation des données sur un hébergement éphémère.

Les services optionnels doivent eux aussi être configurés comme variables Railway : `CINETPAY_API_KEY` et `CINETPAY_SITE_ID` pour les paiements ; `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_TO` et `RESEND_WEBHOOK_SECRET` pour les e-mails ; `AI_API_URL`, `AI_API_KEY` et `AI_MODEL` pour l’assistant IA. N’ajoutez que les fournisseurs réellement utilisés.

### Activer les paiements CinetPay

Dans les variables Railway, renseignez `CINETPAY_API_KEY` et `CINETPAY_SITE_ID` depuis l’espace marchand CinetPay, puis `PUBLIC_BASE_URL` avec l’adresse publique HTTPS exacte du site. Configurez également `<PUBLIC_BASE_URL>/api/payments/notify` comme URL de notification dans CinetPay. Les identifiants restent côté serveur ; les prix ne sont jamais acceptés depuis le navigateur. Un paiement n’est marqué comme confirmé qu’après vérification de son identifiant, de son montant et de sa devise auprès de CinetPay. Les moyens disponibles (Mobile Money, carte, opérateurs) dépendent de l’activation du compte marchand.

## Préparation à une forte audience

Le serveur inclut maintenant une limite de débit, une limite de taille des requêtes, des écritures JSON atomiques et des en-têtes de sécurité. Cela protège le prototype contre les erreurs les plus courantes, mais ne suffit pas pour des millions d’utilisateurs.

Avant un lancement massif, il faut impérativement :

- remplacer `data/store.json` par PostgreSQL ou une base managée ;
- stocker les images, PDF et vidéos dans un stockage objet avec CDN, au lieu de les envoyer en base64 dans le JSON ;
- remplacer le limiteur de débit en mémoire par un service partagé adapté à plusieurs instances ;
- ajouter une protection anti-robot aux formulaires de création de compte et de contact ;
- placer l’hébergement derrière son autoscaling, un CDN et une protection anti-DDoS ;
- ajouter des files d’attente pour les e-mails, paiements et traitements vidéo ;
- surveiller les erreurs, les temps de réponse et les paiements avec des alertes ;
- tester la charge avant l’ouverture publique.

Le fichier JSON est donc utilisable pour une démonstration ou un petit lancement, mais pas comme base de données pour des millions de comptes.

Le traducteur des échanges prend en charge le français, l’anglais, l’espagnol, le portugais, l’allemand et l’arabe. Il nécessite une connexion internet et dépend d’un service externe de traduction ; pour une disponibilité mondiale garantie, il faudra utiliser un fournisseur de traduction avec quota et contrat de disponibilité.

`GET /api/health` indique si l’envoi d’e-mails, leur réception et CinetPay sont configurés, sans révéler de clé secrète. Tant que les variables correspondantes sont absentes, le site refuse honnêtement les envois et ne prétend pas qu’un paiement est confirmé.

## Envoi et réception des e-mails

Le formulaire de contact envoie les demandes à l’adresse du studio configurée et les archive dans le tableau de bord administrateur. Les réponses aux discussions clients utilisent également Resend. Configurez ces variables secrètes dans Railway :

- `RESEND_API_KEY` : clé API Resend.
- `EMAIL_FROM` : adresse d’expédition vérifiée chez Resend, par exemple `Unique Art Studio <contact@votredomaine.com>`.
- `EMAIL_TO` : adresse qui reçoit les demandes du formulaire (facultatif ; par défaut `dieudonnejeannde@gmail.com`).
- `RESEND_WEBHOOK_SECRET` : secret de signature fourni par Resend.
- `CLIENT_SESSION_SECRET` : secret de signature des sessions client ; configurez une valeur aléatoire distincte de `ADMIN_API_KEY`. Si elle est absente, le serveur réutilise la clé administrateur ; en local, sans clé administrateur, une clé temporaire aléatoire est créée au démarrage.
- `PUBLIC_BASE_URL` : URL publique du site, requise pour construire un lien de réinitialisation sûr ; utilisez l’URL HTTPS exacte en production.

Après confirmation effective d’un paiement, le serveur tente d’envoyer un reçu au client et une alerte au studio. Les envois sont réessayés lors d’une nouvelle vérification du statut si Resend était indisponible.

L’espace appareils permet de demander un lien de réinitialisation de mot de passe par e-mail. Les demandes ne révèlent pas si l’adresse correspond à un compte ; les liens sont à usage unique, expirent après 30 minutes et sont limités à cinq demandes par adresse réseau et par instance du serveur sur 15 minutes. Une réinitialisation invalide les sessions client déjà ouvertes. Cette fonctionnalité nécessite `RESEND_API_KEY`, `EMAIL_FROM` et `PUBLIC_BASE_URL` correctement configurés ; le champ `providers.passwordRecovery` de `/api/health` indique si ces paramètres sont présents. Sinon, l’API signale que la récupération n’est pas disponible.

Pour recevoir les courriels envoyés directement à l’adresse du studio, activez la réception sur un domaine dans Resend puis créez un webhook vers `<PUBLIC_BASE_URL>/api/webhooks/resend`, avec l’événement `email.received`. Copiez son secret de signature dans `RESEND_WEBHOOK_SECRET`. Les messages entrants apparaîtront dans la boîte de réception du tableau de bord. En local, configurez les mêmes variables d’environnement avant `npm start`.

## Espace « Mes appareils »

La page `/appareils.html` permet de conserver un inventaire personnel (type d’appareil, système, numéro de série facultatif et indice de compte), de le marquer comme perdu et d’ouvrir le service officiel du fabricant. Sans connexion, l’inventaire reste dans le navigateur. Après connexion au compte client, il est synchronisé avec le serveur et peut être consulté depuis un autre appareil ; la fusion des données locales dans le compte demande une confirmation explicite. La page inclut la récupération de compte par e-mail lorsque Resend et `PUBLIC_BASE_URL` sont configurés. Les utilisateurs peuvent exporter ou importer une sauvegarde JSON. Ne saisissez jamais de mot de passe, de code de vérification ou de récupération dans l’inventaire.

Pour une démonstration avec un testeur, le propriétaire se connecte à `/appareils.html`, ajoute un appareil d’essai à son inventaire, crée une invitation et transmet son lien privé. Le lien expire après 15 minutes et ne peut être accepté qu’une fois. Le testeur n’a pas besoin de compte ni du mot de passe du propriétaire : il ouvre le lien HTTPS, lit les informations, confirme son accord et autorise la géolocalisation du navigateur. La position est associée à l’appareil choisi par le propriétaire dans son inventaire. Le propriétaire voit la dernière position et peut révoquer le partage depuis son compte ; le testeur peut l’arrêter depuis sa page. La session invitée expire au plus tard après une heure. Les positions sont envoyées au plus une fois toutes les 30 secondes tant que la page reste visible ; la dernière position demeure dans l’inventaire jusqu’à son effacement ou la suppression de l’appareil. Une invitation en attente ou un partage actif empêche la création d’une deuxième invitation pour le même appareil.

Retrouve n’envoie pas lui-même les coordonnées à Google, mais le navigateur ou le système peut utiliser son propre fournisseur de géolocalisation. Le lien cartographique ouvre OpenStreetMap ; les coordonnées ne lui sont transmises qu’en ouvrant ce lien.

Ce prototype ne retrouve pas un appareil déjà égaré, éteint, hors ligne, réinitialisé ou dont la page est fermée ; il n’exécute aucun suivi en arrière-plan. Il ne prouve pas l’identité physique de l’appareil désigné dans l’inventaire : activez le partage uniquement sur vos propres appareils ou avec le consentement explicite de leur propriétaire. Pour la localisation d’un appareil perdu, les fonctions natives du fabricant ou une future application mobile installée et autorisée restent nécessaires. Le démonstrateur n’active ni sonnerie, ni micro, ni caméra à distance.
