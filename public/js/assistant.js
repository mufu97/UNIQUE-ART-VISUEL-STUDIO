/* =========================================================
   Assistant de lecture IA — widget présent sur toutes les pages.
   Les questions sont traitées par /api/assistant (recherche dans la base
   documentaire du studio, puis réponse du modèle configuré côté serveur).
   Les notes de lecture restent dans le navigateur du lecteur.
   ========================================================= */
"use strict";

const StudioAssistant = (() => {
    const CLE_NOTES = "uniqueArtReadingNotes";
    const MAX_DISCUSSIONS = 12;
    const MAX_MESSAGES = 40;
    const ACCUEIL = "Bonjour. Je suis l’assistant de lecture du studio. Posez-moi une question sur une œuvre, un passage ou un concept : je réponds à partir des textes que le studio a mis à ma disposition et je cite mes sources.";
    const SUGGESTIONS = [
        ["Les Délires de Pupus", "Qui est Kundu dans Les Délires de Pupus ?"],
        ["Lettres à Marie", "Que cherche Kpa en écrivant à Marie dans Les Lignes d’ombre ?"],
        ["La Nouvelle République", "Que représente la fourmi Ei dans Les Enfants de la Nouvelle République ?"],
        ["Expliquer un passage", "Je ne comprends pas ce passage, peux-tu me l’expliquer ? "]
    ];
    const { el } = Studio;

    let panneau;
    let fil;
    let champ;
    let envoi;
    let discussion = nouvelleDiscussion();
    let enCours = false;
    let reconnaissance = null;

    function nouvelleDiscussion() {
        return { id: `d-${Date.now()}`, debut: new Date().toISOString(), messages: [] };
    }

    function lireNotes() {
        try {
            const notes = JSON.parse(localStorage.getItem(CLE_NOTES) || "[]");
            return Array.isArray(notes) ? notes.filter((note) => note && Array.isArray(note.messages)) : [];
        } catch {
            return [];
        }
    }

    function enregistrerNotes() {
        if (!discussion.messages.length) return;
        try {
            const notes = lireNotes().filter((note) => note.id !== discussion.id);
            notes.unshift({ ...discussion, messages: discussion.messages.slice(-MAX_MESSAGES) });
            localStorage.setItem(CLE_NOTES, JSON.stringify(notes.slice(0, MAX_DISCUSSIONS)));
        } catch {
            /* stockage local indisponible : la discussion n'est simplement pas conservée */
        }
    }

    function ajouterBulle(role, texte, sources = []) {
        const bulle = el("div", { class: `bulle ${role === "user" ? "bulle-lecteur" : "bulle-assistant"}`, text: texte });
        if (sources.length) {
            const references = sources.map((source) => [source.title, source.chapter, source.page ? `page ${source.page}` : ""].filter(Boolean).join(", "));
            bulle.append(el("div", { class: "sources", text: `Sources : ${[...new Set(references)].join(" ; ")}` }));
        }
        fil.append(bulle);
        fil.scrollTop = fil.scrollHeight;
        return bulle;
    }

    function afficherDiscussion() {
        fil.replaceChildren();
        ajouterBulle("assistant", ACCUEIL);
        discussion.messages.forEach((message) => ajouterBulle(message.role, message.content, message.sources || []));
    }

    async function envoyer(question) {
        const texte = String(question || "").trim();
        if (!texte || enCours) return;
        if (texte.length > 8000) {
            ajouterBulle("assistant", "Votre message est trop long (8 000 caractères au maximum). Réduisez l’extrait puis réessayez.");
            return;
        }
        enCours = true;
        envoi.disabled = true;
        champ.value = "";
        const historique = discussion.messages.slice(-8).map(({ role, content }) => ({ role, content }));
        discussion.messages.push({ role: "user", content: texte });
        ajouterBulle("user", texte);
        const attente = ajouterBulle("assistant", "Je consulte la bibliothèque du studio…");
        attente.classList.add("bulle-attente");
        try {
            const resultat = await Studio.api("/assistant", { method: "POST", body: { question: texte, history: historique } });
            attente.remove();
            const sources = Array.isArray(resultat?.sources) ? resultat.sources : [];
            discussion.messages.push({ role: "assistant", content: resultat.answer, sources });
            ajouterBulle("assistant", resultat.answer, sources);
            enregistrerNotes();
        } catch (erreur) {
            attente.remove();
            discussion.messages.pop();
            ajouterBulle("assistant", erreur.status === 503
                ? "L’assistant n’est pas encore activé sur le site. Le studio doit d’abord le relier à un fournisseur d’intelligence artificielle. En attendant, vous pouvez poser votre question via la page Contact."
                : erreur.message || "L’assistant est momentanément indisponible. Réessayez dans un instant.");
        } finally {
            enCours = false;
            envoi.disabled = false;
            champ.focus();
        }
    }

    function afficherHistorique() {
        const notes = lireNotes();
        fil.replaceChildren();
        fil.append(el("div", { class: "bulle bulle-assistant", text: notes.length
            ? "Vos notes de lecture enregistrées sur cet appareil :"
            : "Aucune note de lecture enregistrée sur cet appareil." }));
        notes.forEach((note) => {
            const premiere = note.messages.find((message) => message.role === "user")?.content || "Discussion";
            fil.append(el("button", {
                class: "btn btn-discret",
                type: "button",
                text: `${Studio.date(note.debut, { day: "numeric", month: "short" })} — ${premiere.slice(0, 60)}${premiere.length > 60 ? "…" : ""}`,
                onclick: () => { discussion = note; afficherDiscussion(); }
            }));
        });
        if (notes.length) {
            fil.append(el("button", {
                class: "btn btn-discret btn-danger",
                type: "button",
                text: "Effacer toutes mes notes",
                onclick: () => {
                    try { localStorage.removeItem(CLE_NOTES); } catch { /* rien à effacer */ }
                    discussion = nouvelleDiscussion();
                    afficherDiscussion();
                }
            }));
        }
    }

    function lireAVoixHaute(bouton) {
        if (!("speechSynthesis" in window)) return;
        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            bouton.setAttribute("aria-pressed", "false");
            return;
        }
        const derniere = [...discussion.messages].reverse().find((message) => message.role === "assistant");
        if (!derniere) return;
        const enonce = new SpeechSynthesisUtterance(derniere.content);
        enonce.lang = "fr-FR";
        enonce.onend = () => bouton.setAttribute("aria-pressed", "false");
        bouton.setAttribute("aria-pressed", "true");
        window.speechSynthesis.speak(enonce);
    }

    function basculerDictee(bouton) {
        const Reconnaissance = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Reconnaissance) {
            ajouterBulle("assistant", "La dictée vocale n’est pas prise en charge par ce navigateur. Essayez avec Chrome ou Edge.");
            return;
        }
        if (reconnaissance) {
            reconnaissance.stop();
            return;
        }
        reconnaissance = new Reconnaissance();
        reconnaissance.lang = "fr-FR";
        reconnaissance.interimResults = true;
        reconnaissance.continuous = true;
        const base = champ.value ? `${champ.value.trim()} ` : "";
        reconnaissance.onresult = (evenement) => {
            champ.value = base + [...evenement.results].map((resultat) => resultat[0].transcript).join(" ");
        };
        reconnaissance.onerror = () => ajouterBulle("assistant", "La dictée n’a pas pu démarrer. Autorisez l’accès au micro puis réessayez.");
        reconnaissance.onend = () => {
            reconnaissance = null;
            bouton.setAttribute("aria-pressed", "false");
            champ.focus();
        };
        bouton.setAttribute("aria-pressed", "true");
        reconnaissance.start();
    }

    function construire() {
        const bouton = el("button", { class: "assistant-bouton", type: "button", "aria-expanded": "false", "aria-controls": "assistantPanneau" },
            el("img", { src: "/assets/optimized/assistant.webp", alt: "", width: "42", height: "42", loading: "lazy" }),
            el("span", { text: "Assistant de lecture" }));
        bouton.setAttribute("aria-label", "Ouvrir l’assistant de lecture");

        fil = el("div", { class: "assistant-fil", "aria-live": "polite" });
        champ = el("textarea", { rows: "1", maxlength: "8000", placeholder: "Votre question…", "aria-label": "Question pour l’assistant" });
        envoi = el("button", { class: "btn", type: "submit", text: "Envoyer" });
        const micro = el("button", { class: "assistant-icone", type: "button", "aria-pressed": "false", title: "Dicter", "aria-label": "Dicter une question", text: "🎙" });
        micro.addEventListener("click", () => basculerDictee(micro));
        const voix = el("button", { class: "assistant-icone", type: "button", "aria-pressed": "false", title: "Lire la réponse", "aria-label": "Lire la dernière réponse à voix haute", text: "🔊" });
        voix.addEventListener("click", () => lireAVoixHaute(voix));

        const formulaire = el("form", { class: "assistant-saisie" }, micro, champ, envoi);
        formulaire.addEventListener("submit", (evenement) => { evenement.preventDefault(); envoyer(champ.value); });
        champ.addEventListener("keydown", (evenement) => {
            if (evenement.key === "Enter" && !evenement.shiftKey) {
                evenement.preventDefault();
                envoyer(champ.value);
            }
        });

        const suggestions = el("div", { class: "assistant-suggestions" },
            SUGGESTIONS.map(([libelle, question]) => el("button", {
                type: "button",
                text: libelle,
                onclick: () => {
                    if (question.endsWith(" ")) { champ.value = question; champ.focus(); } else envoyer(question);
                }
            })));

        panneau = el("section", { class: "assistant-panneau", id: "assistantPanneau", "aria-label": "Assistant de lecture", hidden: true },
            el("div", { class: "assistant-tete" },
                el("img", { src: "/assets/optimized/assistant.webp", alt: "", width: "38", height: "38", loading: "lazy" }),
                el("div", {}, el("strong", { text: "Assistant de lecture" }), el("small", { text: "Bibliothèque du studio" })),
                el("div", { class: "actions" },
                    voix,
                    el("button", { class: "assistant-icone", type: "button", title: "Notes de lecture", "aria-label": "Afficher mes notes de lecture", text: "☰", onclick: afficherHistorique }),
                    el("button", { class: "assistant-icone", type: "button", title: "Nouvelle discussion", "aria-label": "Nouvelle discussion", text: "＋", onclick: () => { discussion = nouvelleDiscussion(); afficherDiscussion(); } }),
                    el("button", { class: "assistant-icone", type: "button", title: "Fermer", "aria-label": "Fermer l’assistant", text: "✕", onclick: () => basculer(false) }))),
            fil,
            suggestions,
            formulaire,
            el("p", { class: "assistant-mention" },
                "Les questions et les passages retrouvés sont transmis au fournisseur d’IA du studio. Vos notes restent sur cet appareil. ",
                el("a", { href: "/conditions-ia", text: "Conditions d’utilisation" })));

        bouton.addEventListener("click", () => basculer());
        document.addEventListener("keydown", (evenement) => { if (evenement.key === "Escape" && !panneau.hidden) basculer(false); });
        document.body.append(bouton, panneau);
        afficherDiscussion();

        function basculer(forcer) {
            const ouvrir = forcer === undefined ? panneau.hidden : forcer;
            panneau.hidden = !ouvrir;
            bouton.setAttribute("aria-expanded", String(ouvrir));
            if (ouvrir) champ.focus();
            else bouton.focus();
        }
        StudioAssistant.basculer = basculer;
    }

    function ouvrir(question) {
        StudioAssistant.basculer?.(true);
        if (question) {
            champ.value = question;
            champ.focus();
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        construire();
        document.querySelectorAll("[data-assistant]").forEach((declencheur) => {
            declencheur.addEventListener("click", (evenement) => {
                evenement.preventDefault();
                ouvrir(declencheur.dataset.assistant);
            });
        });
    });

    return { ouvrir, basculer: null };
})();
