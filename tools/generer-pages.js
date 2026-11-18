#!/usr/bin/env node
// Génère les pages HTML publiques à partir des gabarits de site/pages/.
// Chaque gabarit commence par un commentaire JSON décrivant la page, par exemple :
// <!--{"titre":"Créations","description":"…","chemin":"/creations","nav":"creations","scripts":["creations"]}-->
// Les coordonnées publiques viennent de site/contact.json. Dans les gabarits :
//   {{EMAIL_LIEN}}  lien vers l'adresse e-mail publique (ou vers le formulaire si elle n'est pas renseignée)
//   {{TELEPHONES}}  liens d'appel ; {{WHATSAPP}} numéro WhatsApp international sans « + »
//   {{BOUTIQUE_URL}} adresse de la boutique en ligne partenaire
// Usage : node tools/generer-pages.js   (les pages sont écrites dans public/ et doivent être commitées)
"use strict";

const fs = require("fs");
const path = require("path");

const RACINE = path.join(__dirname, "..");
const SOURCES = path.join(RACINE, "site", "pages");
const SORTIE = path.join(RACINE, "public");
// Adresse publique actuelle. À remplacer par le nom de domaine définitif lorsqu'il sera choisi.
const URL_SITE = (process.env.SITE_URL || "https://unique-art-visuel-studio.vercel.app").replace(/\/$/, "");
const VERSION = process.env.ASSETS_VERSION || new Date().toISOString().slice(0, 10).replace(/-/g, "");
const NOM = "UNIQUE ART VISUEL STUDIO";
const CONTACT = JSON.parse(fs.readFileSync(path.join(RACINE, "site", "contact.json"), "utf8"));

const NAVIGATION = [
    ["accueil", "/", "Accueil"],
    ["creations", "/creations", "Créations"],
    ["oeuvres", "/oeuvres", "Œuvres"],
    ["boutique", "/boutique", "Boutique"],
    ["services", "/services", "Services & tarifs"],
    ["actualites", "/actualites", "Actualités"],
    ["studio", "/studio", "Le studio"],
    ["contact", "/contact", "Contact"]
];

const DOCUMENTS_JURIDIQUES = [
    ["/mentions-legales", "Mentions légales"],
    ["/confidentialite", "Politique de confidentialité"],
    ["/cookies", "Politique relative aux cookies"],
    ["/conditions-utilisation", "Conditions générales d’utilisation"],
    ["/conditions-vente", "Conditions générales de vente"],
    ["/remboursement", "Remboursement et réclamations"],
    ["/licence-oeuvres-numeriques", "Licence des œuvres numériques"],
    ["/propriete-intellectuelle", "Propriété intellectuelle"],
    ["/conditions-ia", "Conditions de l’assistant IA"],
    ["/paiement-livraison", "Paiement et livraison numérique"]
];

