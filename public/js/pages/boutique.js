/* Boutique : formules commandables. Le prix est fixé par le serveur ; la commande
   n'est confirmée qu'après vérification du paiement auprès du prestataire. */
"use strict";

const FORMULES = [
    { id: "illustration", nom: "Illustration", prix: 30000, image: "/assets/icones/illustration.svg", description: "Une illustration originale réalisée par le studio." },
    { id: "bd", nom: "Bande dessinée", prix: 75000, image: "/assets/icones/bd.svg", description: "Une planche de bande dessinée en couleur." },
    { id: "character", nom: "Character design", prix: 50000, image: "/assets/icones/personnage.svg", description: "La conception et le développement d’un personnage." },
    { id: "cover", nom: "Couverture", prix: 75000, image: "/assets/icones/couverture.svg", description: "Une couverture de livre illustrée." }
];

document.addEventListener("DOMContentLoaded", async () => {
    const { el } = Studio;
    const dialogue = document.getElementById("dialogueCommande");
    const formulaire = document.getElementById("formulaireCommande");
    const statut = document.getElementById("commandeStatut");
    let formule = null;

    document.getElementById("librairieOeuvres")?.replaceChildren(...Catalogue.oeuvres.map(Catalogue.vignette));

    const sante = await Studio.sante();
    const paiementOuvert = Boolean(sante?.providers?.payments);
    document.getElementById("paiementIndisponible").hidden = paiementOuvert;

    document.getElementById("produits").replaceChildren(...FORMULES.map((produit) => el("article", { class: "carte produit" },
        el("img", { src: produit.image, alt: "", width: "72", height: "72", loading: "lazy" }),
        el("h3", { text: produit.nom }),
        el("p", { text: produit.description }),
        el("p", { class: "prix", text: Studio.prix(produit.prix) }),
        paiementOuvert
            ? el("button", { class: "btn", type: "button", text: "Commander", onclick: () => ouvrir(produit) })
            : el("a", { class: "btn btn-contour", href: `https://wa.me/${encodeURIComponent(document.body.dataset.whatsapp || "2250759875531")}?text=${encodeURIComponent(`Bonjour, je souhaite commander la formule « ${produit.nom} » (${Studio.prix(produit.prix)}).`)}`, target: "_blank", rel: "noopener noreferrer", text: "Commander sur WhatsApp" }))));

    function ouvrir(produit) {
        formule = produit;
        document.getElementById("commandeProduit").textContent = produit.nom;
        document.getElementById("commandePrix").textContent = Studio.prix(produit.prix);
        Studio.statut(statut, "");
        dialogue.showModal();
        document.getElementById("commandeNom").focus();
    }

    dialogue.addEventListener("click", (evenement) => {
        if (evenement.target === dialogue || evenement.target.closest("[data-fermer]")) dialogue.close();
    });

    formulaire.addEventListener("submit", async (evenement) => {
        evenement.preventDefault();
        if (!formulaire.reportValidity()) return;
        const bouton = formulaire.querySelector("button[type='submit']");
        bouton.disabled = true;
        Studio.statut(statut, "Préparation du paiement sécurisé…");
        try {
            const donnees = Object.fromEntries(new FormData(formulaire));
            const resultat = await Studio.api("/orders", { method: "POST", body: { ...donnees, produitId: formule.id } });
            Studio.statut(statut, "Redirection vers la page de paiement…", "succes");
            window.location.assign(resultat.checkoutUrl);
        } catch (erreur) {
            Studio.statut(statut, erreur.message, "erreur");
            bouton.disabled = false;
        }
    });
});
