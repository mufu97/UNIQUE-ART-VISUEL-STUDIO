const STORAGE_KEY = "uniqueArtCreations";
const ADMIN_KEY = "uniqueArtAdminConnected";
const NEWS_KEY = "uniqueArtActualites";
const API_BASE = "/api";
let commandeSelectionnee = { produit: "", prix: 0 };
let accountingRefreshTimer = null;

async function appelerApi(endpoint, options = {}) {
    if (window.location.protocol === "file:") {
        throw new Error("MODE_LOCAL");
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        ...options
    });

    const responseText = await response.text();
    let data = {};

    if (responseText.trim()) {
        try {
            data = JSON.parse(responseText);
        } catch (error) {
            throw new Error(`Le serveur a renvoyé une réponse invalide (HTTP ${response.status}).`);
        }
    }

    if (!response.ok) {
        throw new Error(data.error || `Le serveur a refusé la demande (HTTP ${response.status}).`);
    }

    return data;
}

const ASSISTANT_REPLIES = [
    {
        pattern: /(devis|budget|tarif|prix|illustration|bd|webtoon|couverture)/i,
        answer: "Pour obtenir un devis, précisez le type de projet, la durée estimée et le format souhaité. Nous pouvons vous proposer une illustration, une planche BD, une couverture ou un projet visuel complet."
    },
    {
        pattern: /(paiement|mobile money|virement|carte|pay|payer)/i,
        answer: "Les paiements peuvent se faire par mobile money, carte bancaire, virement bancaire ou selon accord avec le studio. Une confirmation claire est envoyée avant validation finale."
    },
    {
        pattern: /(contact|appel|telephone|email|message|rendezvous)/i,
        answer: "Vous pouvez nous contacter par téléphone au +225 0701675941 / 07 59 87 55 31 ou par e-mail à dieudonnejeannde@gmail.com."
    },
    {
        pattern: /(delai|délai|temps|livraison|date)/i,
        answer: "Le délai dépend du type de projet et de la complexité. Un devis précis est donné au moment où le brief est validé."
    },
    {
        pattern: /(compte|connexion|inscription|client)/i,
        answer: "Vous pouvez créer un compte client dans la section Compte pour suivre vos demandes, vos échanges et vos projets."
    },
    {
        pattern: /(bonjour|salut|merci|bienvenue|ok)/i,
        answer: "Bonjour ! Je peux vous orienter sur les tarifs, les commandes, le paiement et la création de projet."
    }
];

const DEFAULT_CREATIONS = [
    {
        title: "Illustration artistique",
        category: "Illustration",
        description: "Création visuelle pour un projet culturel et narratif.",
        image: "",
        pdf: ""
    },
    {
        title: "Création BD",
        category: "Bande dessinée",
        description: "Planche et storytelling pour une série graphique.",
        image: "",
        pdf: ""
    },
    {
        title: "Character Design",
        category: "Character Design",
        description: "Personnages originaux et expression artistique.",
        image: "",
        pdf: ""
    },
    {
        title: "Projet Webtoon",
        category: "Webtoon",
        description: "Compositions visuelles adaptées au format numérique.",
        image: "",
        pdf: ""
    }
];

const DISCUSSION_KEY = "uniqueArtDiscussions";
const BLOCKED_NAMES_KEY = "uniqueArtBlockedNames";
const DEFAULT_DISCUSSIONS = [
    {
        id: 1,
        name: "Maya",
        type: "Demande de devis",
        message: "Bonjour, je souhaite obtenir un devis pour une illustration de couverture pour un livre jeunesse.",
        date: new Date().toISOString()
    },
    {
        id: 2,
        name: "Kouassi",
        type: "Question sur les modalités",
        message: "Quelles sont les modalités de paiement pour un projet BD de 10 pages ?",
        date: new Date().toISOString()
    }
];

const DEFAULT_NEWS = [
    {
        id: 1,
        title: "Bienvenue dans le fil du studio",
        type: "Annonce",
        content: "Retrouvez ici les nouveaux projets, les coulisses de création et les annonces de Unique Art Visuel Studio.",
        date: new Date().toISOString()
    }
];

const SHOP_PRODUCTS = [
    {
        id: 1,
        name: "Illustration premium",
        price: 25000,
        description: "Œuvre visuelle originale pour décoration ou usage personnel.",
        category: "Illustration",
        icon: "✦",
        illustration: "assets/illustration.svg"
    },
    {
        id: 2,
        name: "Planche BD",
        price: 35000,
        description: "Page dessinée personnalisée avec composition narrative.",
        category: "Bande dessinée",
        icon: "▣",
        illustration: "assets/bd.svg"
    },
    {
        id: 3,
        name: "Character design",
        price: 45000,
        description: "Création de personnage unique selon votre univers artistique.",
        category: "Character Design",
        icon: "◉",
        illustration: "assets/character.svg"
    },
    {
        id: 4,
        name: "Pack couvertures",
        price: 60000,
        description: "Ensemble de couvertures visuelles pour projet éditorial.",
        category: "Livre",
        icon: "▤",
        illustration: "assets/cover.svg"
    }
];

function getSavedCreations() {
    try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function saveCreations(creations) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(creations));
}

function renderGalleryFromData(creations) {
    const gallery = document.querySelector(".gallery");

    if (!gallery) {
        return;
    }

    gallery.innerHTML = "";

    creations.forEach((creation) => {
        const carte = document.createElement("div");
        carte.className = "gallery-card";

        const imageWrap = document.createElement("div");
        imageWrap.className = "placeholder";

        if (creation.image) {
            const image = document.createElement("img");
            image.src = creation.image;
            image.alt = creation.title;
            image.className = "gallery-image";
            imageWrap.appendChild(image);
        } else if (creation.video) {
            const video = document.createElement("video");
            video.src = creation.video;
            video.controls = true;
            video.preload = "metadata";
            video.className = "gallery-video";
            imageWrap.appendChild(video);
        } else if (creation.pdf) {
            const pdfLabel = document.createElement("div");
            pdfLabel.className = "pdf-label";
            pdfLabel.innerHTML = "PDF";
            imageWrap.appendChild(pdfLabel);
        } else {
            imageWrap.textContent = creation.category ? creation.category.toUpperCase() : "CRÉATION";
        }

        const titreElement = document.createElement("h3");
        titreElement.textContent = creation.title;

        const categorieElement = document.createElement("p");
        categorieElement.className = "gallery-category";
        categorieElement.textContent = creation.category;

        const descriptionElement = document.createElement("p");
        descriptionElement.className = "gallery-description";
        descriptionElement.textContent = creation.description || "Création visuelle.";

        if (creation.pdf) {
            const lienPdf = document.createElement("a");
            lienPdf.href = creation.pdf;
            lienPdf.target = "_blank";
            lienPdf.rel = "noopener noreferrer";
            lienPdf.className = "pdf-link";
            lienPdf.textContent = "Ouvrir le PDF";
            descriptionElement.appendChild(document.createElement("br"));
            descriptionElement.appendChild(lienPdf);
        }

        carte.appendChild(imageWrap);
        carte.appendChild(titreElement);
        carte.appendChild(categorieElement);
        carte.appendChild(descriptionElement);

        gallery.appendChild(carte);
    });

    actualiserNombreCreations();
}

