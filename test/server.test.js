// Tests de bout en bout du serveur : `npm test`.
// Le serveur est lancé sur un port libre avec un dossier de données temporaire,
// afin de ne jamais toucher à data/store.json ni aux services externes.
const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const RACINE = path.join(__dirname, "..");
const CLE_ADMIN = "cle-admin-de-test-0123456789";
let serveur;
let base;
let dossierDonnees;

function portLibre() {
    return new Promise((resolve, reject) => {
        const sonde = net.createServer();
        sonde.once("error", reject);
        sonde.listen(0, "127.0.0.1", () => {
            const { port } = sonde.address();
            sonde.close(() => resolve(port));
        });
    });
}

function json(corps) {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) };
}

before(async () => {
    const port = await portLibre();
    dossierDonnees = fs.mkdtempSync(path.join(os.tmpdir(), "unique-art-test-"));
    base = `http://127.0.0.1:${port}`;
    serveur = spawn(process.execPath, ["server.js"], {
        cwd: RACINE,
        env: {
            PATH: process.env.PATH,
            PORT: String(port),
            NODE_ENV: "test",
            DATA_DIR: dossierDonnees,
            ADMIN_API_KEY: CLE_ADMIN,
            CLIENT_SESSION_SECRET: "secret-de-session-de-test",
            // Valeurs vides : le serveur ne doit contacter aucun service externe pendant les tests.
            DATABASE_URL: "", RESEND_API_KEY: "", EMAIL_FROM: "", CINETPAY_API_KEY: "", CINETPAY_SITE_ID: "",
            AI_API_URL: "", AI_API_KEY: "", AI_MODEL: "", PUBLIC_BASE_URL: ""
        },
        stdio: ["ignore", "pipe", "pipe"]
    });
    let journal = "";
    serveur.stdout.on("data", (morceau) => { journal += morceau; });
    serveur.stderr.on("data", (morceau) => { journal += morceau; });

    for (let essai = 0; essai < 100; essai += 1) {
        try {
            if ((await fetch(`${base}/api/health`)).ok) return;
        } catch {
            // Le serveur n'écoute pas encore.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Le serveur n'a pas démarré.\n${journal}`);
});

after(() => {
    serveur?.kill();
    if (dossierDonnees) fs.rmSync(dossierDonnees, { recursive: true, force: true });
});

test("l'état du service répond", async () => {
    const reponse = await fetch(`${base}/api/health`);
    assert.equal(reponse.status, 200);
    const etat = await reponse.json();
    assert.equal(etat.ok, true);
    assert.equal(etat.providers.payments, false);
});

test("la page d'accueil référence ses ressources par empreinte de contenu", async () => {
    const reponse = await fetch(`${base}/`);
    assert.equal(reponse.status, 200);
    assert.match(reponse.headers.get("content-type"), /text\/html/);
    assert.equal(reponse.headers.get("cache-control"), "no-cache");
    const html = await reponse.text();
    const style = html.match(/href="(style\.css\?v=[a-f0-9]{12})"/);
    const script = html.match(/src="(script\.js\?v=[a-f0-9]{12})"/);
    assert.ok(style, "style.css doit porter une version calculée");
    assert.ok(script, "script.js doit porter une version calculée");

    const feuille = await fetch(`${base}/${style[1]}`);
    assert.equal(feuille.status, 200);
    assert.match(feuille.headers.get("cache-control"), /immutable/);
});

test("une page inchangée renvoie 304 au navigateur", async () => {
    const premiere = await fetch(`${base}/mentions-legales.html`);
    const etag = premiere.headers.get("etag");
    assert.ok(etag);
    const seconde = await fetch(`${base}/mentions-legales.html`, { headers: { "If-None-Match": etag } });
    assert.equal(seconde.status, 304);
});

test("toutes les images et pages citées par les pages publiques existent", async () => {
    const pages = ["index.html", "appareils.html", "assistance-appareils.html", "mentions-legales.html",
        "confidentialite.html", "conditions-utilisation.html"];
    const cibles = new Set();
    for (const page of pages) {
        const html = fs.readFileSync(path.join(RACINE, page), "utf8");
        for (const [, lien] of html.matchAll(/\b(?:src|href)="([^"#?]+)(?:[?#][^"]*)?"/g)) {
            if (/^(?:[a-z]+:|\/\/)/i.test(lien)) continue;
            cibles.add(lien.replace(/^\//, ""));
        }
    }
    assert.ok(cibles.size > 10);
    for (const cible of cibles) {
        const reponse = await fetch(`${base}/${cible}`, { method: "HEAD" });
        assert.equal(reponse.status, 200, `${cible} devrait être servi`);
    }
});

test("les fichiers privés ne sont jamais servis", async () => {
    const interdits = ["/.env", "/.env.example", "/server.js", "/package.json", "/data/store.json",
        "/.git/config", "/README.md", "/assets/..%2f.env", "/assets/%2e%2e/server.js", "/render.yaml"];
    for (const chemin of interdits) {
        const reponse = await fetch(`${base}${chemin}`);
        assert.equal(reponse.status, 404, `${chemin} ne doit pas être accessible`);
    }
});

test("les fichiers statiques n'acceptent que la lecture", async () => {
    const reponse = await fetch(`${base}/index.html`, { method: "POST" });
    assert.equal(reponse.status, 405);
});

test("un corps JSON invalide est refusé proprement", async () => {
    const reponse = await fetch(`${base}/api/login`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalide"
    });
    assert.equal(reponse.status, 400);
    assert.equal(reponse.headers.get("cache-control"), "no-store");
});

test("une route d'API inconnue renvoie 404 en JSON", async () => {
    const reponse = await fetch(`${base}/api/inconnue`);
    assert.equal(reponse.status, 404);
    assert.ok((await reponse.json()).error);
});

test("parcours client : inscription, connexion, session, déconnexion", async () => {
    const compte = { nom: "Aïcha Koné", email: "Aicha.Kone@example.com", motDePasse: "mot-de-passe-long", telephone: "+225 01 02 03 04" };

    const tropCourt = await fetch(`${base}/api/clients`, json({ ...compte, motDePasse: "court" }));
    assert.equal(tropCourt.status, 400);

    const inscription = await fetch(`${base}/api/clients`, json(compte));
    assert.equal(inscription.status, 201);
    // L'inscription ouvre directement la session du nouveau client.
    const cookieInscription = inscription.headers.get("set-cookie").split(";")[0];
    const sessionInscription = await fetch(`${base}/api/client/session`, { headers: { Cookie: cookieInscription } });
    assert.equal(sessionInscription.status, 200);

    const doublon = await fetch(`${base}/api/clients`, json(compte));
    assert.equal(doublon.status, 409);

    // Le mot de passe est stocké sous forme d'empreinte scrypt, jamais en clair.
    const stocke = JSON.parse(fs.readFileSync(path.join(dossierDonnees, "store.json"), "utf8")).clients[0];
    assert.equal(stocke.nom, "Aïcha Koné");
    assert.match(stocke.motDePasseHash, /^scrypt\$/);
    assert.ok(!JSON.stringify(stocke).includes(compte.motDePasse));

    const sansSession = await fetch(`${base}/api/client/session`);
    assert.equal(sansSession.status, 401);

    const mauvais = await fetch(`${base}/api/login`, json({ email: compte.email, motDePasse: "mauvais-mot-de-passe" }));
    assert.equal(mauvais.status, 401);

    const connexion = await fetch(`${base}/api/login`, json({ email: compte.email, motDePasse: compte.motDePasse }));
    assert.equal(connexion.status, 200);
    const cookie = connexion.headers.get("set-cookie");
    assert.match(cookie, /unique_art_client=[^;]+; HttpOnly; SameSite=Lax/);
    const profil = await connexion.json();
    assert.equal(profil.email, "aicha.kone@example.com");
    assert.equal(profil.motDePasseHash, undefined);

    const session = await fetch(`${base}/api/client/session`, { headers: { Cookie: cookie.split(";")[0] } });
    assert.equal(session.status, 200);
    assert.equal((await session.json()).nom, "Aïcha Koné");

    const falsifie = await fetch(`${base}/api/client/session`, { headers: { Cookie: `${cookie.split(";")[0]}x` } });
    assert.equal(falsifie.status, 401);

    const deconnexion = await fetch(`${base}/api/client/session`, { method: "DELETE" });
    assert.equal(deconnexion.status, 204);
    assert.match(deconnexion.headers.get("set-cookie"), /Max-Age=0/);
});

test("les routes d'administration exigent une session", async () => {
    assert.equal((await (await fetch(`${base}/api/admin/session`)).json()).authenticated, false);
    assert.equal((await fetch(`${base}/api/admin/inbox`)).status, 401);
    assert.equal((await fetch(`${base}/api/creations`, json({ titre: "Sans droit" }))).status, 401);

    const connexion = await fetch(`${base}/api/admin/session`, json({ password: CLE_ADMIN }));
    assert.equal(connexion.status, 200);
    const cookie = connexion.headers.get("set-cookie").split(";")[0];
    const etat = await fetch(`${base}/api/admin/session`, { headers: { Cookie: cookie } });
    assert.equal((await etat.json()).authenticated, true);
    assert.equal((await fetch(`${base}/api/admin/inbox`, { headers: { Cookie: cookie } })).status, 200);
});

test("demandes des clients : privées, puis réponse et suppression par le studio", async () => {
    const demande = { name: "Yao Bamba", email: "yao@example.com", language: "fr", type: "Demande de devis", message: "Un devis pour une bande dessinée, s'il vous plaît." };
    const publication = await fetch(`${base}/api/discussions`, json(demande));
    assert.equal(publication.status, 201);
    const { id } = await publication.json();

    // Un visiteur ne voit jamais les demandes des autres ; seul le studio connecté les lit.
    assert.deepEqual(await (await fetch(`${base}/api/discussions`)).json(), []);
    assert.equal((await fetch(`${base}/api/discussions/${id}/reply`, json({ message: "Sans droit" }))).status, 401);

    const admin = (await fetch(`${base}/api/admin/session`, json({ password: CLE_ADMIN }))).headers.get("set-cookie").split(";")[0];
    const liste = await (await fetch(`${base}/api/discussions`, { headers: { Cookie: admin } })).json();
    assert.ok(liste.some((discussion) => discussion.id === id));

    const reponse = await fetch(`${base}/api/discussions/${id}/reply`, { ...json({ message: "Voici notre proposition." }), headers: { "Content-Type": "application/json", Cookie: admin } });
    assert.equal(reponse.status, 201);

    // Le client retrouve la réponse du studio dans son espace.
    await fetch(`${base}/api/clients`, json({ nom: "Yao Bamba", email: "yao@example.com", motDePasse: "mot-de-passe-de-yao", telephone: "+225 05 06 07 08" }));
    const client = (await fetch(`${base}/api/login`, json({ email: "yao@example.com", motDePasse: "mot-de-passe-de-yao" }))).headers.get("set-cookie").split(";")[0];
    const echanges = await (await fetch(`${base}/api/client/discussions`, { headers: { Cookie: client } })).json();
    assert.equal(echanges[0].replies[0].message, "Voici notre proposition.");

    const suppression = await fetch(`${base}/api/discussions/${id}`, { method: "DELETE", headers: { Cookie: admin } });
    assert.equal(suppression.status, 200);
    const apres = await (await fetch(`${base}/api/discussions`, { headers: { Cookie: admin } })).json();
    assert.ok(!apres.some((discussion) => discussion.id === id));
});

test("un message de contact arrive dans la boîte du studio même sans service d'e-mail", async () => {
    const envoi = await fetch(`${base}/api/contact`, json({ nom: "Awa Traoré", email: "awa@example.com", message: "Bonjour, j'aimerais une couverture illustrée." }));
    assert.equal(envoi.status, 201);
    assert.equal((await envoi.json()).emailEnvoye, false);

    const admin = (await fetch(`${base}/api/admin/session`, json({ password: CLE_ADMIN }))).headers.get("set-cookie").split(";")[0];
    const boite = await (await fetch(`${base}/api/admin/inbox`, { headers: { Cookie: admin } })).json();
    assert.ok(boite.some((message) => message.nom === "Awa Traoré" && message.message.includes("couverture illustrée")));

    // Le champ piège rempli par un robot ne crée aucun message.
    const robot = await fetch(`${base}/api/contact`, json({ nom: "Robot", email: "robot@example.com", message: "spam", website: "http://spam.example" }));
    assert.equal(robot.status, 200);
    const boiteApres = await (await fetch(`${base}/api/admin/inbox`, { headers: { Cookie: admin } })).json();
    assert.ok(!boiteApres.some((message) => message.nom === "Robot"));

    // Au-delà de cinq messages en dix minutes, l'adresse est temporisée.
    let dernier;
    for (let essai = 0; essai < 5; essai += 1) {
        dernier = await fetch(`${base}/api/contact`, json({ nom: "Awa Traoré", email: "awa@example.com", message: `Relance ${essai}` }));
    }
    assert.equal(dernier.status, 429);
});

// Ce test reste le dernier : il déclenche volontairement la suspension des connexions.
test("les essais de mot de passe en série sont suspendus", async () => {
    let dernier;
    for (let essai = 0; essai < 12; essai += 1) {
        dernier = await fetch(`${base}/api/admin/session`, json({ password: `essai-${essai}` }));
    }
    assert.equal(dernier.status, 429);
    assert.equal(dernier.headers.get("retry-after"), "900");

    // Même la bonne clé est refusée pendant la suspension.
    const bonne = await fetch(`${base}/api/admin/session`, json({ password: CLE_ADMIN }));
    assert.equal(bonne.status, 429);
});
