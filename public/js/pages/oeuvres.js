/* Bibliothèque : sommaire visuel des œuvres, chaque couverture mène à sa fiche. */
"use strict";

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("sommaireOeuvres")?.replaceChildren(...Catalogue.oeuvres.map((oeuvre) => {
        const vignette = Catalogue.vignette(oeuvre);
        vignette.setAttribute("href", `#${oeuvre.id}`);
        return vignette;
    }));
});
