/* =========================================================
   UNIQUE ART VISUEL STUDIO — fonctions communes à toutes les pages
   ========================================================= */
"use strict";

const Studio = (() => {
    const API = "/api";

    async function api(chemin, options = {}) {
        const entetes = { ...(options.headers || {}) };
        if (options.body !== undefined && !(options.body instanceof FormData)) entetes["Content-Type"] = "application/json";
        let reponse;
        try {
            reponse = await fetch(`${API}${chemin}`, {
                credentials: "same-origin",
                ...options,
                headers: entetes,
                body: options.body === undefined || typeof options.body === "string" ? options.body : JSON.stringify(options.body)
            });
        } catch {
            throw new Error("Connexion au serveur impossible. Vérifiez votre connexion internet puis réessayez.");
        }
        const texte = await reponse.text();
        let donnees = null;
        try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = null; }
        if (!reponse.ok) {
            const erreur = new Error(donnees?.error || `Le serveur a répondu avec une erreur (${reponse.status}).`);
            erreur.status = reponse.status;
            throw erreur;
        }
        return donnees;
    }

    function echapper(valeur) {
        return String(valeur ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }

    function prix(montant) {
        return `${Number(montant || 0).toLocaleString("fr-FR")} FCFA`;
    }

    function date(valeur, options = { day: "numeric", month: "long", year: "numeric" }) {
        const d = new Date(valeur);
        return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", options);
    }

    function statut(element, message, type = "") {
        if (!element) return;
        element.classList.remove("succes", "erreur");
        if (type) element.classList.add(type);
        element.textContent = message || "";
    }

    function avis(message, type = "") {
        const bandeau = document.getElementById("avisGlobal");
        if (!bandeau) return;
        bandeau.classList.remove("succes", "erreur");
        if (type) bandeau.classList.add(type);
        bandeau.textContent = message;
        bandeau.hidden = !message;
    }

    // Crée un élément DOM : el("p", { class: "x", text: "…" }, enfants…). Le texte n'est jamais interprété comme HTML.
    function el(balise, attributs = {}, ...enfants) {
        const element = document.createElement(balise);
        for (const [cle, valeur] of Object.entries(attributs)) {
            if (valeur === undefined || valeur === null || valeur === false) continue;
            if (cle === "text") element.textContent = valeur;
            else if (cle === "class") element.className = valeur;
            else if (cle.startsWith("on") && typeof valeur === "function") element.addEventListener(cle.slice(2), valeur);
            else if (cle === "dataset") Object.assign(element.dataset, valeur);
            else element.setAttribute(cle, valeur === true ? "" : valeur);
        }
        for (const enfant of enfants.flat()) {
            if (enfant === null || enfant === undefined || enfant === false) continue;
            element.append(enfant instanceof Node ? enfant : document.createTextNode(String(enfant)));
        }
        return element;
    }

    // Un média n'est affiché que s'il provient du site ou d'un fichier importé (data:) d'un type attendu.
    function urlMediaSure(valeur, types = ["image"]) {
        const texte = String(valeur || "").trim();
        if (!texte) return "";
        if (texte.startsWith("/") && !texte.startsWith("//")) return texte;
        const correspondance = texte.match(/^data:([a-z]+)\/[a-z0-9.+-]+;base64,/i);
        if (correspondance && types.includes(correspondance[1].toLowerCase())) return texte;
        return "";
    }

    let santePromesse = null;
    function sante() {
        if (!santePromesse) santePromesse = api("/health").catch(() => null);
        return santePromesse;
    }

    function initialiserNavigation() {
        const bouton = document.querySelector(".bouton-menu");
        const nav = document.getElementById("navPrincipale");
        if (!bouton || !nav) return;
        const fermer = () => {
            nav.classList.remove("ouverte");
            bouton.setAttribute("aria-expanded", "false");
            bouton.setAttribute("aria-label", "Ouvrir le menu");
        };
        bouton.addEventListener("click", () => {
            const ouvert = nav.classList.toggle("ouverte");
            bouton.setAttribute("aria-expanded", String(ouvert));
            bouton.setAttribute("aria-label", ouvert ? "Fermer le menu" : "Ouvrir le menu");
        });
        nav.addEventListener("click", (evenement) => { if (evenement.target.closest("a")) fermer(); });
        document.addEventListener("keydown", (evenement) => { if (evenement.key === "Escape") fermer(); });
    }

    function initialiserApparitions() {
        const elements = document.querySelectorAll(".apparition");
        if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            elements.forEach((element) => element.classList.add("visible"));
            return;
        }
        const observateur = new IntersectionObserver((entrees) => {
            for (const entree of entrees) {
                if (entree.isIntersecting) {
                    entree.target.classList.add("visible");
                    observateur.unobserve(entree.target);
                }
            }
        }, { rootMargin: "0px 0px -8% 0px" });
        elements.forEach((element) => observateur.observe(element));
    }

    function retirerParametres(...noms) {
        const params = new URLSearchParams(window.location.search);
        noms.forEach((nom) => params.delete(nom));
        const requete = params.toString();
        window.history.replaceState({}, "", `${window.location.pathname}${requete ? `?${requete}` : ""}${window.location.hash}`);
    }

    // Retour du guichet de paiement : le statut affiché est toujours celui vérifié par le serveur.
    async function traiterRetourPaiement() {
        const params = new URLSearchParams(window.location.search);
        if (params.get("paiement") !== "retour") return;
        const transaction = params.get("transaction_id") || params.get("cpm_trans_id") || params.get("commande");
        retirerParametres("paiement", "transaction_id", "cpm_trans_id", "commande");
        if (!transaction || !/^[a-f0-9]{32}$/.test(transaction)) {
            avis("Retour du paiement reçu. Le statut de votre commande sera confirmé par e-mail et dans votre espace client.");
            return;
        }
        avis("Vérification de votre paiement auprès du prestataire…");
        for (let tentative = 0; tentative < 10; tentative += 1) {
            try {
                const resultat = await api(`/payments/status?transaction_id=${encodeURIComponent(transaction)}`);
                if (resultat.statut === "confirmée") {
                    avis(`Paiement confirmé${resultat.produit ? ` pour « ${resultat.produit} »` : ""}. Merci ! Un récapitulatif vous est envoyé par e-mail.`, "succes");
                    return;
                }
                if (["paiement refusé", "échec de création du paiement"].includes(resultat.statut)) {
                    avis("Le paiement n’a pas été confirmé. Aucune somme n’est due pour cette commande ; vous pouvez réessayer.", "erreur");
                    return;
                }
                avis("Votre paiement est en cours de confirmation par le prestataire…");
            } catch {
                avis("La vérification du paiement est momentanément indisponible. Le statut vous sera confirmé par e-mail.");
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 2500));
        }
        avis("Le paiement est toujours en attente de confirmation. Vous retrouverez son statut dans votre espace client.");
    }

    document.addEventListener("DOMContentLoaded", () => {
        initialiserNavigation();
        initialiserApparitions();
        document.querySelectorAll("[data-annee]").forEach((element) => { element.textContent = new Date().getFullYear(); });
        traiterRetourPaiement();
    });

    return { api, echapper, prix, date, statut, avis, el, urlMediaSure, sante, retirerParametres };
})();
