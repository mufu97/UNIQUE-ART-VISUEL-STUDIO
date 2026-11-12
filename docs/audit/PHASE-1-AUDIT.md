# PHASE 1 — Audit intégral du projet existant

**Projet :** UNIQUE ART VISUEL STUDIO — site-application
**Date de l'audit :** 12 novembre 2026
**Branche auditée :** `claude/gracious-heisenberg-ai842g` (identique à `main`, commit `9f8210f`)
**Portée :** lecture de l'intégralité des sources, exécution des tests, audit des dépendances, analyse de l'historique Git, lancement local et captures d'écran (bureau 1440 px et iPhone 13), tests d'intrusion ciblés sur l'API locale.
**Aucune modification du code n'a été faite pendant cette phase.**

---

## 1. Synthèse exécutive

Le projet n'est **pas une simple vitrine** : il possède déjà un vrai backend Node.js (≈ 2 500 lignes) avec comptes clients, sessions signées, administration protégée côté serveur, paiement CinetPay vérifié, envoi d'e-mails Resend, un premier assistant IA de type RAG (recherche lexicale) et une suite de tests qui passe. Plusieurs choix de sécurité sont bons et doivent être conservés.

En revanche, il ne peut pas devenir la plateforme décrite dans le cahier des charges sans une refonte structurelle, pour quatre raisons majeures :

1. **Stockage non viable** : toute la base (clients, commandes, images et vidéos en base64, manuscrits) tient dans **une seule ligne JSON** réécrite intégralement à chaque modification et relue à chaque requête.
2. **Faille de confidentialité confirmée** : n'importe qui peut lire les demandes et commandes d'une autre personne en créant un compte avec son adresse e-mail (aucune vérification d'adresse).
3. **Fonctions commerciales absentes** : pas de librairie numérique (pas de catalogue de livres, de panier, de téléchargement sécurisé), pas de devis avec pièces jointes ni de suivi, pas de gestion complète des créations (ni modification ni suppression).
4. **Identité visuelle non conforme** : la charte actuelle est rose/corail/sarcelle, pas noir et or, avec des défauts de contraste qui rendent le titre principal et la navigation illisibles en thème sombre.

**Recommandation :** conserver Node.js, la logique de sécurité, l'intégration CinetPay, Resend et l'extraction PDF ; remplacer la couche de données (PostgreSQL relationnel + stockage objet privé + pgvector) ; découper le monolithe en modules ; reconstruire le frontend en pages distinctes avec URLs propres et la charte noir et or.

---

## 2. Inventaire du projet

| Fichier | Lignes | Rôle |
|---|---:|---|
| `server.js` | 2 484 | Serveur HTTP natif (sans framework) : API complète + service des fichiers statiques |
| `pdf-extractor.js` | 58 | Processus isolé d'extraction du texte PDF (`pdf-parse`) |
| `index.html` | 1 100 | Page unique contenant **toutes** les sections publiques, l'espace client et le tableau de bord admin |
| `script.js` | 3 248 | Toute la logique frontend (galerie, boutique, assistant, dictée, admin, compte…) |
| `style.css` | 3 599 | Feuille de style unique (22 media queries) |
| `appareils.html/.js/.css` | 1 447 | Service « Retrouve » : inventaire d'appareils et partage de géolocalisation |
| `assistance-appareils.html/.js/.css` | 263 | Offre d'assistance en cas de perte d'appareil |
| `mentions-legales.html`, `confidentialite.html`, `conditions-utilisation.html` | 85 | Projets de pages juridiques (champs à compléter) |
| `tests/api.test.js` | 224 | 14 tests de bout en bout de l'API |
| `render.yaml` | 46 | Blueprint de déploiement Render (service web + PostgreSQL gratuit) |
| `.env.example` | 24 | Variables d'environnement documentées |
| `README.md` | 157 | Documentation (lancement local, Railway + Supabase, CinetPay, Resend, IA) |
| `Lancer le site.bat` | 17 | Lanceur Windows |
| `assets/` | ~4,3 Mo | Logo, emblème, QR code boutique, portraits, 4 études de portrait, 4 SVG génériques |

**Technologies :** Node.js ≥ 20 (testé avec 22), module `http` natif, `pg` 8, `pdf-parse` 1.1. Aucun framework, aucun outil de build, aucun bundler. HTML/CSS/JS sans dépendance.

**Résultats de vérification :**

- `npm test` : **14/14 tests réussis**.
- `npm audit --omit=dev` : **0 vulnérabilité**.
- Historique Git analysé : **aucune clé secrète** n'a été commitée. `.env` et `data/store.json` sont bien ignorés.

---

## 3. Fonctionnalités : état réel

### 3.1 Opérationnelles (à conserver)

| Fonction | Constat |
|---|---|
| Création de compte et connexion | Mot de passe haché en **scrypt** avec sel, comparaison à temps constant, migration automatique des anciennes empreintes SHA-256. |
| Session client | Jeton signé HMAC-SHA256, cookie `HttpOnly`, `SameSite=Lax`, `Secure` en production, invalidation par `sessionVersion`. |
| Récupération du mot de passe | Jeton aléatoire à usage unique stocké sous forme d'empreinte, expiration 30 min, réponse neutre (ne révèle pas l'existence du compte), limite de 5 demandes / 15 min. |
| Administration | Mot de passe vérifié **côté serveur** (`ADMIN_API_KEY`), comparaison à temps constant, cookie `HttpOnly` + `SameSite=Strict`. |
| Paiement CinetPay | Prix fixés **côté serveur**, transaction vérifiée auprès de CinetPay (code, statut, **montant et devise**), aucun paiement simulé, URL de paiement contrôlée (`https`, domaine `cinetpay.com`). |
| E-mails Resend | Confirmation de compte, réponse aux discussions, reçu et alerte de commande, formulaire de contact, réception par webhook avec **vérification de signature Svix**. |
| Assistant IA (base) | Import PDF/TXT/MD, extraction isolée dans un processus séparé avec délais et limites, découpage en passages avec numéros de page, recherche BM25, citations « Titre, page N », refus explicite si aucun passage pertinent, consigne anti-injection. |
| Concurrence | Verrou séquentiel des écritures (pas de perte en cas de requêtes simultanées), écriture atomique du fichier local. |
| Service des fichiers | Liste blanche des fichiers servis (le dossier `data/` et `.git` ne sont jamais exposés), compression gzip, en-têtes de cache. |
| Tests | Suite de tests de bout en bout réelle, sans service externe. |

