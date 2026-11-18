/* Espace client : authentification, vérification d'adresse, commandes et demandes. */
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const { el } = Studio;
    const zoneVisiteur = document.getElementById("zoneVisiteur");
    const zoneClient = document.getElementById("zoneClient");
    const panneaux = {
        connexion: document.getElementById("panneauConnexion"),
        inscription: document.getElementById("panneauInscription"),
        oubli: document.getElementById("panneauOubli"),
        reinitialisation: document.getElementById("panneauReinitialisation")
    };
    const onglets = document.querySelector(".onglets");
    const statutDe = (formulaire) => formulaire.querySelector(".statut");

    function montrer(nom) {
        for (const [cle, panneau] of Object.entries(panneaux)) panneau.hidden = cle !== nom;
        onglets.hidden = !["connexion", "inscription"].includes(nom);
        document.querySelectorAll(".onglet").forEach((onglet) => {
            const actif = onglet.getAttribute("aria-controls") === panneaux[nom]?.id;
            onglet.setAttribute("aria-selected", String(actif));
            onglet.tabIndex = actif ? 0 : -1;
        });
    }
    document.getElementById("ongletConnexion").addEventListener("click", () => montrer("connexion"));
    document.getElementById("ongletInscription").addEventListener("click", () => montrer("inscription"));
    document.getElementById("lienOubli").addEventListener("click", () => montrer("oubli"));
    panneaux.oubli.querySelector("[data-retour]").addEventListener("click", () => montrer("connexion"));

    async function soumettre(formulaire, action) {
        formulaire.addEventListener("submit", async (evenement) => {
            evenement.preventDefault();
            if (!formulaire.reportValidity()) return;
            const bouton = formulaire.querySelector("button[type='submit']");
            bouton.disabled = true;
            Studio.statut(statutDe(formulaire), "Un instant…");
            try {
                await action(Object.fromEntries(new FormData(formulaire)));
            } catch (erreur) {
                Studio.statut(statutDe(formulaire), erreur.message, "erreur");
            } finally {
                bouton.disabled = false;
            }
        });
    }

    soumettre(panneaux.connexion, async (d) => {
        const client = await Studio.api("/login", { method: "POST", body: { email: d.email, motDePasse: d.motDePasse } });
        panneaux.connexion.reset();
        Studio.statut(statutDe(panneaux.connexion), "");
        await ouvrirEspace(client);
    });

    soumettre(panneaux.inscription, async (d) => {
        const resultat = await Studio.api("/clients", { method: "POST", body: { nom: d.nom, email: d.email, telephone: d.telephone, motDePasse: d.motDePasse } });
        panneaux.inscription.reset();
        montrer("connexion");
        panneaux.connexion.email.value = d.email;
        Studio.statut(statutDe(panneaux.connexion), resultat?.emailEnvoye
            ? "Compte créé. Un lien de confirmation vous a été envoyé par e-mail. Vous pouvez dès maintenant vous connecter."
            : "Compte créé. Vous pouvez vous connecter ; vous pourrez demander le lien de confirmation de votre adresse depuis votre espace.", "succes");
        panneaux.connexion.motDePasse.focus();
    });

    soumettre(panneaux.oubli, async (d) => {
        const resultat = await Studio.api("/password/forgot", { method: "POST", body: { email: d.email } });
        Studio.statut(statutDe(panneaux.oubli), resultat?.message || "Si cette adresse correspond à un compte, un lien vous a été envoyé.", "succes");
    });

    const params = new URLSearchParams(window.location.search);
    const jetonReinitialisation = params.get("reset_token");
    if (jetonReinitialisation) {
        Studio.retirerParametres("reset_token");
        montrer("reinitialisation");
        soumettre(panneaux.reinitialisation, async (d) => {
            const resultat = await Studio.api("/password/reset", { method: "POST", body: { token: jetonReinitialisation, motDePasse: d.motDePasse } });
            montrer("connexion");
            Studio.statut(statutDe(panneaux.connexion), resultat?.message || "Mot de passe modifié. Vous pouvez vous connecter.", "succes");
        });
    }

    const jetonVerification = params.get("verifier_email");
    if (jetonVerification) {
        Studio.retirerParametres("verifier_email");
        try {
            const resultat = await Studio.api("/email/verify", { method: "POST", body: { token: jetonVerification } });
            Studio.avis(`${resultat?.message || "Adresse confirmée."} Vos demandes et commandes associées à cette adresse sont désormais visibles dans votre espace.`, "succes");
        } catch (erreur) {
            Studio.avis(erreur.message, "erreur");
        }
    }

    function element(titre, meta, ...contenu) {
        return el("li", { class: "element" }, el("div", { class: "element-entete" }, el("strong", { text: titre }), el("span", { class: "meta", text: meta })), ...contenu);
    }

    async function chargerCommandes() {
        const liste = document.getElementById("listeCommandes");
        try {
            const commandes = await Studio.api("/client/orders");
            liste.replaceChildren(...(commandes.length ? commandes.map((commande) => element(
                commande.produit,
                Studio.date(commande.date),
                el("p", { text: `${Studio.prix(commande.prix)} · ${commande.statut}` }))) : [el("li", { class: "element", text: "Aucune commande n’est encore associée à votre compte." })]));
        } catch (erreur) {
            liste.replaceChildren(el("li", { class: "element", text: erreur.message }));
        }
    }

    async function chargerDemandes() {
        const liste = document.getElementById("listeDemandes");
        try {
            const demandes = await Studio.api("/client/discussions");
            liste.replaceChildren(...(demandes.length ? demandes.map((demande) => element(
                demande.type || "Demande",
                Studio.date(demande.date),
                el("p", { text: demande.message }),
                ...(demande.replies || []).map((reponse) => el("div", { class: "reponse-studio" },
                    el("small", { text: `Réponse du studio · ${Studio.date(reponse.date)}` }), el("p", { text: reponse.message }))),
                (demande.replies || []).length ? null : el("small", { text: "En attente de réponse du studio." }))) : [el("li", { class: "element", text: "Aucune demande n’est encore associée à votre compte." })]));
        } catch (erreur) {
            liste.replaceChildren(el("li", { class: "element", text: erreur.message }));
        }
    }

    async function ouvrirEspace(client) {
        zoneVisiteur.hidden = true;
        zoneClient.hidden = false;
        document.getElementById("titreCompte").textContent = `Bonjour, ${client.nom}`;
        document.getElementById("profilDetails").replaceChildren(
            el("dt", { text: "Nom" }), el("dd", { text: client.nom }),
            el("dt", { text: "E-mail" }), el("dd", { text: `${client.email}${client.emailVerifie ? " · confirmée" : " · non confirmée"}` }),
            el("dt", { text: "Téléphone" }), el("dd", { text: client.telephone || "—" }));
        document.getElementById("blocVerification").hidden = client.emailVerifie === true;
        await Promise.all([chargerCommandes(), chargerDemandes()]);
    }

    const boutonVerification = document.getElementById("boutonVerification");
    boutonVerification.addEventListener("click", async () => {
        const statut = document.getElementById("statutVerification");
        boutonVerification.disabled = true;
        try {
            const resultat = await Studio.api("/client/email-verification", { method: "POST" });
            Studio.statut(statut, resultat?.dejaVerifie ? "Votre adresse est déjà confirmée." : resultat?.message, "succes");
        } catch (erreur) {
            Studio.statut(statut, erreur.message, "erreur");
        } finally {
            boutonVerification.disabled = false;
        }
    });

    document.getElementById("boutonDeconnexion").addEventListener("click", async () => {
        try { await Studio.api("/client/session", { method: "DELETE" }); } catch { /* session déjà fermée */ }
        window.location.reload();
    });

    try {
        const client = await Studio.api("/client/session");
        await ouvrirEspace(client);
    } catch {
        zoneVisiteur.hidden = false;
    }
});