function echapper(texte) {
    return String(texte ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function remplacerCoordonnees(html) {
    const email = String(CONTACT.email || "").trim();
    const lienEmail = email
        ? `<a href="mailto:${echapper(email)}">${echapper(email)}</a>`
        : `<a href="/contact#formulaire">formulaire de contact</a>`;
    const telephones = (CONTACT.telephones || [])
        .map((numero) => `<a href="tel:${echapper(numero.replace(/\s+/g, ""))}">${echapper(numero)}</a>`).join(" · ");
    return html
        .replaceAll("{{EMAIL_LIEN}}", lienEmail)
        .replaceAll("{{TELEPHONES}}", telephones)
        .replaceAll("{{WHATSAPP}}", echapper(CONTACT.whatsapp || ""))
        .replaceAll("{{BOUTIQUE_URL}}", echapper(CONTACT.boutique || "/boutique"));
}

function fichierPourChemin(chemin) {
    return chemin === "/" ? "index.html" : `${chemin.replace(/^\//, "")}.html`;
}

function entete(page) {
    const liens = NAVIGATION.map(([cle, href, libelle]) =>
        `<li><a href="${href}"${page.nav === cle ? ' aria-current="page"' : ""}>${echapper(libelle)}</a></li>`).join("\n                    ");
    return `<a class="lien-evitement" href="#contenu">Aller au contenu</a>
    <header class="entete">
        <div class="conteneur entete-interieur">
            <a class="marque" href="/" aria-label="${NOM}, retour à l’accueil">
                <img src="/assets/brand/unique-art-emblem.jpg" width="42" height="42" alt="">
                <span><strong>UNIQUE ART</strong><small>VISUEL STUDIO</small></span>
            </a>
            <nav class="nav-principale" id="navPrincipale" aria-label="Navigation principale">
                <ul>
                    ${liens}
                    <li class="nav-mobile"><a href="/compte"${page.nav === "compte" ? ' aria-current="page"' : ""}>Mon compte</a></li>
                </ul>
            </nav>
            <div class="entete-actions">
                <a class="btn btn-discret entete-compte" href="/compte"${page.nav === "compte" ? ' aria-current="page"' : ""}>Mon compte</a>
                <button class="bouton-menu" type="button" aria-expanded="false" aria-controls="navPrincipale" aria-label="Ouvrir le menu"><span></span></button>
            </div>
        </div>
    </header>
    <div id="avisGlobal" class="bandeau-avis" role="status" aria-live="polite" hidden></div>`;
}

function pied() {
    const juridique = DOCUMENTS_JURIDIQUES.map(([href, libelle]) => `<li><a href="${href}">${libelle}</a></li>`).join("\n                        ");
    return `<footer class="pied">
        <div class="conteneur">
            <div class="pied-grille">
                <div class="pied-marque">
                    <a class="marque" href="/" aria-label="${NOM}, retour à l’accueil">
                        <img src="/assets/brand/unique-art-emblem.jpg" width="42" height="42" alt="" loading="lazy">
                        <span><strong>UNIQUE ART</strong><small>VISUEL STUDIO</small></span>
                    </a>
                    <p class="devise">« Là où le dessin pense »</p>
                    <p>Studio indépendant de création et de production artistique, littéraire et visuelle. L’excellence, notre Leitmotiv.</p>
                </div>
                <div>
                    <h2>Découvrir</h2>
                    <ul>
                        <li><a href="/creations">Créations</a></li>
                        <li><a href="/oeuvres">Œuvres &amp; publications</a></li>
                        <li><a href="/boutique">Boutique</a></li>
                        <li><a href="/actualites">Actualités</a></li>
                    </ul>
                </div>
                <div>
                    <h2>Le studio</h2>
                    <ul>
                        <li><a href="/studio">À propos</a></li>
                        <li><a href="/services">Services &amp; tarifs</a></li>
                        <li><a href="/assistant">Assistant de lecture IA</a></li>
                        <li><a href="/contact">Contact</a></li>
                        <li><a href="/compte">Mon compte</a></li>
                    </ul>
                </div>
                <div>
                    <h2>Informations légales</h2>
                    <ul>
                        ${juridique}
                    </ul>
                </div>
                <div>
                    <h2>Autres services</h2>
                    <ul>
                        <li><a href="/appareils.html">Mes appareils</a></li>
                        <li><a href="/assistance-appareils.html">Assistance appareils</a></li>
                        <li><a href="/admin" rel="nofollow">Espace studio</a></li>
                    </ul>
                </div>
            </div>
            <div class="pied-bas">
                <span>© <span data-annee>2026</span> ${NOM}. Tous droits réservés.</span>
                <span>L’excellence, notre Leitmotiv.</span>
            </div>
        </div>
    </footer>`;
}

function donneesStructurees(page) {
    if (page.chemin !== "/") return "";
    const donnees = {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: NOM,
        slogan: "Là où le dessin pense",
        url: `${URL_SITE}/`,
        logo: `${URL_SITE}/assets/brand/unique-art-studio.jpg`,
        founder: { "@type": "Person", name: "Ando Dieudonné-Jean N'dé" },
        areaServed: "CI"
    };
    if (CONTACT.email) donnees.email = CONTACT.email;
    if (CONTACT.telephones?.[0]) donnees.telephone = CONTACT.telephones[0];
    return `\n    <script type="application/ld+json">${JSON.stringify(donnees).replace(/</g, "\\u003c")}</script>`;
}

function construirePage(page, corps) {
    const titreComplet = page.chemin === "/" ? `${NOM} — Là où le dessin pense` : `${page.titre} — ${NOM}`;
    const url = `${URL_SITE}${page.chemin}`;
    const image = `${URL_SITE}${page.image || "/assets/brand/unique-art-studio.jpg"}`;
    const scripts = ["/js/core.js", ...(page.assistant === false ? [] : ["/js/assistant.js"]),
        ...(page.scripts || []).map((nom) => (nom.startsWith("/") ? nom : `/js/pages/${nom}.js`))]
        .map((src) => `<script src="${src}?v=${VERSION}" defer></script>`).join("\n    ");
    return `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${echapper(titreComplet)}</title>
    <meta name="description" content="${echapper(page.description)}">
    ${page.robots ? `<meta name="robots" content="${echapper(page.robots)}">` : `<link rel="canonical" href="${url}">`}
    <meta name="theme-color" content="#0a0a0b">
    <meta property="og:type" content="website">
    <meta property="og:locale" content="fr_FR">
    <meta property="og:site_name" content="${NOM}">
    <meta property="og:title" content="${echapper(titreComplet)}">
    <meta property="og:description" content="${echapper(page.description)}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${image}">
    <meta name="twitter:card" content="summary_large_image">
    <link rel="icon" type="image/jpeg" href="/assets/brand/unique-art-emblem.jpg">
    <link rel="preload" href="/assets/fonts/cormorant-garamond-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/assets/fonts/manrope-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="stylesheet" href="/css/studio.css?v=${VERSION}">${donneesStructurees(page)}
    ${scripts}
</head>
<body data-page="${echapper(page.nav || "")}" data-whatsapp="{{WHATSAPP}}">
    ${entete(page)}
    <main id="contenu">
${corps.trim().split("\n").map((ligne) => (ligne ? `        ${ligne}` : "")).join("\n")}
    </main>
    ${pied()}
</body>
</html>
`;
}

function main() {
    const fichiers = fs.readdirSync(SOURCES).filter((nom) => nom.endsWith(".html")).sort();
    const plan = [];
    for (const nom of fichiers) {
        const source = fs.readFileSync(path.join(SOURCES, nom), "utf8");
        const entree = source.match(/^<!--(\{[\s\S]*?\})-->\s*/);
        if (!entree) throw new Error(`${nom} : commentaire de description manquant.`);
        const page = JSON.parse(entree[1]);
        for (const cle of ["titre", "description", "chemin"]) {
            if (!page[cle]) throw new Error(`${nom} : champ « ${cle} » manquant.`);
        }
        const sortie = page.fichier || fichierPourChemin(page.chemin);
        const html = remplacerCoordonnees(construirePage(page, source.slice(entree[0].length)));
        fs.writeFileSync(path.join(SORTIE, sortie), html);
        if (!page.robots) plan.push(page);
        console.log(`✓ ${sortie}`);
    }

    const aujourdHui = new Date().toISOString().slice(0, 10);
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${plan.map((page) => `  <url><loc>${URL_SITE}${page.chemin}</loc><lastmod>${aujourdHui}</lastmod><priority>${page.chemin === "/" ? "1.0" : page.priorite || "0.6"}</priority></url>`).join("\n")}
</urlset>
`;
    fs.writeFileSync(path.join(SORTIE, "sitemap.xml"), sitemap);
    fs.writeFileSync(path.join(SORTIE, "robots.txt"), `User-agent: *
Allow: /
Disallow: /admin
Disallow: /compte
Disallow: /api/

Sitemap: ${URL_SITE}/sitemap.xml
`);
    console.log(`✓ sitemap.xml (${plan.length} pages) et robots.txt`);
}

main();
