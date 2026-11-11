// Tests de bout en bout de l'API : lance le vrai serveur dans un dossier de données
// temporaire, sans base PostgreSQL ni service externe (e-mail, paiement, IA).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ADMIN_KEY = "cle-admin-de-test-suffisamment-longue";
const PORT = 41000 + Math.floor(Math.random() * 2000);
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "uavs-test-"));
let serveur;

before(async () => {
    const env = {
        ...process.env,
        PORT: String(PORT),
        DATA_DIR: dataDir,
        NODE_ENV: "test",
        ADMIN_API_KEY: ADMIN_KEY,
        CLIENT_SESSION_SECRET: "secret-session-de-test-suffisamment-long"
    };
    // Valeurs vides (et non absentes) pour que le fichier .env local ne les remplisse pas.
    for (const cle of ["DATABASE_URL", "RESEND_API_KEY", "EMAIL_FROM", "EMAIL_TO", "RESEND_WEBHOOK_SECRET",
        "CINETPAY_API_KEY", "CINETPAY_SITE_ID", "PUBLIC_BASE_URL", "AI_API_URL", "AI_API_KEY", "AI_MODEL"]) {
        env[cle] = "";
    }
    serveur = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let sortie = "";
    await new Promise((resolve, reject) => {
        const delai = setTimeout(() => reject(new Error(`Le serveur n'a pas démarré :\n${sortie}`)), 15000);
        const lire = (chunk) => {
            sortie += chunk;
            if (sortie.includes("disponible sur")) { clearTimeout(delai); resolve(); }
        };
        serveur.stdout.on("data", lire);
        serveur.stderr.on("data", lire);
        serveur.on("exit", (code) => { clearTimeout(delai); reject(new Error(`Serveur arrêté (code ${code}) :\n${sortie}`)); });
    });
});

after(() => {
    serveur?.removeAllListeners("exit");
    serveur?.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
});

