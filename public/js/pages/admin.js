/* Espace studio : toutes les actions sont vérifiées par le serveur (session administrateur). */
"use strict";

document.addEventListener("DOMContentLoaded", async () => {
    const { el } = Studio;
    const zoneConnexion = document.getElementById("zoneConnexionAdmin");
    const zoneAdmin = document.getElementById("zoneAdmin");

    function lireFichier(fichier) {
        return new Promise((resolve, reject) => {
            const lecteur = new FileReader();
            lecteur.onload = () => resolve(lecteur.result);
            lecteur.onerror = () => reject(new Error(`Lecture impossible : ${fichier.name}`));
            lecteur.readAsDataURL(fichier);
        });
    }

    function element(titre, meta, ...contenu) {
        return el("li", { class: "element" }, el("div", { class: "element-entete" }, el("strong", { text: titre }), el("span", { class: "meta", text: meta })), ...contenu);
    }

    function gererFormulaire(formulaire, action) {
        formulaire.addEventListener("submit", async (evenement) => {
            evenement.preventDefault();
            if (!formulaire.reportValidity()) return;
            const statut = formulaire.querySelector(".statut");
            const bouton = formulaire.querySelector("button[type='submit']");
            bouton.disabled = true;
            Studio.statut(statut, "Traitement en cours…");
            try {
                const message = await action(formulaire);
                Studio.statut(statut, message, "succes");
            } catch (erreur) {
                Studio.statut(statut, erreur.status === 413 ? "Fichier trop volumineux pour être envoyé." : erreur.message, "erreur");
            } finally {
                bouton.disabled = false;
            }
        });
    }

    async function tableau() {
        const etat = await Studio.api("/admin/overview");
        const c = etat.comptabilite;
        const indicateurs = [
            [Studio.prix(c.chiffreAffairesConfirme), "Chiffre d’affaires confirmé"],
            [c.commandes - c.commandesEnAttente, "Commandes payées"],
            [c.commandesEnAttente, "Commandes non payées ou échouées"],
            [etat.volumes.clients, "Comptes clients"],
            [etat.volumes.discussions, "Demandes clients"],
            [etat.volumes.creations, "Créations publiées"],
            [etat.volumes.actualites, "Actualités publiées"]
        ];
        document.getElementById("indicateurs").replaceChildren(...indicateurs.map(([valeur, libelle]) =>
            el("div", { class: "indicateur" }, el("strong", { text: valeur }), el("span", { text: libelle }))));
        document.getElementById("activites").replaceChildren(...(etat.activites.length
            ? etat.activites.map((activite) => element(`${activite.type} — ${activite.detail || ""}`, Studio.date(activite.date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
                activite.montant ? el("p", { text: Studio.prix(activite.montant) }) : null))
            : [el("li", { class: "element", text: "Aucune activité enregistrée." })]));
    }

    async function demandes() {
        const liste = document.getElementById("listeDemandesAdmin");
        const discussions = (await Studio.api("/discussions")).slice().reverse();
        if (!discussions.length) {
            liste.replaceChildren(el("li", { class: "element", text: "Aucune demande client pour le moment." }));
            return;
        }
        liste.replaceChildren(...discussions.map((demande) => {
            const statut = el("p", { class: "statut", role: "status" });
            const traduction = el("div", { class: "reponse-studio", hidden: true });
            const champ = el("textarea", { maxlength: "2000", placeholder: "Votre réponse (envoyée par e-mail au client et visible dans son espace)…", "aria-label": `Réponse à ${demande.name}` });
            const formulaire = el("form", { class: "formulaire", hidden: true }, champ, el("button", { class: "btn", type: "submit", text: "Envoyer la réponse" }));
            formulaire.addEventListener("submit", async (evenement) => {
                evenement.preventDefault();
                if (!champ.value.trim()) return;
                try {
                    const resultat = await Studio.api(`/discussions/${demande.id}/reply`, { method: "POST", body: { message: champ.value } });
                    await demandes();
                    Studio.avis(resultat.emailEnvoye ? "Réponse envoyée par e-mail au client." : "Réponse enregistrée. L’e-mail n’a pas pu être envoyé : le client la verra dans son espace.", "succes");
                } catch (erreur) {
                    Studio.statut(statut, erreur.message, "erreur");
                }
            });
            const action = (libelle, rappel, classe = "btn btn-discret") => el("button", { class: classe, type: "button", text: libelle, onclick: rappel });
            return element(`${demande.type} — ${demande.name}`, `${demande.email} · ${Studio.date(demande.date, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
                el("p", { text: demande.message }),
                ...(demande.replies || []).map((reponse) => el("div", { class: "reponse-studio" }, el("small", { text: `Votre réponse · ${Studio.date(reponse.date)}` }), el("p", { text: reponse.message }))),
                traduction,
                el("div", { class: "actions-element" },
                    action("Répondre", () => { formulaire.hidden = !formulaire.hidden; if (!formulaire.hidden) champ.focus(); }),
                    action("Traduire", async () => {
                        Studio.statut(statut, "Traduction…");
                        try {
                            const resultat = await Studio.api("/translate", { method: "POST", body: { text: demande.message, targetLanguage: document.getElementById("langueTraduction").value } });
                            traduction.textContent = resultat.translation;
                            traduction.hidden = false;
                            Studio.statut(statut, "");
                        } catch (erreur) { Studio.statut(statut, erreur.message, "erreur"); }
                    }),
                    action("Supprimer", async () => {
                        if (!window.confirm("Supprimer définitivement cette demande ?")) return;
                        try { await Studio.api(`/discussions/${demande.id}`, { method: "DELETE" }); await demandes(); } catch (erreur) { Studio.statut(statut, erreur.message, "erreur"); }
                    }, "btn btn-discret btn-danger"),
                    action("Bloquer l’expéditeur", async () => {
                        if (!window.confirm("Bloquer cet expéditeur ? Ses demandes seront retirées.")) return;
                        try { await Studio.api(`/discussions/${demande.id}/block`, { method: "POST" }); await demandes(); } catch (erreur) { Studio.statut(statut, erreur.message, "erreur"); }
                    }, "btn btn-discret btn-danger")),
                formulaire, statut);
        }));
    }

    async function messagerie() {
        const messages = await Studio.api("/admin/inbox");
        document.getElementById("boiteReception").replaceChildren(...(messages.length
            ? messages.map((message) => element(`${message.sujet || "(sans objet)"} — ${message.nom}`, `${message.direction === "reçu" ? "Reçu" : "Formulaire"} · ${Studio.date(message.date)}`,
                el("p", { text: message.message }), message.email ? el("small", { text: message.email }) : null))
            : [el("li", { class: "element", text: "La boîte de réception est vide." })]));
    }

    async function bibliotheque() {
        const documents = await Studio.api("/admin/knowledge");
        document.getElementById("listeBibliotheque").replaceChildren(...(documents.length
            ? documents.map((document_) => element(document_.title, `Indexé le ${Studio.date(document_.updatedAt)}`,
                el("p", { text: `${document_.fileName} · ${document_.pages ? `${document_.pages} pages · ` : ""}${document_.chunkCount} passages · ${document_.chapterCount ? `${document_.chapterCount} chapitres ou sections · ` : ""}${document_.characterCount.toLocaleString("fr-FR")} caractères` }),
                el("div", { class: "actions-element" }, el("button", {
                    class: "btn btn-discret btn-danger", type: "button", text: "Retirer de la bibliothèque",
                    onclick: async () => {
                        if (!window.confirm(`Retirer « ${document_.title} » de la bibliothèque de l’assistant ?`)) return;
                        await Studio.api(`/admin/knowledge/${encodeURIComponent(document_.id)}`, { method: "DELETE" });
                        await bibliotheque();
                    }
                }))))
            : [el("li", { class: "element", text: "Aucune œuvre indexée : l’assistant ne peut pas encore répondre sur le contenu des œuvres." })]));
    }

    async function services() {
        const sante = await Studio.api("/health");
        const libelles = {
            emailSending: "Envoi d’e-mails (Resend)",
            emailReceiving: "Réception d’e-mails",
            emailVerification: "Vérification des adresses",
            passwordRecovery: "Récupération de mot de passe",
            payments: "Paiement en ligne (CinetPay)",
            writingAssistant: "Assistant IA"
        };
        const lignes = [el("dt", { text: "Base de données" }), el("dd", { text: sante.storage === "non-configure" ? "Non configurée : rien n’est enregistré durablement" : sante.storage || "—" })];
        for (const [cle, libelle] of Object.entries(libelles)) {
            if (cle in (sante.providers || {})) lignes.push(el("dt", { text: libelle }), el("dd", { text: sante.providers[cle] ? "Configuré" : "Non configuré" }));
        }
        document.getElementById("etatServices").replaceChildren(...lignes);
    }

    async function chargerTout() {
        const resultats = await Promise.allSettled([tableau(), demandes(), messagerie(), bibliotheque(), services()]);
        const echec = resultats.find((resultat) => resultat.status === "rejected");
        if (echec) Studio.avis(echec.reason.message, "erreur");
    }

    document.getElementById("creationCategorie").replaceChildren(...Catalogue.categoriesCreations.map((categorie) => el("option", { text: categorie })));

    gererFormulaire(document.getElementById("formulaireAdmin"), async (formulaire) => {
        await Studio.api("/admin/session", { method: "POST", body: { password: formulaire.password.value } });
        formulaire.reset();
        zoneConnexion.hidden = true;
        zoneAdmin.hidden = false;
        await chargerTout();
        return "";
    });

    gererFormulaire(document.getElementById("formulaireActualite"), async (formulaire) => {
        await Studio.api("/actualites", { method: "POST", body: Object.fromEntries(new FormData(formulaire)) });
        formulaire.reset();
        await tableau();
        return "Actualité publiée.";
    });

    gererFormulaire(document.getElementById("formulaireCreation"), async (formulaire) => {
        const fichiers = ["image", "video", "pdf"].map((nom) => [nom, formulaire[nom].files[0]]).filter(([, fichier]) => fichier);
        if (!fichiers.length) throw new Error("Ajoutez au moins une image, une vidéo ou un PDF.");
        const total = fichiers.reduce((somme, [, fichier]) => somme + fichier.size, 0);
        if (total > 4 * 1024 * 1024) throw new Error("Les fichiers dépassent 4 Mo au total. Réduisez leur taille avant l’envoi.");
        const corps = { title: formulaire.title.value, category: formulaire.category.value, description: formulaire.description.value };
        for (const [nom, fichier] of fichiers) corps[nom] = await lireFichier(fichier);
        await Studio.api("/creations", { method: "POST", body: corps });
        formulaire.reset();
        await tableau();
        return "Création publiée dans la galerie.";
    });

    gererFormulaire(document.getElementById("formulaireBibliotheque"), async (formulaire) => {
        const fichier = formulaire.fichier.files[0];
        if (fichier.size > 16 * 1024 * 1024) throw new Error("Le fichier dépasse 16 Mo.");
        const resultat = await Studio.api("/admin/knowledge", {
            method: "POST",
            body: { title: formulaire.title.value, fileName: fichier.name, content: await lireFichier(fichier) }
        });
        formulaire.reset();
        await bibliotheque();
        return resultat.message;
    });

    gererFormulaire(document.getElementById("formulaireTestRecherche"), async (formulaire) => {
        const resultats = await Studio.api("/admin/knowledge/search", { method: "POST", body: { question: formulaire.question.value } });
        document.getElementById("resultatsTestRecherche").replaceChildren(...(resultats.length
            ? resultats.map((resultat) => element(resultat.reference, `pertinence ${resultat.score}`, el("p", { text: `${resultat.extrait}…` })))
            : [el("li", { class: "element", text: "Aucun passage pertinent : l’assistant répondrait qu’il ne peut pas vérifier l’information." })]));
        return `${resultats.length} passage(s) retrouvé(s).`;
    });

    document.getElementById("actualiserTableau").addEventListener("click", chargerTout);
    document.getElementById("deconnexionAdmin").addEventListener("click", async () => {
        try { await Studio.api("/admin/session", { method: "DELETE" }); } catch { /* déjà déconnecté */ }
        window.location.reload();
    });

    try {
        const session = await Studio.api("/admin/session");
        if (session?.authenticated) {
            zoneAdmin.hidden = false;
            await chargerTout();
            return;
        }
    } catch {
        /* afficher la connexion */
    }
    zoneConnexion.hidden = false;
});
