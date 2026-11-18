/* Formulaire de contact : envoyé au studio par e-mail via le serveur. */
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const formulaire = document.getElementById("formulaireContact");
    const statut = document.getElementById("contactStatut");
    if (new URLSearchParams(window.location.search).get("sujet") === "partenariat") {
        formulaire.message.value = "Bonjour, je souhaite échanger au sujet d’un partenariat ou d’un investissement dans vos projets.\n\n";
    }
    if (new URLSearchParams(window.location.search).get("sujet") === "donnees") {
        formulaire.message.value = "Bonjour, je souhaite exercer mes droits sur mes données personnelles (accès, rectification ou suppression de mon compte). Adresse e-mail du compte concerné : \n\n";
    }
    const sante = await Studio.sante();
    if (sante && !sante.providers?.emailSending) document.getElementById("emailIndisponible").hidden = false;

    formulaire.addEventListener("submit", async (evenement) => {
        evenement.preventDefault();
        if (!formulaire.reportValidity()) return;
        const bouton = formulaire.querySelector("button[type='submit']");
        bouton.disabled = true;
        Studio.statut(statut, "Envoi en cours…");
        try {
            await Studio.api("/contact", { method: "POST", body: Object.fromEntries(new FormData(formulaire)) });
            formulaire.reset();
            Studio.statut(statut, "Merci, votre message a bien été envoyé. Le studio vous répondra par e-mail.", "succes");
        } catch (erreur) {
            Studio.statut(statut, erreur.message, "erreur");
        } finally {
            bouton.disabled = false;
        }
    });
});