async function api(chemin, { method = "GET", body, cookie } = {}) {
    const headers = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (cookie) headers.Cookie = cookie;
    const reponse = await fetch(BASE + chemin, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const texte = await reponse.text();
    let json = null;
    try { json = JSON.parse(texte); } catch { /* réponse non JSON */ }
    const setCookie = reponse.headers.get("set-cookie");
    return { status: reponse.status, json, texte, cookie: setCookie ? setCookie.split(";")[0] : null };
}

let compteur = 0;
function nouveauClient() {
    compteur += 1;
    return { nom: `Client ${compteur}`, email: `client${compteur}.${Date.now()}@exemple.ci`, telephone: "0700000000", motDePasse: "motdepasse-solide" };
}

async function inscrireEtConnecter(client = nouveauClient()) {
    assert.equal((await api("/api/clients", { method: "POST", body: client })).status, 201);
    const connexion = await api("/api/login", { method: "POST", body: { email: client.email, motDePasse: client.motDePasse } });
    assert.equal(connexion.status, 200);
    assert.ok(connexion.cookie, "cookie de session attendu");
    return { client, cookie: connexion.cookie, id: connexion.json.id };
}

test("santé du serveur", async () => {
    const { status, json } = await api("/api/health");
    assert.equal(status, 200);
    assert.equal(json.ok, true);
});

test("les pages publiques sont servies, les fichiers internes non", async () => {
    for (const page of ["/", "/appareils.html", "/assistance-appareils.html", "/confidentialite.html"]) {
        assert.equal((await api(page)).status, 200, page);
    }
    for (const prive of ["/server.js", "/.env", "/data/store.json", "/package.json", "/.git/config", "/assets/%2e%2e/server.js"]) {
        assert.equal((await api(prive)).status, 404, prive);
    }
});

test("inscription : validation, doublon, mot de passe non stocké en clair", async () => {
    const client = nouveauClient();
    assert.equal((await api("/api/clients", { method: "POST", body: { ...client, motDePasse: "court" } })).status, 400);
    assert.equal((await api("/api/clients", { method: "POST", body: { ...client, email: "invalide" } })).status, 400);
    assert.equal((await api("/api/clients", { method: "POST", body: client })).status, 201);
    assert.equal((await api("/api/clients", { method: "POST", body: client })).status, 409);
    const stockage = fs.readFileSync(path.join(dataDir, "store.json"), "utf8");
    assert.ok(stockage.includes(client.email));
    assert.ok(!stockage.includes(client.motDePasse), "le mot de passe ne doit pas apparaître en clair");
});

test("connexion et session client", async () => {
    const { client, cookie } = await inscrireEtConnecter();
    assert.equal((await api("/api/login", { method: "POST", body: { email: client.email, motDePasse: "mauvais-mot-de-passe" } })).status, 401);
    const session = await api("/api/client/session", { cookie });
    assert.equal(session.status, 200);
    assert.equal(session.json.email, client.email);
    assert.equal((await api("/api/client/session")).status, 401);
    assert.equal((await api("/api/client/session", { cookie: "unique_art_client=falsifie.signature" })).status, 401);
});

test("inscriptions simultanées : chaque compte reste distinct", async () => {
    const clients = Array.from({ length: 8 }, nouveauClient);
    const reponses = await Promise.all(clients.map((c) => api("/api/clients", { method: "POST", body: c })));
    reponses.forEach((r) => assert.equal(r.status, 201));
    const ids = [];
    for (const c of clients) {
        const connexion = await api("/api/login", { method: "POST", body: { email: c.email, motDePasse: c.motDePasse } });
        assert.equal(connexion.status, 200, `connexion de ${c.email}`);
        ids.push(String(connexion.json.id));
        const session = await api("/api/client/session", { cookie: connexion.cookie });
        assert.equal(session.json.email, c.email, "la session doit ouvrir le bon compte");
    }
    assert.equal(new Set(ids).size, ids.length, "identifiants de compte en double");
});

test("inventaire d'appareils : réservé au compte connecté, aller-retour fidèle", async () => {
    const { cookie } = await inscrireEtConnecter();
    const appareils = [{ id: "tel-1", name: "Téléphone de test", type: "Téléphone", platform: "android", serial: "", contact: "", status: "ready", location: null }];
    assert.equal((await api("/api/client/devices", { method: "PUT", body: { appareils } })).status, 401);
    assert.equal((await api("/api/client/devices", { method: "PUT", body: { appareils: [{ id: "x" }] }, cookie })).status, 400);
    assert.equal((await api("/api/client/devices", { method: "PUT", body: { appareils }, cookie })).status, 200);
    const lecture = await api("/api/client/devices", { cookie });
    assert.equal(lecture.status, 200);
    assert.deepEqual(lecture.json.appareils, appareils);
});

test("administration : mot de passe vérifié, routes protégées", async () => {
    assert.equal((await api("/api/admin/session", { method: "POST", body: { password: "faux" } })).status, 401);
    assert.equal((await api("/api/creations", { method: "POST", body: { title: "x" } })).status, 401);
    const connexion = await api("/api/admin/session", { method: "POST", body: { password: ADMIN_KEY } });
    assert.equal(connexion.status, 200);
    assert.equal((await api("/api/admin/session", { cookie: connexion.cookie })).json.authenticated, true);
    assert.equal((await api("/api/admin/session")).json.authenticated, false);
});

test("discussions : création publique, suppression réservée à l'admin", async () => {
    const creation = await api("/api/discussions", { method: "POST", body: { name: "Visiteur", email: "visiteur@exemple.ci", type: "Question", message: "Bonjour" } });
    assert.equal(creation.status, 201);
    assert.equal((await api("/api/discussions", { method: "POST", body: { name: "Incomplet" } })).status, 400);
    assert.equal((await api(`/api/discussions/${creation.json.id}`, { method: "DELETE" })).status, 401);
    const admin = await api("/api/admin/session", { method: "POST", body: { password: ADMIN_KEY } });
    assert.equal((await api(`/api/discussions/${creation.json.id}`, { method: "DELETE", cookie: admin.cookie })).status, 200);
});

test("commandes : produit validé côté serveur, paiement non configuré signalé honnêtement", async () => {
    const commande = { nom: "Acheteur", email: "acheteur@exemple.ci", telephone: "0700000000" };
    assert.equal((await api("/api/orders", { method: "POST", body: { ...commande, produitId: "inexistant" } })).status, 400);
    assert.equal((await api("/api/orders", { method: "POST", body: { ...commande, produitId: "illustration" } })).status, 503);
});

test("mot de passe oublié : refus explicite si l'e-mail n'est pas configuré", async () => {
    assert.equal((await api("/api/password/forgot", { method: "POST", body: { email: "a@exemple.ci" } })).status, 503);
    assert.equal((await api("/api/password/reset", { method: "POST", body: { token: "invalide", motDePasse: "nouveau-mot-de-passe" } })).status, 400);
});

async function inviterPourPartage(cookie) {
    const appareils = [{ id: "tel-partage", name: "Téléphone partagé", type: "Téléphone", platform: "android", serial: "", contact: "", status: "lost", location: null }];
    assert.equal((await api("/api/client/devices", { method: "PUT", body: { appareils }, cookie })).status, 200);
    const invitation = await api("/api/client/location-shares", { method: "POST", body: { deviceId: "tel-partage" }, cookie });
    assert.equal(invitation.status, 201);
    return invitation.json.partage;
}

test("partage de position : le cookie d'invité n'ouvre jamais le compte du propriétaire", async () => {
    const { cookie } = await inscrireEtConnecter();
    const partage = await inviterPourPartage(cookie);
    const acceptation = await api("/api/location-shares/accept", { method: "POST", body: { token: partage.invitationToken } });
    assert.equal(acceptation.status, 200);
    const jetonInvite = acceptation.cookie.split("=").slice(1).join("=");
    const usurpation = await api("/api/client/session", { cookie: `unique_art_client=${jetonInvite}` });
    assert.equal(usurpation.status, 401, "un jeton de partage ne doit pas valoir session client");
    assert.equal((await api("/api/client/devices", { cookie: `unique_art_client=${jetonInvite}` })).status, 401);
    // Et inversement : une session client ne doit pas valoir session de partage.
    const jetonClient = cookie.split("=").slice(1).join("=");
    assert.equal((await api("/api/location-shares/position", { method: "POST", body: { latitude: 5, longitude: -4 }, cookie: `unique_art_location_share=${jetonClient}` })).status, 401);
});

test("partage de position : invitation à usage unique, position reçue, révocation", async () => {
    const { cookie } = await inscrireEtConnecter();
    const partage = await inviterPourPartage(cookie);
    assert.equal((await api("/api/client/location-shares", { method: "POST", body: { deviceId: "tel-partage" }, cookie })).status, 409);
    const acceptation = await api("/api/location-shares/accept", { method: "POST", body: { token: partage.invitationToken } });
    assert.equal(acceptation.status, 200);
    assert.equal((await api("/api/location-shares/accept", { method: "POST", body: { token: partage.invitationToken } })).status, 410);
    const envoi = await api("/api/location-shares/position", { method: "POST", body: { latitude: 5.35, longitude: -4.01 }, cookie: acceptation.cookie });
    assert.equal(envoi.status, 200);
    const appareils = await api("/api/client/devices", { cookie });
    assert.equal(appareils.json.appareils[0].location.latitude, 5.35);
    assert.equal((await api(`/api/client/location-shares/${partage.id}`, { method: "DELETE", cookie })).status, 200);
    assert.equal((await api("/api/location-shares/position", { method: "POST", body: { latitude: 5, longitude: -4 }, cookie: acceptation.cookie })).status, 410);
});

test("texte accentué volumineux : aucun caractère corrompu", async () => {
    const admin = await api("/api/admin/session", { method: "POST", body: { password: ADMIN_KEY } });
    const description = "Éléphant à l’œuvre — ".repeat(90);
    const creation = await api("/api/creations", { method: "POST", cookie: admin.cookie, body: { title: "Œuvre accentuée", description, image: "data:image/png;base64," + "A".repeat(200000) } });
    assert.equal(creation.status, 201);
    const liste = await api("/api/creations");
    const trouvee = liste.json.find((c) => c.id === creation.json.id);
    assert.equal(trouvee.description, description.trim().slice(0, 2000));
    assert.ok(!liste.texte.includes("�"), "caractère de remplacement détecté");
});

test("publications simultanées : identifiants distincts, aucune perte", async () => {
    const reponses = await Promise.all(Array.from({ length: 10 }, (_, i) =>
        api("/api/discussions", { method: "POST", body: { name: `Simultané ${i}`, email: `s${i}@exemple.ci`, type: "Question", message: "Bonjour" } })));
    reponses.forEach((r) => assert.equal(r.status, 201));
    const ids = reponses.map((r) => r.json.id);
    assert.equal(new Set(ids).size, ids.length, "identifiants de discussion en double");
    const admin = await api("/api/admin/session", { method: "POST", body: { password: ADMIN_KEY } });
    const toutes = await api("/api/discussions", { cookie: admin.cookie });
    for (const id of ids) assert.ok(toutes.json.some((d) => d.id === id), `discussion ${id} perdue`);
});
