# Audit complet du site — sécurité, conformité, qualité (19 novembre 2026)

Périmètre : code du dépôt (`server.js`, `api/`, `public/`, `site/`, `tools/`), configuration Vercel (`vercel.json`), site en production `https://unique-art-visuel-studio.vercel.app`.

Méthode : lecture du code route par route, `npm audit`, tests automatisés (25 tests), essais d'attaque en local (falsification d'adresse IP, requêtes depuis une autre origine, injection de liens dans les médias, robots), parcours dans un vrai navigateur (Chromium) de 15 pages avec relevé des erreurs et des violations CSP, sondage de la production (fichiers sensibles, routes privées, en-têtes).

## 1. Résumé

| Domaine | État |
|---|---|
| Dépendances (`npm audit`) | 0 vulnérabilité |
| Secrets dans le dépôt / le code public | Aucun trouvé (clés lues uniquement dans les variables d'environnement Vercel) |
| Fichiers sensibles en production (`.env`, `server.js`, `package.json`, `data/store.json`, `.git/config`, `tests/`, `site/`) | Tous en 404 |
| Données privées (demandes de devis) | Vides sans session studio (vérifié en production) |
| En-têtes de sécurité | HSTS (2 ans, preload), CSP stricte sans `unsafe-inline`, `nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` ; **COOP ajouté** |
| XSS côté navigateur | Aucun `innerHTML` : tout le contenu est inséré en texte ; liens de médias filtrés (`urlMediaSure`) |
| Mots de passe | scrypt + sel, comparaison à temps constant |
| Sessions | Cookies `HttpOnly`, `Secure`, `SameSite`, signés HMAC |
| Paiement | Aucun paiement simulé : statut confirmé uniquement par vérification serveur auprès de CinetPay |

## 2. Failles trouvées et corrigées dans cet audit

| # | Gravité | Problème | Correctif | Vérification |
|---|---|---|---|---|
| 1 | **Élevée** | Les limites anti-abus lisaient l'en-tête `X-Forwarded-For`, que n'importe qui peut inventer : en le changeant à chaque essai, un attaquant contournait toutes les limites (démontré : 0 refus sur 130 essais). | Sur Vercel, l'adresse vient de `x-real-ip` (posé par Vercel, non falsifiable) ; ailleurs, `X-Forwarded-For` n'est lu que si `TRUST_PROXY=1`. | Test automatique : 12 essais avec adresses falsifiées → refus dès le 9ᵉ. |
| 2 | **Élevée** | Pas de verrouillage par compte à la connexion client : essais de mots de passe illimités sur un même e-mail (en changeant d'adresse IP). | 8 échecs / 15 min par compte et 30 / 15 min par adresse → 429 ; remise à zéro après succès. Hachage factice si le compte n'existe pas (pas de différence de temps de réponse révélant les comptes). | Test automatique. |
| 3 | Moyenne | Connexion à l'espace studio : pas de limite d'échecs, comparaison non à temps constant. | 10 échecs / 15 min par adresse, comparaison SHA-256 + `timingSafeEqual`, journalisation des succès et échecs. | Tests existants (connexion studio) au vert. |
| 4 | Moyenne | `/api/translate` ouvert au public : relais gratuit vers un service tiers (abus, fuite de texte). | Réservé à l'espace studio ; texte limité à 16 000 caractères. | Test : 401 sans session studio. |
| 5 | Moyenne | Pré-vérification CORS répondant `Access-Control-Allow-Origin: *` sur l'API. | Plus d'autorisation croisée ; toute écriture `/api` venant d'une autre origine (ou `Origin: null`) → 403. Les webhooks (sans `Origin`) restent acceptés. | Test : 403 depuis un site tiers, 201 depuis le site. |
| 6 | Moyenne | Créations : n'importe quelle chaîne acceptée comme image/PDF/vidéo (liens `javascript:` ou externes stockés). | Seuls `data:image/(jpeg|png|webp|gif)`, `data:application/pdf`, `data:video/(mp4|webm)` sont acceptés, sinon 400. | Test : `javascript:` et lien externe refusés. |
| 7 | Moyenne | Corps de requête jusqu'à 25 Mo sur toutes les routes (épuisement mémoire). | 1 Mo par défaut ; 12 Mo seulement pour l'ajout de créations (studio). | Suite de tests. |
| 8 | Faible | Création de comptes, demandes, commandes : pas de limite par adresse (spam). | Limites d'écriture : comptes 5/h, demandes 10/15 min, contact 5/15 min, commandes 10/15 min. | Suite de tests. |
| 9 | Faible | Formulaire de devis sans protection anti-robots. | Champ piège invisible : un envoi qui le remplit reçoit une réponse normale mais n'est pas enregistré. | Test + parcours navigateur (devis réel enregistré). |
| 10 | Faible | Ancienne route `/login` doublon de `/api/login`, hors des protections `/api`. | Supprimée (le site appelle `/api/login` via `Studio.api`). | Parcours navigateur de la page compte sans erreur. |
| 11 | Faible | Réponses API sans `X-Frame-Options` ni `Cross-Origin-Resource-Policy`. | Ajoutés ; `Cross-Origin-Opener-Policy: same-origin` sur les pages. | En-têtes vérifiés. |

## 3. Vérifications sans anomalie

- Cloisonnement des données clients : un client ne voit que ses commandes, demandes et téléchargements (tests de Phase 0).
- Vérification de l'adresse e-mail et réinitialisation du mot de passe : jetons à usage unique, limités en fréquence.
- Base de données : RLS activée et droits publics révoqués sur la table `app_store` ; aucune clé côté navigateur.
- Œuvres : les textes servent uniquement à la recherche interne de l'assistant ; ils ne sont pas envoyés pour entraîner un modèle tiers.
- Navigateur : 15 pages chargées sans erreur JavaScript ni violation CSP. Les seules erreurs relevées sont les 401 attendus quand personne n'est connecté, et le 404 volontaire.

## 4. Limites restantes (à connaître)

1. **Limites anti-abus en mémoire** : sur Vercel, chaque instance du serveur compte de son côté ; un attaquant très actif peut obtenir quelques essais de plus. Pour aller plus loin : pare-feu Vercel (règle de limitation sur `/api/login`) ou compteur partagé (Redis).
2. **Session studio non révocable individuellement** : elle expire d'elle-même ; pour couper toutes les sessions, changer `ADMIN_API_KEY` dans Vercel.
3. **Création de compte** : un e-mail déjà inscrit renvoie un message distinct (révèle qu'un compte existe). Limité à 5 essais/h par adresse ; acceptable pour un studio, à revoir si besoin.
4. **`DATABASE_URL` absente en production** : le site fonctionne, mais **les comptes, devis et commandes ne sont pas conservés durablement** tant que la base Supabase n'est pas reliée dans Vercel. C'est le point le plus important à régler.
5. **Services non configurés** : fournisseur d'IA, CinetPay, Resend. Les fonctions correspondantes l'indiquent honnêtement au visiteur (aucune simulation).
6. **Conformité** : la politique de confidentialité contient encore des champs à compléter (prestataire et pays de la base de données, fournisseur d'IA, formalités ARTCI, durées de conservation). Les documents juridiques restent des projets à faire valider par un avocat ivoirien.
7. **Téléchargement sécurisé des PDF** : pas encore assuré par le site lui-même (aucune route de téléchargement côté serveur) ; les ventes passent aujourd'hui par la boutique Chariow. À construire (liens signés à durée limitée, après paiement vérifié) si le site doit vendre directement.
8. **Recherche de l'assistant** : recherche par mots, sans racines (« meurt » ne retrouve pas « mort »).
9. `Access-Control-Allow-Origin: *` sur les fichiers statiques publics (comportement par défaut de Vercel) : sans risque, ces fichiers sont publics.