### 3.2 Incomplètes

| Fonction | Ce qui manque |
|---|---|
| Galerie / créations | Ajout seulement : **ni modification, ni suppression, ni réorganisation**. Pas de fiche détaillée par création, pas d'URL propre. |
| Boutique | 4 « produits » qui sont en réalité des **prestations à prix fixe** (Illustration 30 000, BD 75 000…) alors que la grille tarifaire affiche des **fourchettes** (15 000 à 30 000…). Les CGU signalent déjà cette incohérence (acompte ou prix total ?). Aucun livre vendu sur le site : les livres renvoient à une **boutique externe via QR code**. |
| Espace client | Commandes et échanges visibles ; **pas de** modification du profil, historique des paiements, téléchargements, suivi des devis/projets, messagerie bidirectionnelle, préférences de confidentialité, suppression du compte. |
| Devis | Demande texte via « discussion » ; **pas de pièces jointes**, pas de choix structuré de prestation, pas de statut ni de suivi. |
| Actualités | Publication seulement : ni modification, ni suppression, ni page par article, ni SEO. |
| Tableau de bord admin | Statistiques partielles. « Chiffre prévisionnel » additionne aussi les commandes **échouées ou refusées**. Pas de gestion des utilisateurs, des livres, des tarifs, des projets, des paramètres. Pas de mesure d'audience. |
| Assistant IA | Recherche **lexicale** uniquement (pas d'embeddings sémantiques) ; aucune gestion des droits d'accès par œuvre ; pas de lien avec les achats ; `max_tokens` limité à 350 (trop court pour une analyse approfondie) ; pas de statistiques d'usage ; textes complets stockés dans la même ligne JSON que le reste. |
| Pages juridiques | 3 projets sur les 10 demandés. Pas de CGV, politique cookies, remboursement, licence des œuvres numériques, propriété intellectuelle, conditions de l'IA, paiement/livraison numérique. |
| SEO | Pas de `sitemap.xml`, `robots.txt`, données structurées, page 404, ni d'URL par contenu (une seule page à ancres). `og:image` en chemin relatif (non lu par les réseaux sociaux). |

### 3.3 Défectueuses (bugs constatés)

| # | Défaut | Preuve |
|---|---|---|
| B1 | **Traduction toujours en anglais** : le frontend envoie `targetLanguage`, le serveur lit `language` (défaut `en`). En secours, le navigateur appelle directement MyMemory (contourne le serveur). | `script.js` ≈ l. 2483 vs `server.js` l. 1981 |
| B2 | **Contraste illisible en thème sombre** : « L'art qui donne », les liens de navigation et le bouton « Demander un devis » sont presque invisibles. | Captures bureau et mobile |
| B3 | Deux éléments portent l'`id="nombreCreations"` (HTML invalide, un seul compteur mis à jour). | `index.html` l. 559 et 874 |
| B4 | L'e-mail de réinitialisation parle de « Retrouve » au lieu du studio. | `server.js` l. 693 |
| B5 | Le lien de réinitialisation renvoie vers `appareils.html` et non vers l'espace client du studio. | `server.js` l. 673 |
| B6 | La politique de confidentialité décrit une dictée via une « application Assistant personnel Windows » alors que le code utilise désormais la reconnaissance vocale du navigateur. Information inexacte pour les utilisateurs. | `confidentialite.html` vs `README.md` |
| B7 | Les mentions légales désignent Render ; le README décrit Railway + Supabase. L'hébergement réel n'est pas déterminé. | Deux documents contradictoires |
| B8 | Section « Œuvres & créations » titrée « LA BOUTIQUE DU STUDIO » et section « Boutique » titrée « Prestations » dans le menu : navigation confuse. | `index.html` |

---

## 4. Sécurité : risques identifiés

Classement : **Critique** (exploitable, données personnelles exposées) · **Élevé** · **Moyen** · **Faible**.

| # | Gravité | Risque | Détail |
|---|---|---|---|
| S1 | **Critique — confirmé** | Accès aux données d'un tiers par usurpation d'adresse e-mail | Les commandes et discussions d'un compte sont retrouvées **par adresse e-mail**, et l'inscription ne vérifie pas l'adresse. Test réalisé en local : une personne envoie une demande de devis avec `victime@exemple.ci` ; un tiers crée un compte avec cette adresse et lit immédiatement la demande (contenu, budget). Même mécanisme pour les commandes (nom, produit, statut). |
| S2 | Élevé | Base de données monolithique | Toutes les données (y compris médias en base64 jusqu'à 80 Mo par requête) dans une seule ligne JSONB relue **à chaque requête authentifiée** et réécrite à chaque modification : saturation mémoire, lenteur, risque de corruption globale, sauvegarde/restauration tout ou rien, impossible de faire des droits d'accès par table (RLS). |
| S3 | Élevé | Limitation de débit contournable | L'adresse du client est lue dans `X-Forwarded-For` sans filtrer les proxys de confiance : un attaquant peut changer d'adresse à chaque requête et contourner les limites (connexion, mot de passe oublié, assistant IA donc **coût du fournisseur IA**). |
| S4 | Élevé | Force brute sur les mots de passe | Aucune limite spécifique sur `/api/login` et `/api/admin/session` au-delà de la limite générale (120/min, elle-même contournable — S3). Pas de verrouillage progressif. |
| S5 | Élevé | Administration à clé unique partagée | Un seul secret pour tout l'espace admin, pas de compte nominatif, pas de rôles, pas de 2FA, pas de journal d'audit des actions sensibles. Sessions admin en mémoire : perdues au redémarrage, incompatibles avec plusieurs instances. |
| S6 | Moyen | Injection de contenu dans la galerie | Les champs `image`, `video`, `pdf` d'une création sont insérés **sans échappement ni validation de schéma** dans le HTML (`src`, `href`). Exploitable par quiconque obtient la session admin (ex. lien `javascript:`). |
| S7 | Moyen | Pas de politique CSP ni HSTS | Aucun en-tête `Content-Security-Policy`, `Strict-Transport-Security`, `Permissions-Policy`. Les réponses API n'ont pas `X-Frame-Options`. |
| S8 | Moyen | Protection CSRF implicite seulement | Repose uniquement sur `SameSite`. Pas de vérification de l'en-tête `Origin` ni de jeton CSRF. Le serveur accepte du JSON envoyé avec n'importe quel `Content-Type`. |
| S9 | Moyen | Blocage par nom | Le blocage d'un expéditeur se fait sur le **nom saisi** : contournable en changeant une lettre, et peut bloquer des homonymes innocents. |
| S10 | Moyen | Données de géolocalisation | Le module « Retrouve » collecte des positions GPS de tiers invités. Données particulièrement sensibles au regard de la loi 2013-450, sans lien avec l'activité du studio (voir § 6). |
| S11 | Faible | Fichiers PDF des créations | Les PDF sont publics (data URL dans la réponse `/api/creations`) : aucune protection pour des contenus payants. |
| S12 | Faible | Pas de vérification de l'adresse e-mail | Comptes créés avec des adresses inexistantes ou usurpées (cause de S1). |
| S13 | Faible | Route héritée `/login` | Doublon de `/api/login` à supprimer. |
| S14 | Faible | Sauvegardes | Aucune procédure de sauvegarde/restauration documentée ou testée ; offre PostgreSQL gratuite de Render sans sauvegarde et à durée limitée. |

**Correctif immédiat recommandé pour S1** (avant même la refonte, si le site est en ligne) : lier commandes et demandes à l'**identifiant du compte**, et exiger la **vérification de l'adresse e-mail** avant d'afficher toute donnée rattachée à cette adresse.

---

## 5. Design, UX, accessibilité, performance

| Domaine | Constat |
|---|---|
| Charte | Rose vif / corail / sarcelle / papier crème. **Non conforme** à l'identité noir et or demandée. Le logo et l'emblème (or sur noir) sont, eux, cohérents avec la cible. |
| Slogan / signature | « Là où le dessin pense » et « L'excellence, notre Leitmotiv » **absents**. Le site affiche « L'art qui donne vie aux idées » et « Créons. Imaginons. Résistons. » |
| Structure | Une seule page de **~19 000 px** de haut avec 13 sections dans un ordre peu logique (boutique avant l'offre, admin intégré à la page publique). |
| Navigation | 11 entrées dans le menu, dont « Administration » et un bouton « ✦17 » publics. Les liens « Mes appareils » / « Assistance appareils » mélangent un autre produit à l'identité du studio. |
| Contraste | Échecs WCAG en thème sombre (B2). |
| Éléments flottants | Deux personnages flottants (guide de section + assistant) qui masquent les boutons d'action sur mobile. |
| Galerie | 4 cartes « placeholder » génériques quand aucune création n'est publiée. Pas de visionneuse plein écran navigable, pas de filtres. |
| Performance | 4 JPEG de **0,6 à 1,2 Mo** (3,5 Mo au total) utilisés en arrière-plan décoratif et dans la galerie, sans versions redimensionnées ni WebP/AVIF. Médias des créations transmis en base64 dans le JSON de l'API (aucune mise en cache possible). |
| Accessibilité | Bonnes bases (lien d'évitement, `aria-live`, `alt`). À reprendre : contrastes, modales sans piège de focus, gestes « maintenir pour agrandir » non accessibles au clavier. |

---

## 6. Conformité : premiers constats

Ce sont des constats techniques ; l'analyse juridique détaillée sera produite en phase 8 et **devra être validée par un professionnel du droit ivoirien**.

- **Bon point :** les pages existantes ne fabriquent aucune information juridique ; elles signalent les champs inconnus entre crochets. Cette approche sera conservée.
- **Responsable de traitement non identifié** (nom légal, statut, adresse) : bloquant pour les mentions légales, la politique de confidentialité, les CGV et les formalités ARTCI.
- **Formalités ARTCI** (loi n° 2013-450) : la plateforme traite des données de clients, de paiement, des messages, et dans le module Retrouve des **données de localisation**. Les formalités préalables (déclaration ou autorisation selon le traitement) et l'autorisation des **transferts hors de Côte d'Ivoire** (hébergeur, e-mail, IA, traduction) doivent être étudiées. Aucune n'est documentée comme accomplie.
- **Durées de conservation** non définies ; aucune suppression automatique ; pas de procédure d'exercice des droits ni de suppression de compte en libre-service.
- **Commerce électronique** (loi n° 2013-546) et **consommation** (loi n° 2016-412) : pas de CGV, pas de récapitulatif de commande avant paiement, pas d'archivage du contrat, pas de règles de réclamation et de remboursement.
- **Droit d'auteur** (loi n° 2016-555) : pas de conditions de licence des œuvres numériques ; l'import de manuscrits vers un fournisseur IA externe n'est encadré que par un avertissement.
- **Module « Retrouve » (appareils, géolocalisation)** : hors du périmètre du studio, il ajoute un traitement à risque élevé et une marque différente. **Décision à prendre** (voir § 9).

---

## 7. Inventaire : conserver / améliorer / remplacer / créer

### Conserver tel quel (en le déplaçant dans des modules)
Hachage scrypt et migration ; signature des jetons de session ; récupération du mot de passe ; vérification des paiements CinetPay ; envoi Resend et vérification Svix ; extraction PDF isolée ; découpage en passages avec pages ; consignes anti-injection de l'assistant ; liste blanche des fichiers servis ; suite de tests ; logo, emblème, portraits, œuvres.

### Améliorer
Assistant IA (recherche hybride sémantique + lexicale, droits par œuvre, citations par chapitre, réponses longues, statistiques) ; limitation de débit (proxy de confiance, limites par route et par compte) ; e-mails (charte, liens vers l'espace client) ; tableau de bord ; pages juridiques existantes ; tests (étendus à chaque nouvelle fonction).

### Remplacer
Ligne JSON unique → **schéma PostgreSQL relationnel** avec migrations ; médias en base64 → **stockage objet** (public pour les images, **privé** pour les PDF/EPUB avec liens signés à durée courte) ; clé admin partagée → **comptes nominatifs avec rôles** (admin, éditeur) et 2FA ; sessions admin en mémoire → sessions en base ; page unique → **pages distinctes avec URLs propres** ; charte rose → **charte noir et or**.

### Créer
Librairie numérique (catalogue, fiches, auteurs, filtres, recherche, panier, commande, paiement, confirmation, téléchargement sécurisé) ; fiches de créations ; bibliothèque éditoriale (œuvres, univers, personnages, extraits) ; actualités administrables avec SEO ; devis structurés avec pièces jointes et suivi ; projets ; messagerie client ↔ studio ; espace client complet ; vérification de l'e-mail ; administration complète et journal d'audit ; base vectorielle et pipeline d'indexation ; 7 pages juridiques manquantes ; bandeau et préférences cookies si nécessaire ; sitemap, robots, données structurées, 404 ; sauvegardes ; documentation technique et de déploiement.

---

## 8. Architecture cible proposée (PHASE 2, à valider)

### 8.1 Principe : évolution, pas réécriture arbitraire

Le backend Node.js existant est sain sur le plan de la sécurité ; il est conservé et **découpé en modules**. Le frontend est reconstruit car sa structure monopage et sa charte ne permettent pas d'atteindre les objectifs (SEO par œuvre, identité noir et or, espaces séparés).

```
Navigateur ──HTTPS──▶ Hébergeur Node.js (service web unique)
                        ├─ Pages publiques rendues côté serveur (SEO, URLs propres)
                        ├─ API REST /api/v1 (validation, rôles, CSRF, limites)
                        ├─ Tâches d'arrière-plan (indexation IA, e-mails)
                        │
                        ├──▶ PostgreSQL (Supabase)  : données relationnelles + pgvector + RLS
                        ├──▶ Stockage objet (Supabase Storage) : images publiques, PDF/EPUB privés
                        ├──▶ CinetPay : paiement Mobile Money / carte (vérification serveur)
                        ├──▶ Resend : e-mails transactionnels
                        └──▶ Fournisseur LLM : reçoit uniquement la question + passages retrouvés
```

### 8.2 Choix techniques recommandés

| Couche | Recommandation | Justification |
|---|---|---|
| Serveur | Node.js 22 LTS, maintien du module `http` ou passage à un micro-framework léger (Fastify) | Continuité avec l'existant ; Fastify apporte validation de schéma et plugins de sécurité sans lourdeur. |
| Pages | Rendu serveur de gabarits HTML + JavaScript progressif sans framework lourd | Pages rapides sur mobile, indexables, sans outil de build complexe. Next.js reste une alternative si une équipe React doit maintenir le site. |
| Données | PostgreSQL (Supabase, déjà envisagé dans le README) avec migrations versionnées | Relationnel, sauvegardes, RLS, pgvector inclus. |
| Fichiers | Supabase Storage : bucket public (visuels) + bucket **privé** (livres) | Liens de téléchargement signés, expirant en quelques minutes, générés après vérification de l'achat. |
| IA — embeddings | **Modèle d'embeddings exécuté sur le serveur du studio** (modèle multilingue open source) | Les œuvres ne quittent pas l'infrastructure du studio pour être vectorisées. |
| IA — recherche | Hybride : pgvector (sémantique) + recherche plein texte PostgreSQL (lexicale) | Robuste sur les concepts (« le Singularisme ») et sur les termes exacts. |
| IA — génération | Fournisseur LLM configurable côté serveur | Seuls la question et quelques passages sont transmis ; fournisseur à choisir avec garantie contractuelle de **non-utilisation pour l'entraînement**. |
| Paiement | CinetPay (déjà intégré) | Compatible Côte d'Ivoire ; alternatives à évaluer si besoin. |
| Hébergement | Hébergeur Node.js persistant (Render ou Railway) + Supabase | Netlify seul n'est pas adapté : l'extraction PDF, l'indexation et les réponses IA dépassent les durées d'exécution de ses fonctions. Netlify peut servir le frontend statique, mais le backend doit tourner ailleurs. |

### 8.3 Modèle de données (aperçu)

`users` (rôle, e-mail vérifié, 2FA admin) · `sessions` · `audit_log` · `creations` + `creation_media` · `categories` · `works` (œuvres éditoriales : roman, essai, BD, conte…) + `work_chapters` + `characters` + `universes` · `products` (livres numériques, prix FCFA, fichier privé) · `authors` · `carts` · `orders` + `order_items` · `payments` (transactions CinetPay vérifiées) · `entitlements` (droit de télécharger / droit d'interroger l'IA sur une œuvre) · `download_tokens` · `services` + `service_prices` · `quote_requests` + `quote_attachments` + `quote_events` · `projects` · `messages` · `news` · `ai_documents` + `ai_chunks` (vecteur, chapitre, page) + `ai_index_jobs` + `ai_queries` · `consents` · `data_requests` · `settings`.

### 8.4 Parcours d'achat d'un livre numérique

Fiche livre → panier → récapitulatif + acceptation des CGV → commande `en attente` → page de paiement CinetPay → notification serveur → **vérification auprès de CinetPay** (montant, devise, statut) → commande `payée` → droit d'accès créé → e-mail de confirmation → dans l'espace client, bouton « Télécharger » qui génère un lien signé valable quelques minutes, journalisé, avec filigrane nominatif optionnel du PDF.

---

## 9. Informations et décisions nécessaires de votre part

Je ne peux pas inventer ces éléments. Les plus bloquants sont en tête.

| # | Information / décision | Bloque |
|---|---|---|
| D1 | **Statut juridique actuel** du studio (activité en nom propre, entreprise individuelle, société, aucune immatriculation encore ?), nom légal du responsable, adresse professionnelle, RCCM / compte contribuable s'ils existent. | Pages juridiques, CGV, ARTCI, compte marchand |
| D2 | **Compte marchand CinetPay** : existe-t-il et est-il activé ? Sinon, quel prestataire souhaitez-vous ? | Paiement réel |
| D3 | **Hébergement** : Render, Railway, ou autre ? Avez-vous déjà un projet Supabase ? Budget mensuel acceptable ? | Déploiement, base de données |
| D4 | **Nom de domaine** (acheté ? lequel ?) et adresse e-mail professionnelle sur ce domaine. | HTTPS, e-mails, SEO |
| D5 | **Catalogue de livres** : titres, auteurs, prix en FCFA, formats (PDF/EPUB), couvertures, résumés. | Boutique |
| D6 | **Prestations payables en ligne** : faut-il encaisser un **acompte de 50 %**, un prix fixe, ou seulement passer par devis ? | Boutique services, CGV |
| D7 | **Fournisseur IA** pour la génération des réponses et budget mensuel. | Assistant IA |
| D8 | **Module « Retrouve » (appareils et géolocalisation)** : le garder sur ce site, le déplacer vers un projet séparé (recommandé, sans rien supprimer), ou l'archiver ? | Périmètre, conformité |
| D9 | Section **Investisseurs** : à conserver ? | Contenu |
| D10 | Accès IA : réservé aux acheteurs de l'œuvre, ouvert à tous sur certaines œuvres, ou par abonnement ? | Droits d'accès IA |
| D11 | Politique de remboursement souhaitée pour les fichiers numériques et pour les prestations. | CGV, remboursement |
| D12 | Les deux numéros de téléphone et l'e-mail affichés sont-ils les coordonnées publiques définitives ? | Contact, mentions légales |

---

## 10. Plan d'intervention

Chaque phase est commitée sur la branche de travail, testée, et documentée. **Aucun fichier ni aucune donnée n'est supprimé** : les éléments remplacés sont archivés dans `legacy/` et une procédure de migration reprend les données existantes de `app_store` vers les nouvelles tables.

| Phase | Contenu | Dépend de |
|---|---|---|
| 0 (urgent) | Correctif S1 (lier données au compte + vérification e-mail), B1, B2 | — |
| 2 | Architecture détaillée, schéma SQL, arborescence, conventions | Validation de ce rapport, D3 |
| 3 | Charte noir et or, gabarits, navigation, pages distinctes, accueil | — |
| 4 | Créations, bibliothèque éditoriale, actualités, devis avec pièces jointes | D9 |
| 5 | Librairie, panier, paiement, téléchargements sécurisés | D2, D5, D6, D11 |
| 6 | Espace client complet, administration avec rôles et statistiques | — |
| 7 | Pipeline RAG : import, extraction, segmentation, embeddings locaux, pgvector, droits d'accès | D7, D10 |
| 8 | Sécurité renforcée (CSP, CSRF, limites, audit, sauvegardes) et 10 documents juridiques | D1, D12 |
| 9 | Tests fonctionnels, accessibilité, performance, corrections | — |
| 10 | Documentation technique et de déploiement, liste des obligations juridiques | D3, D4 |

**Ce qui nécessitera une intervention humaine ou une configuration externe :** création des comptes Supabase, hébergeur, CinetPay et Resend ; saisie des secrets dans l'hébergeur ; achat et configuration DNS du domaine ; fourniture des fichiers des livres et des manuscrits ; formalités ARTCI ; validation juridique finale par un professionnel du droit ivoirien.
