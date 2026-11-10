// Prépare un lancement local sans manipulation : crée `.env` à partir de `.env.example`
// s'il n'existe pas encore, avec un mot de passe administrateur et un secret de session
// générés au hasard. Un `.env` existant n'est jamais modifié.
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const racine = path.join(__dirname, "..");
const fichierEnv = path.join(racine, ".env");

function lireCleAdmin() {
    const ligne = fs.readFileSync(fichierEnv, "utf8").split(/\r?\n/).find((entree) => entree.startsWith("ADMIN_API_KEY="));
    return ligne ? ligne.slice("ADMIN_API_KEY=".length).trim() : "";
}

if (!fs.existsSync(fichierEnv)) {
    const cleAdmin = crypto.randomBytes(18).toString("base64url");
    const secretSession = crypto.randomBytes(32).toString("base64url");
    const modele = fs.readFileSync(path.join(racine, ".env.example"), "utf8")
        .replace(/^ADMIN_API_KEY=.*$/m, `ADMIN_API_KEY=${cleAdmin}`)
        .replace(/^CLIENT_SESSION_SECRET=.*$/m, `CLIENT_SESSION_SECRET=${secretSession}`);
    fs.writeFileSync(fichierEnv, modele, { mode: 0o600 });
    console.log("Fichier .env créé pour ce poste.");
}

const cle = lireCleAdmin();
console.log("");
console.log(cle
    ? `Mot de passe administrateur (bouton « Administration » du site) : ${cle}`
    : "Aucun mot de passe administrateur : renseignez ADMIN_API_KEY dans le fichier .env.");
console.log("Il est conservé dans le fichier .env de ce dossier ; ne partagez pas ce fichier.");
console.log("");