function initialiserGalerie() {
    const saved = getSavedCreations();

    if (saved.length > 0) {
        renderGalleryFromData(saved);
    } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CREATIONS));
        renderGalleryFromData(DEFAULT_CREATIONS);
    }

    appelerApi("/creations").then((creations) => {
        if (creations.length) {
            saveCreations(creations);
            renderGalleryFromData(creations);
        }
    }).catch(() => {
        // La galerie locale reste disponible sans serveur.
    });
}

function ouvrirFenetre() {
    const modal = document.getElementById("fenetreAjout");

    if (modal) {
        modal.style.display = "flex";
    }
}

function gererTypeMedia() {
    const typeMedia = document.getElementById("typeMedia").value;
    const imageBox = document.querySelector(".upload-area").closest("label");
    const pdfBox = document.querySelector(".pdf-upload-box");
    const videoBox = document.querySelector(".video-upload-box");

    imageBox.style.display = "none";
    pdfBox.style.display = "none";
    videoBox.style.display = "none";

    if (typeMedia === "pdf") {
        pdfBox.style.display = "block";
    } else if (typeMedia === "image") {
        imageBox.style.display = "flex";
    } else if (typeMedia === "imageEtPdf") {
        imageBox.style.display = "flex";
        pdfBox.style.display = "block";
    } else if (typeMedia === "video") {
        videoBox.style.display = "block";
    }
}

function fermerFenetre() {
    const modal = document.getElementById("fenetreAjout");

    if (modal) {
        modal.style.display = "none";
    }

    const inputImage = document.getElementById("imageInput");
    const inputPdf = document.getElementById("pdfInput");
    const inputVideo = document.getElementById("videoInput");
    const inputTitre = document.getElementById("titreCreation");
    const inputDescription = document.getElementById("descriptionCreation");
    const inputMedia = document.getElementById("typeMedia");
    const preview = document.getElementById("imagePreview");
    const uploadText = document.getElementById("uploadText");
    const pdfLabel = document.getElementById("pdfFileName");
    const videoLabel = document.getElementById("videoFileName");

    if (inputImage) inputImage.value = "";
    if (inputPdf) inputPdf.value = "";
    if (inputVideo) inputVideo.value = "";
    if (inputTitre) inputTitre.value = "";
    if (inputDescription) inputDescription.value = "";
    if (inputMedia) inputMedia.value = "image";
    if (preview) preview.style.display = "none";
    if (uploadText) uploadText.style.display = "block";
    if (pdfLabel) pdfLabel.textContent = "Aucun fichier PDF sélectionné";
    if (videoLabel) videoLabel.textContent = "Aucune vidéo sélectionnée";
    gererTypeMedia();
}

function previsualiserImage(event) {
    const fichier = event.target.files[0];
    const imagePreview = document.getElementById("imagePreview");
    const uploadText = document.getElementById("uploadText");

    if (!fichier) {
        return;
    }

    if (!fichier.type.startsWith("image/")) {
        alert("Sélectionne un fichier image valide.");
        event.target.value = "";
        return;
    }

    imagePreview.src = URL.createObjectURL(fichier);
    imagePreview.style.display = "block";
    uploadText.style.display = "none";
}

function afficherNomPdf(event) {
    const fichier = event.target.files[0];
    const pdfLabel = document.getElementById("pdfFileName");

    if (!fichier) {
        return;
    }

    if (fichier.type !== "application/pdf") {
        alert("Sélectionne un fichier PDF valide.");
        event.target.value = "";
        return;
    }

    if (pdfLabel) {
        pdfLabel.textContent = fichier.name;
    }
}

function afficherNomVideo(event) {
    const fichier = event.target.files[0];
    const videoLabel = document.getElementById("videoFileName");

    if (!fichier) {
        return;
    }

    if (!fichier.type.startsWith("video/")) {
        alert("Sélectionne un fichier vidéo valide.");
        event.target.value = "";
        return;
    }

    if (videoLabel) {
        videoLabel.textContent = fichier.name;
    }
}

function lireFichierEnBase64(file) {
    return new Promise((resolve, reject) => {
        const lecteur = new FileReader();

        lecteur.onload = () => resolve(lecteur.result);
        lecteur.onerror = () => reject(new Error("Impossible de lire le fichier."));
        lecteur.readAsDataURL(file);
    });
}

