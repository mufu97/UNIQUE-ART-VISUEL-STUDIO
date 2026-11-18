/* =========================================================
   Contenus de référence du studio (publiés sur le site).
   Les créations ajoutées par l'administration via /api/creations
   s'ajoutent à ces études. Aucune information n'est inventée ici :
   les descriptions reprennent celles déjà publiées par le studio.
   ========================================================= */
"use strict";

const Catalogue = {
    categoriesCreations: [
        "Illustration", "Dessin", "Bande dessinée", "Personnage", "Affiche",
        "Couverture", "Direction artistique", "Animation"
    ],

    etudes: [
        { id: "etude-trait", title: "Étude de portrait · trait", category: "Dessin", description: "Portrait en noir et blanc dessiné au trait.", image: "/assets/optimized/oeuvres/web/portrait-etude-trait-1280.webp", miniature: "/assets/optimized/oeuvres/web/portrait-etude-trait-640.webp" },
        { id: "etude-couleur", title: "Étude de portrait · couleur", category: "Illustration", description: "Portrait illustré en couleur sur fond jaune.", image: "/assets/optimized/oeuvres/web/portrait-etude-couleur-1280.webp", miniature: "/assets/optimized/oeuvres/web/portrait-etude-couleur-640.webp" },
        { id: "etude-gris", title: "Étude de portrait · gris", category: "Illustration", description: "Portrait expressif travaillé en nuances de gris.", image: "/assets/optimized/oeuvres/web/portrait-etude-gris-1280.webp", miniature: "/assets/optimized/oeuvres/web/portrait-etude-gris-640.webp" },
        { id: "etude-crayon", title: "Étude de portrait · crayon", category: "Dessin", description: "Portrait en noir et blanc, réalisé au crayon.", image: "/assets/optimized/oeuvres/web/portrait-etude-crayon-1280.webp", miniature: "/assets/optimized/oeuvres/web/portrait-etude-crayon-640.webp" }
    ],

    oeuvres: [
        {
            id: "le-singularisme",
            titre: "Le Singularisme",
            genre: "Œuvre philosophique",
            auteur: "Ando Dieudonné-Jean N'dé",
            resume: "Une œuvre sur la pensée, l’individu, l’authenticité et la société.",
            themes: ["La pensée", "L’individu", "L’authenticité", "La société"],
            couverture: "singularisme",
            question: "Peux-tu m’expliquer la pensée du Singularisme ?"
        },
        {
            id: "le-pouvoir-des-mots",
            titre: "Le Pouvoir des Mots",
            genre: "Récit graphique",
            auteur: "Ando Dieudonné-Jean N'dé",
            resume: "Une série sur la force du verbe, de la parole et de l’imagination.",
            themes: ["Le verbe", "La parole", "L’imagination"],
            couverture: "mots",
            question: "Quels thèmes explore Le Pouvoir des Mots ?"
        }
    ]
};

// Normalise une création venant de l'API ou du catalogue local.
Catalogue.normaliserCreation = function normaliserCreation(creation, index = 0) {
    const image = Studio.urlMediaSure(creation.image, ["image"]);
    const video = Studio.urlMediaSure(creation.video, ["video"]);
    const pdf = Studio.urlMediaSure(creation.pdf, ["application"]);
    return {
        id: String(creation.id ?? `creation-${index}`),
        titre: String(creation.title || creation.titre || "Création sans titre"),
        categorie: String(creation.category || creation.categorie || "Création"),
        description: String(creation.description || ""),
        date: creation.date || null,
        image,
        miniature: Studio.urlMediaSure(creation.miniature, ["image"]) || image,
        video,
        pdf
    };
};

// Construit la couverture typographique d'une œuvre écrite (pas d'image inventée).
Catalogue.couverture = function couverture(oeuvre) {
    const { el } = Studio;
    return el("div", { class: `couverture${oeuvre.couverture === "mots" ? " couverture-mots" : ""}`, role: "img", "aria-label": `Couverture : ${oeuvre.titre}` },
        el("small", { text: oeuvre.genre.toUpperCase() }),
        el("strong", { text: oeuvre.titre }),
        el("span", { text: oeuvre.auteur }));
};
