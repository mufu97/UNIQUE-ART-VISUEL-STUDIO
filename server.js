const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MAX_BODY_SIZE = 80 * 1024 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 120;
const requestCounts = new Map();

if (IS_PRODUCTION && !process.env.ADMIN_API_KEY) {
    throw new Error("ADMIN_API_KEY doit être configurée en production.");
}
const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml"
};

function ensureStore() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ clients: [], discussions: [], orders: [], creations: [], actualites: [] }, null, 2));
    }
}

function readStore() {
    ensureStore();
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function writeStore(store) {
    const temporaryFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(store, null, 2));
    fs.renameSync(temporaryFile, DATA_FILE);
}

function sendJson(response, status, payload) {
    response.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });
    response.end(JSON.stringify(payload));
}

function getClientAddress(request) {
    return request.headers["x-forwarded-for"]?.split(",")[0].trim() || request.socket.remoteAddress || "unknown";
}

function isRateLimited(request) {
    const now = Date.now();
    const address = getClientAddress(request);
    const current = requestCounts.get(address);

    if (requestCounts.size > 10000) {
        for (const [storedAddress, entry] of requestCounts) {
            if (now - entry.startedAt > RATE_WINDOW_MS) {
                requestCounts.delete(storedAddress);
            }
        }
    }

    if (!current || now - current.startedAt > RATE_WINDOW_MS) {
        requestCounts.set(address, { startedAt: now, count: 1 });
        return false;
    }

    current.count += 1;
    return current.count > RATE_LIMIT;
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = "";

        const declaredLength = Number(request.headers["content-length"] || 0);
        if (declaredLength > MAX_BODY_SIZE) {
            reject(new Error("Payload trop volumineux"));
            request.destroy();
            return;
        }

        request.on("data", (chunk) => {
            body += chunk;
            if (Buffer.byteLength(body, "utf8") > MAX_BODY_SIZE) {
                reject(new Error("Payload trop volumineux"));
                request.destroy();
            }
        });

        request.on("end", () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(new Error("JSON invalide"));
            }
        });

        request.on("error", reject);
    });
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(password).digest("hex");
}

function isAdminRequest(request) {
    const configuredKey = process.env.ADMIN_API_KEY || (IS_PRODUCTION ? "" : "UNIQUE17");
    const suppliedKey = request.headers["x-admin-key"] || "";

    if (!configuredKey || suppliedKey.length !== configuredKey.length) {
        return false;
    }

    return crypto.timingSafeEqual(Buffer.from(suppliedKey), Buffer.from(configuredKey));
}

