/* Accueil : sélection de créations, publications et dernières actualités. */
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const { el } = Studio;

    const oeuvres = document.getElementById("selectionOeuvres");
    Catalogue.oeuvres.forEach((oeuvre) => {
        oeuvres?.append(el("a", { class: "carte apparition visible", href: `/oeuvres#${oeuvre.id}` },
            el("span", { class: "numero", text: oeuvre.genre }),
            el("h3", { text: oeuvre.titre }),
            el("p", { text: oeuvre.resume }),
            el("span", { class: "lien-fleche", text: "Lire la fiche" })));
    });

    const selection = document.getElementById("selectionCreations");
    let creations = [];
    try {
        const serveur = await Studio.api("/creations");
        if (Array.isArray(serveur)) creations = serveur.slice().reverse();
    } catch {
        /* la sélection utilise alors les études publiées */
    }
    const affichees = [...creations, ...Catalogue.etudes].map(Catalogue.normaliserCreation)
        .filter((creation) => creation.miniature).slice(0, 4);
    affichees.forEach((creation) => {
        selection?.append(el("figure", { class: "oeuvre" },
            el("a", { href: `/creations#${encodeURIComponent(creation.id)}`, "aria-label": `${creation.titre}, voir dans la galerie` },
                el("div", { class: "oeuvre-visuel" }, el("img", { src: creation.miniature, alt: creation.titre, loading: "lazy", decoding: "async", width: "640", height: "960" }))),
            el("figcaption", {}, el("span", { text: creation.categorie }), el("strong", { text: creation.titre }))));
    });

    const actualites = document.getElementById("dernieresActualites");
    try {
        const liste = await Studio.api("/actualites");
        const recentes = (Array.isArray(liste) ? liste : []).slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3);
        if (!recentes.length) throw new Error("vide");
        recentes.forEach((actualite) => {
            actualites?.append(el("a", { class: "carte", href: `/actualites#actualite-${actualite.id}` },
                el("span", { class: "numero", text: `${actualite.type || "Actualité"} · ${Studio.date(actualite.date)}` }),
                el("h3", { text: actualite.title }),
                el("p", { text: String(actualite.content || "").slice(0, 180) + (String(actualite.content || "").length > 180 ? "…" : "") })));
        });
    } catch {
        actualites?.append(el("p", { class: "etat-vide", text: "Les prochaines actualités du studio seront publiées ici." }));
    }
});