async function publierCreation() {
    const fichierImage = document.getElementById("imageInput").files[0];
    const fichierPdf = document.getElementById("pdfInput").files[0];
    const fichierVideo = document.getElementById("videoInput").files[0];
    const typeMedia = document.getElementById("typeMedia").value;
    const titre = document.getElementById("titreCreation").value.trim();
    const categorie = document.getElementById("categorieCreation").value || "Autre";
    const description = document.getElementById("descriptionCreation").value.trim();

    if (!titre) {
        alert("Donne un titre à ta création.");
        return;
    }

    const veutImage = typeMedia === "image" || typeMedia === "imageEtPdf";
    const veutPdf = typeMedia === "pdf" || typeMedia === "imageEtPdf";
    const veutVideo = typeMedia === "video";

    if (veutImage && !fichierImage) {
        alert("Tu dois choisir une image pour publier cette création.");
        return;
    }

    if (veutPdf && !fichierPdf) {
        alert("Tu dois choisir un fichier PDF pour publier cette création.");
        return;
    }

    if (veutVideo && !fichierVideo) {
        alert("Tu dois choisir une vidéo pour publier cette création.");
        return;
    }

    try {
        const nouvellesCreations = getSavedCreations();
        const creation = {
            title: titre,
            category: categorie,
            description: description || "Création visuelle.",
            image: "",
            pdf: "",
            video: ""
        };

        if (veutImage) {
            if (!fichierImage.type.startsWith("image/")) {
                alert("Le fichier image sélectionné est invalide.");
                return;
            }
            creation.image = await lireFichierEnBase64(fichierImage);
        }

        if (veutPdf) {
            if (fichierPdf.type !== "application/pdf") {
                alert("Le fichier PDF sélectionné est invalide.");
                return;
            }
            creation.pdf = await lireFichierEnBase64(fichierPdf);
        }

        if (veutVideo) {
            if (!fichierVideo.type.startsWith("video/")) {
                alert("Le fichier vidéo sélectionné est invalide.");
                return;
            }
            creation.video = await lireFichierEnBase64(fichierVideo);
        }

        let creationsFinales = [...nouvellesCreations, creation];

        try {
            const creationServeur = await appelerApi("/creations", {
                method: "POST",
                body: JSON.stringify(creation)
            });
            creationsFinales = [...nouvellesCreations, creationServeur];
        } catch (error) {
            creationsFinales = nouvellesCreations;
        }

        saveCreations(creationsFinales);
        renderGalleryFromData(creationsFinales);
        fermerFenetre();
        alert("✨ Ta création a été ajoutée au portfolio !");
    } catch (error) {
        alert("Une erreur est survenue lors du chargement du fichier.");
    }
}

function ouvrirMenu() {
    const nav = document.querySelector("nav");

    if (!nav || window.innerWidth > 800) {
        return;
    }

    const estVisible = nav.style.display === "flex";

    nav.style.display = estVisible ? "none" : "flex";
    nav.style.position = "absolute";
    nav.style.top = "80px";
    nav.style.right = "7%";
    nav.style.flexDirection = "column";
    nav.style.gap = "15px";
    nav.style.padding = "20px";
    nav.style.background = "rgba(11, 11, 11, 0.95)";
    nav.style.border = "1px solid #333";
}

function fermerMenuMobile() {
    const nav = document.querySelector("nav");

    if (!nav || window.innerWidth > 800) {
        return;
    }

    nav.style.display = "none";
}

function ouvrirConnexion() {
    const modal = document.getElementById("connexionAdmin");

    if (modal) {
        modal.style.display = "flex";
    }
}

function fermerConnexion() {
    const modal = document.getElementById("connexionAdmin");
    const motDePasse = document.getElementById("motDePasse");
    const erreur = document.getElementById("erreurConnexion");

    if (modal) modal.style.display = "none";
    if (motDePasse) motDePasse.value = "";
    if (erreur) erreur.textContent = "";
}

function afficherDashboard(estConnecte) {
    const dashboard = document.getElementById("adminDashboard");
    const boutonAdmin = document.querySelector(".admin-link");
    const triggerSecret = document.getElementById("secretAdminTrigger");
    const assistantWidget = document.getElementById("assistantWidget");
    const newsForm = document.getElementById("newsForm");

    if (dashboard) {
        dashboard.style.display = estConnecte ? "block" : "none";
    }

    if (boutonAdmin) {
        boutonAdmin.style.display = estConnecte ? "inline-flex" : "none";
        boutonAdmin.textContent = estConnecte ? "Tableau de bord" : "Administration";
    }

    if (triggerSecret) {
        triggerSecret.style.display = "inline-flex";
        triggerSecret.textContent = estConnecte ? "⌂17" : "✦17";
        triggerSecret.setAttribute("aria-label", estConnecte ? "Ouvrir le tableau de bord" : "Accès studio");
    }

    if (assistantWidget) {
        assistantWidget.style.display = "flex";
    }

    if (newsForm) {
        newsForm.classList.toggle("visible", estConnecte);
    }

    if (document.getElementById("discussionList")) {
        renderDiscussions();
    }

    if (estConnecte) {
        actualiserComptabilite();
        if (!accountingRefreshTimer) {
            accountingRefreshTimer = window.setInterval(actualiserComptabilite, 15000);
        }
    } else if (accountingRefreshTimer) {
        window.clearInterval(accountingRefreshTimer);
        accountingRefreshTimer = null;
    }
}

function reponseAssistant(message) {
    const messageNet = message.trim();

    if (!messageNet) {
        return "Merci de préciser votre demande pour recevoir une réponse utile.";
    }

    const reponse = ASSISTANT_REPLIES.find((item) => item.pattern.test(messageNet));

    if (reponse) {
        return reponse.answer;
    }

    return "Je peux vous aider pour les devis, les tarifs, les paiements, les illustrations, la BD et les demandes de contact. Dites-moi le type de projet dont vous avez besoin.";
}

function ajouterMessageAssistant(message, estUtilisateur) {
    const container = document.getElementById("assistantMessages");

    if (!container) {
        return;
    }

    const messageElement = document.createElement("div");
    messageElement.className = estUtilisateur ? "assistant-message assistant-user" : "assistant-message assistant-bot";
    messageElement.textContent = message;
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

function initialiserAssistant() {
    const widget = document.getElementById("assistantWidget");
    const toggle = document.getElementById("assistantToggle");
    const closeButton = document.getElementById("assistantClose");
    const form = document.getElementById("assistantForm");
    const input = document.getElementById("assistantInput");
    const quickActions = document.querySelectorAll(".assistant-chip");

    if (!widget || !toggle || !form) {
        return;
    }

    toggle.addEventListener("click", function () {
        widget.classList.toggle("open");
    });

    if (closeButton) {
        closeButton.addEventListener("click", function () {
            widget.classList.remove("open");
        });
    }

    quickActions.forEach((button) => {
        button.addEventListener("click", function () {
            const question = button.dataset.question || "";
            if (!question) {
                return;
            }

            ajouterMessageAssistant(question, true);
            ajouterMessageAssistant(reponseAssistant(question), false);
            widget.classList.add("open");
        });
    });

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const message = input.value.trim();

        if (!message) {
            return;
        }

        ajouterMessageAssistant(message, true);
        ajouterMessageAssistant(reponseAssistant(message), false);
        form.reset();
        widget.classList.add("open");
    });

    widget.style.display = "flex";
}

function verifierStatutAdmin() {
    const estConnecte = localStorage.getItem(ADMIN_KEY) === "true";
    afficherDashboard(estConnecte);
}

