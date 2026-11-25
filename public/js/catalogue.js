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

    // Œuvres écrites du studio (ordre d'affichage). « couverture » : image réelle de l'ouvrage, sinon couverture typographique.
    oeuvres: [
        { id: "les-delires-de-pupus", titre: "Les Délires de Pupus", genre: "Roman psychologique", resume: "À Pupus, des enfants disparaissent sans papiers ni noms. Une enquête entre polar, fable politique et vertige existentiel.", image: "/assets/oeuvres/les-delires-de-pupus-480.webp" },
        { id: "le-mythe-incompris-de-kundu", titre: "Le Mythe incompris de Kundu", genre: "Théâtre", resume: "Kundu naît dans le silence et grandit le cri étouffé : son histoire se joue au théâtre d’une enfance perdue.", image: "/assets/oeuvres/le-mythe-incompris-de-kundu-480.webp" },
        { id: "les-lignes-d-ombre", titre: "Les Lignes d’ombre — Lettres à Marie", genre: "Roman épistolaire", resume: "Kpa Alfred écrit à Marie, même après sa disparition. Marie ne répond qu’une seule fois.", image: "/assets/oeuvres/les-lignes-d-ombre-480.webp" },
        { id: "je-suis-handicapee-et-alors", titre: "Je suis handicapée. Et alors ?", genre: "Roman", resume: "Harpie, étudiante en histoire de l’art, et sa sœur : ce que la différence révèle de nous-mêmes.", image: "/assets/oeuvres/je-suis-handicapee-et-alors-480.webp" },
        { id: "les-enfants-de-la-nouvelle-republique", titre: "Les Enfants de la Nouvelle République", genre: "Fable philosophico-politique", resume: "Ei, père et fourmi, perd son enfant faute d’un reçu. De son deuil naît un mouvement.", image: "/assets/oeuvres/les-enfants-de-la-nouvelle-republique-480.webp" },
        { id: "un-instant-d-amour", titre: "Un instant d’amour", genre: "Nouvelle romance", resume: "Suite du Singularisme : Kpa Emeric Alfred raconte ses « instants d’amour ».", image: "/assets/oeuvres/un-instant-d-amour-480.webp" },
        { id: "je-pense-donc-je-suis-fou", titre: "Je pense, donc je suis fou", genre: "Essai", resume: "Réflexion absurde sur la vérité, le langage et la foi.", image: "/assets/oeuvres/je-pense-donc-je-suis-fou-480.webp" },
        { id: "l-amour-est-une-superstition", titre: "L’Amour est une superstition", genre: "Essai poétique", resume: "Une dérive amoureuse pour celles et ceux qui osent penser avec le cœur… jusqu’au vertige.", image: "/assets/oeuvres/l-amour-est-une-superstition-480.webp" },
        { id: "creer-c-est-resister", titre: "Créer, c’est résister", genre: "Essai · manifeste", resume: "Une parole contre le plagiat et pour la reconnaissance de la création africaine.", image: "/assets/oeuvres/creer-c-est-resister-480.webp" },
        { id: "les-enfants-de-l-eclipse", titre: "Les Enfants de l’Éclipse", genre: "Essai poétique", resume: "Vingt-quatre petits chapitres comme autant de lampes dans l’obscurité de l’enfance.", image: "/assets/oeuvres/les-enfants-de-l-eclipse-480.webp" },
        { id: "le-singularisme", titre: "Le Singularisme", genre: "Conte philosophique", resume: "À Pupus, un jeune instituteur découvre que l’école ne suffit pas à comprendre la vie.", image: "/assets/oeuvres/le-singularisme-480.webp" },
        { id: "le-pouvoir-des-mots", titre: "Le Pouvoir des Mots", genre: "Récit graphique", auteur: "Ando Dieudonné-Jean N'dé", resume: "Une série sur la force du verbe, de la parole et de l’imagination.", couverture: "mots" }
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

// Couverture d'une œuvre : l'image réelle si elle existe, sinon une couverture typographique (pas d'image inventée).
Catalogue.couverture = function couverture(oeuvre) {
    const { el } = Studio;
    if (oeuvre.image) return el("img", { src: oeuvre.image, alt: `Couverture : ${oeuvre.titre}`, width: "480", height: "680", loading: "lazy", decoding: "async" });
    return el("div", { class: `couverture${oeuvre.couverture === "mots" ? " couverture-mots" : ""}`, role: "img", "aria-label": `Couverture : ${oeuvre.titre}` },
        el("small", { text: oeuvre.genre.toUpperCase() }),
        el("strong", { text: oeuvre.titre }),
        el("span", { text: oeuvre.auteur || "Ando Dieudonné-Jean N'dé" }));
};

// Vignette d'une œuvre (couverture, genre, titre) menant à sa fiche.
Catalogue.vignette = function vignette(oeuvre) {
    const { el } = Studio;
    return el("a", { class: "livre-mini", href: `/oeuvres#${oeuvre.id}` },
        Catalogue.couverture(oeuvre), el("strong", { text: oeuvre.titre }), el("span", { text: oeuvre.genre }));
};