function handleApi(request, response, url) {
    if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true, service: "unique-art-backend" });
        return true;
    }

    if (request.method === "GET" && url.pathname === "/api/admin/overview") {
        if (!isAdminRequest(request)) {
            sendJson(response, 401, { error: "Action réservée à l'administrateur." });
            return true;
        }

        const store = readStore();
        const orders = store.orders || [];
        const totalPrevisionnel = orders.reduce((total, order) => total + (Number(order.prix) || 0), 0);
        const commandesConfirmees = orders.filter((order) => String(order.statut).toLowerCase() === "confirmée");
        const chiffreAffairesConfirme = commandesConfirmees.reduce((total, order) => total + (Number(order.prix) || 0), 0);
        const activites = [
            ...(store.orders || []).map((order) => ({ type: "Commande", detail: order.produit, date: order.date, montant: Number(order.prix) || 0 })),
            ...(store.clients || []).map((client) => ({ type: "Nouveau client", detail: client.nom, date: client.creeLe })),
            ...(store.discussions || []).map((discussion) => ({ type: "Discussion", detail: discussion.name, date: discussion.date })),
            ...(store.actualites || []).map((actualite) => ({ type: "Actualité", detail: actualite.title, date: actualite.date })),
            ...(store.creations || []).map((creation) => ({ type: "Création", detail: creation.title, date: creation.date }))
        ].filter((activity) => activity.date).sort((left, right) => new Date(right.date) - new Date(left.date));

        sendJson(response, 200, {
            actualiseLe: new Date().toISOString(),
            comptabilite: {
                totalPrevisionnel,
                chiffreAffairesConfirme,
                commandes: orders.length,
                commandesEnAttente: orders.length - commandesConfirmees.length,
                panierMoyen: orders.length ? totalPrevisionnel / orders.length : 0
            },
            volumes: {
                clients: (store.clients || []).length,
                discussions: (store.discussions || []).length,
                creations: (store.creations || []).length,
                actualites: (store.actualites || []).length
            },
            activites: activites.slice(0, 8)
        });
        return true;
    }

    if (request.method === "GET" && url.pathname === "/api/discussions") {
        sendJson(response, 200, readStore().discussions);
        return true;
    }

    if (request.method === "GET" && url.pathname === "/api/creations") {
        sendJson(response, 200, readStore().creations || []);
        return true;
    }

    if (request.method === "GET" && url.pathname === "/api/actualites") {
        sendJson(response, 200, readStore().actualites || []);
        return true;
    }

    if (request.method === "POST" && url.pathname === "/api/translate") {
        readBody(request).then(async (body) => {
            const texte = String(body.text || "").trim();
            const langue = String(body.language || "en").trim().toLowerCase();
            const languesAutorisees = ["en", "es", "pt", "de", "ar"];

            if (!texte || !languesAutorisees.includes(langue)) {
                sendJson(response, 400, { error: "Texte ou langue invalide." });
                return;
            }

            const traductionResponse = await fetch(
                `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texte)}&langpair=fr|${encodeURIComponent(langue)}`
            );
            const traductionData = await traductionResponse.json();
            const traduction = traductionData?.responseData?.translatedText;

            if (!traductionResponse.ok || !traduction) {
                sendJson(response, 502, { error: "Le service de traduction est indisponible." });
                return;
            }

            sendJson(response, 200, { translation: traduction });
        }).catch((error) => sendJson(response, 502, { error: error.message }));
        return true;
    }

    if (request.method === "POST" && url.pathname === "/api/actualites") {
        readBody(request).then((body) => {
            if (!body.title || !body.content || !body.type) {
                sendJson(response, 400, { error: "Titre, type et contenu requis." });
                return;
            }

            const store = readStore();
            store.actualites = store.actualites || [];
            const actualite = {
                id: Date.now(),
                title: String(body.title).slice(0, 150),
                type: String(body.type).slice(0, 60),
                content: String(body.content).slice(0, 2000),
                date: new Date().toISOString()
            };
            store.actualites.push(actualite);
            writeStore(store);
            sendJson(response, 201, actualite);
        }).catch((error) => sendJson(response, 400, { error: error.message }));
        return true;
    }

    if (request.method === "POST" && url.pathname === "/api/creations") {
        readBody(request).then((body) => {
            if (!body.title || (!body.image && !body.pdf && !body.video)) {
                sendJson(response, 400, { error: "Un titre et un fichier sont requis." });
                return;
            }

            const store = readStore();
            store.creations = store.creations || [];
            const creation = {
                id: Date.now(),
                title: String(body.title).slice(0, 150),
                category: String(body.category || "Autre").slice(0, 100),
                description: String(body.description || "Création visuelle.").slice(0, 2000),
                image: body.image || "",
                pdf: body.pdf || "",
                video: body.video || "",
                date: new Date().toISOString()
            };
            store.creations.push(creation);
            writeStore(store);
            sendJson(response, 201, creation);
        }).catch((error) => sendJson(response, 400, { error: error.message }));
        return true;
    }

    if (request.method === "POST" && url.pathname === "/api/discussions") {
        readBody(request).then((body) => {
            if (!body.name || !body.type || !body.message) {
                sendJson(response, 400, { error: "Nom, type et message requis." });
                return;
            }

            const store = readStore();
            store.blocks = store.blocks || [];
            if (store.blocks.some((blockedName) => blockedName.toLowerCase() === String(body.name).trim().toLowerCase())) {
                sendJson(response, 403, { error: "Ce profil est bloqué par le studio." });
                return;
            }
            const discussion = {
                id: Date.now(),
                name: String(body.name).slice(0, 100),
                type: String(body.type).slice(0, 100),
                message: String(body.message).slice(0, 2000),
                date: new Date().toISOString(),
                replies: []
            };
            store.discussions.push(discussion);
            writeStore(store);
            sendJson(response, 201, discussion);
        }).catch((error) => sendJson(response, 400, { error: error.message }));
        return true;
    }

    const discussionMatch = url.pathname.match(/^\/api\/discussions\/(\d+)(?:\/(reply|block))?$/);
    if (discussionMatch && !isAdminRequest(request)) {
        sendJson(response, 401, { error: "Action réservée à l'administrateur." });
        return true;
    }

    if (discussionMatch && request.method === "DELETE" && !discussionMatch[2]) {
        const discussionId = Number(discussionMatch[1]);
        const store = readStore();
        store.discussions = store.discussions.filter((discussion) => discussion.id !== discussionId);
        writeStore(store);
        sendJson(response, 200, { ok: true });
        return true;
    }

    if (discussionMatch && request.method === "POST" && discussionMatch[2] === "reply") {
        readBody(request).then((body) => {
            if (!body.message) {
                sendJson(response, 400, { error: "Une réponse est requise." });
                return;
            }

            const discussionId = Number(discussionMatch[1]);
            const store = readStore();
            const discussion = store.discussions.find((item) => item.id === discussionId);
            if (!discussion) {
                sendJson(response, 404, { error: "Discussion introuvable." });
                return;
            }

            discussion.replies = discussion.replies || [];
            const reply = {
                id: Date.now(),
                message: String(body.message).slice(0, 2000),
                date: new Date().toISOString()
            };
            discussion.replies.push(reply);
            writeStore(store);
            sendJson(response, 201, reply);
        }).catch((error) => sendJson(response, 400, { error: error.message }));
        return true;
    }

    if (discussionMatch && request.method === "POST" && discussionMatch[2] === "block") {
        const discussionId = Number(discussionMatch[1]);
        const store = readStore();
        const discussion = store.discussions.find((item) => item.id === discussionId);
        if (!discussion) {
            sendJson(response, 404, { error: "Discussion introuvable." });
            return true;
        }

        store.blocks = store.blocks || [];
        if (!store.blocks.includes(discussion.name)) {
            store.blocks.push(discussion.name);
        }
        store.discussions = store.discussions.filter((item) => item.name !== discussion.name);
        writeStore(store);
        sendJson(response, 200, { ok: true });
        return true;
    }

    if (request.method === "POST" && url.pathname === "/api/clients") {
        readBody(request).then((body) => {
            if (!body.nom || !body.email || !body.motDePasse || !body.telephone) {
                sendJson(response, 400, { error: "Tous les champs sont requis." });
                return;
            }

            const store = readStore();
            const email = String(body.email).trim().toLowerCase();
            if (store.clients.some((client) => client.email === email)) {
                sendJson(response, 409, { error: "Cette adresse e-mail est déjà utilisée." });
                return;
            }

            store.clients.push({
                id: Date.now(),
                nom: String(body.nom).slice(0, 100),
                email,
                motDePasseHash: hashPassword(String(body.motDePasse)),
                telephone: String(body.telephone).slice(0, 40),
                creeLe: new Date().toISOString()
            });
            writeStore(store);
            sendJson(response, 201, { ok: true });
        }).catch((error) => sendJson(response, 400, { error: error.message }));
        return true;
    }

    if (request.method === "POST" && url.pathname === "/api/login") {
        readBody(request).then((body) => {
            const email = String(body.email || "").trim().toLowerCase();
            const motDePasse = String(body.motDePasse || "");

            if (!email || !motDePasse) {
                sendJson(response, 400, { error: "Adresse e-mail et mot de passe requis." });
                return;
            }

            const client = readStore().clients.find((item) => item.email === email);
            if (!client || client.motDePasseHash !== hashPassword(motDePasse)) {
                sendJson(response, 401, { error: "Adresse e-mail ou mot de passe incorrect." });
                return;
            }

            sendJson(response, 200, {
                id: client.id,
                nom: client.nom,
                email: client.email,
                telephone: client.telephone
            });
        }).catch((error) => sendJson(response, 400, { error: error.message }));
        return true;
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
        readBody(request).then((body) => {
            if (!body.nom || !body.email || !body.telephone || !body.paiement || !body.produit) {
                sendJson(response, 400, { error: "Informations de commande incomplètes." });
                return;
            }

            const store = readStore();
            const order = {
                id: Date.now(),
                produit: String(body.produit).slice(0, 150),
                prix: Number(body.prix) || 0,
                nom: String(body.nom).slice(0, 100),
                email: String(body.email).slice(0, 150),
                telephone: String(body.telephone).slice(0, 40),
                paiement: String(body.paiement).slice(0, 60),
                date: new Date().toISOString(),
                statut: "à confirmer"
            };
            store.orders.push(order);
            writeStore(store);
            sendJson(response, 201, { ok: true, orderId: order.id });
        }).catch((error) => sendJson(response, 400, { error: error.message }));
        return true;
    }

    sendJson(response, 404, { error: "Route API introuvable." });
    return true;
}

function serveFile(request, response, url) {
    const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.normalize(path.join(ROOT, requestedPath));

    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Page introuvable");
        return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, { "Content-Type": MIME_TYPES[extension] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(response);
}

ensureStore();
http.createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (isRateLimited(request)) {
        response.writeHead(429, {
            "Content-Type": "application/json; charset=utf-8",
            "Retry-After": "60",
            "X-Content-Type-Options": "nosniff"
        });
        response.end(JSON.stringify({ error: "Trop de demandes. Réessayez dans une minute." }));
        return;
    }

    if (url.pathname.startsWith("/api/")) {
        handleApi(request, response, url);
        return;
    }

    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("X-Frame-Options", "SAMEORIGIN");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    serveFile(request, response, url);
}).listen(PORT, "0.0.0.0", () => {
    console.log(`Unique Art Studio disponible sur http://localhost:${PORT}`);
});