function connexionAdmin() {
    const motDePasse = document.getElementById("motDePasse");
    const erreur = document.getElementById("erreurConnexion");
    const modal = document.getElementById("connexionAdmin");

    if (!motDePasse) {
        return;
    }

    const motDePasseValide = ["17", "UNIQUE17", "unique17"];

    if (!motDePasseValide.includes(motDePasse.value.trim())) {
        if (erreur) {
            erreur.textContent = "Mot de passe incorrect.";
        }
        return;
    }

    localStorage.setItem(ADMIN_KEY, "true");

    if (modal) {
        modal.style.display = "none";
    }

    if (erreur) {
        erreur.textContent = "";
    }

    motDePasse.value = "";
    afficherDashboard(true);
}

function deconnexionAdmin() {
    localStorage.setItem(ADMIN_KEY, "false");
    afficherDashboard(false);
}

function actualiserNombreCreations() {
    const compteur = document.getElementById("nombreCreations");

    if (!compteur) {
        return;
    }

    compteur.textContent = document.querySelectorAll(".gallery-card").length;
}

function formaterMontant(montant) {
    return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(montant) || 0)} FCFA`;
}

function afficherActivitesComptables(activites) {
    const liste = document.getElementById("accountingActivityList");

    if (!liste) {
        return;
    }

    liste.innerHTML = "";
    if (!activites.length) {
        liste.innerHTML = '<p class="activity-empty">Aucune activité enregistrée pour le moment.</p>';
        return;
    }

    activites.forEach((activite) => {
        const item = document.createElement("div");
        item.className = "activity-item";
        const date = new Date(activite.date);
        const detail = document.createElement("span");
        detail.innerHTML = `<strong>${activite.type}</strong><small>${activite.detail}</small>`;
        const time = document.createElement("time");
        time.dateTime = activite.date;
        time.textContent = date.toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        item.appendChild(detail);
        if (activite.montant) {
            const amount = document.createElement("b");
            amount.textContent = formaterMontant(activite.montant);
            item.appendChild(amount);
        }
        item.appendChild(time);
        liste.appendChild(item);
    });
}

async function actualiserComptabilite() {
    if (localStorage.getItem(ADMIN_KEY) !== "true") {
        return;
    }

    const status = document.getElementById("accountingLastUpdate");

    try {
        const overview = await appelerApi("/admin/overview", optionsAdmin());
        const comptabilite = overview.comptabilite;
        const volumes = overview.volumes;
        document.getElementById("accountingTotal").textContent = formaterMontant(comptabilite.totalPrevisionnel);
        document.getElementById("accountingConfirmed").textContent = formaterMontant(comptabilite.chiffreAffairesConfirme);
        document.getElementById("accountingPending").textContent = comptabilite.commandesEnAttente;
        document.getElementById("accountingAverage").textContent = formaterMontant(comptabilite.panierMoyen);
        document.getElementById("volumeClients").textContent = volumes.clients;
        document.getElementById("volumeDiscussions").textContent = volumes.discussions;
        document.getElementById("volumeCreations").textContent = volumes.creations;
        document.getElementById("volumeNews").textContent = volumes.actualites;
        afficherActivitesComptables(overview.activites);
        if (status) {
            status.textContent = `En direct · ${new Date(overview.actualiseLe).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
            status.classList.add("is-connected");
        }
    } catch (error) {
        if (status) {
            status.textContent = "Données indisponibles";
            status.classList.remove("is-connected");
        }
    }
}

function initialiserFormulaireContact() {
    const form = document.getElementById("contactForm");

    if (!form) {
        return;
    }

    form.addEventListener("submit", function (event) {
        event.preventDefault();

        const nom = document.getElementById("nomContact").value.trim();
        const email = document.getElementById("emailContact").value.trim();
        const message = document.getElementById("messageContact").value.trim();
        const status = document.getElementById("statusContact");

        if (!nom || !email || !message) {
            status.textContent = "Remplis tous les champs pour envoyer ton message.";
            status.className = "status-message error";
            return;
        }

        const emailValide = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

        if (!emailValide) {
            status.textContent = "Adresse e-mail invalide.";
            status.className = "status-message error";
            return;
        }

        status.textContent = "Merci ! Ton message a bien été envoyé.";
        status.className = "status-message success";
        form.reset();
    });
}

function initialiserModales() {
    document.addEventListener("click", function (event) {
        const fenetreAjout = document.getElementById("fenetreAjout");
        const connexionAdmin = document.getElementById("connexionAdmin");
        const commandeModal = document.getElementById("commandeModal");

        if (event.target === fenetreAjout) {
            fermerFenetre();
        }

        if (event.target === connexionAdmin) {
            fermerConnexion();
        }

        if (event.target === commandeModal) {
            fermerCommande();
        }
    });
}

function formaterPrix(prix) {
    return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "XOF",
        maximumFractionDigits: 0
    }).format(prix);
}

function renderShopProducts() {
    const shopGrid = document.getElementById("shopGrid");

    if (!shopGrid) {
        return;
    }

    shopGrid.innerHTML = "";

    SHOP_PRODUCTS.forEach((produit) => {
        const card = document.createElement("article");
        card.className = "shop-card";

        const cover = document.createElement("div");
        cover.className = "shop-cover";

        const illustration = document.createElement("img");
        illustration.src = produit.illustration;
        illustration.alt = `${produit.category} - illustration`; 
        illustration.className = "shop-cover-image";

        const icon = document.createElement("span");
        icon.className = "shop-cover-icon";
        icon.textContent = produit.icon || "✦";

        const category = document.createElement("span");
        category.className = "shop-cover-label";
        category.textContent = produit.category.toUpperCase();

        cover.appendChild(illustration);
        cover.appendChild(icon);
        cover.appendChild(category);

        const name = document.createElement("h3");
        name.textContent = produit.name;

        const description = document.createElement("p");
        description.className = "shop-description";
        description.textContent = produit.description;

        const price = document.createElement("div");
        price.className = "shop-price";
        price.textContent = formaterPrix(produit.price);

        const button = document.createElement("button");
        button.type = "button";
        button.className = "shop-button";
        button.innerHTML = "<span>Commander</span><b aria-hidden=\"true\">→</b>";
        button.addEventListener("click", function () {
            ouvrirCommande(produit.name, produit.price);
        });

        card.appendChild(cover);
        card.appendChild(name);
        card.appendChild(description);
        card.appendChild(price);
        card.appendChild(button);

        shopGrid.appendChild(card);
    });
}

