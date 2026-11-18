/* Demande de devis : enregistrée par le serveur (rattachée au compte si le client est connecté). */
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const formulaire = document.getElementById("formulaireDevis");
    const statut = document.getElementById("devisStatut");

    const prestation = new URLSearchParams(window.location.search).get("prestation");
    if (prestation) {
        const option = [...formulaire.prestation.options].find((item) => item.value === prestation);
        if (option) option.selected = true;
    }

    try {
        const client = await Studio.api("/client/session");
        if (client?.email && !formulaire.email.value) formulaire.email.value = client.email;
        if (client?.nom && !formulaire.nom.value) formulaire.nom.value = client.nom;
    } catch {
        /* visiteur non connecté */
    }

    formulaire.addEventListener("submit", async (evenement) => {
        evenement.preventDefault();
        if (!formulaire.reportValidity()) return;
        const d = Object.fromEntries(new FormData(formulaire));
        const message = [
            d.description.trim(),
            d.delai.trim() ? `Délai souhaité : ${d.delai.trim()}` : "",
            d.budget.trim() ? `Budget indicatif : ${d.budget.trim()}` : ""
        ].filter(Boolean).join("\n\n");
        const bouton = formulaire.querySelector("button[type='submit']");
        bouton.disabled = true;
        Studio.statut(statut, "Envoi de votre demande…");
        try {
            await Studio.api("/discussions", {
                method: "POST",
                body: { name: d.nom, email: d.email, type: `Demande de devis — ${d.prestation}`, message, language: "fr" }
            });
            formulaire.reset();
            Studio.statut(statut, "Votre demande a bien été transmise au studio. Vous recevrez une réponse par e-mail.", "succes");
        } catch (erreur) {
            Studio.statut(statut, erreur.message, "erreur");
        } finally {
            bouton.disabled = false;
        }
    });
});
