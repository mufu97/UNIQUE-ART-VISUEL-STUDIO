/* Galerie des créations : filtres par catégorie et fiche détaillée (visionneuse). */
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const { el } = Studio;
    const galerie = document.getElementById("galerieCreations");
    const filtres = document.getElementById("filtresCreations");
    const vide = document.getElementById("galerieVide");
    const visionneuse = document.getElementById("visionneuse");
    let creations = Catalogue.etudes.map(Catalogue.normaliserCreation);
    let visibles = [];
    let courante = -1;
    let dernierDeclencheur = null;
    let filtre = "Toutes";

    try {
        const serveur = await Studio.api("/creations");
        if (Array.isArray(serveur) && serveur.length) {
            creations = [...serveur.slice().reverse().map(Catalogue.normaliserCreation), ...creations];
        }
    } catch {
        /* galerie limitée aux études publiées */
    }

    function construireFiltres() {
        const presentes = new Set(creations.map((creation) => creation.categorie));
        const categories = ["Toutes", ...Catalogue.categoriesCreations.filter((categorie) => presentes.has(categorie)),
            ...[...presentes].filter((categorie) => !Catalogue.categoriesCreations.includes(categorie))];
        filtres.replaceChildren(...categories.map((categorie) => el("button", {
            class: "filtre", type: "button", "aria-pressed": String(categorie === filtre), text: categorie,
            onclick: () => { filtre = categorie; construireFiltres(); afficher(); }
        })));
    }

    function afficher() {
        visibles = creations.filter((creation) => filtre === "Toutes" || creation.categorie === filtre);
        galerie.replaceChildren(...visibles.map((creation, index) => {
            const visuel = creation.miniature
                ? el("img", { src: creation.miniature, alt: "", loading: index < 4 ? "eager" : "lazy", decoding: "async" })
                : el("span", { class: "sans-image", text: creation.video ? "Vidéo" : creation.pdf ? "Document PDF" : creation.categorie });
            return el("figure", { class: "oeuvre", id: creation.id },
                el("button", { type: "button", "aria-label": `Ouvrir la fiche : ${creation.titre}`, onclick: (evenement) => ouvrir(index, evenement.currentTarget) },
                    el("div", { class: "oeuvre-visuel" }, visuel)),
                el("figcaption", {}, el("span", { text: creation.categorie }), el("strong", { text: creation.titre })));
        }));
        vide.hidden = visibles.length > 0;
    }

    function ouvrir(index, declencheur) {
        const creation = visibles[index];
        if (!creation) return;
        courante = index;
        if (declencheur) dernierDeclencheur = declencheur;
        const media = document.getElementById("visionneuseMedia");
        if (creation.video) media.replaceChildren(el("video", { src: creation.video, controls: true, preload: "metadata" }));
        else if (creation.image) media.replaceChildren(el("img", { src: creation.image, alt: creation.titre }));
        else media.replaceChildren(el("span", { class: "sans-image", text: creation.titre }));
        document.getElementById("visionneuseCategorie").textContent = creation.categorie;
        document.getElementById("visionneuseTitre").textContent = creation.titre;
        document.getElementById("visionneuseDescription").textContent = creation.description;
        const details = document.getElementById("visionneuseDetails");
        details.replaceChildren(el("dt", { text: "Catégorie" }), el("dd", { text: creation.categorie }),
            ...(creation.date ? [el("dt", { text: "Publiée le" }), el("dd", { text: Studio.date(creation.date) })] : []),
            el("dt", { text: "Studio" }), el("dd", { text: "UNIQUE ART VISUEL STUDIO" }));
        const zonePdf = document.getElementById("visionneusePdf");
        zonePdf.replaceChildren();
        if (creation.pdf) {
            zonePdf.append(el("button", { class: "btn btn-contour", type: "button", text: "Ouvrir le PDF", onclick: () => ouvrirPdf(creation.pdf) }));
        }
        visionneuse.hidden = false;
        document.body.style.overflow = "hidden";
        history.replaceState(null, "", `#${encodeURIComponent(creation.id)}`);
        document.getElementById("visionneuseFermer").focus();
    }

    // Les PDF importés sont des données base64 : ils sont ouverts via une URL locale temporaire.
    function ouvrirPdf(dataUrl) {
        const binaire = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
        const octets = Uint8Array.from(binaire, (caractere) => caractere.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([octets], { type: "application/pdf" }));
        window.open(url, "_blank", "noopener");
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }

    function fermer() {
        visionneuse.hidden = true;
        document.body.style.overflow = "";
        document.getElementById("visionneuseMedia").replaceChildren();
        history.replaceState(null, "", window.location.pathname);
        dernierDeclencheur?.focus();
    }

    const deplacer = (pas) => ouvrir((courante + pas + visibles.length) % visibles.length);
    document.getElementById("visionneuseFermer").addEventListener("click", fermer);
    document.getElementById("visionneusePrecedent").addEventListener("click", () => deplacer(-1));
    document.getElementById("visionneuseSuivant").addEventListener("click", () => deplacer(1));
    document.addEventListener("keydown", (evenement) => {
        if (visionneuse.hidden) return;
        if (evenement.key === "Escape") fermer();
        if (evenement.key === "ArrowLeft") deplacer(-1);
        if (evenement.key === "ArrowRight") deplacer(1);
        if (evenement.key === "Tab") {
            const focusables = [...visionneuse.querySelectorAll("button, a[href], video")];
            const premier = focusables[0];
            const dernier = focusables[focusables.length - 1];
            if (evenement.shiftKey && document.activeElement === premier) { evenement.preventDefault(); dernier.focus(); }
            else if (!evenement.shiftKey && document.activeElement === dernier) { evenement.preventDefault(); premier.focus(); }
        }
    });

    construireFiltres();
    afficher();
    const cible = decodeURIComponent(window.location.hash.slice(1));
    if (cible) {
        const index = visibles.findIndex((creation) => creation.id === cible);
        if (index >= 0) ouvrir(index);
    }
});