function ouvrirCommande(nomProduit, prixProduit) {
    const modal = document.getElementById("commandeModal");
    const nom = document.getElementById("commandeProduitNom");
    const prix = document.getElementById("commandePrix");

    if (!modal || !nom) {
        return;
    }

    nom.textContent = nomProduit;
    commandeSelectionnee = { produit: nomProduit, prix: prixProduit };

    if (prix) {
        prix.textContent = formaterPrix(prixProduit);
    }

    modal.style.display = "flex";
}

function fermerCommande() {
    const modal = document.getElementById("commandeModal");
    const form = document.getElementById("commandeForm");
    const status = document.getElementById("statusCommande");
    const celebration = document.getElementById("paymentCelebration");
    const submitButton = form ? form.querySelector("button[type=\"submit\"]") : null;

    if (modal) {
        modal.style.display = "none";
    }

    if (form) {
        form.reset();
    }

    if (submitButton) {
        submitButton.disabled = false;
        submitButton.className = "publish-button";
        submitButton.innerHTML = "<span>Valider la commande</span><b aria-hidden=\"true\">→</b>";
    }

    if (status) {
        status.textContent = "";
        status.className = "status-message";
    }

    if (celebration) {
        celebration.hidden = true;
    }
}

function initialiserCommande() {
    const form = document.getElementById("commandeForm");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const submitButton = form.querySelector("button[type=\"submit\"]");

        const nom = document.getElementById("commandeNom").value.trim();
        const email = document.getElementById("commandeEmail").value.trim();
        const telephone = document.getElementById("commandeTelephone").value.trim();
        const paiement = document.getElementById("commandePaiement").value;
        const status = document.getElementById("statusCommande");

        if (!nom || !email || !telephone || !paiement) {
            if (status) {
                status.textContent = "Remplis tous les champs pour valider la commande.";
                status.className = "status-message error";
            }
            return;
        }

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.classList.add("is-processing");
            submitButton.innerHTML = "<span>Préparation du paiement...</span><b aria-hidden=\"true\">✦</b>";
        }

        try {
            await appelerApi("/orders", {
                method: "POST",
                body: JSON.stringify({
                    ...commandeSelectionnee,
                    nom,
                    email,
                    telephone,
                    paiement
                })
            });

            if (status) {
                status.textContent = "Commande enregistrée ! Le studio vous contactera pour finaliser le paiement.";
                status.className = "status-message success";
            }

            const celebration = document.getElementById("paymentCelebration");
            if (celebration) {
                celebration.hidden = false;
            }

            if (submitButton) {
                submitButton.classList.remove("is-processing");
                submitButton.classList.add("is-success");
                submitButton.innerHTML = "<span>Demande envoyée !</span><b aria-hidden=\"true\">✓</b>";
            }

            setTimeout(() => fermerCommande(), 1500);
        } catch (error) {
            const commandesLocales = JSON.parse(localStorage.getItem("uniqueArtCommandes") || "[]");
            commandesLocales.push({
                ...commandeSelectionnee,
                nom,
                email,
                telephone,
                paiement,
                date: new Date().toISOString(),
                statut: "à confirmer"
            });
            localStorage.setItem("uniqueArtCommandes", JSON.stringify(commandesLocales));

            if (status) {
                status.textContent = "Demande enregistrée localement. Le serveur pourra la synchroniser dès son lancement.";
                status.className = "status-message success";
            }

            const celebration = document.getElementById("paymentCelebration");
            if (celebration) celebration.hidden = false;

            if (submitButton) {
                submitButton.disabled = false;
                submitButton.classList.remove("is-processing");
                submitButton.classList.add("is-success");
                submitButton.innerHTML = "<span>Demande enregistrée</span><b aria-hidden=\"true\">✓</b>";
            }
        }
    });
}

function getSavedDiscussions() {
    try {
        const saved = JSON.parse(localStorage.getItem(DISCUSSION_KEY) || "[]");
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function saveDiscussions(messages) {
    localStorage.setItem(DISCUSSION_KEY, JSON.stringify(messages));
}

function optionsAdmin() {
    return { headers: { "x-admin-key": "UNIQUE17" } };
}

function getBlockedNames() {
    try {
        const blocked = JSON.parse(localStorage.getItem(BLOCKED_NAMES_KEY) || "[]");
        return Array.isArray(blocked) ? blocked : [];
    } catch (error) {
        return [];
    }
}

async function traduireTexte(texte, langue) {
    if (langue === "fr") {
        return texte;
    }

    try {
        const response = await appelerApi("/translate", {
            method: "POST",
            body: JSON.stringify({ text: texte, language: langue })
        });
        return response.translation;
    } catch (error) {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(texte)}&langpair=fr|${encodeURIComponent(langue)}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Service de traduction indisponible");
        }

        const data = await response.json();
        const traduction = data?.responseData?.translatedText;

        if (!traduction) {
            throw new Error("Traduction vide");
        }

        return traduction;
    }
}

function ajouterControleTraduction(container, texteOriginal) {
    const controls = document.createElement("div");
    controls.className = "translation-message-tools";

    const translateButton = document.createElement("button");
    translateButton.type = "button";
    translateButton.className = "translate-button";
    translateButton.textContent = "Traduire";

    const result = document.createElement("p");
    result.className = "translation-result";
    result.setAttribute("aria-live", "polite");
    result.hidden = true;

    translateButton.addEventListener("click", async () => {
        const language = document.getElementById("discussionLanguage")?.value || "en";
        translateButton.disabled = true;
        translateButton.textContent = "Traduction...";

        try {
            result.textContent = await traduireTexte(texteOriginal, language);
            result.hidden = false;
            translateButton.textContent = "Actualiser la traduction";
        } catch (error) {
            result.textContent = "La traduction est momentanément indisponible. Réessayez dans un instant.";
            result.hidden = false;
            translateButton.textContent = "Réessayer";
        } finally {
            translateButton.disabled = false;
        }
    });

    controls.appendChild(translateButton);
    controls.appendChild(result);
    container.appendChild(controls);
}

