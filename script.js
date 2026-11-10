/* =========================================================
   UNIQUE ART VISUEL STUDIO
   SCRIPT PRINCIPAL
   ========================================================= */

const STORAGE_KEY = "uniqueArtCreations";
const ADMIN_KEY = "uniqueArtAdminConnected";
const NEWS_KEY = "uniqueArtActualites";
const ORDERS_KEY = "uniqueArtCommandes";
const ASSISTANT_HISTORY_KEY = "uniqueArtReadingNotes";
const ASSISTANT_HISTORY_LIMIT = 12;
const ASSISTANT_MESSAGE_LIMIT = 40;
const ASSISTANT_QUESTION_MAX_LENGTH = 8000;
const ASSISTANT_WELCOME_MESSAGE = "Bonjour ! Je peux vous aider à explorer nos œuvres écrites, éclaircir leurs thèmes et discuter d’un extrait que vous partagez. Que souhaitez-vous découvrir ?";

const API_BASE = "/api";
const NUMERO_WHATSAPP_STUDIO = "2250759875531";
let paiementEnLigneDisponible = null;
let envoiEmailDisponible = null;

async function actualiserDisponibiliteServices() {
    try {
        const etat = await appelerApi("/health");
        paiementEnLigneDisponible = Boolean(etat?.providers?.payments);
        // Le formulaire de contact fonctionne dès que le serveur conserve les messages,
        // même sans service d'e-mail : l'avis d'indisponibilité ne s'affiche plus dans ce cas.
        envoiEmailDisponible = Boolean(etat?.providers?.emailSending || etat?.providers?.contactInbox);
        const noticePaiement = document.getElementById("paymentAvailabilityNotice");
        const noticeEmail = document.getElementById("emailAvailabilityNotice");
        if (noticePaiement) noticePaiement.hidden = paiementEnLigneDisponible;
        if (noticeEmail) noticeEmail.hidden = envoiEmailDisponible;
        renderShop();
    } catch {
        // Sans serveur joignable, proposer des solutions de contact au lieu d'une impasse.
        paiementEnLigneDisponible = false;
        envoiEmailDisponible = false;
        const noticePaiement = document.getElementById("paymentAvailabilityNotice");
        const noticeEmail = document.getElementById("emailAvailabilityNotice");
        if (noticePaiement) noticePaiement.hidden = false;
        if (noticeEmail) noticeEmail.hidden = false;
        renderShop();
    }
}

function commanderSurWhatsApp(produit, prix) {
    const message = `Bonjour Unique Art Visuel Studio, je souhaite commander : ${produit} (${formatPrix(prix)}).`;
    const lien = `https://wa.me/${NUMERO_WHATSAPP_STUDIO}?text=${encodeURIComponent(message)}`;
    // WhatsApp s'ouvre dans un nouvel onglet pour que le visiteur ne quitte pas le site.
    // Si le navigateur bloque l'ouverture, on revient à la navigation dans l'onglet courant.
    const onglet = window.open(lien, "_blank");
    if (onglet) onglet.opener = null;
    else window.location.assign(lien);
}

let commandeSelectionnee = {
    produit: "",
    prix: 0
};

let accountingTimer = null;
let discussionTimer = null;


/* =========================================================
   OUTILS GENERAUX
   ========================================================= */

async function appelerApi(endpoint, options = {}) {
    if (window.location.protocol === "file:") {
        throw new Error("MODE_LOCAL");
    }

    const {
        headers = {},
        ...autresOptions
    } = options;

    const reponse = await fetch(`${API_BASE}${endpoint}`, {
        cache: "no-store",
        ...autresOptions,
        headers: {
            "Content-Type": "application/json",
            ...headers
        }
    });

    const texte = await reponse.text();

    let donnees = null;

    try {
        donnees = texte ? JSON.parse(texte) : null;
    } catch {
        donnees = texte;
    }

    if (!reponse.ok) {
        throw new Error(
            donnees?.message ||
            donnees?.error ||
            `Erreur API ${reponse.status}`
        );
    }

    return donnees;
}


