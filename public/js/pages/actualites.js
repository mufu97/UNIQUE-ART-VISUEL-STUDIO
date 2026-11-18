/* Fil d'actualités publié par l'administration. */
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const { el } = Studio;
    const liste = document.getElementById("listeActualites");
    const filtres = document.getElementById("filtresActualites");
    let actualites = [];
    let filtre = "Toutes";
    try {
        const reponse = await Studio.api("/actualites");
        actualites = (Array.isArray(reponse) ? reponse : []).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
    } catch {
        liste.replaceChildren(el("p", { class: "etat-vide", text: "Les actualités sont momentanément indisponibles. Réessayez dans un instant." }));
        return;
    }

    function afficher() {
        const types = ["Toutes", ...new Set(actualites.map((actualite) => actualite.type).filter(Boolean))];
        filtres.replaceChildren(...(types.length > 2 ? types : []).map((type) => el("button", {
            class: "filtre", type: "button", "aria-pressed": String(type === filtre), text: type,
            onclick: () => { filtre = type; afficher(); }
        })));
        const visibles = actualites.filter((actualite) => filtre === "Toutes" || actualite.type === filtre);
        if (!visibles.length) {
            liste.replaceChildren(el("p", { class: "etat-vide", text: "Aucune actualité publiée pour le moment. Revenez bientôt." }));
            return;
        }
        liste.replaceChildren(...visibles.map((actualite) => el("article", { class: "carte", id: `actualite-${actualite.id}` },
            el("span", { class: "numero", text: `${actualite.type || "Actualité"} · ${Studio.date(actualite.date)}` }),
            el("h2", { text: actualite.title }),
            el("p", { class: "texte-article", text: actualite.content }))));
        const cible = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
        cible?.scrollIntoView();
    }
    afficher();
});