function renderDiscussions() {
    const list = document.getElementById("discussionList");

    if (!list) {
        return;
    }

    const discussions = getSavedDiscussions();
    list.innerHTML = "";

    if (!discussions.length) {
        list.innerHTML = '<div class="discussion-empty">Aucune demande pour le moment. Soyez le premier à ouvrir une discussion.</div>';
        return;
    }

    discussions.slice().reverse().forEach((discussion) => {
        const item = document.createElement("div");
        item.className = "discussion-item";

        const head = document.createElement("div");
        head.className = "discussion-header";

        const identity = document.createElement("div");
        identity.className = "discussion-identity";
        identity.innerHTML = `<strong>${discussion.name}</strong><span>${discussion.type}</span>`;

        const date = document.createElement("span");
        date.className = "discussion-date";
        date.textContent = new Date(discussion.date).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });

        const content = document.createElement("p");
        content.className = "discussion-message";
        content.textContent = discussion.message;

        head.appendChild(identity);
        head.appendChild(date);

        item.appendChild(head);
        item.appendChild(content);
        ajouterControleTraduction(item, discussion.message);

        if (discussion.replies && discussion.replies.length) {
            const replies = document.createElement("div");
            replies.className = "discussion-replies";
            discussion.replies.forEach((reply) => {
                const replyItem = document.createElement("p");
                replyItem.className = "discussion-reply-item";
                replyItem.innerHTML = "<strong>Studio :</strong> ";
                replyItem.appendChild(document.createTextNode(reply.message));
                replies.appendChild(replyItem);
            });
            item.appendChild(replies);
        }

        if (localStorage.getItem(ADMIN_KEY) === "true") {
            const actions = document.createElement("div");
            actions.className = "discussion-actions";

            const replyForm = document.createElement("form");
            replyForm.className = "discussion-reply";
            replyForm.innerHTML = '<input type="text" placeholder="Répondre au client..." required><button type="submit">Répondre</button>';
            replyForm.addEventListener("submit", async (event) => {
                event.preventDefault();
                const input = replyForm.querySelector("input");
                try {
                    const reply = await appelerApi(`/discussions/${discussion.id}/reply`, {
                        method: "POST",
                        ...optionsAdmin(),
                        body: JSON.stringify({ message: input.value.trim() })
                    });
                    discussion.replies = discussion.replies || [];
                    discussion.replies.push(reply);
                    saveDiscussions(discussions);
                    renderDiscussions();
                } catch (error) {
                    discussion.replies = discussion.replies || [];
                    discussion.replies.push({
                        id: Date.now(),
                        message: input.value.trim(),
                        date: new Date().toISOString()
                    });
                    saveDiscussions(discussions);
                    renderDiscussions();
                }
            });

            const deleteButton = document.createElement("button");
            deleteButton.type = "button";
            deleteButton.textContent = "Supprimer";
            deleteButton.addEventListener("click", async () => {
                if (!confirm("Supprimer définitivement cette demande ?")) return;
                await modererDiscussion(discussion.id, "delete");
            });

            const blockButton = document.createElement("button");
            blockButton.type = "button";
            blockButton.textContent = "Bloquer ce profil";
            blockButton.addEventListener("click", async () => {
                if (!confirm(`Bloquer les messages de ${discussion.name} ?`)) return;
                await modererDiscussion(discussion.id, "block");
            });

            actions.appendChild(deleteButton);
            actions.appendChild(blockButton);
            item.appendChild(replyForm);
            item.appendChild(actions);
        }

        list.appendChild(item);
    });
}

async function modererDiscussion(id, action) {
    try {
        const endpoint = action === "delete" ? `/discussions/${id}` : `/discussions/${id}/block`;
        await appelerApi(endpoint, { method: action === "delete" ? "DELETE" : "POST", ...optionsAdmin() });
        const discussions = getSavedDiscussions().filter((discussion) => discussion.id !== id);
        saveDiscussions(discussions);
        renderDiscussions();
    } catch (error) {
        const discussions = getSavedDiscussions();
        const discussion = discussions.find((item) => item.id === id);

        if (action === "block" && discussion) {
            const blocked = getBlockedNames();
            if (!blocked.includes(discussion.name)) {
                blocked.push(discussion.name);
                localStorage.setItem(BLOCKED_NAMES_KEY, JSON.stringify(blocked));
            }
            saveDiscussions(discussions.filter((item) => item.name !== discussion.name));
        } else {
            saveDiscussions(discussions.filter((item) => item.id !== id));
        }
        renderDiscussions();
    }
}

function initialiserDiscussion() {
    const form = document.getElementById("discussionForm");

    if (!form) {
        return;
    }

    const saved = getSavedDiscussions();
    if (!saved.length) {
        saveDiscussions(DEFAULT_DISCUSSIONS);
    }

    renderDiscussions();

    appelerApi("/discussions").then((discussions) => {
        saveDiscussions(discussions);
        renderDiscussions();
    }).catch(() => {
        // Le mode local reste disponible lorsque la page est ouverte directement.
    });

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const nom = document.getElementById("discussionNom").value.trim();
        const type = document.getElementById("discussionType").value;
        const message = document.getElementById("discussionMessage").value.trim();
        const status = document.getElementById("discussionStatus");

        if (getBlockedNames().some((blockedName) => blockedName.toLowerCase() === nom.toLowerCase())) {
            status.textContent = "Ce profil ne peut plus publier dans cet espace.";
            status.className = "status-message error";
            return;
        }

        if (!nom || !type || !message) {
            if (status) {
                status.textContent = "Remplis tous les champs pour publier votre demande.";
                status.className = "status-message error";
            }
            return;
        }

        try {
            const discussion = await appelerApi("/discussions", {
                method: "POST",
                body: JSON.stringify({ name: nom, type, message })
            });
            const discussions = getSavedDiscussions();
            discussions.push(discussion);
            saveDiscussions(discussions);
            renderDiscussions();
            form.reset();

            if (status) {
                status.textContent = "Votre demande a bien été envoyée au studio.";
                status.className = "status-message success";
            }
        } catch (error) {
            const discussions = getSavedDiscussions();
            discussions.push({
                id: Date.now(),
                name: nom,
                type,
                message,
                date: new Date().toISOString(),
                replies: []
            });
            saveDiscussions(discussions);
            renderDiscussions();
            form.reset();

            if (status) {
                status.textContent = "Votre demande a été publiée localement.";
                status.className = "status-message success";
            }
        }
    });
}

function getSavedNews() {
    try {
        const saved = JSON.parse(localStorage.getItem(NEWS_KEY) || "[]");
        return Array.isArray(saved) ? saved : [];
    } catch (error) {
        return [];
    }
}

function saveNews(actualites) {
    localStorage.setItem(NEWS_KEY, JSON.stringify(actualites));
}