function echapperHTML(valeur) {
    return String(valeur ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


function formatPrix(prix) {
    const nombre = Number(prix) || 0;
    return `${nombre.toLocaleString("fr-FR")} FCFA`;
}


function afficherElement(id, afficher = true) {
    const element = document.getElementById(id);

    if (!element) return;

    element.style.display = afficher ? "" : "none";
}


/* =========================================================
   ASSISTANTE VIRTUELLE
   ========================================================= */

function ajouterMessageAssistant(texte, type = "assistant-bot") {
    const messages = document.getElementById("assistantMessages");
    if (!messages) return;
    const message = document.createElement("div");
    message.className = `assistant-message ${type}`;
    message.textContent = texte;
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
}

let assistantEnCours = false;
let discussionsAssistant = [];
let discussionAssistantActive = null;
let dicteeLocaleActive = false;
let dicteeLocaleFinale = "";
let dicteeLocaleIntermediaire = "";
let dicteeLocaleTexteInitial = "";
let reconnaissanceVocaleNavigateur = null;
let dicteeArretEnCours = false;
let dicteeErreur = "";
let dicteeSilenceTimer = null;
let dicteeArretResolver = null;
let syntheseVocaleEnCours = false;

function creerDiscussionAssistant() {
    const date = new Date().toISOString();
    return {
        id: window.crypto?.randomUUID?.() || `lecture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: "Nouvelle lecture",
        createdAt: date,
        updatedAt: date,
        closedAt: null,
        messages: [{ role: "assistant", content: ASSISTANT_WELCOME_MESSAGE, createdAt: date }]
    };
}

function enregistrerDiscussionsAssistant() {
    try {
        discussionsAssistant = discussionsAssistant
            .slice(0, ASSISTANT_HISTORY_LIMIT);
        discussionsAssistant.forEach(discussion => {
            discussion.messages = discussion.messages.slice(-ASSISTANT_MESSAGE_LIMIT);
        });
        localStorage.setItem(ASSISTANT_HISTORY_KEY, JSON.stringify(discussionsAssistant));
    } catch (error) {
        console.error("Enregistrement local des notes de lecture impossible:", error.message);
        afficherStatutDiscussionAssistant("L’espace de stockage local est indisponible ; cette discussion ne sera pas conservée.", true);
    }
}

function chargerDiscussionsAssistant() {
    try {
        const sauvegarde = JSON.parse(localStorage.getItem(ASSISTANT_HISTORY_KEY) || "[]");
        if (!Array.isArray(sauvegarde)) throw new Error("Format d’historique invalide.");
        discussionsAssistant = sauvegarde
            .filter(discussion => discussion && typeof discussion.id === "string" && Array.isArray(discussion.messages))
            .map(discussion => ({
                id: discussion.id,
                title: String(discussion.title || "Notes de lecture").slice(0, 80),
                createdAt: String(discussion.createdAt || new Date().toISOString()),
                updatedAt: String(discussion.updatedAt || discussion.createdAt || new Date().toISOString()),
                closedAt: discussion.closedAt ? String(discussion.closedAt) : null,
                messages: discussion.messages
                    .filter(message => ["user", "assistant"].includes(message?.role) && typeof message.content === "string")
                    .slice(-ASSISTANT_MESSAGE_LIMIT)
                    .map(message => ({
                        role: message.role,
                        content: message.content.slice(0, ASSISTANT_QUESTION_MAX_LENGTH),
                        createdAt: String(message.createdAt || discussion.updatedAt || new Date().toISOString())
                    }))
            }))
            .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
            .slice(0, ASSISTANT_HISTORY_LIMIT);
    } catch (error) {
        console.error("Lecture locale des notes de lecture impossible:", error.message);
        discussionsAssistant = [];
        localStorage.removeItem(ASSISTANT_HISTORY_KEY);
    }

    discussionAssistantActive = discussionsAssistant.find(discussion => !discussion.closedAt) || null;
    if (!discussionAssistantActive) {
        discussionAssistantActive = creerDiscussionAssistant();
        discussionsAssistant.unshift(discussionAssistantActive);
        enregistrerDiscussionsAssistant();
    }
    afficherDiscussionAssistant(discussionAssistantActive);
    afficherHistoriqueAssistant();
}

function afficherStatutDiscussionAssistant(texte, erreur = false) {
    const statut = document.getElementById("assistantConversationStatus");
    if (statut && texte) {
        statut.textContent = texte;
        statut.classList.toggle("is-error", erreur);
    }
}

function afficherDiscussionAssistant(discussion) {
    const messages = document.getElementById("assistantMessages");
    if (!messages || !discussion) return;
    messages.replaceChildren();
    discussion.messages.forEach(message => {
        const element = document.createElement("div");
        element.className = `assistant-message ${message.role === "user" ? "assistant-user" : "assistant-bot"}`;
        element.textContent = message.content;
        messages.append(element);
    });
    messages.scrollTop = messages.scrollHeight;

    const terminee = Boolean(discussion.closedAt);
    const input = document.getElementById("assistantInput");
    const envoi = document.getElementById("assistantSend");
    const micro = document.getElementById("assistantMic");
    const terminer = document.getElementById("assistantEndChat");
    const nouvelleDiscussion = document.getElementById("assistantNewChat");
    const actionsRapides = document.querySelector(".assistant-quick-actions");
    if (input) {
        input.disabled = terminee || assistantEnCours;
        input.placeholder = terminee ? "Cette discussion est terminée. Commencez-en une nouvelle." : "Question ou court extrait à explorer...";
    }
    if (envoi) envoi.disabled = terminee || assistantEnCours || dicteeLocaleActive;
    if (micro) micro.disabled = terminee || assistantEnCours;
    if (terminer) {
        terminer.hidden = terminee;
        terminer.disabled = assistantEnCours;
    }
    if (nouvelleDiscussion) nouvelleDiscussion.disabled = assistantEnCours;
    if (actionsRapides) actionsRapides.hidden = terminee || discussion.messages.length > 1;
    afficherStatutDiscussionAssistant(terminee ? "Discussion enregistrée" : "Discussion en cours");
}

function afficherHistoriqueAssistant() {
    const liste = document.getElementById("assistantHistoryList");
    const bouton = document.getElementById("assistantHistoryToggle");
    if (!liste || !bouton) return;
    liste.replaceChildren();
    bouton.textContent = `Historique de lecture (${discussionsAssistant.length})`;

    if (!discussionsAssistant.length) {
        const vide = document.createElement("li");
        vide.textContent = "Aucune note de lecture enregistrée.";
        liste.append(vide);
        return;
    }

    discussionsAssistant.forEach(discussion => {
        const element = document.createElement("li");
        const ouvrir = document.createElement("button");
        ouvrir.type = "button";
        ouvrir.className = "assistant-history-open";
        ouvrir.textContent = `${discussion.title} · ${new Date(discussion.updatedAt).toLocaleString("fr-FR")}${discussion.closedAt ? " · terminée" : " · en cours"}`;
        ouvrir.setAttribute("aria-current", String(discussion.id === discussionAssistantActive?.id));
        ouvrir.addEventListener("click", () => {
            discussionAssistantActive = discussion;
            afficherDiscussionAssistant(discussion);
            document.getElementById("assistantHistory").hidden = true;
            bouton.setAttribute("aria-expanded", "false");
            afficherStatutDiscussionAssistant(discussion.closedAt ? "Notes de lecture consultées" : "Discussion en cours");
        });
        element.append(ouvrir);
        liste.append(element);
    });
}

function arreterLectureVocaleAssistant() {
    if (syntheseVocaleEnCours) window.speechSynthesis?.cancel();
    syntheseVocaleEnCours = false;
    const boutonLire = document.getElementById("assistantSpeak");
    boutonLire?.setAttribute("aria-label", "Lire la dernière réponse à voix haute");
    if (boutonLire) boutonLire.title = "Lire la dernière réponse à voix haute";
}

function demarrerNouvelleDiscussionAssistant() {
    if (assistantEnCours) return;
    if (dicteeLocaleActive) void arreterDicteeLocale("Dictée arrêtée pour commencer une nouvelle discussion.", false);
    arreterLectureVocaleAssistant();
    const discussion = creerDiscussionAssistant();
    discussionsAssistant.unshift(discussion);
    discussionAssistantActive = discussion;
    enregistrerDiscussionsAssistant();
    afficherDiscussionAssistant(discussion);
    afficherHistoriqueAssistant();
    ouvrirAssistant(true);
    afficherStatutDiscussionAssistant("Nouvelle discussion prête");
    document.getElementById("assistantInput")?.focus();
}

function terminerDiscussionAssistant() {
    if (assistantEnCours || !discussionAssistantActive || discussionAssistantActive.closedAt) return;
    if (dicteeLocaleActive) void arreterDicteeLocale("Dictée arrêtée ; discussion enregistrée.", false);
    arreterLectureVocaleAssistant();
    discussionAssistantActive.closedAt = new Date().toISOString();
    discussionAssistantActive.updatedAt = discussionAssistantActive.closedAt;
    enregistrerDiscussionsAssistant();
    afficherDiscussionAssistant(discussionAssistantActive);
    afficherHistoriqueAssistant();
    afficherStatutDiscussionAssistant("Discussion terminée et enregistrée dans ce navigateur");
    ouvrirAssistant(false);
}

function effacerHistoriqueAssistant() {
    if (!window.confirm("Effacer toutes les notes de lecture enregistrées dans ce navigateur ? Cette action est définitive.")) return;
    if (dicteeLocaleActive) void arreterDicteeLocale("Dictée arrêtée ; historique effacé.", false);
    arreterLectureVocaleAssistant();
    discussionsAssistant = [];
    discussionAssistantActive = creerDiscussionAssistant();
    discussionsAssistant.push(discussionAssistantActive);
    enregistrerDiscussionsAssistant();
    afficherDiscussionAssistant(discussionAssistantActive);
    afficherHistoriqueAssistant();
    document.getElementById("assistantHistory").hidden = true;
    document.getElementById("assistantHistoryToggle")?.setAttribute("aria-expanded", "false");
    afficherStatutDiscussionAssistant("Historique effacé");
}

function afficherEtatDicteeLocale(active, texteStatut) {
    const boutonMicro = document.getElementById("assistantMic");
    const boutonEnvoi = document.getElementById("assistantSend");
    const statut = document.getElementById("assistantVoiceStatus");
    if (boutonMicro) {
        boutonMicro.setAttribute("aria-pressed", String(active));
        boutonMicro.setAttribute("aria-label", active ? "Arrêter la dictée" : "Dicter une question");
        boutonMicro.title = active ? "Arrêter la dictée" : "Dicter une question";
        boutonMicro.classList.toggle("is-listening", active);
    }
    if (boutonEnvoi) boutonEnvoi.disabled = active || assistantEnCours || Boolean(discussionAssistantActive?.closedAt);
    if (statut && texteStatut) statut.textContent = texteStatut;
}

function afficherTranscriptionDicteeLocale() {
    const champ = document.getElementById("assistantInput");
    if (!champ) return;
    const transcription = [dicteeLocaleFinale, dicteeLocaleIntermediaire].filter(Boolean).join(" ").trim();
    champ.value = `${dicteeLocaleTexteInitial}${dicteeLocaleTexteInitial && transcription ? " " : ""}${transcription}`.slice(0, ASSISTANT_QUESTION_MAX_LENGTH);
    champ.dispatchEvent(new Event("input", { bubbles: true }));
}

function demarrerDicteeLocale() {
    if (!window.isSecureContext) {
        afficherEtatDicteeLocale(false, "La dictée vocale nécessite HTTPS ou une adresse localhost.");
        return;
    }
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
        afficherEtatDicteeLocale(false, "La dictée vocale n’est pas prise en charge par ce navigateur. Essayez la dernière version de Chrome ou Microsoft Edge.");
        return;
    }

    const champ = document.getElementById("assistantInput");
    dicteeLocaleFinale = "";
    dicteeLocaleIntermediaire = "";
    dicteeLocaleTexteInitial = champ?.value.trim() || "";
    dicteeErreur = "";
    dicteeArretEnCours = false;
    dicteeLocaleActive = true;
    const reconnaissance = new SpeechRecognitionAPI();
    reconnaissanceVocaleNavigateur = reconnaissance;
    reconnaissance.lang = "fr-FR";
    reconnaissance.continuous = true;
    reconnaissance.interimResults = true;
    reconnaissance.maxAlternatives = 1;
    afficherEtatDicteeLocale(true, "Demande d’accès au microphone…");

    reconnaissance.onstart = () => {
        afficherEtatDicteeLocale(true, "Écoute active. Parlez ; appuyez sur le micro pour terminer et envoyer votre question.");
        clearTimeout(dicteeSilenceTimer);
        dicteeSilenceTimer = setTimeout(() => {
            void arreterDicteeLocale(
                dicteeLocaleFinale || dicteeLocaleIntermediaire
                    ? "Dictée arrêtée après une longue pause. Vérifiez le texte, puis envoyez votre question."
                    : "Aucune parole détectée après 5 minutes. Vérifiez l’autorisation du microphone, puis réessayez."
            );
        }, 5 * 60 * 1000);
    };

    reconnaissance.onresult = event => {
        dicteeLocaleFinale = "";
        dicteeLocaleIntermediaire = "";
        for (let index = 0; index < event.results.length; index += 1) {
            const result = event.results[index];
            const texte = result[0]?.transcript?.trim();
            if (!texte) continue;
            if (result.isFinal) dicteeLocaleFinale += `${dicteeLocaleFinale ? " " : ""}${texte}`;
            else dicteeLocaleIntermediaire += `${dicteeLocaleIntermediaire ? " " : ""}${texte}`;
        }
        dicteeLocaleFinale = dicteeLocaleFinale.trim();
        dicteeLocaleIntermediaire = dicteeLocaleIntermediaire.trim();
        afficherTranscriptionDicteeLocale();
        clearTimeout(dicteeSilenceTimer);
        dicteeSilenceTimer = setTimeout(() => {
            void arreterDicteeLocale(
                "Dictée arrêtée après une longue pause. Vérifiez le texte, puis envoyez votre question."
            );
        }, 5 * 60 * 1000);
        afficherEtatDicteeLocale(true, "Voix transcrite. Continuez à parler ou appuyez sur le micro pour envoyer la question.");
    };

    reconnaissance.onerror = event => {
        const messages = {
            "not-allowed": "Accès au microphone refusé. Autorisez le microphone pour ce site dans les paramètres du navigateur, puis réessayez.",
            "service-not-allowed": "Le service de reconnaissance vocale est bloqué par le navigateur ou l’appareil.",
            "audio-capture": "Aucun microphone n’est disponible. Vérifiez le branchement et les paramètres audio de Windows.",
            "no-speech": "Aucune parole détectée. Vérifiez le microphone et réessayez.",
            "network": "Le service de reconnaissance vocale nécessite une connexion réseau. Vérifiez votre connexion, puis réessayez.",
            "language-not-supported": "La reconnaissance vocale française n’est pas disponible dans ce navigateur."
        };
        dicteeErreur = messages[event.error] || `La reconnaissance vocale a échoué (${event.error || "erreur inconnue"}).`;
        dicteeLocaleActive = false;
        clearTimeout(dicteeSilenceTimer);
        afficherEtatDicteeLocale(false, dicteeErreur);
        try {
            reconnaissance.stop();
        } catch (error) {
            console.warn("Arrêt après erreur de reconnaissance impossible:", error.message);
        }
    };

    reconnaissance.onend = () => {
        clearTimeout(dicteeSilenceTimer);
        if (reconnaissanceVocaleNavigateur === reconnaissance) reconnaissanceVocaleNavigateur = null;
        if (dicteeArretResolver) {
            const resolve = dicteeArretResolver;
            dicteeArretResolver = null;
            resolve();
        } else if (dicteeLocaleActive) {
            dicteeLocaleActive = false;
            afficherEtatDicteeLocale(false, dicteeLocaleFinale || dicteeLocaleIntermediaire
                ? "La dictée s’est arrêtée. Vérifiez le texte, puis envoyez votre question."
                : "La reconnaissance vocale s’est arrêtée sans transcription. Vérifiez l’autorisation du microphone et réessayez.");
        }
    };

    try {
        reconnaissance.start();
    } catch (error) {
        dicteeLocaleActive = false;
        reconnaissanceVocaleNavigateur = null;
        afficherEtatDicteeLocale(false, error.name === "NotAllowedError"
            ? "Accès au microphone refusé. Autorisez le microphone pour ce site dans les paramètres du navigateur, puis réessayez."
            : `Impossible de démarrer la reconnaissance vocale : ${error.message}`);
        console.error("Démarrage de la reconnaissance vocale impossible:", error.message);
    }
}

async function arreterDicteeLocale(message = "", envoyerTranscription = false) {
    const etaitActive = dicteeLocaleActive;
    dicteeLocaleActive = false;
    clearTimeout(dicteeSilenceTimer);
    if (reconnaissanceVocaleNavigateur && etaitActive && !dicteeArretEnCours) {
        dicteeArretEnCours = true;
        try {
            await new Promise(resolve => {
                dicteeArretResolver = resolve;
                const timeout = setTimeout(() => {
                    if (dicteeArretResolver === resolve) {
                        dicteeArretResolver = null;
                        resolve();
                    }
                }, 2000);
                const reconnaissance = reconnaissanceVocaleNavigateur;
                const finEcoute = reconnaissance.onend;
                reconnaissance.onend = () => {
                    clearTimeout(timeout);
                    if (typeof finEcoute === "function") finEcoute.call(reconnaissance);
                };
                try {
                    reconnaissance.stop();
                } catch (error) {
                    clearTimeout(timeout);
                    dicteeArretResolver = null;
                    console.warn("Arrêt de la reconnaissance vocale impossible:", error.message);
                    resolve();
                }
            });
        } catch (error) {
            console.error("Arrêt de la reconnaissance vocale impossible:", error.message);
        } finally {
            dicteeArretEnCours = false;
        }
    }
    const questionDictee = document.getElementById("assistantInput")?.value.trim() || "";
    const transcriptionReçue = Boolean(dicteeLocaleFinale || dicteeLocaleIntermediaire);
    if (envoyerTranscription && etaitActive && transcriptionReçue && questionDictee && !assistantEnCours) {
        afficherEtatDicteeLocale(false, "Question transcrite. Envoi à l’assistant IA…");
        const champ = document.getElementById("assistantInput");
        if (champ) {
            champ.value = "";
            champ.dispatchEvent(new Event("input", { bubbles: true }));
        }
        traiterQuestionAssistant(questionDictee);
        return;
    }
    afficherEtatDicteeLocale(false, message || dicteeErreur || (dicteeLocaleFinale
        ? "Dictée terminée. Vérifiez le texte, puis envoyez votre question."
        : dicteeLocaleIntermediaire
            ? "Dictée arrêtée. Vérifiez le texte provisoire ci-dessus, puis envoyez votre question."
            : "Dictée arrêtée. Aucune transcription reçue ; vérifiez l’autorisation et le fonctionnement du microphone."));
}

function initialiserCommandesVocales() {
    const boutonMicro = document.getElementById("assistantMic");
    const boutonLire = document.getElementById("assistantSpeak");
    const statut = document.getElementById("assistantVoiceStatus");
    if (boutonMicro) {
        boutonMicro.title = "Dicter en français, puis appuyer de nouveau pour envoyer la question";
        if (!window.isSecureContext) {
            boutonMicro.disabled = true;
            afficherEtatDicteeLocale(false, "La dictée vocale nécessite HTTPS ou une adresse localhost.");
        } else if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) {
            boutonMicro.disabled = true;
            afficherEtatDicteeLocale(false, "La dictée vocale nécessite un navigateur compatible, comme Chrome ou Microsoft Edge.");
        }
        boutonMicro.addEventListener("click", () => {
            if (dicteeLocaleActive) void arreterDicteeLocale("", true);
            else demarrerDicteeLocale();
        });
        if (statut && !statut.textContent) {
            statut.textContent = "Dictée française : autorisez le microphone de votre navigateur pour commencer.";
        }
    }

    if (boutonLire) {
        if (!("speechSynthesis" in window) || typeof window.SpeechSynthesisUtterance !== "function") {
            boutonLire.disabled = true;
            boutonLire.title = "La lecture vocale n’est pas prise en charge par ce navigateur.";
        } else {
            boutonLire.addEventListener("click", () => {
                if (syntheseVocaleEnCours) {
                    arreterLectureVocaleAssistant();
                    return;
                }
                const dernierMessage = discussionAssistantActive?.messages?.at(-1);
                const derniereReponse = dernierMessage?.role === "assistant"
                    && dernierMessage.content !== ASSISTANT_WELCOME_MESSAGE
                    ? dernierMessage.content
                    : "";
                if (!derniereReponse) {
                    if (statut) statut.textContent = "Aucune réponse à lire pour le moment.";
                    return;
                }
                window.speechSynthesis.cancel();
                const utterance = new window.SpeechSynthesisUtterance(derniereReponse);
                utterance.lang = "fr-FR";
                utterance.onend = utterance.onerror = () => {
                    syntheseVocaleEnCours = false;
                    boutonLire.setAttribute("aria-label", "Lire la dernière réponse à voix haute");
                    boutonLire.title = "Lire la dernière réponse à voix haute";
                };
                syntheseVocaleEnCours = true;
                boutonLire.setAttribute("aria-label", "Arrêter la lecture vocale");
                boutonLire.title = "Arrêter la lecture vocale";
                window.speechSynthesis.speak(utterance);
            });
        }
    }
}

async function traiterQuestionAssistant(question) {
    const texte = String(question || "").trim();
    if (!texte || assistantEnCours) return;
    if (texte.length > ASSISTANT_QUESTION_MAX_LENGTH) {
        afficherStatutDiscussionAssistant(`Votre message dépasse la limite de ${ASSISTANT_QUESTION_MAX_LENGTH.toLocaleString("fr-FR")} caractères.`, true);
        return;
    }
    if (!discussionAssistantActive || discussionAssistantActive.closedAt) {
        afficherStatutDiscussionAssistant("Cette discussion est terminée. Commencez-en une nouvelle pour continuer.", true);
        return;
    }
    const date = new Date().toISOString();
    discussionAssistantActive.messages.push({ role: "user", content: texte, createdAt: date });
    discussionAssistantActive.title = texte.replace(/\s+/g, " ").slice(0, 60) || "Notes de lecture";
    discussionAssistantActive.updatedAt = date;
    const discussionEnCours = discussionAssistantActive;
    enregistrerDiscussionsAssistant();
    afficherDiscussionAssistant(discussionAssistantActive);
    afficherHistoriqueAssistant();
    const messages = document.getElementById("assistantMessages");
    const indicateur = document.createElement("div");
    indicateur.className = "assistant-message assistant-bot assistant-pending";
    indicateur.textContent = "Je réfléchis à votre question…";
    messages?.append(indicateur);
    if (messages) messages.scrollTop = messages.scrollHeight;
    assistantEnCours = true;
    const boutonEnvoi = document.getElementById("assistantSend");
    const input = document.getElementById("assistantInput");
    afficherDiscussionAssistant(discussionAssistantActive);
    try {
        const historique = discussionEnCours.messages
            .filter(message => ["user", "assistant"].includes(message.role))
            .slice(-8, -1)
            .map(message => ({ role: message.role, content: message.content }));
        const resultat = await appelerApi("/assistant", {
            method: "POST",
            body: JSON.stringify({ question: texte, history: historique })
        });
        const sources = Array.isArray(resultat.sources) ? resultat.sources : [];
        const references = [...new Map(sources.map(source => [
            `${source.title}:${source.page || ""}`,
            source.page ? `« ${source.title} », p. ${source.page}` : `« ${source.title} »`
        ])).values()];
        const reponse = references.length
            ? `${resultat.answer}\n\nSources consultées : ${references.join(" · ")}`
            : resultat.answer;
        discussionEnCours.messages.push({ role: "assistant", content: reponse, createdAt: new Date().toISOString() });
        discussionEnCours.updatedAt = new Date().toISOString();
        enregistrerDiscussionsAssistant();
        if (discussionAssistantActive.id === discussionEnCours.id) afficherDiscussionAssistant(discussionAssistantActive);
        afficherHistoriqueAssistant();
    } catch (error) {
        const detail = error instanceof TypeError
            ? "Impossible de joindre le serveur du site. Vérifiez votre connexion, puis réessayez."
            : String(error.message || "Erreur inconnue.");
        const messageErreur = `L’assistant IA n’a pas pu répondre : ${detail} Votre question reste dans l’historique ; vous pourrez réessayer.`;
        discussionEnCours.messages.push({ role: "assistant", content: messageErreur, createdAt: new Date().toISOString() });
        discussionEnCours.updatedAt = new Date().toISOString();
        enregistrerDiscussionsAssistant();
        if (discussionAssistantActive.id === discussionEnCours.id) afficherDiscussionAssistant(discussionEnCours);
        afficherHistoriqueAssistant();
        afficherStatutDiscussionAssistant("La requête à l’assistant a échoué.", true);
        console.error("Réponse de l’assistant IA indisponible:", error.message);
    } finally {
        indicateur.remove();
        assistantEnCours = false;
        afficherDiscussionAssistant(discussionAssistantActive);
        if (input) {
            if (!discussionAssistantActive?.closedAt) input.focus();
        }
    }
}

function envoyerQuestionAssistant() {
    const input = document.getElementById("assistantInput");
    if (!input) return;
    const question = input.value;
    input.value = "";
    traiterQuestionAssistant(question);
}

function questionRapide(question) {
    traiterQuestionAssistant(question);
}

function ouvrirAssistant(forceOuverture) {
    const assistant = document.getElementById("assistantWidget");
    const bouton = document.getElementById("assistantToggle");
    if (!assistant) return;
    const estOuvert = typeof forceOuverture === "boolean" ? forceOuverture : !assistant.classList.contains("open");
    assistant.classList.toggle("open", estOuvert);
    bouton?.setAttribute("aria-expanded", String(estOuvert));
    if (estOuvert) document.getElementById("assistantInput")?.focus();
}

function initialiserAssistant() {
    chargerDiscussionsAssistant();
    initialiserCommandesVocales();
    document.getElementById("assistantToggle")?.addEventListener("click", () => ouvrirAssistant(true));
    document.getElementById("assistantClose")?.addEventListener("click", () => {
        if (dicteeLocaleActive) void arreterDicteeLocale("Dictée arrêtée.");
        arreterLectureVocaleAssistant();
        ouvrirAssistant(false);
    });
    document.getElementById("assistantForm")?.addEventListener("submit", event => {
        event.preventDefault();
        envoyerQuestionAssistant();
    });
    document.querySelectorAll(".assistant-chip[data-question]").forEach(bouton => {
        bouton.addEventListener("click", () => questionRapide(bouton.dataset.question));
    });
    document.getElementById("assistantNewChat")?.addEventListener("click", demarrerNouvelleDiscussionAssistant);
    document.getElementById("assistantEndChat")?.addEventListener("click", terminerDiscussionAssistant);
    document.getElementById("assistantHistoryToggle")?.addEventListener("click", event => {
        const panneau = document.getElementById("assistantHistory");
        if (!panneau) return;
        panneau.hidden = !panneau.hidden;
        event.currentTarget.setAttribute("aria-expanded", String(!panneau.hidden));
        if (!panneau.hidden) document.getElementById("assistantHistoryList")?.scrollIntoView({ block: "nearest" });
    });
    document.getElementById("assistantHistoryClear")?.addEventListener("click", effacerHistoriqueAssistant);
    document.getElementById("assistantInput")?.addEventListener("input", event => {
        const nombre = event.currentTarget.value.length;
        afficherStatutDiscussionAssistant(nombre > ASSISTANT_QUESTION_MAX_LENGTH - 500
            ? `${nombre.toLocaleString("fr-FR")}/${ASSISTANT_QUESTION_MAX_LENGTH.toLocaleString("fr-FR")} caractères`
            : "");
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && document.getElementById("assistantWidget")?.classList.contains("open")) {
            ouvrirAssistant(false);
            document.getElementById("assistantToggle")?.focus();
        }
    });
}

async function actualiserSourcesAssistant() {
    const liste = document.getElementById("assistantKnowledgeList");
    if (!liste) return;
    liste.replaceChildren();
    try {
        const documents = await appelerApi("/admin/knowledge");
        if (!Array.isArray(documents) || documents.length === 0) {
            const vide = document.createElement("li");
            vide.textContent = "Aucune œuvre indexée pour le moment.";
            liste.append(vide);
            return;
        }
        documents.forEach(documentSource => {
            const item = document.createElement("li");
            const details = document.createElement("span");
            const pages = documentSource.pages ? ` · ${documentSource.pages} pages` : "";
            details.textContent = `${documentSource.title} · ${documentSource.chunkCount} passages${pages}`;
            const supprimer = document.createElement("button");
            supprimer.type = "button";
            supprimer.className = "assistant-knowledge-remove";
            supprimer.textContent = "Retirer";
            supprimer.setAttribute("aria-label", `Retirer ${documentSource.title} de la base documentaire`);
            supprimer.addEventListener("click", async () => {
                if (!window.confirm(`Retirer « ${documentSource.title} » de la base de lecture ?`)) return;
                supprimer.disabled = true;
                try {
                    await appelerApi(`/admin/knowledge/${encodeURIComponent(documentSource.id)}`, { method: "DELETE" });
                    await actualiserSourcesAssistant();
                } catch (error) {
                    afficherStatutSourcesAssistant(error.message, true);
                    supprimer.disabled = false;
                }
            });
            item.append(details, supprimer);
            liste.append(item);
        });
    } catch (error) {
        const echeance = document.createElement("li");
        echeance.textContent = "Connectez-vous à l’espace studio pour consulter les sources.";
        liste.append(echeance);
        console.error("Chargement de la base documentaire impossible:", error.message);
    }
}

function afficherStatutSourcesAssistant(message, erreur = false) {
    const statut = document.getElementById("assistantKnowledgeStatus");
    if (!statut) return;
    statut.textContent = message;
    statut.classList.toggle("is-error", erreur);
}

async function importerSourceAssistant() {
    const titre = document.getElementById("assistantKnowledgeTitleInput");
    const selecteur = document.getElementById("assistantKnowledgeFile");
    const bouton = document.getElementById("assistantKnowledgeImport");
    const fichier = selecteur?.files?.[0];
    const nom = titre?.value.trim() || "";
    if (!nom || !fichier) {
        afficherStatutSourcesAssistant("Indiquez le titre de l’œuvre et sélectionnez son manuscrit.", true);
        return;
    }
    if (fichier.size > 16 * 1024 * 1024) {
        afficherStatutSourcesAssistant("Le fichier doit peser moins de 16 Mo.", true);
        return;
    }
    if (!/\.(pdf|txt|md)$/i.test(fichier.name)) {
        afficherStatutSourcesAssistant("Formats acceptés : PDF, TXT et Markdown (.md).", true);
        return;
    }

    bouton.disabled = true;
    afficherStatutSourcesAssistant("Lecture et indexation des passages en cours…");
    try {
        const contenu = await lireFichierEnBase64(fichier);
        const resultat = await appelerApi("/admin/knowledge", {
            method: "POST",
            body: JSON.stringify({ title: nom, fileName: fichier.name, content: contenu })
        });
        afficherStatutSourcesAssistant(`${resultat.message} L’assistant peut maintenant retrouver les passages pertinents.`);
        selecteur.value = "";
        await actualiserSourcesAssistant();
    } catch (error) {
        afficherStatutSourcesAssistant(error.message || "Import du manuscrit impossible.", true);
        console.error("Import de la source documentaire impossible:", error.message);
    } finally {
        bouton.disabled = false;
    }
}

function initialiserFiltresOeuvres() {
    const recherche = document.getElementById("oeuvresSearch");
    const categorie = document.getElementById("oeuvresType");
    const cartes = [...document.querySelectorAll(".oeuvre-product")];
    const messageVide = document.getElementById("oeuvresEmpty");
    if (!recherche || !categorie || cartes.length === 0) return;

    const normaliser = valeur => String(valeur || "")
        .toLocaleLowerCase("fr")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
    const filtrer = () => {
        const terme = normaliser(recherche.value.trim());
        const type = categorie.value;
        let nombreVisible = 0;
        cartes.forEach(carte => {
            const correspond = (type === "all" || carte.dataset.type === type)
                && (!terme || normaliser(carte.textContent).includes(terme));
            carte.hidden = !correspond;
            if (correspond) nombreVisible += 1;
        });
        if (messageVide) messageVide.hidden = nombreVisible > 0;
    };
    recherche.addEventListener("input", filtrer);
    categorie.addEventListener("change", filtrer);
}


/* =========================================================
   CREATIONS PAR DEFAUT
   ========================================================= */

const creationsParDefaut = [
    {
        id: "default-1",
        titre: "Illustration",
        categorie: "Illustration",
        description: "Création originale du studio.",
        image: "assets/illustration.svg",
        date: new Date().toISOString()
    },
    {
        id: "default-2",
        titre: "Bande dessinée",
        categorie: "BD",
        description: "Projet de bande dessinée.",
        image: "assets/bd.svg",
        date: new Date().toISOString()
    },
    {
        id: "default-3",
        titre: "Character Design",
        categorie: "Character Design",
        description: "Conception de personnage.",
        image: "assets/character.svg",
        date: new Date().toISOString()
    },
    {
        id: "default-4",
        titre: "Couverture",
        categorie: "Couverture",
        description: "Création de couverture.",
        image: "assets/cover.svg",
        date: new Date().toISOString()
    }
];


/* =========================================================
   GALERIE
   ========================================================= */

function getSavedCreations() {
    try {
        const donnees = localStorage.getItem(STORAGE_KEY);

        if (!donnees) {
            return [];
        }

        const creations = JSON.parse(donnees);

        return Array.isArray(creations) ? creations : [];
    } catch (error) {
        console.error("Erreur lecture créations :", error);
        return [];
    }
}


function saveCreations(creations) {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(creations)
        );

        return true;
    } catch (error) {
        console.error("Impossible d'enregistrer les créations :", error);

        alert(
            "La création a été ajoutée à l'affichage, " +
            "mais le navigateur n'a pas assez d'espace pour " +
            "la conserver localement. Essaie avec une image plus légère."
        );

        return false;
    }
}


function mettreAJourCompteursCreations(nombre) {
    document
        .querySelectorAll("#nombreCreations")
        .forEach(element => {
            element.textContent = nombre;
        });

    const volumeCreations =
        document.getElementById("volumeCreations");

    if (volumeCreations) {
        volumeCreations.textContent = nombre;
    }
}


function renderGalleryFromData(creations) {
    const galerie =
        document.getElementById("gallery") ||
        document.querySelector(".gallery");

    if (!galerie) return;

    galerie.innerHTML = "";

    if (!Array.isArray(creations) || creations.length === 0) {
        galerie.innerHTML = `
            <div class="gallery-card">
                <div class="placeholder">
                    <span>Aucune création pour le moment.</span>
                </div>
            </div>
        `;

        mettreAJourCompteursCreations(0);
        return;
    }

    creations.forEach((creation, index) => {
        const carte = document.createElement("article");

        carte.className = "gallery-card";

        const titre = echapperHTML(
            creation.titre || creation.title || `Création ${index + 1}`
        );

        const categorie = echapperHTML(
            creation.categorie || creation.category || "Création"
        );

        const description = echapperHTML(
            creation.description || ""
        );

        let mediaHTML = `
            <div class="placeholder">
                <span>${categorie}</span>
            </div>
        `;

        if (creation.image) {
            mediaHTML = `
                <div class="placeholder">
                    <img
                        src="${creation.image}"
                        alt="${titre}"
                        class="gallery-image"
                        loading="lazy"
                    >
                </div>
            `;
        } else if (creation.video) {
            mediaHTML = `
                <div class="placeholder">
                    <video
                        class="gallery-video"
                        controls
                        preload="metadata"
                    >
                        <source src="${creation.video}">
                        Votre navigateur ne peut pas lire cette vidéo.
                    </video>
                </div>
            `;
        } else if (creation.pdf) {
            mediaHTML = `
                <div class="placeholder pdf-label">
                    <span>PDF</span>
                </div>
            `;
        }

        let lienPDF = "";

        if (creation.pdf) {
            lienPDF = `
                <a
                    href="${creation.pdf}"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="pdf-link"
                >
                    Ouvrir le PDF
                </a>
            `;
        }

        carte.innerHTML = `
            ${mediaHTML}

            <div class="gallery-card-content">
                <h3>${titre}</h3>

                <p class="gallery-category">
                    ${categorie}
                </p>

                ${
                    description
                        ? `<p>${description}</p>`
                        : ""
                }

                ${lienPDF}
            </div>
        `;

        galerie.appendChild(carte);
    });

    preparerImagesZoomables(galerie);
    mettreAJourCompteursCreations(creations.length);
}

/* =========================================================
   ZOOM TEMPORAIRE DES ILLUSTRATIONS
   ========================================================= */

const SELECTEUR_IMAGES_ZOOMABLES = ".oeuvre-product > img, .gallery-image";
const DUREE_ZOOM_MIN_MS = 650;
const DUREE_DEZOOM_MS = 440;
let imageZoomActive = null;
let overlayZoomActif = null;
let zoomCommenceA = 0;

function preparerImagesZoomables(conteneur = document) {
    conteneur.querySelectorAll(SELECTEUR_IMAGES_ZOOMABLES).forEach(image => {
        image.classList.add("press-zoomable");
        image.tabIndex = 0;
        image.setAttribute("role", "button");
        image.setAttribute("aria-keyshortcuts", "Space Enter");
        image.setAttribute("aria-label", `${image.alt || "Illustration"}. Maintenez le clic ou la touche Espace pour agrandir, puis relâchez pour réduire.`);
        image.title = "Maintenez le clic ou la touche Espace pour agrandir";
        image.draggable = false;
    });
}

function fermerZoomIllustration() {
    if (imageZoomActive) imageZoomActive.classList.remove("is-press-zoomed");
    imageZoomActive = null;
    if (!overlayZoomActif) return;
    const overlay = overlayZoomActif;
    overlayZoomActif = null;
    const attente = Math.max(0, DUREE_ZOOM_MIN_MS - (performance.now() - zoomCommenceA));
    zoomCommenceA = 0;
    window.setTimeout(() => {
        overlay.classList.add("is-closing");
        window.setTimeout(() => overlay.remove(), DUREE_DEZOOM_MS);
    }, attente);
}

function agrandirIllustration(image) {
    if (imageZoomActive === image) return;
    fermerZoomIllustration();
    imageZoomActive = image;
    zoomCommenceA = performance.now();
    image.classList.add("is-press-zoomed");

    const overlay = document.createElement("div");
    overlay.className = "press-zoom-overlay";
    overlay.setAttribute("aria-hidden", "true");
    const copie = image.cloneNode();
    copie.className = "press-zoom-overlay-image";
    copie.alt = "";
    copie.removeAttribute("id");
    overlay.appendChild(copie);
    document.body.appendChild(overlay);
    overlayZoomActif = overlay;
}

function initialiserZoomMaintenu() {
    preparerImagesZoomables();

    document.addEventListener("pointerdown", event => {
        if (event.button !== 0) return;
        const image = event.target.closest?.(SELECTEUR_IMAGES_ZOOMABLES);
        if (!image) return;
        event.preventDefault();
        image.focus({ preventScroll: true });
        agrandirIllustration(image);
    });

    document.addEventListener("pointerup", fermerZoomIllustration);
    document.addEventListener("pointercancel", fermerZoomIllustration);
    document.addEventListener("keydown", event => {
        if (event.repeat || (event.code !== "Space" && event.code !== "Enter")) return;
        const image = event.target.closest?.(SELECTEUR_IMAGES_ZOOMABLES);
        if (!image) return;
        event.preventDefault();
        agrandirIllustration(image);
    });
    document.addEventListener("keyup", event => {
        if (event.code === "Space" || event.code === "Enter") fermerZoomIllustration();
    });
    document.addEventListener("focusout", event => {
        if (event.target.matches?.(SELECTEUR_IMAGES_ZOOMABLES)) fermerZoomIllustration();
    });
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) fermerZoomIllustration();
    });
    window.addEventListener("blur", fermerZoomIllustration);
}


async function initialiserGalerie() {
    let creations = getSavedCreations();

    if (creations.length === 0) {
        creations = [...creationsParDefaut];
        saveCreations(creations);
    }

    renderGalleryFromData(creations);

    try {
        const serveur = await appelerApi("/creations");

        if (Array.isArray(serveur)) {
            saveCreations(serveur);
            renderGalleryFromData(serveur);
        }
    } catch (error) {
        console.info(
            "API créations indisponible. Utilisation du stockage local."
        );
    }
}


/* =========================================================
   FENETRE AJOUT CREATION
   ========================================================= */

function ouvrirFenetre() {
    const fenetre = document.getElementById("fenetreAjout");

    if (!fenetre) return;

    fenetre.style.display = "flex";

    gererTypeMedia();
    if (localStorage.getItem(ADMIN_KEY) === "true") actualiserSourcesAssistant();
}


function fermerFenetre() {
    const fenetre = document.getElementById("fenetreAjout");

    if (!fenetre) return;

    fenetre.style.display = "none";
}


function gererTypeMedia() {
    const select =
        document.getElementById("typeMedia");

    const type = select
        ? select.value
        : "image";

    const imageBox =
        document.getElementById("imageUploadBox");

    const pdfBox =
        document.getElementById("pdfUploadBox");

    const videoBox =
        document.getElementById("videoUploadBox");

    const imageInput =
        document.getElementById("imageInput");

    const pdfInput =
        document.getElementById("pdfInput");

    const videoInput =
        document.getElementById("videoInput");

    if (imageBox) {
        imageBox.style.display =
            type === "image" || type === "imageEtPdf"
                ? ""
                : "none";
    }

    if (pdfBox) {
        pdfBox.style.display =
            type === "pdf" || type === "imageEtPdf"
                ? ""
                : "none";
    }

    if (videoBox) {
        videoBox.style.display =
            type === "video"
                ? ""
                : "none";
    }

    if (imageInput) {
        imageInput.required =
            type === "image" ||
            type === "imageEtPdf";
    }

    if (pdfInput) {
        pdfInput.required =
            type === "pdf" ||
            type === "imageEtPdf";
    }

    if (videoInput) {
        videoInput.required =
            type === "video";
    }
}


function previsualiserImage(event) {
    const fichier =
        event?.target?.files?.[0];

    const preview =
        document.getElementById("imagePreview");

    if (!preview) return;

    if (!fichier) {
        preview.removeAttribute("src");
        preview.style.display = "none";
        return;
    }

    if (!fichier.type.startsWith("image/")) {
        alert("Veuillez sélectionner une image.");
        event.target.value = "";
        preview.style.display = "none";
        return;
    }

    const ancienneURL =
        preview.dataset.objectUrl;

    if (ancienneURL) {
        URL.revokeObjectURL(ancienneURL);
    }

    const url =
        URL.createObjectURL(fichier);

    preview.src = url;
    preview.dataset.objectUrl = url;
    preview.style.display = "block";
}


function afficherNomPdf(event) {
    const fichier =
        event?.target?.files?.[0];

    const element =
        document.getElementById("pdfFileName");

    if (!element) return;

    element.textContent =
        fichier
            ? fichier.name
            : "Aucun PDF sélectionné";
}


function afficherNomVideo(event) {
    const fichier =
        event?.target?.files?.[0];

    const element =
        document.getElementById("videoFileName");

    if (!element) return;

    element.textContent =
        fichier
            ? fichier.name
            : "Aucune vidéo sélectionnée";
}


function lireFichierEnBase64(fichier) {
    return new Promise((resolve, reject) => {
        if (!fichier) {
            resolve(null);
            return;
        }

        const lecteur = new FileReader();

        lecteur.onload = () => {
            resolve(lecteur.result);
        };

        lecteur.onerror = () => {
            reject(
                new Error(
                    `Impossible de lire le fichier ${fichier.name}`
                )
            );
        };

        lecteur.readAsDataURL(fichier);
    });
}


/* =========================================================
   PUBLICATION D'UNE CREATION
   ========================================================= */

async function publierCreation() {
    const typeMedia =
        document.getElementById("typeMedia")?.value ||
        "image";

    const imageInput =
        document.getElementById("imageInput");

    const pdfInput =
        document.getElementById("pdfInput");

    const videoInput =
        document.getElementById("videoInput");

    const titre =
        document.getElementById("titreCreation")?.value.trim();

    const categorie =
        document.getElementById("categorieCreation")?.value.trim();

    const description =
        document.getElementById("descriptionCreation")?.value.trim();

    const imageFile =
        imageInput?.files?.[0] || null;

    const pdfFile =
        pdfInput?.files?.[0] || null;

    const videoFile =
        videoInput?.files?.[0] || null;

    if (!titre) {
        alert("Veuillez donner un titre à la création.");
        return;
    }

    if (!categorie) {
        alert("Veuillez indiquer une catégorie.");
        return;
    }

    if (
        (typeMedia === "image" ||
            typeMedia === "imageEtPdf") &&
        !imageFile
    ) {
        alert("Veuillez sélectionner une image.");
        return;
    }

    if (
        (typeMedia === "pdf" ||
            typeMedia === "imageEtPdf") &&
        !pdfFile
    ) {
        alert("Veuillez sélectionner un PDF.");
        return;
    }

    if (typeMedia === "video" && !videoFile) {
        alert("Veuillez sélectionner une vidéo.");
        return;
    }

    if (imageFile && !imageFile.type.startsWith("image/")) {
        alert("Le fichier sélectionné n'est pas une image valide.");
        return;
    }

    if (pdfFile && pdfFile.type !== "application/pdf") {
        alert("Le fichier sélectionné n'est pas un PDF valide.");
        return;
    }

    if (videoFile && !videoFile.type.startsWith("video/")) {
        alert("Le fichier sélectionné n'est pas une vidéo valide.");
        return;
    }

    try {
        const [imageBase64, pdfBase64, videoBase64] =
            await Promise.all([
                imageFile
                    ? lireFichierEnBase64(imageFile)
                    : null,

                pdfFile
                    ? lireFichierEnBase64(pdfFile)
                    : null,

                videoFile
                    ? lireFichierEnBase64(videoFile)
                    : null
            ]);

        const creation = {
            id:
                "creation-" +
                Date.now() +
                "-" +
                Math.random()
                    .toString(36)
                    .substring(2, 8),

            titre,
            categorie,
            description,

            image:
                imageBase64 || null,

            pdf:
                pdfBase64 || null,

            video:
                videoBase64 || null,

            date:
                new Date().toISOString()
        };

        let creationServeur;
        try {
            creationServeur = await appelerApi("/creations", {
                method: "POST",
                body: JSON.stringify({
                    title: titre,
                    category: categorie,
                    description,
                    image: imageBase64,
                    pdf: pdfBase64,
                    video: videoBase64
                })
            });
        } catch (error) {
            console.error("Publication de la création impossible:", error.message);
            alert(`La création n’a pas été publiée : ${error.message}`);
            return;
        }

        const nouvellesCreations = getSavedCreations()
            .filter(item => !String(item.id || "").startsWith("default-"));
        const creationsFinales = [...nouvellesCreations, creationServeur];
        saveCreations(creationsFinales);
        renderGalleryFromData(creationsFinales);
        alert("Création publiée avec succès.");

        fermerFenetre();

        const formulaire =
            document.getElementById("creationForm");

        if (formulaire) {
            formulaire.reset();
        }

        if (imageInput) {
            imageInput.value = "";
        }

        if (pdfInput) {
            pdfInput.value = "";
        }

        if (videoInput) {
            videoInput.value = "";
        }

        const preview =
            document.getElementById("imagePreview");

        if (preview) {
            const objectURL =
                preview.dataset.objectUrl;

            if (objectURL) {
                URL.revokeObjectURL(objectURL);
            }

            preview.removeAttribute("src");
            preview.removeAttribute("data-object-url");
            preview.style.display = "none";
        }

        const pdfName =
            document.getElementById("pdfFileName");

        if (pdfName) {
            pdfName.textContent =
                "Aucun PDF sélectionné";
        }

        const videoName =
            document.getElementById("videoFileName");

        if (videoName) {
            videoName.textContent =
                "Aucune vidéo sélectionnée";
        }

        gererTypeMedia();

    } catch (error) {
        console.error(
            "Erreur publication création :",
            error
        );

        alert(
            "Impossible de publier la création.\n\n" +
            error.message
        );
    }
}


/* =========================================================
   NAVIGATION MOBILE
   ========================================================= */

function toggleMenu() {
    const menu =
        document.getElementById("mainNav");

    if (!menu) return;

    const ouvert = menu.classList.toggle("active");
    document.querySelector(".menu-button")?.setAttribute("aria-expanded", String(ouvert));
}


function fermerMenuMobile() {
    const menu =
        document.getElementById("mainNav");

    if (!menu) return;

    menu.classList.remove("active");
    document.querySelector(".menu-button")?.setAttribute("aria-expanded", "false");
}

// Le menu déroulant se referme avec Échap ou d’un clic en dehors, comme tout menu natif.
document.addEventListener("keydown", (evenement) => {
    if (evenement.key !== "Escape") return;
    const menu = document.getElementById("mainNav");
    if (!menu?.classList.contains("active")) return;
    fermerMenuMobile();
    document.querySelector(".menu-button")?.focus();
});

document.addEventListener("click", (evenement) => {
    const menu = document.getElementById("mainNav");
    if (!menu?.classList.contains("active")) return;
    if (evenement.target.closest("#mainNav, .menu-button")) return;
    fermerMenuMobile();
});

function initialiserConfortVisuel() {
    const racine = document.documentElement;
    const boutonTheme = document.getElementById("themeToggle");
    const themeEnregistre = localStorage.getItem("uniqueArtTheme");

    function appliquerTheme(theme) {
        racine.dataset.theme = theme;
        boutonTheme?.setAttribute("aria-label", theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre");
        if (boutonTheme) boutonTheme.innerHTML = `<span aria-hidden="true">${theme === "dark" ? "☀" : "☾"}</span>`;
        document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#101116" : "#f4f1f5");
    }

    appliquerTheme(themeEnregistre || "dark");
    boutonTheme?.addEventListener("click", () => {
        const prochain = racine.dataset.theme === "dark" ? "light" : "dark";
        localStorage.setItem("uniqueArtTheme", prochain);
        appliquerTheme(prochain);
    });

    const barre = document.getElementById("readingProgress");
    const retourHaut = document.getElementById("backToTop");
    let planifie = false;
    function mettreAJourDefilement() {
        const maximum = document.documentElement.scrollHeight - window.innerHeight;
        const progression = maximum > 0 ? (window.scrollY / maximum) * 100 : 0;
        if (barre) barre.style.transform = `scaleX(${progression / 100})`;
        retourHaut?.classList.toggle("visible", window.scrollY > 600);
        planifie = false;
    }
    window.addEventListener("scroll", () => {
        if (!planifie) {
            window.requestAnimationFrame(mettreAJourDefilement);
            planifie = true;
        }
    }, { passive: true });
    retourHaut?.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

    const sections = [...document.querySelectorAll("main section[id]")];
    const textesGuide = {
        accueil: ["Bienvenue au studio", "Découvrez l’univers créatif d’UNIQUE ART VISUEL STUDIO."],
        boutique: ["La boutique", "Choisissez une création et passez commande en quelques étapes."],
        tarifs: ["Les tarifs", "Consultez les prix indicatifs et les conditions des prestations."],
        compte: ["Votre espace client", "Créez un compte pour suivre vos commandes et vos échanges."],
        actualites: ["Les actualités", "Suivez les projets, les nouvelles et les coulisses du studio."],
        creations: ["Le portfolio", "Parcourez les réalisations et les créations du studio."],
        oeuvres: ["Nos œuvres", "Explorez les projets artistiques et les illustrations récentes."],
        apropos: ["À propos", "Découvrez l’histoire, la démarche et la mission du studio."],
        contact: ["Parlons de votre projet", "Présentez votre idée : le studio vous répondra avec attention."]
    };
    const guideTitre = document.getElementById("sectionGuideTitle");
    const guideTexte = document.getElementById("sectionGuideText");
    let derniereRubriqueGuide = "";
    function actualiserGuide(sectionId) {
        const contenu = textesGuide[sectionId];
        if (!contenu || sectionId === derniereRubriqueGuide) return;
        derniereRubriqueGuide = sectionId;
        if (guideTitre) guideTitre.textContent = contenu[0];
        if (guideTexte) guideTexte.textContent = contenu[1];
        const bulle = document.getElementById("sectionGuideBubble");
        if (bulle) {
            bulle.classList.remove("guide-bubble-arrive");
            requestAnimationFrame(() => bulle.classList.add("guide-bubble-arrive"));
        }
    }
    if ("IntersectionObserver" in window) {
        const observateur = new IntersectionObserver((entrees) => {
            for (const entree of entrees) {
                if (!entree.isIntersecting) continue;
                actualiserGuide(entree.target.id);
                document.querySelectorAll("#mainNav a[data-section]").forEach((lien) => {
                    if (lien.dataset.section === entree.target.id) lien.setAttribute("aria-current", "location");
                    else lien.removeAttribute("aria-current");
                });
            }
        }, { rootMargin: "-25% 0px -65% 0px" });
        sections.forEach((section) => observateur.observe(section));
    } else {
        actualiserGuide("accueil");
    }

    document.querySelectorAll("#mainNav a").forEach((lien) => lien.addEventListener("click", fermerMenuMobile));
}


/* =========================================================
   ADMINISTRATION
   ========================================================= */

function ouvrirConnexion() {
    const modal =
        document.getElementById("connexionAdmin");

    if (!modal) return;

    modal.style.display = "flex";
}


function fermerConnexion() {
    const modal =
        document.getElementById("connexionAdmin");

    if (!modal) return;

    modal.style.display = "none";
}


function optionsAdmin() {
    return {};
}


function afficherDashboard(ouvrir = false) {
    const dashboard =
        document.getElementById("adminDashboard");

    if (!dashboard) return;

    dashboard.style.display = "block";
    dashboard.classList.remove("admin-dashboard-entering");
    void dashboard.offsetWidth;
    dashboard.classList.add("admin-dashboard-entering");
    if (ouvrir) {
        requestAnimationFrame(() => dashboard.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
}


function ouvrirEspaceStudio() {
    const dashboard = document.getElementById("adminDashboard");
    if (dashboard && dashboard.style.display === "block") {
        dashboard.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
    }
    ouvrirConnexion();
    requestAnimationFrame(() => document.getElementById("motDePasse")?.focus());
}


async function verifierStatutAdmin() {
    try {
        if (localStorage.getItem(ADMIN_KEY) !== "true") return;
        const session = await appelerApi("/admin/session");
        if (!session.authenticated) {
            localStorage.removeItem(ADMIN_KEY);
            return;
        }
        afficherDashboard();
        await actualiserBoiteReception();
        await actualiserComptabilite();
        await actualiserSourcesAssistant();
    } catch (error) {
        console.error(error);
    }
}


async function connexionAdmin(event) {
    if (event) {
        event.preventDefault();
    }

    const champ =
        document.getElementById("motDePasse");

    const erreur =
        document.getElementById("erreurConnexion");

    const motDePasse =
        champ?.value || "";

    try {
        await appelerApi("/admin/session", {
            method: "POST",
            body: JSON.stringify({ password: motDePasse })
        });
        localStorage.setItem(ADMIN_KEY, "true");
        if (erreur) erreur.textContent = "";
        fermerConnexion();
        afficherDashboard(true);
        // Les demandes des clients sont réservées au studio : on les charge dès la connexion.
        await initialiserDiscussions();
        await actualiserBoiteReception();
        await actualiserComptabilite();
        await actualiserSourcesAssistant();
    } catch (error) {
        if (erreur) erreur.textContent = error.message === "MODE_LOCAL"
            ? "Lancez le site avec son serveur pour accéder à l’espace studio."
            : error.message;
    }
}

async function deconnexionAdmin() {
    try {
        await appelerApi("/admin/session", { method: "DELETE" });
    } catch (error) {
        console.info("Session studio déjà fermée.");
    }
    localStorage.removeItem(ADMIN_KEY);
    // Les demandes des clients ne doivent pas rester affichées ni mémorisées après la déconnexion.
    saveDiscussions([]);
    renderDiscussions([]);

    const dashboard =
        document.getElementById("adminDashboard");

    if (dashboard) {
        dashboard.style.display = "none";
    }
}


/* =========================================================
   COMPTABILITE ADMIN
   ========================================================= */

async function actualiserComptabilite() {
    try {
        const donnees =
            await appelerApi(
                "/admin/overview",
                optionsAdmin()
            );

        if (!donnees) return;

        const mapping = {
            accountingLastUpdate:
                donnees.lastUpdate ||
                donnees.derniereMiseAJour,

            accountingTotal:
                donnees.total ||
                donnees.totalAmount ||
                0,

            accountingConfirmed:
                donnees.confirmed ||
                donnees.confirmedAmount ||
                0,

            accountingPending:
                donnees.pending ||
                donnees.pendingAmount ||
                0,

            accountingAverage:
                donnees.average ||
                donnees.averageAmount ||
                0,

            volumeClients:
                donnees.clients ||
                donnees.volumeClients ||
                0,

            volumeDiscussions:
                donnees.discussions ||
                donnees.volumeDiscussions ||
                0,

            volumeCreations:
                donnees.creations ||
                donnees.volumeCreations ||
                getSavedCreations().length,

            volumeNews:
                donnees.news ||
                donnees.volumeNews ||
                0
        };

        Object.entries(mapping).forEach(
            ([id, valeur]) => {
                const element =
                    document.getElementById(id);

                if (element) {
                    element.textContent =
                        typeof valeur === "number"
                            ? valeur.toLocaleString("fr-FR")
                            : valeur;
                }
            }
        );

        const activites =
            document.getElementById(
                "accountingActivityList"
            );

        if (
            activites &&
            Array.isArray(donnees.activities)
        ) {
            activites.innerHTML =
                donnees.activities
                    .map(
                        activite => `
                            <li>
                                ${echapperHTML(
                                    activite.message ||
                                    activite.description ||
                                    ""
                                )}
                            </li>
                        `
                    )
                    .join("");
        }

    } catch (error) {
        console.info(
            "Comptabilité serveur indisponible."
        );
    }
}


/* =========================================================
   BOITE DE RECEPTION ADMIN
   ========================================================= */

async function actualiserBoiteReception() {
    const liste =
        document.getElementById(
            "adminInboxList"
        );

    if (!liste) return;

    try {
        const donnees =
            await appelerApi(
                "/admin/inbox",
                optionsAdmin()
            );

        if (!Array.isArray(donnees)) {
            return;
        }

        if (donnees.length === 0) {
            liste.innerHTML = '<li class="discussion-empty">La boîte de réception est vide.</li>';
            return;
        }

        liste.innerHTML = donnees
            .map(
                message => `
                    <li>
                        <strong>${echapperHTML(message.nom || message.name || message.email || "Visiteur")}</strong>
                        <span>${echapperHTML(message.sujet || (message.direction === "reçu" ? "E-mail reçu" : "Message du site"))}</span>
                        <span>${echapperHTML(message.message || "")}</span>
                        <small>${message.direction === "reçu" ? "Reçu" : "Envoyé depuis le site"} · ${echapperHTML(new Date(message.date).toLocaleString("fr-FR"))}</small>
                    </li>
                `
            )
            .join("");

    } catch (error) {
        liste.innerHTML = '<li class="discussion-empty">Impossible de charger la boîte de réception. Reconnectez-vous puis réessayez.</li>';
        console.info(
            "Boîte de réception serveur indisponible."
        );
    }
}


/* =========================================================
   CONTACT
   ========================================================= */

async function envoyerContact(event) {
    if (event) {
        event.preventDefault();
    }

    const formulaire =
        event?.target ||
        document.getElementById("contactForm");

    if (!formulaire) return;

    const status = document.getElementById("statusContact");
    const bouton = formulaire.querySelector('button[type="submit"]');
    const payload = {
        nom: document.getElementById("nomContact")?.value.trim(),
        email: document.getElementById("emailContact")?.value.trim(),
        message: document.getElementById("messageContact")?.value.trim(),
        website: document.getElementById("siteWebContact")?.value.trim()
    };
    if (bouton) bouton.disabled = true;
    if (status) {
        status.classList.remove("error", "success");
        status.textContent = "Envoi de votre message…";
    }
    try {
        await appelerApi("/contact", { method: "POST", body: JSON.stringify(payload) });
        formulaire.reset();
        if (status) {
            status.classList.add("success");
            status.textContent = "Votre message a bien été transmis au studio. Merci !";
        }
    } catch (error) {
        if (status) {
            status.classList.add("error");
            status.textContent = error.message === "MODE_LOCAL"
                ? "Cette page est ouverte comme un fichier. Lancez le serveur du site, puis ouvrez http://localhost:3000."
                : error.message;
        }
    } finally {
        if (bouton) bouton.disabled = false;
    }
}


/* =========================================================
   BOUTIQUE
   ========================================================= */

const produitsBoutique = [
    {
        id: "illustration",
        nom: "Illustration",
        prix: 30000,
        image: "assets/illustration.svg",
        description:
            "Illustration originale réalisée par le studio."
    },

    {
        id: "bd",
        nom: "Bande dessinée",
        prix: 75000,
        image: "assets/bd.svg",
        description:
            "Création de planche de bande dessinée couleur."
    },

    {
        id: "character",
        nom: "Character Design",
        prix: 50000,
        image: "assets/character.svg",
        description:
            "Conception et développement d'un personnage."
    },

    {
        id: "cover",
        nom: "Couverture",
        prix: 75000,
        image: "assets/cover.svg",
        description:
            "Création d'une couverture illustrée."
    }
];


function renderShop() {
    const grille =
        document.getElementById("shopGrid");

    if (!grille) return;

    grille.innerHTML = "";

    produitsBoutique.forEach(produit => {
        const carte =
            document.createElement("article");

        carte.className = "shop-card";

        carte.innerHTML = `
            <div class="shop-image">
                <img
                    src="${produit.image}"
                    alt="${echapperHTML(produit.nom)}"
                >
            </div>

            <div class="shop-card-content">
                <h3>
                    ${echapperHTML(produit.nom)}
                </h3>

                <p>
                    ${echapperHTML(produit.description)}
                </p>

                <strong>
                    ${formatPrix(produit.prix)}
                </strong>

                <button
                    class="shop-button"
                    type="button"
                    onclick="ouvrirCommande(
                        '${produit.nom.replace(/'/g, "\\'")}',
                        ${produit.prix},
                        '${produit.id}'
                    )"
                >
                    <span class="shop-button-label">${paiementEnLigneDisponible === false ? "Commander sur WhatsApp" : "Commander"}</span>
                    <span class="shop-button-icon" aria-hidden="true">↗</span>
                </button>
            </div>
        `;

        grille.appendChild(carte);
    });
}


/* =========================================================
   COMMANDES
   ========================================================= */

function ouvrirCommande(produit, prix, produitId = "") {
    if (paiementEnLigneDisponible === false) {
        commanderSurWhatsApp(produit, prix);
        return;
    }

    commandeSelectionnee = {
        id: produitId,
        produit,
        prix
    };

    const modal =
        document.getElementById("commandeModal");

    const produitNom =
        document.getElementById(
            "commandeProduitNom"
        );

    const prixElement =
        document.getElementById("commandePrix");

    if (produitNom) {
        produitNom.textContent = produit;
    }

    if (prixElement) {
        prixElement.textContent =
            formatPrix(prix);
    }

    if (modal) {
        modal.style.display = "flex";
    }
}


function fermerCommande() {
    const modal =
        document.getElementById("commandeModal");

    if (modal) {
        modal.style.display = "none";
    }
}


async function envoyerCommande(event) {
    if (event) {
        event.preventDefault();
    }

    const nom =
        document.getElementById("commandeNom")
            ?.value.trim();

    const email =
        document.getElementById("commandeEmail")
            ?.value.trim();

    const telephone =
        document.getElementById("commandeTelephone")
            ?.value.trim();

    const message =
        document.getElementById("commandeMessage")
            ?.value.trim();

    const statut = document.getElementById("statusCommande");
    const bouton = document.querySelector("#commandeForm button[type='submit']");
    if (bouton) bouton.disabled = true;
    if (statut) {
        statut.classList.remove("error", "success");
        statut.textContent = "Préparation du paiement sécurisé…";
    }
    try {
        const result = await appelerApi("/orders", {
            method: "POST",
            body: JSON.stringify({
                produitId: commandeSelectionnee.id,
                nom,
                email,
                telephone,
                message
            })
        });
        if (!result.checkoutUrl) throw new Error("Le lien de paiement sécurisé n’a pas été reçu.");
        if (statut) statut.textContent = "Redirection vers CinetPay…";
        window.location.assign(result.checkoutUrl);
    } catch (error) {
        if (statut) {
            statut.classList.add("error");
            statut.textContent = error.message === "MODE_LOCAL"
                ? "Cette page est ouverte comme un fichier. Lancez le serveur du site, puis ouvrez http://localhost:3000."
                : error.message;
        }
    } finally {
        if (bouton) bouton.disabled = false;
    }
}

async function traiterRetourPaiement() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paiement") !== "retour") return;
    const notice = document.getElementById("paymentReturnNotice");
    if (!notice) return;
    notice.hidden = false;
    const transactionId = params.get("transaction_id") || params.get("cpm_trans_id");
    if (!transactionId) {
        notice.textContent = "Retour du paiement reçu. Le studio confirmera le statut de votre commande par e-mail.";
        return;
    }
    notice.textContent = "Vérification du statut de votre paiement…";
    for (let tentative = 0; tentative < 10; tentative += 1) {
        try {
            const result = await appelerApi(`/payments/status?transaction_id=${encodeURIComponent(transactionId)}`);
            if (result.statut === "confirmée") {
                notice.classList.add("is-success");
                notice.innerHTML = `
                    <div class="payment-celebration payment-return-celebration">
                        <div class="celebration-person" aria-hidden="true">
                            <span class="person-hat">✦</span>
                            <span class="person-head"></span>
                            <span class="person-body"></span>
                            <span class="person-arm person-arm-left"></span>
                            <span class="person-arm person-arm-right"></span>
                            <span class="person-leg person-leg-left"></span>
                            <span class="person-leg person-leg-right"></span>
                        </div>
                        <strong>Paiement confirmé !</strong>
                        <span>Merci pour votre achat${result.produit ? ` de « ${echapperHTML(result.produit)} »` : ""} ! Le studio s’occupe de la suite.</span>
                    </div>`;
                break;
            }
            if (["paiement refusé", "échec de création du paiement"].includes(result.statut)) {
                notice.textContent = "Le paiement n’a pas été confirmé. Vous pouvez réessayer depuis la boutique.";
                break;
            }
            notice.textContent = "Votre paiement est en cours de confirmation. Cette page se mettra à jour automatiquement.";
        } catch (error) {
            notice.textContent = "La vérification du paiement est momentanément indisponible. Le statut sera confirmé par e-mail.";
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    params.delete("paiement");
    params.delete("transaction_id");
    params.delete("cpm_trans_id");
    const query = params.toString();
    window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}


/* =========================================================
   DISCUSSIONS / COMMUNAUTE
   ========================================================= */

const DISCUSSIONS_KEY =
    "uniqueArtDiscussions";


function getSavedDiscussions() {
    try {
        return JSON.parse(
            localStorage.getItem(
                DISCUSSIONS_KEY
            ) || "[]"
        );
    } catch {
        return [];
    }
}


function saveDiscussions(discussions) {
    try {
        localStorage.setItem(
            DISCUSSIONS_KEY,
            JSON.stringify(discussions)
        );
    } catch (error) {
        console.error(error);
    }
}


// Bouton « Traduire » placé sous un message : traduit dans la langue choisie par le visiteur.
function ajouterControleTraduction(conteneur, texteOriginal) {
    const outils = document.createElement("div");
    outils.className = "translation-message-tools";

    const bouton = document.createElement("button");
    bouton.type = "button";
    bouton.className = "translate-button";
    bouton.textContent = "Traduire";

    const resultat = document.createElement("p");
    resultat.className = "translation-result";
    resultat.setAttribute("aria-live", "polite");
    resultat.hidden = true;

    bouton.addEventListener("click", async () => {
        const langue = document.getElementById("discussionLanguage")?.value || "en";
        bouton.disabled = true;
        bouton.textContent = "Traduction…";
        try {
            resultat.textContent = await traduireTexte(texteOriginal, langue);
            bouton.textContent = "Actualiser la traduction";
        } catch (error) {
            resultat.textContent = "La traduction est momentanément indisponible. Réessayez dans un instant.";
            bouton.textContent = "Réessayer";
        } finally {
            resultat.hidden = false;
            bouton.disabled = false;
        }
    });

    outils.append(bouton, resultat);
    conteneur.appendChild(outils);
}


function renderDiscussions(discussions) {
    const liste =
        document.getElementById(
            "discussionList"
        );

    if (!liste) return;

    liste.innerHTML = "";

    if (
        !Array.isArray(discussions) ||
        discussions.length === 0
    ) {
        liste.innerHTML =
            "<p>Aucune discussion pour le moment.</p>";
        return;
    }

    const estAdmin = localStorage.getItem(ADMIN_KEY) === "true";

    // Les demandes les plus récentes apparaissent en premier.
    [...discussions].reverse().forEach((discussion) => {
        const element = document.createElement("article");
        element.className = "discussion-item";

        const entete = document.createElement("div");
        entete.className = "discussion-header";

        const identite = document.createElement("div");
        identite.className = "discussion-identity";
        const nom = document.createElement("strong");
        nom.textContent = discussion.nom || discussion.name || "Anonyme";
        const type = document.createElement("span");
        type.textContent = discussion.type || "Discussion";
        identite.append(nom, type);
        entete.appendChild(identite);

        const dateDemande = discussion.date ? new Date(discussion.date) : null;
        if (dateDemande && !Number.isNaN(dateDemande.getTime())) {
            const date = document.createElement("span");
            date.className = "discussion-date";
            date.textContent = dateDemande.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
            entete.appendChild(date);
        }

        const contenu = document.createElement("p");
        contenu.className = "discussion-message";
        contenu.textContent = discussion.message || "";

        element.append(entete, contenu);

        // L'adresse du client n'est transmise par le serveur qu'au studio connecté.
        if (estAdmin && discussion.email) {
            const contact = document.createElement("a");
            contact.className = "discussion-contact";
            contact.href = `mailto:${discussion.email}`;
            contact.textContent = discussion.email;
            element.appendChild(contact);
        }

        if (discussion.message) ajouterControleTraduction(element, discussion.message);

        if (Array.isArray(discussion.replies) && discussion.replies.length) {
            const reponses = document.createElement("div");
            reponses.className = "discussion-replies";
            discussion.replies.forEach((reponse) => {
                const ligne = document.createElement("p");
                ligne.className = "discussion-reply-item";
                const auteur = document.createElement("strong");
                auteur.textContent = "Studio : ";
                ligne.append(auteur, document.createTextNode(reponse.message || ""));
                reponses.appendChild(ligne);
            });
            element.appendChild(reponses);
        }

        if (estAdmin && discussion.id) {
            const formulaire = document.createElement("form");
            formulaire.className = "discussion-reply";
            const champ = document.createElement("input");
            champ.type = "text";
            champ.maxLength = 2000;
            champ.required = true;
            champ.placeholder = "Répondre au client…";
            champ.setAttribute("aria-label", `Répondre à ${nom.textContent}`);
            const envoyer = document.createElement("button");
            envoyer.type = "submit";
            envoyer.textContent = "Répondre";
            const etat = document.createElement("p");
            etat.className = "status-message";
            etat.setAttribute("aria-live", "polite");
            formulaire.append(champ, envoyer);

            formulaire.addEventListener("submit", async (evenement) => {
                evenement.preventDefault();
                const texte = champ.value.trim();
                if (!texte) return;
                envoyer.disabled = true;
                try {
                    const reponse = await appelerApi(`/discussions/${discussion.id}/reply`, {
                        method: "POST",
                        ...optionsAdmin(),
                        body: JSON.stringify({ message: texte })
                    });
                    discussion.replies = [...(discussion.replies || []), reponse];
                    saveDiscussions(discussions);
                    renderDiscussions(discussions);
                } catch (error) {
                    // Rien n'est affiché comme envoyé tant que le serveur n'a pas enregistré la réponse.
                    etat.classList.add("error");
                    etat.textContent = error.message || "La réponse n’a pas pu être enregistrée. Réessayez.";
                    envoyer.disabled = false;
                }
            });

            const actions = document.createElement("div");
            actions.className = "discussion-actions";

            const supprimer = document.createElement("button");
            supprimer.type = "button";
            supprimer.textContent = "Supprimer";
            supprimer.addEventListener("click", () => {
                if (!window.confirm("Supprimer définitivement cette demande ?")) return;
                modererDiscussion(discussion.id, "delete", etat);
            });

            const bloquer = document.createElement("button");
            bloquer.type = "button";
            bloquer.textContent = "Bloquer ce profil";
            bloquer.addEventListener("click", () => {
                if (!window.confirm(`Bloquer ${nom.textContent} et supprimer toutes ses demandes ?`)) return;
                modererDiscussion(discussion.id, "block", etat);
            });

            actions.append(supprimer, bloquer);
            element.append(formulaire, etat, actions);
        }

        liste.appendChild(element);
    });
}


// Suppression d'une demande ou blocage d'un profil par le studio, puis rechargement de la liste.
async function modererDiscussion(id, action, etat) {
    try {
        await appelerApi(action === "delete" ? `/discussions/${id}` : `/discussions/${id}/block`, {
            method: action === "delete" ? "DELETE" : "POST",
            ...optionsAdmin()
        });
        const restantes = await appelerApi("/discussions");
        saveDiscussions(Array.isArray(restantes) ? restantes : []);
        renderDiscussions(Array.isArray(restantes) ? restantes : []);
    } catch (error) {
        if (etat) {
            etat.classList.add("error");
            etat.textContent = error.message || "L’action n’a pas pu être effectuée. Réessayez.";
        }
    }
}


async function initialiserDiscussions() {
    const locales =
        getSavedDiscussions();

    renderDiscussions(locales);

    try {
        const serveur =
            await appelerApi(
                "/discussions"
            );

        if (Array.isArray(serveur)) {
            if (serveur.length || locales.length === 0) {
                saveDiscussions(serveur);
                renderDiscussions(serveur);
            }
        }
    } catch (error) {
        console.info(
            "Discussions serveur indisponibles."
        );
    }
}


async function envoyerDiscussion(event) {
    if (event) {
        event.preventDefault();
    }

    const nom =
        document.getElementById(
            "discussionNom"
        )?.value.trim();

    const email =
        document.getElementById(
            "discussionEmail"
        )?.value.trim();

    const langue =
        document.getElementById(
            "discussionLanguage"
        )?.value || "fr";

    const type =
        document.getElementById(
            "discussionType"
        )?.value || "Discussion";

    const message =
        document.getElementById(
            "discussionMessage"
        )?.value.trim();

    if (!message) {
        alert(
            "Veuillez écrire un message."
        );
        return;
    }

    const statut = document.getElementById("discussionStatus");
    const bouton = event?.target?.querySelector('button[type="submit"]');
    const discussion = {
        name: nom,
        email,
        language: langue,
        type,
        message,
    };

    if (bouton) bouton.disabled = true;
    if (statut) {
        statut.classList.remove("error", "success");
        statut.textContent = "Envoi de votre demande…";
    }
    try {
        const publiee = await appelerApi(
            "/discussions",
            {
                method: "POST",
                body: JSON.stringify(discussion)
            }
        );
        const discussions = getSavedDiscussions();
        discussions.push(publiee);
        saveDiscussions(discussions);
        renderDiscussions(discussions);
        if (statut) {
            statut.classList.add("success");
            statut.textContent = "Votre demande a bien été envoyée au studio.";
        }
        event?.target?.reset();
    } catch (error) {
        if (statut) {
            statut.classList.add("error");
            statut.textContent = error.message === "MODE_LOCAL"
                ? "Lancez le site avec son serveur pour envoyer votre demande."
                : error.message || "Votre demande n’a pas pu être envoyée. Réessayez.";
        }
    } finally {
        if (bouton) bouton.disabled = false;
    }
}


/* =========================================================
   TRADUCTION
   ========================================================= */

async function traduireTexte(
    texte,
    langueCible
) {
    if (!texte) return "";

    try {
        const resultat =
            await appelerApi(
                "/translate",
                {
                    method: "POST",
                    body: JSON.stringify({
                        text: texte,
                        targetLanguage: langueCible
                    })
                }
            );

        if (resultat?.translation) {
            return resultat.translation;
        }
    } catch (error) {
        console.info(
            "API traduction indisponible."
        );
    }

    /*
     * MyMemory comme solution de secours.
     */

    try {
        const langueSource = "fr";

        const url =
            "https://api.mymemory.translated.net/get" +
            `?q=${encodeURIComponent(texte)}` +
            `&langpair=${langueSource}|${encodeURIComponent(langueCible)}`;

        const reponse =
            await fetch(url);

        const donnees =
            await reponse.json();

        return (
            donnees?.responseData?.translatedText ||
            texte
        );

    } catch (error) {
        console.info(
            "Traduction de secours indisponible."
        );

        return texte;
    }
}


/* =========================================================
   ACTUALITES
   ========================================================= */

const actualitesParDefaut = [
    {
        id: "news-1",
        titre: "Bienvenue chez UNIQUE ART VISUEL STUDIO",
        type: "Studio",
        contenu:
            "Découvrez nos créations, nos services et nos projets.",
        date:
            new Date().toISOString()
    }
];


function getSavedNews() {
    try {
        const donnees =
            localStorage.getItem(
                NEWS_KEY
            );

        if (!donnees) return [];

        const news =
            JSON.parse(donnees);

        return Array.isArray(news)
            ? news
            : [];

    } catch {
        return [];
    }
}


function saveNews(news) {
    try {
        localStorage.setItem(
            NEWS_KEY,
            JSON.stringify(news)
        );
    } catch (error) {
        console.error(error);
    }
}


function renderNews(news) {
    const feed =
        document.getElementById(
            "newsFeed"
        );

    if (!feed) return;

    feed.innerHTML = "";

    if (
        !Array.isArray(news) ||
        news.length === 0
    ) {
        feed.innerHTML =
            "<p>Aucune actualité pour le moment.</p>";
        return;
    }

    news.forEach(actualite => {
        const article =
            document.createElement("article");

        article.className =
            "news-card";

        article.innerHTML = `
            <span class="news-type">
                ${echapperHTML(
                    actualite.type ||
                    "Actualité"
                )}
            </span>

            <h3>
                ${echapperHTML(
                    actualite.titre ||
                        actualite.title ||
                        ""
                    )}
            </h3>

            <p>
                ${echapperHTML(
                    actualite.contenu ||
                    actualite.content ||
                    ""
                )}
            </p>
        `;

        feed.appendChild(article);
    });
}


async function initialiserNews() {
    let news =
        getSavedNews();

    if (news.length === 0) {
        news =
            [...actualitesParDefaut];

        saveNews(news);
    }

    renderNews(news);

    try {
        const serveur =
            await appelerApi(
                "/actualites"
            );

        if (Array.isArray(serveur)) {
            saveNews(serveur);
            renderNews(serveur);
        }

    } catch (error) {
        console.info(
            "Actualités serveur indisponibles."
        );
    }
}


async function publierActualite(event) {
    if (event) {
        event.preventDefault();
    }

    const titre =
        document.getElementById(
            "newsTitle"
        )?.value.trim();

    const type =
        document.getElementById(
            "newsType"
        )?.value.trim();

    const contenu =
        document.getElementById(
            "newsContent"
        )?.value.trim();

    if (!titre || !contenu) {
        alert(
            "Veuillez remplir le titre et le contenu."
        );
        return;
    }

    try {
        const actualite = await appelerApi("/actualites", {
            method: "POST",
            body: JSON.stringify({
                title: titre,
                type: type || "Actualité",
                content: contenu
            })
        });
        const news = getSavedNews().filter(item => String(item.id) !== String(actualite.id));
        news.unshift(actualite);
        saveNews(news);
        renderNews(news);
        const statut = document.getElementById("newsStatus");
        if (statut) statut.textContent = "Actualité publiée sur le site.";
        event?.target?.reset();
    } catch (error) {
        console.error("Publication de l’actualité impossible:", error.message);
        const statut = document.getElementById("newsStatus");
        if (statut) statut.textContent = `Actualité non publiée : ${error.message}`;
    }
}


/* =========================================================
   COMPTE CLIENT
   ========================================================= */

async function creerCompteClient(event) {
    if (event) {
        event.preventDefault();
    }

    const nom =
        document.getElementById(
            "accountNom"
        )?.value.trim();

    const email =
        document.getElementById(
            "accountEmail"
        )?.value.trim();

    const motDePasse =
        document.getElementById(
            "accountPassword"
        )?.value;

    const telephone =
        document.getElementById(
            "accountTelephone"
        )?.value.trim();

    const statut =
        document.getElementById(
            "accountStatus"
        );

    if (!nom || !email || !motDePasse || !telephone) {
        if (statut) {
            statut.textContent =
                "Veuillez remplir les champs obligatoires.";
        }

        return;
    }

    if (motDePasse.length < 10) {
        if (statut) statut.textContent = "Choisissez un mot de passe d’au moins 10 caractères.";
        return;
    }

    try {
        const resultat = await appelerApi(
            "/clients",
            {
                method: "POST",
                body: JSON.stringify({ nom, email, motDePasse, telephone })
            }
        );
        if (statut) {
            statut.classList.remove("error");
            statut.classList.add("success");
            statut.textContent = resultat?.emailEnvoye
                ? "Compte créé. Un e-mail de confirmation vous a été envoyé."
                : "Compte créé. Vous êtes connecté à votre espace client.";
        }
        event?.target?.reset();
        // Le serveur ouvre la session à l'inscription : l'espace client s'affiche aussitôt.
        if (resultat?.client) {
            afficherSessionClient(resultat.client);
            await chargerCommandesClient();
            await chargerEchangesClient();
        }
    } catch (error) {
        if (statut) {
            statut.classList.remove("success");
            statut.classList.add("error");
            statut.textContent = error.message === "MODE_LOCAL"
                ? "Lancez le site avec son serveur pour créer un compte."
                : error.message || "Impossible de créer le compte pour le moment.";
        }
    }
}


async function connexionClient(event) {
    if (event) {
        event.preventDefault();
    }

    const email =
        document.getElementById(
            "clientLoginEmail"
        )?.value.trim();

    const motDePasse =
        document.getElementById(
            "clientLoginPassword"
        )?.value;

    const statut =
        document.getElementById(
            "clientLoginStatus"
        );

    if (!email || !motDePasse) {
        if (statut) {
            statut.textContent =
                "Veuillez remplir les deux champs.";
        }

        return;
    }

    try {
        const resultat =
            await appelerApi(
                "/login",
                {
                    method: "POST",
                    body: JSON.stringify({
                        email,
                        motDePasse
                    })
                }
            );

        const client =
            resultat?.client ||
            resultat;

        afficherSessionClient(client);
        await chargerCommandesClient();
        await chargerEchangesClient();
        fermerConnexionClient();

        if (statut) {
            statut.classList.remove("error");
            statut.classList.add("success");
            statut.textContent =
                "Connexion réussie.";
        }

    } catch (error) {
        if (statut) {
            statut.classList.remove("success");
            statut.classList.add("error");
            statut.textContent = error.message === "MODE_LOCAL"
                ? "Lancez le site avec son serveur pour vous connecter."
                : error.message || "Connexion impossible. Vérifiez vos identifiants.";
        }
    }
}


function afficherSessionClient(client) {
    const panel =
        document.getElementById(
            "clientSessionPanel"
        );

    const nom =
        document.getElementById(
            "clientSessionName"
        );

    const email =
        document.getElementById(
            "clientSessionEmail"
        );

    if (panel) {
        panel.hidden = false;
        panel.style.display = "block";
    }
    const formulaireCompte = document.getElementById("accountForm");
    if (formulaireCompte) formulaireCompte.style.display = "none";

    if (nom) {
        nom.textContent =
            client?.nom ||
            client?.name ||
            "Client";
    }

    if (email) {
        email.textContent =
            client?.email ||
            "";
    }
}


async function chargerCommandesClient() {
    const liste = document.getElementById("clientOrdersList");
    if (!liste) return;
    liste.textContent = "Chargement de vos commandes…";
    try {
        const commandes = await appelerApi("/client/orders");
        if (!Array.isArray(commandes) || commandes.length === 0) {
            liste.textContent = "Aucune commande n’est encore associée à cette adresse e-mail.";
            return;
        }
        liste.innerHTML = commandes.map((commande) => {
            const date = commande.date ? new Date(commande.date).toLocaleDateString("fr-FR") : "";
            return `<article class="client-order-item"><strong>${echapperHTML(commande.produit)}</strong><span>${formatPrix(commande.prix)} · ${echapperHTML(commande.statut)}</span><small>${echapperHTML(date)}</small></article>`;
        }).join("");
    } catch (error) {
        liste.textContent = error.message || "Impossible de charger vos commandes.";
    }
}


async function chargerEchangesClient() {
    const liste = document.getElementById("clientDiscussionsList");
    if (!liste) return;
    liste.textContent = "Chargement de vos échanges…";
    try {
        const discussions = await appelerApi("/client/discussions");
        if (!Array.isArray(discussions) || discussions.length === 0) {
            liste.textContent = "Aucune demande enregistrée pour cette adresse e-mail.";
            return;
        }
        liste.innerHTML = discussions.map((discussion) => {
            const reponses = (discussion.replies || []).map((reply) =>
                `<p class="client-discussion-reply">${echapperHTML(reply.message)}</p>`
            ).join("");
            return `<article class="client-order-item"><strong>${echapperHTML(discussion.type || "Demande")}</strong><p>${echapperHTML(discussion.message)}</p>${reponses}</article>`;
        }).join("");
    } catch (error) {
        liste.textContent = error.message || "Impossible de charger vos échanges.";
    }
}


async function chargerSessionClient() {
    try {
        const client = await appelerApi("/client/session");
        afficherSessionClient(client);
        await chargerCommandesClient();
        await chargerEchangesClient();
    } catch (error) {
        const panel = document.getElementById("clientSessionPanel");
        if (panel) {
            panel.hidden = true;
            panel.style.display = "";
        }
        const formulaireCompte = document.getElementById("accountForm");
        if (formulaireCompte) formulaireCompte.style.display = "";
    }
}


async function deconnecterClient() {
    try {
        await appelerApi("/client/session", { method: "DELETE" });
    } catch (error) {
        console.info("Session client déjà fermée.");
    }
    const panel = document.getElementById("clientSessionPanel");
    if (panel) {
        panel.hidden = true;
        panel.style.display = "";
    }
    const formulaireCompte = document.getElementById("accountForm");
    if (formulaireCompte) formulaireCompte.style.display = "";
}


function ouvrirConnexionClient() {
    const modal = document.getElementById("connexionClient");
    if (modal) modal.style.display = "flex";
}


function fermerConnexionClient() {
    const modal = document.getElementById("connexionClient");
    if (modal) modal.style.display = "none";
}


/* =========================================================
   GUIDE VISITEUR
   ========================================================= */

function guideVisiteur() {
    const accueil =
        document.getElementById("accueil");

    if (accueil) {
        accueil.scrollIntoView({
            behavior: "smooth"
        });
    }
}


/* =========================================================
   EVENEMENTS FENETRES
   ========================================================= */

function initialiserFermetureModales() {
    window.addEventListener(
        "click",
        event => {
            const modales =
                document.querySelectorAll(
                    ".modal"
                );

            modales.forEach(modale => {
                if (
                    event.target === modale
                ) {
                    modale.style.display =
                        "none";
                }
            });
        }
    );
}


/* =========================================================
   RACCOURCI ADMIN
   ========================================================= */

function initialiserRaccourciAdmin() {
    document.getElementById("secretAdminTrigger")?.addEventListener("click", ouvrirEspaceStudio);
    document.addEventListener(
        "keydown",
        event => {
            if (
                event.ctrlKey &&
                event.shiftKey &&
                event.key.toLowerCase() === "a"
            ) {
                event.preventDefault();

                ouvrirConnexion();
            }
        }
    );
}


/* =========================================================
   INITIALISATION GENERALE
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        traiterRetourPaiement();
        actualiserDisponibiliteServices();
        initialiserConfortVisuel();
        initialiserAssistant();
        initialiserFiltresOeuvres();
        initialiserZoomMaintenu();
        const formulaires = [
            ["contactForm", envoyerContact],
            ["commandeForm", envoyerCommande],
            ["discussionForm", envoyerDiscussion],
            ["newsForm", publierActualite],
            ["accountForm", creerCompteClient],
            ["clientLoginForm", connexionClient]
        ];
        formulaires.forEach(([id, gestionnaire]) => {
            document.getElementById(id)?.addEventListener("submit", gestionnaire);
        });
        console.log(
            "UNIQUE ART VISUEL STUDIO : application chargée."
        );

        /*
         * Galerie
         */
        await Promise.all([
            initialiserGalerie(),
            initialiserNews(),
            initialiserDiscussions()
        ]);

        renderShop();

        /*
         * Session client
         */
        chargerSessionClient();

        /*
         * Administration
         */
        await verifierStatutAdmin();

        /*
         * Modales
         */
        initialiserFermetureModales();

        /*
         * Raccourci administrateur
         */
        initialiserRaccourciAdmin();

        /*
         * Type de média
         */
        gererTypeMedia();

        /*
         * Comptabilité
         */
        /*
         * Rafraîchissement périodique
         */
        accountingTimer =
            setInterval(
                () => {
                    if (
                        localStorage.getItem(
                            ADMIN_KEY
                        ) === "true"
                    ) {
                        actualiserComptabilite();
                    }
                },
                60000
            );

        discussionTimer =
            setInterval(
                () => {
                    initialiserDiscussions();
                },
                120000
            );
    }
);


/* =========================================================
   COMPATIBILITE AVEC LES ATTRIBUTS ONCLICK DU HTML
   ========================================================= */

window.ouvrirFenetre =
    ouvrirFenetre;

window.fermerFenetre =
    fermerFenetre;

window.gererTypeMedia =
    gererTypeMedia;

window.previsualiserImage =
    previsualiserImage;

window.afficherNomPdf =
    afficherNomPdf;

window.afficherNomVideo =
    afficherNomVideo;

window.publierCreation =
    publierCreation;

window.ouvrirConnexion =
    ouvrirConnexion;

window.fermerConnexion =
    fermerConnexion;

window.connexionAdmin =
    connexionAdmin;

window.deconnexionAdmin =
    deconnexionAdmin;

window.actualiserBoiteReception =
    actualiserBoiteReception;

window.actualiserComptabilite =
    actualiserComptabilite;

window.envoyerContact =
    envoyerContact;

window.ouvrirCommande =
    ouvrirCommande;

window.fermerCommande =
    fermerCommande;

window.envoyerCommande =
    envoyerCommande;

window.envoyerDiscussion =
    envoyerDiscussion;

window.traduireTexte =
    traduireTexte;

window.publierActualite =
    publierActualite;

window.creerCompteClient =
    creerCompteClient;

window.connexionClient =
    connexionClient;

window.ouvrirConnexionClient = ouvrirConnexionClient;
window.fermerConnexionClient = fermerConnexionClient;
window.deconnecterClient = deconnecterClient;

window.guideVisiteur =
    guideVisiteur;

window.toggleMenu =
    toggleMenu;

window.fermerMenuMobile =
    fermerMenuMobile;

window.envoyerQuestionAssistant =
    envoyerQuestionAssistant;

window.questionRapide =
    questionRapide;

window.ouvrirAssistant =
    ouvrirAssistant;