function renderNews(actualites) {
    const feed = document.getElementById("newsFeed");

    if (!feed) {
        return;
    }

    feed.innerHTML = "";

    if (!actualites.length) {
        feed.innerHTML = '<div class="news-empty">Les prochaines actualités du studio apparaîtront ici.</div>';
        return;
    }

    actualites.slice().reverse().forEach((actualite) => {
        const card = document.createElement("article");
        card.className = "news-card";

        const header = document.createElement("div");
        header.className = "news-card-header";

        const title = document.createElement("h3");
        title.textContent = actualite.title;

        const date = document.createElement("span");
        date.className = "news-date";
        date.textContent = new Date(actualite.date).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });

        const type = document.createElement("p");
        type.className = "news-type";
        type.textContent = actualite.type;

        const content = document.createElement("p");
        content.className = "news-content";
        content.textContent = actualite.content;

        header.appendChild(title);
        header.appendChild(date);
        card.appendChild(header);
        card.appendChild(type);
        card.appendChild(content);
        feed.appendChild(card);
    });
}

function initialiserActualites() {
    const formulaire = document.getElementById("newsForm");
    const actualitesLocales = getSavedNews();

    if (actualitesLocales.length) {
        renderNews(actualitesLocales);
    } else {
        saveNews(DEFAULT_NEWS);
        renderNews(DEFAULT_NEWS);
    }

    appelerApi("/actualites").then((actualites) => {
        saveNews(actualites);
        renderNews(actualites);
    }).catch(() => {
        // Le fil local reste visible si le serveur n'est pas lancé.
    });

    if (!formulaire) {
        return;
    }

    formulaire.addEventListener("submit", async function (event) {
        event.preventDefault();

        const titre = document.getElementById("newsTitle").value.trim();
        const type = document.getElementById("newsType").value;
        const contenu = document.getElementById("newsContent").value.trim();
        const statut = document.getElementById("newsStatus");

        try {
            const actualite = await appelerApi("/actualites", {
                method: "POST",
                body: JSON.stringify({ title: titre, type, content: contenu })
            });
            const actualites = getSavedNews();
            actualites.push(actualite);
            saveNews(actualites);
            renderNews(actualites);
            formulaire.reset();
            statut.textContent = "Actualité publiée dans le fil.";
            statut.className = "status-message success";
        } catch (error) {
            const actualites = getSavedNews();
            actualites.push({
                id: Date.now(),
                title: titre,
                type,
                content: contenu,
                date: new Date().toISOString()
            });
            saveNews(actualites);
            renderNews(actualites);
            formulaire.reset();
            statut.textContent = "Actualité publiée localement.";
            statut.className = "status-message success";
        }
    });
}

function initialiserCompteClient() {
    const form = document.getElementById("accountForm");

    if (!form) {
        return;
    }

    afficherSessionClient();

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const nom = document.getElementById("accountNom").value.trim();
        const email = document.getElementById("accountEmail").value.trim();
        const motDePasse = document.getElementById("accountPassword").value.trim();
        const telephone = document.getElementById("accountTelephone").value.trim();
        const status = document.getElementById("accountStatus");

        if (!nom || !email || !motDePasse || !telephone) {
            if (status) {
                status.textContent = "Tous les champs sont requis pour créer votre compte.";
                status.className = "status-message error";
            }
            return;
        }

        try {
            const resultat = await appelerApi("/clients", {
                method: "POST",
                body: JSON.stringify({ nom, email, motDePasse, telephone })
            });
            form.reset();

            if (status) {
                status.textContent = resultat.emailEnvoye
                    ? "Compte créé. Un e-mail de confirmation vient d’être envoyé."
                    : "Compte créé. L’e-mail n’a pas encore pu être envoyé par le serveur.";
                status.className = "status-message success";
            }
        } catch (error) {
            const clients = JSON.parse(localStorage.getItem("uniqueArtClients") || "[]");
            const emailNormalise = email.toLowerCase();

            if (clients.some((client) => client.email === emailNormalise)) {
                status.textContent = "Cette adresse e-mail est déjà utilisée.";
                status.className = "status-message error";
                return;
            }

            clients.push({ nom, email: emailNormalise, telephone, creeLe: new Date().toISOString() });
            localStorage.setItem("uniqueArtClients", JSON.stringify(clients));
            form.reset();
            status.textContent = "Compte créé localement. Il sera partagé après connexion au serveur.";
            status.className = "status-message success";
        }
    });
}

function afficherSessionClient() {
    const client = JSON.parse(localStorage.getItem("uniqueArtClient") || "null");
    const panel = document.getElementById("clientSessionPanel");
    const name = document.getElementById("clientSessionName");
    const email = document.getElementById("clientSessionEmail");

    if (!panel) {
        return;
    }

    panel.hidden = !client;
    if (client) {
        name.textContent = client.nom;
        email.textContent = client.email;
    }
}

function deconnecterClient() {
    localStorage.removeItem("uniqueArtClient");
    afficherSessionClient();
    const status = document.getElementById("accountStatus");
    if (status) {
        status.textContent = "Vous êtes déconnecté.";
        status.className = "status-message success";
    }
}

function ouvrirConnexionClient() {
    const modal = document.getElementById("connexionClient");
    if (modal) {
        modal.style.display = "flex";
    }
    document.getElementById("clientLoginEmail")?.focus();
}

function fermerConnexionClient() {
    const modal = document.getElementById("connexionClient");
    const status = document.getElementById("clientLoginStatus");
    if (modal) {
        modal.style.display = "none";
    }
    if (status) {
        status.textContent = "";
        status.className = "status-message";
    }
}

function initialiserConnexionClient() {
    const form = document.getElementById("clientLoginForm");

    if (!form) {
        return;
    }

    form.addEventListener("submit", async function (event) {
        event.preventDefault();

        const email = document.getElementById("clientLoginEmail").value.trim();
        const motDePasse = document.getElementById("clientLoginPassword").value;
        const status = document.getElementById("clientLoginStatus");

        try {
            const client = await appelerApi("/login", {
                method: "POST",
                body: JSON.stringify({ email, motDePasse })
            });

            localStorage.setItem("uniqueArtClient", JSON.stringify(client));
            afficherSessionClient();
            status.textContent = `Connexion réussie. Bienvenue ${client.nom}.`;
            status.className = "status-message success";
            form.reset();
        } catch (error) {
            status.textContent = error.message === "MODE_LOCAL"
                ? "Lancez le serveur avec npm start pour vous connecter."
                : error.message;
            status.className = "status-message error";
        }
    });
}

function initialiserAccesAdminCache() {
    const trigger = document.getElementById("secretAdminTrigger");

    if (!trigger) {
        return;
    }

    trigger.addEventListener("click", function () {
        if (localStorage.getItem(ADMIN_KEY) === "true") {
            document.getElementById("adminDashboard")?.scrollIntoView({ behavior: "smooth" });
        } else {
            ouvrirConnexion();
        }
    });

    document.addEventListener("keydown", function (event) {
        if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "a") {
            ouvrirConnexion();
        }
    });
}

function construireContenuSection(section) {
    const sections = {
        accueil: {
            titre: "Accueil",
            texte: "Nous concevons des visuels puissants, cohérents et mémorables pour les marques, projets et œuvres artistiques.",
            liste: ["Création visuelle", "Direction artistique", "Illustration & storytelling"]
        },
        boutique: {
            titre: "Boutique",
            texte: "Découvrez les œuvres et créations à commander, avec des tarifs clairs et des offres adaptées à votre projet.",
            liste: ["Produits culturels", "Commandes simples", "Paiements sécurisés"]
        },
        tarifs: {
            titre: "Tarifs",
            texte: "Une grille de prix claire pour l’illustration, la BD, la scénarisation, la communication visuelle et les prestations spécifiques.",
            liste: ["Illustration", "Bande dessinée", "Scénarisation", "Direction artistique"]
        },
        actualites: {
            titre: "Fil d’actualité",
            texte: "Suivez les projets, les coulisses et les annonces publiés par Unique Art Visuel Studio.",
            liste: ["Nouveaux projets", "Coulisses de création", "Annonces du studio"]
        },
        compte: {
            titre: "Compte client",
            texte: "Créez votre compte pour suivre vos demandes, discuter avec le studio et accéder aux modalités de service.",
            liste: ["Compte client", "Suivi des demandes", "Discussions et devis"]
        },
        creations: {
            titre: "Créations",
            texte: "Une sélection de projets qui explore l’illustration, le caractère, le webtoon et le visuel de marque.",
            liste: ["Illustration originale", "Personnages et univers", "Mise en scène visuelle"]
        },
        oeuvres: {
            titre: "Œuvres",
            texte: "Des univers artistiques qui mêlent narration, pensée et expression visuelle pour raconter des histoires fortes.",
            liste: ["Le Singularisme", "Le Pouvoir des Mots", "Séries et projets éditoriaux"]
        },
        apropos: {
            titre: "À propos",
            texte: "UNIQUE ART VISUEL STUDIO aide les projets à trouver leur identité visuelle et leur voix artistique.",
            liste: ["Studio créatif", "Équipe artistique", "Mission : transformer des idées en univers"]
        },
        contact: {
            titre: "Contact",
            texte: "Parlons de votre projet : illustration, BD, couverture, direction artistique ou création visuelle.",
            liste: ["Email : dieudonnejeannde@gmail.com", "Téléphone : +225 07 59 87 55 31", "Disponibilité selon projet"]
        }
    };

    const donnees = sections[section] || sections.accueil;

    return `
        <h2>${donnees.titre}</h2>
        <p>${donnees.texte}</p>
        <ul>
            ${donnees.liste.map((item) => `<li>${item}</li>`).join("")}
        </ul>
        <a href="#${section}" class="overlay-cta">Voir plus</a>
    `;
}

function ouvrirSectionOverlay(section) {
    const overlay = document.getElementById("sectionOverlay");
    const content = document.getElementById("overlayContent");

    if (!overlay || !content) {
        return;
    }

    content.innerHTML = construireContenuSection(section);
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
}

function fermerSectionOverlay() {
    const overlay = document.getElementById("sectionOverlay");

    if (!overlay) {
        return;
    }

    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
}

function initialiserGuidesVisite() {
    const messages = {
        accueil: "Bienvenue dans l’univers Unique Art !",
        boutique: "Ici, vous pouvez commander nos créations.",
        tarifs: "Découvrez les tarifs des prestations du studio.",
        compte: "Créez votre espace client et gardez le contact.",
        actualites: "Suivez les nouveautés et les coulisses du studio.",
        creations: "Explorez notre galerie de créations visuelles.",
        oeuvres: "Entrez dans nos univers et nos histoires.",
        apropos: "Découvrez l’identité et la mission du studio.",
        contact: "Parlons ensemble de votre prochain projet."
    };

    document.querySelectorAll("section:not(#adminDashboard)").forEach((section) => {
        const sectionId = section.id || "";
        const message = messages[sectionId] || "Découvrez cette partie du studio.";

        const guide = document.createElement("div");
        guide.className = "visit-guide";
        guide.setAttribute("role", "note");
        guide.innerHTML = `
            <div class="visit-bubble">${message}</div>
            <div class="visit-person" aria-hidden="true">
                <span class="visit-head"></span>
                <span class="visit-body"></span>
                <span class="visit-arm visit-arm-left"></span>
                <span class="visit-arm visit-arm-right"></span>
                <span class="visit-hand visit-hand-left">✦</span>
                <span class="visit-hand visit-hand-right">✦</span>
                <span class="visit-foot visit-foot-left"></span>
                <span class="visit-foot visit-foot-right"></span>
            </div>
        `;

        section.appendChild(guide);
    });
}

document.addEventListener("DOMContentLoaded", function () {
    initialiserGalerie();
    renderShopProducts();
    verifierStatutAdmin();
    initialiserAssistant();
    initialiserFormulaireContact();
    initialiserCommande();
    initialiserCompteClient();
    initialiserConnexionClient();
    initialiserDiscussion();
    initialiserActualites();
    initialiserModales();
    initialiserAccesAdminCache();
    initialiserGuidesVisite();
    gererTypeMedia();

    const nav = document.querySelector("nav");
    if (nav && window.innerWidth <= 800) {
        nav.style.display = "none";
    }

    document.querySelectorAll("nav a").forEach(function (lien) {
        lien.addEventListener("click", function (event) {
            event.preventDefault();
            const section = lien.dataset.section || "accueil";
            ouvrirSectionOverlay(section);
            fermerMenuMobile();
        });
    });

    document.getElementById("closeOverlay")?.addEventListener("click", fermerSectionOverlay);

    document.addEventListener("dblclick", function (event) {
        const overlay = document.getElementById("sectionOverlay");
        const elementInteractif = event.target.closest("button, a, input, textarea, select, form");

        if (overlay?.classList.contains("open") && !elementInteractif) {
            fermerSectionOverlay();
        }
    });
});