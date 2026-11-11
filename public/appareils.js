(() => {
    "use strict";

    const STORAGE_KEY = "retrouve-appareils-v1";
    const MAX_DEVICES = 100;
    const MAX_BACKUP_SIZE = 1024 * 1024;
    const LOCATION_UPDATE_INTERVAL_MS = 30_000;
    const LOCATION_REFRESH_INTERVAL_MS = 15_000;
    const platforms = {
        apple: { label: "Apple", url: "https://www.icloud.com/find" },
        android: { label: "Google / Android", url: "https://www.google.com/android/find/" },
        samsung: { label: "Samsung", url: "https://smartthingsfind.samsung.com/" },
        windows: { label: "Microsoft", url: "https://account.microsoft.com/devices" },
        other: { label: "service du fabricant", url: "" }
    };
    const typeIcons = {
        "Téléphone": "▯",
        "Ordinateur": "▱",
        "Tablette": "▯",
        "Montre connectée": "◷",
        "Autre": "◇"
    };
    const form = document.querySelector("#deviceForm");
    const deviceList = document.querySelector("#deviceList");
    const statusMessage = document.querySelector("#statusMessage");
    const accountStatus = document.querySelector("#accountStatus");
    const importFile = document.querySelector("#importFile");
    const accountSignedOut = document.querySelector("#accountSignedOut");
    const accountSignedIn = document.querySelector("#accountSignedIn");
    const mergeLocalButton = document.querySelector("#mergeLocalButton");
    const locationSharePanel = document.querySelector("#locationSharePanel");
    const locationShareDevice = document.querySelector("#locationShareDevice");
    const locationShareList = document.querySelector("#locationShareList");
    const shareGuestPanel = document.querySelector("#shareGuestPanel");
    let devices = [];
    let localDevices = [];
    let locationShares = [];
    let clientSession = null;
    let storageMode = "loading";
    let activeLocationShare = null;
    let passwordResetToken = new URLSearchParams(window.location.search).get("reset_token") || "";
    let invitationToken = new URLSearchParams(window.location.hash.slice(1)).get("share") || "";
    if (passwordResetToken) {
        window.history.replaceState(null, "", window.location.pathname);
        invitationToken = "";
    }

    function showMessage(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.classList.toggle("error", isError);
        statusMessage.hidden = false;
    }

    function showAccountStatus(message, isError = false) {
        accountStatus.textContent = message;
        accountStatus.classList.toggle("error", isError);
        accountStatus.hidden = !message;
    }

    async function callApi(endpoint, options = {}) {
        const response = await fetch(`/api${endpoint}`, {
            cache: "no-store",
            credentials: "same-origin",
            ...options,
            headers: {
                "Content-Type": "application/json",
                ...options.headers
            }
        });
        const text = await response.text();
        let payload = null;
        try {
            payload = text ? JSON.parse(text) : null;
        } catch {
            payload = null;
        }
        if (!response.ok) {
            const error = new Error(payload?.error || "Le service est momentanément indisponible.");
            error.status = response.status;
            throw error;
        }
        return payload;
    }

    function isValidDevice(item) {
        return item !== null
            && typeof item === "object"
            && typeof item.id === "string"
            && item.id.length <= 80
            && typeof item.name === "string"
            && item.name.trim().length > 0
            && item.name.length <= 60
            && typeof item.type === "string"
            && Object.hasOwn(typeIcons, item.type)
            && typeof item.platform === "string"
            && Object.hasOwn(platforms, item.platform)
            && typeof item.serial === "string"
            && item.serial.length <= 100
            && typeof item.contact === "string"
            && item.contact.length <= 160
            && ["ready", "lost"].includes(item.status)
            && (item.location === null || (
                typeof item.location === "object"
                && Number.isFinite(item.location.latitude)
                && Math.abs(item.location.latitude) <= 90
                && Number.isFinite(item.location.longitude)
                && Math.abs(item.location.longitude) <= 180
                && typeof item.location.recordedAt === "string"
                && Number.isFinite(Date.parse(item.location.recordedAt))
            ));
    }

    function readLocalDevices() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === null) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length > MAX_DEVICES || !parsed.every(isValidDevice)) {
            throw new Error("L’inventaire enregistré dans ce navigateur est invalide. Ne le modifiez pas avant d’avoir récupéré une sauvegarde.");
        }
        return parsed;
    }

    async function saveDevices() {
        if (storageMode === "connected" && clientSession) {
            const result = await callApi("/client/devices", {
                method: "PUT",
                body: JSON.stringify({ appareils: devices })
            });
            if (!Array.isArray(result?.appareils) || !result.appareils.every(isValidDevice)) {
                throw new Error("Le serveur a renvoyé un inventaire invalide. Exportez vos données et réessayez plus tard.");
            }
            devices = result.appareils;
            return;
        }
        if (storageMode !== "local") {
            throw new Error("Le stockage n’est pas disponible. Réessayez avant de modifier l’inventaire.");
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(devices));
        localDevices = devices;
    }

    function updateAccountPanel() {
        const isConnected = Boolean(clientSession && storageMode === "connected");
        accountSignedOut.hidden = isConnected || Boolean(passwordResetToken);
        accountSignedIn.hidden = !isConnected;
        document.querySelector("#passwordResetContainer").hidden = !passwordResetToken || isConnected;
        if (isConnected) {
            document.querySelector("#accountIdentity").textContent = `${clientSession.nom || "Client"} · ${clientSession.email}`;
        }
        const cloudIds = new Set(devices.map(device => device.id));
        const hasLocalDevicesToMerge = localDevices.some(device => !cloudIds.has(device.id));
        mergeLocalButton.hidden = !isConnected || !hasLocalDevicesToMerge;
        document.querySelector("#accountRetryButton").hidden = storageMode !== "error";
        locationSharePanel.hidden = !isConnected || Boolean(invitationToken);
        const canEdit = !passwordResetToken && (storageMode === "local" || storageMode === "connected");
        form.querySelector("button[type='submit']").disabled = !canEdit;
        document.querySelector("#importButton").disabled = !canEdit;
        deviceList.querySelectorAll(".device-actions button").forEach(button => {
            button.disabled = !canEdit;
        });
        deviceList.querySelectorAll(".location-share").forEach(button => {
            const isCurrentShare = activeLocationShare?.deviceId === button.dataset.deviceId;
            button.disabled = !isConnected || (Boolean(activeLocationShare) && !isCurrentShare);
        });
        const selectedDeviceId = locationShareDevice.value;
        locationShareDevice.replaceChildren();
        for (const device of devices) {
            const option = document.createElement("option");
            option.value = device.id;
            option.textContent = device.name;
            locationShareDevice.append(option);
        }
        if (devices.some(device => device.id === selectedDeviceId)) locationShareDevice.value = selectedDeviceId;
        document.querySelector("#locationShareCreateButton").disabled = !isConnected || !devices.length;
    }

    function createTextElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        element.textContent = text;
        return element;
    }

    function createButton(label, className, onClick) {
        const button = createTextElement("button", `button ${className}`, label);
        button.type = "button";
        button.addEventListener("click", onClick);
        return button;
    }

    function createDeviceCard(device) {
        const card = document.createElement("article");
        card.className = `device-card${device.status === "lost" ? " is-lost" : ""}`;
        const top = document.createElement("div");
        top.className = "device-top";
        const title = document.createElement("div");
        title.className = "device-title";
        title.append(createTextElement("span", "device-emoji", typeIcons[device.type] || "◇"));
        const titleCopy = document.createElement("div");
        titleCopy.append(
            createTextElement("h3", "", device.name),
            createTextElement("p", "", `${device.type} · ${platforms[device.platform].label}`)
        );
        title.append(titleCopy);
        top.append(title);
        if (device.status === "lost") top.append(createTextElement("span", "lost-badge", "Signalé perdu"));
        card.append(top);

        const details = document.createElement("dl");
        details.className = "device-details";
        const entries = [
            ["Numéro de série", device.serial || "Non renseigné"],
            ["Compte propriétaire (indice)", device.contact || "Non renseigné"]
        ];
        for (const [label, value] of entries) {
            const item = document.createElement("div");
            item.append(createTextElement("dt", "", label), createTextElement("dd", "", value));
            details.append(item);
        }
        card.append(details);

        if (device.location) {
            const locationTime = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" })
                .format(new Date(device.location.recordedAt));
            const mapLink = document.createElement("a");
            mapLink.className = "location-note";
            mapLink.href = `https://www.openstreetmap.org/?mlat=${device.location.latitude}&mlon=${device.location.longitude}#map=16/${device.location.latitude}/${device.location.longitude}`;
            mapLink.target = "_blank";
            mapLink.rel = "noopener noreferrer";
            mapLink.title = "OpenStreetMap recevra ces coordonnées uniquement si vous ouvrez ce lien.";
            mapLink.textContent = `Dernière position partagée le ${locationTime} · Voir sur OpenStreetMap ↗`;
            card.append(mapLink);
        }

        const actions = document.createElement("div");
        actions.className = "device-actions";
        const isSharing = activeLocationShare?.deviceId === device.id;
        const shareButton = createButton(
            isSharing ? "Arrêter le partage" : "Partager la position de cet appareil",
            isSharing ? "button-danger location-share" : "button-primary location-share",
            () => isSharing ? stopLocationSharing() : startLocationSharing(device.id)
        );
        shareButton.dataset.deviceId = device.id;
        shareButton.title = isSharing
            ? "Arrêter immédiatement le partage de position"
            : "Partager la position de l’appareil qui consulte cette page";
        actions.append(shareButton);
        const findLink = document.createElement("a");
        findLink.className = "button button-locate";
        findLink.href = platforms[device.platform].url || "https://support.google.com/";
        findLink.target = "_blank";
        findLink.rel = "noopener noreferrer";
        findLink.textContent = platforms[device.platform].url ? `Ouvrir ${platforms[device.platform].label} ↗` : "Consulter l’aide du fabricant ↗";
        actions.append(findLink);
        card.append(createTextElement(
            "p",
            "service-hint",
            "Le service affichera les appareils du compte propriétaire connecté. Sélectionnez-y celui-ci ; si ce n’est pas le bon compte, changez de compte dans le service."
        ));
        actions.append(createButton(
            device.location ? "Actualiser cette position" : "Enregistrer cette position",
            "button-subtle",
            () => recordLocation(device.id)
        ));
        if (device.location) {
            actions.append(createButton("Effacer la position", "button-subtle", () => clearLocation(device.id)));
        }
        actions.append(createButton(
            device.status === "lost" ? "Annuler le signalement" : "Marquer comme perdu",
            device.status === "lost" ? "button-subtle" : "button-danger",
            () => toggleLostStatus(device.id)
        ));
        actions.append(createButton("Supprimer", "button-subtle", () => deleteDevice(device.id)));
        card.append(actions);

        if (device.status === "lost") {
            const tips = document.createElement("div");
            tips.className = "lost-tips";
            tips.append(createTextElement("strong", "", "À faire maintenant"));
            const list = document.createElement("ul");
            for (const tip of [
                "Utilisez le service officiel pour localiser ou verrouiller l’appareil.",
                "Appelez votre opérateur pour suspendre la carte SIM.",
                "Changez vos mots de passe et signalez le vol aux autorités."
            ]) list.append(createTextElement("li", "", tip));
            tips.append(list);
            card.append(tips);
        }
        return card;
    }

    function render() {
        deviceList.replaceChildren();
        if (!devices.length) {
            const empty = document.createElement("div");
            empty.className = "empty-state";
            empty.append(
                createTextElement("span", "empty-icon", "⌁"),
                createTextElement("h3", "", "Votre inventaire commence ici"),
                createTextElement("p", "", "Ajoutez un téléphone ou un ordinateur pour garder ses références et ses options de recherche au même endroit.")
            );
            deviceList.append(empty);
        } else {
            for (const device of devices) deviceList.append(createDeviceCard(device));
        }
        updateAccountPanel();
        renderLocationShares();
    }

    function showLocationShareStatus(message, isError = false) {
        const status = document.querySelector("#locationShareStatus");
        status.textContent = message;
        status.classList.toggle("error", isError);
        status.hidden = !message;
    }

    function showGuestShareStatus(message, isError = false) {
        const status = document.querySelector("#shareGuestStatus");
        status.textContent = message;
        status.classList.toggle("error", isError);
        status.hidden = !message;
    }

    function renderLocationShares() {
        locationShareList.replaceChildren();
        document.querySelector("#locationShareEmpty").hidden = locationShares.length > 0;
        for (const share of locationShares) {
            const item = document.createElement("li");
            item.className = "location-share-item";
            const details = document.createElement("div");
            const statusLabels = {
                pending: "Invitation en attente",
                active: "Partage en cours",
                paused: "Aucune mise à jour récente",
                stopped: "Partage arrêté par le testeur",
                expired: "Invitation expirée",
                revoked: "Invitation révoquée"
            };
            const lastSeen = share.lastLocation
                ? `Dernière position : ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(share.lastLocation.recordedAt))}`
                : "Aucune position reçue.";
            details.append(
                createTextElement("strong", "", share.deviceName),
                createTextElement("span", "location-share-state", statusLabels[share.status] || "État inconnu"),
                createTextElement("small", "", lastSeen)
            );
            item.append(details);
            if (["pending", "active", "paused"].includes(share.status)) {
                item.append(createButton("Révoquer", "button-danger", () => revokeLocationShare(share.id)));
            }
            locationShareList.append(item);
        }
    }

    async function refreshLocationShares() {
        if (storageMode !== "connected") return;
        const result = await callApi("/client/location-shares");
        const validStatuses = ["pending", "active", "paused", "stopped", "expired", "revoked"];
        if (!Array.isArray(result?.partages) || !result.partages.every(share =>
            share && typeof share.id === "string"
            && typeof share.deviceId === "string"
            && typeof share.deviceName === "string"
            && validStatuses.includes(share.status)
            && (share.lastLocation === null || (
                Number.isFinite(share.lastLocation?.latitude)
                && Math.abs(share.lastLocation.latitude) <= 90
                && Number.isFinite(share.lastLocation?.longitude)
                && Math.abs(share.lastLocation.longitude) <= 180
                && Number.isFinite(Date.parse(share.lastLocation.recordedAt))
            ))
        )) {
            throw new Error("Le serveur a renvoyé une liste d’invitations invalide.");
        }
        locationShares = result.partages;
        renderLocationShares();
    }

    async function revokeLocationShare(id) {
        if (!window.confirm("Révoquer cette invitation ou arrêter le partage associé ? Le testeur ne pourra plus envoyer de position.")) return;
        try {
            await callApi(`/client/location-shares/${encodeURIComponent(id)}`, { method: "DELETE" });
            await refreshLocationShares();
            showLocationShareStatus("Invitation révoquée. Le partage ne peut plus envoyer de position.");
        } catch (error) {
            showLocationShareStatus(`Impossible de révoquer ce partage : ${error.message}`, true);
        }
    }

    async function updateDevice(id, update) {
        const index = devices.findIndex(device => device.id === id);
        if (index < 0) {
            showMessage("Appareil introuvable dans votre inventaire.", true);
            return;
        }
        const previous = devices[index];
        devices[index] = update(previous);
        try {
            await saveDevices();
            render();
            showMessage("Inventaire mis à jour.");
        } catch (error) {
            devices[index] = previous;
            render();
            showMessage(`Impossible d’enregistrer la modification : ${error.message}`, true);
        }
    }

    async function clearLocation(id) {
        if (activeLocationShare?.deviceId === id) stopLocationSharing(false);
        if (storageMode !== "connected" || !clientSession) {
            await updateDevice(id, device => ({ ...device, location: null }));
            return;
        }
        try {
            await callApi(`/client/devices/${encodeURIComponent(id)}/location`, { method: "DELETE" });
            const index = devices.findIndex(device => device.id === id);
            if (index >= 0) devices[index] = { ...devices[index], location: null };
            render();
            showMessage("Position effacée de votre compte Retrouve.");
        } catch (error) {
            showMessage(`Impossible d’effacer la position : ${error.message}`, true);
        }
    }

    function recordLocation(id) {
        if (!navigator.geolocation) {
            showMessage("La géolocalisation n’est pas disponible dans ce navigateur.", true);
            return;
        }
        showMessage("Autorisez la position si vous le souhaitez. Elle correspond à l’appareil qui consulte cette page, pas à l’appareil perdu.");
        navigator.geolocation.getCurrentPosition(
            position => updateDevice(id, device => ({
                ...device,
                location: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    recordedAt: new Date().toISOString()
                }
            })),
            error => {
                const reasons = {
                    1: "Vous avez refusé l’accès à la position.",
                    2: "Votre position n’a pas pu être déterminée.",
                    3: "La demande de position a expiré."
                };
                showMessage(`${reasons[error.code] || "La position n’a pas pu être enregistrée."} Vous pouvez réessayer ou vérifier les réglages de votre navigateur.`, true);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
        );
    }

    async function stopLocationSharing(announce = true) {
        if (!activeLocationShare) return;
        const tracker = activeLocationShare;
        activeLocationShare = null;
        if (tracker.watchId !== null) navigator.geolocation.clearWatch(tracker.watchId);
        if (tracker.invitedSession) {
            try {
                await callApi("/location-shares/position", { method: "DELETE", keepalive: !announce });
                document.querySelector("#shareGuestStop").hidden = true;
                document.querySelector("#shareGuestStart").hidden = true;
                showGuestShareStatus("Partage arrêté. Le propriétaire peut encore voir la dernière position enregistrée.");
            } catch (error) {
                if (announce) showGuestShareStatus(`Le navigateur a arrêté le partage, mais le serveur n’a pas confirmé l’arrêt : ${error.message}`, true);
                else console.warn("L’arrêt du partage invité n’a pas pu être confirmé.", error);
            }
            return;
        }
        render();
        if (announce) showMessage("Partage arrêté. La dernière position reste dans votre compte jusqu’à ce que vous l’effaciez.");
    }

    async function sendSharedLocation(tracker, position) {
        if (activeLocationShare !== tracker || tracker.pending
            || Date.now() - tracker.lastSentAt < LOCATION_UPDATE_INTERVAL_MS) return;
        tracker.pending = true;
        try {
            const endpoint = tracker.invitedSession
                ? "/location-shares/position"
                : `/client/devices/${encodeURIComponent(tracker.deviceId)}/location`;
            const result = await callApi(endpoint, {
                method: "POST",
                body: JSON.stringify({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                })
            });
            tracker.lastSentAt = Date.now();
            if (activeLocationShare !== tracker) return;
            if (!result?.location || !Number.isFinite(result.location.latitude)
                || !Number.isFinite(result.location.longitude)
                || !Number.isFinite(Date.parse(result.location.recordedAt))) {
                throw new Error("Le serveur a renvoyé une position invalide.");
            }
            if (tracker.invitedSession) {
                showGuestShareStatus("Votre position est partagée avec le propriétaire de l’invitation. Vous pouvez arrêter à tout moment.");
                return;
            }
            const index = devices.findIndex(device => device.id === tracker.deviceId);
            if (index >= 0) devices[index] = { ...devices[index], location: result.location };
            render();
            showMessage("Position partagée avec votre compte Retrouve.");
        } catch (error) {
            if (activeLocationShare === tracker) await stopLocationSharing(false);
            if (tracker.invitedSession) showGuestShareStatus(`Partage interrompu : ${error.message}`, true);
            else showMessage(`Partage interrompu : ${error.message}`, true);
        } finally {
            tracker.pending = false;
        }
    }

    function startLocationSharing(id) {
        if (storageMode !== "connected" || !clientSession) {
            showMessage("Connectez-vous à votre compte Retrouve pour partager une position entre appareils.", true);
            return;
        }
        if (!window.isSecureContext || !navigator.geolocation) {
            showMessage("La géolocalisation nécessite HTTPS (ou localhost) et un navigateur compatible.", true);
            return;
        }
        const selectedDevice = devices.find(device => device.id === id);
        if (!window.confirm(`La position de l’appareil qui consulte cette page sera associée à « ${selectedDevice?.name || "cet appareil"} » dans votre compte Retrouve, après autorisation du navigateur. Le partage s’arrête si la page est masquée ou fermée. Continuer ?`)) return;

        const tracker = { deviceId: id, watchId: null, lastSentAt: 0, pending: false };
        activeLocationShare = tracker;
        tracker.watchId = navigator.geolocation.watchPosition(
            position => sendSharedLocation(tracker, position),
            error => {
                if (activeLocationShare !== tracker) return;
                const reasons = {
                    1: "Vous avez refusé l’accès à la position.",
                    2: "Votre position n’a pas pu être déterminée.",
                    3: "La demande de position a expiré."
                };
                stopLocationSharing(false);
                showMessage(`${reasons[error.code] || "Le partage de position a échoué."} Vous pouvez réessayer depuis les réglages du navigateur.`, true);
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
        render();
        showMessage("Partage en attente de l’autorisation du navigateur…");
    }

    function initializeGuestSharePage() {
        for (const selector of [
            "#accountPanel",
            "#locationSharePanel",
            ".notice",
            "#deviceSectionHeading",
            "#statusMessage",
            "#deviceWorkspace",
            ".how-it-works",
            ".studio-help"
        ]) document.querySelector(selector).hidden = true;
        shareGuestPanel.hidden = false;
        document.querySelector("#shareGuestConsent").addEventListener("change", event => {
            document.querySelector("#shareGuestStart").disabled = !event.currentTarget.checked;
        });
        document.querySelector("#shareGuestStart").addEventListener("click", startInvitedLocationSharing);
        document.querySelector("#shareGuestStop").addEventListener("click", () => stopLocationSharing());
    }

    function startInvitedLocationSharing() {
        if (!invitationToken) {
            showGuestShareStatus("Cette invitation n’est plus disponible. Demandez au propriétaire de vous en envoyer une nouvelle.", true);
            return;
        }
        if (!document.querySelector("#shareGuestConsent").checked) {
            showGuestShareStatus("Cochez la case pour confirmer votre accord avant de continuer.", true);
            return;
        }
        if (!window.isSecureContext || !navigator.geolocation) {
            showGuestShareStatus("Le partage nécessite une page HTTPS (ou localhost) et un navigateur compatible.", true);
            return;
        }

        const startButton = document.querySelector("#shareGuestStart");
        startButton.disabled = true;
        showGuestShareStatus("Autorisez la position dans la demande du navigateur pour démarrer le partage.");
        navigator.geolocation.getCurrentPosition(
            async position => {
                try {
                    const result = await callApi("/location-shares/accept", {
                        method: "POST",
                        body: JSON.stringify({ token: invitationToken })
                    });
                    if (!result?.partage || typeof result.partage.id !== "string") {
                        throw new Error("Le serveur n’a pas confirmé cette invitation.");
                    }
                    invitationToken = "";
                    window.history.replaceState(null, "", window.location.pathname);
                    document.querySelector("#shareGuestDescription").textContent =
                        `Vous partagez la position de cet appareil avec le propriétaire de l’invitation, pour « ${result.partage.deviceName} ».`;
                    document.querySelector("#shareGuestConsent").disabled = true;
                    startButton.hidden = true;
                    document.querySelector("#shareGuestStop").hidden = false;
                    const tracker = {
                        deviceId: result.partage.id,
                        watchId: null,
                        lastSentAt: 0,
                        pending: false,
                        invitedSession: true
                    };
                    activeLocationShare = tracker;
                    showGuestShareStatus("Envoi de la première position…");
                    await sendSharedLocation(tracker, position);
                    if (activeLocationShare !== tracker) return;
                    tracker.watchId = navigator.geolocation.watchPosition(
                        nextPosition => sendSharedLocation(tracker, nextPosition),
                        error => {
                            if (activeLocationShare !== tracker) return;
                            const reasons = {
                                1: "Vous avez refusé l’accès à la position.",
                                2: "Votre position n’a pas pu être déterminée.",
                                3: "La demande de position a expiré."
                            };
                            stopLocationSharing(false);
                            showGuestShareStatus(`${reasons[error.code] || "Le partage de position a échoué."} Vous pouvez réessayer depuis les réglages du navigateur.`, true);
                        },
                        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
                    );
                } catch (error) {
                    startButton.disabled = false;
                    showGuestShareStatus(error.message, true);
                }
            },
            error => {
                startButton.disabled = false;
                const reasons = {
                    1: "Vous avez refusé l’accès à la position.",
                    2: "Votre position n’a pas pu être déterminée.",
                    3: "La demande de position a expiré."
                };
                showGuestShareStatus(`${reasons[error.code] || "La position n’a pas pu être déterminée."} L’invitation n’a pas été utilisée ; vous pouvez réessayer.`, true);
            },
            { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
        );
    }

    async function toggleLostStatus(id) {
        await updateDevice(id, device => ({ ...device, status: device.status === "lost" ? "ready" : "lost" }));
    }

    async function deleteDevice(id) {
        const device = devices.find(item => item.id === id);
        if (!device || !window.confirm(`Supprimer « ${device.name} » de cet inventaire ?`)) return;
        if (activeLocationShare?.deviceId === id) stopLocationSharing(false);
        const previous = devices;
        devices = devices.filter(item => item.id !== id);
        try {
            await saveDevices();
            render();
            showMessage("Appareil supprimé de cet inventaire.");
        } catch (error) {
            devices = previous;
            render();
            showMessage(`Impossible d’enregistrer la suppression : ${error.message}`, true);
        }
    }

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (storageMode !== "local" && storageMode !== "connected") {
            showMessage("Le stockage n’est pas disponible. Réessayez avant de modifier l’inventaire.", true);
            return;
        }
        if (devices.length >= MAX_DEVICES) {
            showMessage(`La limite de ${MAX_DEVICES} appareils est atteinte.`, true);
            return;
        }
        const data = new FormData(form);
        const device = {
            id: crypto.randomUUID(),
            name: String(data.get("name")).trim(),
            type: String(data.get("type")),
            platform: String(data.get("platform")),
            serial: String(data.get("serial")).trim(),
            contact: String(data.get("contact")).trim(),
            status: "ready",
            location: null
        };
        devices.push(device);
        try {
            await saveDevices();
            form.reset();
            render();
            showMessage("Appareil ajouté à votre inventaire.");
        } catch (error) {
            devices.pop();
            render();
            showMessage(`Impossible d’enregistrer l’appareil : ${error.message}`, true);
        }
    });

    document.querySelector("#exportButton").addEventListener("click", () => {
        try {
            const content = JSON.stringify({ format: "retrouve-appareils", version: 1, devices }, null, 2);
            const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = `mes-appareils-${new Date().toISOString().slice(0, 10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
            showMessage("Sauvegarde exportée. Conservez ce fichier dans un endroit sûr.");
        } catch (error) {
            showMessage(`Impossible de créer la sauvegarde : ${error.message}`, true);
        }
    });

    document.querySelector("#importButton").addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", async () => {
        const file = importFile.files && importFile.files[0];
        importFile.value = "";
        if (!file) return;
        if (file.size > MAX_BACKUP_SIZE) {
            showMessage("Le fichier dépasse la taille maximale de 1 Mo.", true);
            return;
        }
        try {
            const backup = JSON.parse(await file.text());
            if (backup.format !== "retrouve-appareils"
                || backup.version !== 1
                || !Array.isArray(backup.devices)
                || backup.devices.length > MAX_DEVICES
                || !backup.devices.every(isValidDevice)) {
                throw new Error("Le fichier ne correspond pas à une sauvegarde Retrouve valide.");
            }
            if (!window.confirm("Importer cette sauvegarde et remplacer l’inventaire affiché ? Exportez d’abord vos données actuelles si vous souhaitez les conserver.")) return;
            const previous = devices;
            devices = backup.devices.map(device => ({ ...device, id: crypto.randomUUID() }));
            try {
                await saveDevices();
                render();
                showMessage("Sauvegarde importée.");
            } catch (error) {
                devices = previous;
                throw error;
            }
        } catch (error) {
            showMessage(`Import impossible : ${error.message}`, true);
        }
    });

    async function authenticate(email, password) {
        const client = await callApi("/login", {
            method: "POST",
            body: JSON.stringify({ email, motDePasse: password })
        });
        const inventory = await callApi("/client/devices");
        if (!Array.isArray(inventory?.appareils) || inventory.appareils.length > MAX_DEVICES
            || !inventory.appareils.every(isValidDevice)) {
            throw new Error("L’inventaire du compte n’a pas pu être vérifié. Réessayez avant toute modification.");
        }
        clientSession = client;
        devices = inventory.appareils;
        storageMode = "connected";
        render();
        try {
            await refreshLocationShares();
        } catch (error) {
            showLocationShareStatus(`Impossible de charger les invitations : ${error.message}`, true);
        }
    }

    document.querySelector("#locationShareForm").addEventListener("submit", async event => {
        event.preventDefault();
        if (storageMode !== "connected") {
            showLocationShareStatus("Connectez-vous à votre compte avant de créer une invitation.", true);
            return;
        }
        const deviceId = locationShareDevice.value;
        const submitButton = document.querySelector("#locationShareCreateButton");
        submitButton.disabled = true;
        showLocationShareStatus("Création d’une invitation à usage unique…");
        try {
            const result = await callApi("/client/location-shares", {
                method: "POST",
                body: JSON.stringify({ deviceId })
            });
            if (!result?.partage || typeof result.partage.invitationToken !== "string"
                || !Number.isFinite(Date.parse(result.partage.invitationExpiresAt))) {
                throw new Error("Le serveur a renvoyé une invitation invalide.");
            }
            const inviteUrl = new URL("/appareils.html", window.location.origin);
            inviteUrl.hash = new URLSearchParams({ share: result.partage.invitationToken }).toString();
            document.querySelector("#locationShareInviteUrl").value = inviteUrl.toString();
            document.querySelector("#locationShareInvite").hidden = false;
            await refreshLocationShares();
            showLocationShareStatus(`Invitation créée. Elle expire le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(result.partage.invitationExpiresAt))} et ne peut être utilisée qu’une fois.`);
        } catch (error) {
            showLocationShareStatus(`Impossible de créer l’invitation : ${error.message}`, true);
        } finally {
            submitButton.disabled = storageMode !== "connected" || !devices.length;
        }
    });

    document.querySelector("#locationShareSendButton").addEventListener("click", async () => {
        const url = document.querySelector("#locationShareInviteUrl").value;
        if (!url) return;
        try {
            if (navigator.share) {
                await navigator.share({
                    title: "Invitation Retrouve",
                    text: "Ouvrez ce lien sur le téléphone à tester et choisissez vous-même si vous partagez votre position.",
                    url
                });
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(url);
                showLocationShareStatus("Lien copié. Envoyez-le directement au testeur ; ne le publiez pas.");
            } else {
                const input = document.querySelector("#locationShareInviteUrl");
                input.focus();
                input.select();
                showLocationShareStatus("Lien sélectionné. Copiez-le puis envoyez-le directement au testeur.");
            }
        } catch (error) {
            if (error.name !== "AbortError") showLocationShareStatus(`Impossible de partager le lien : ${error.message}`, true);
        }
    });

    document.querySelector("#accountLoginForm").addEventListener("submit", async event => {
        event.preventDefault();
        const loginForm = event.currentTarget;
        const formData = new FormData(loginForm);
        try {
            await authenticate(String(formData.get("email")).trim(), String(formData.get("motDePasse")));
            loginForm.reset();
            showAccountStatus("Connexion réussie. Votre inventaire est maintenant accessible depuis ce compte.");
            showMessage("Inventaire du compte chargé.");
        } catch (error) {
            storageMode = error.status && error.status < 500 ? "local" : "error";
            render();
            showAccountStatus(error.message, true);
        }
    });

    document.querySelector("#accountRecoveryForm").addEventListener("submit", async event => {
        event.preventDefault();
        const recoveryForm = event.currentTarget;
        const email = String(new FormData(recoveryForm).get("email")).trim();
        try {
            const result = await callApi("/password/forgot", {
                method: "POST",
                body: JSON.stringify({ email })
            });
            recoveryForm.reset();
            showAccountStatus(result.message || "Si cette adresse est associée à un compte, un lien de réinitialisation sera envoyé.");
        } catch (error) {
            showAccountStatus(error.message, true);
        }
    });

    document.querySelector("#passwordResetForm").addEventListener("submit", async event => {
        event.preventDefault();
        if (!passwordResetToken) {
            showAccountStatus("Le lien de réinitialisation est absent ou invalide. Demandez-en un nouveau.", true);
            return;
        }
        const resetForm = event.currentTarget;
        const formData = new FormData(resetForm);
        const password = String(formData.get("motDePasse"));
        const confirmation = String(formData.get("confirmation"));
        if (password !== confirmation) {
            showAccountStatus("Les deux mots de passe ne correspondent pas.", true);
            return;
        }

        const submitButton = resetForm.querySelector("button[type='submit']");
        submitButton.disabled = true;
        try {
            const result = await callApi("/password/reset", {
                method: "POST",
                body: JSON.stringify({ token: passwordResetToken, motDePasse: password })
            });
            passwordResetToken = "";
            resetForm.reset();
            render();
            showAccountStatus(result.message || "Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.");
        } catch (error) {
            showAccountStatus(error.message, true);
        } finally {
            submitButton.disabled = false;
        }
    });

    document.querySelector("#accountRegisterForm").addEventListener("submit", async event => {
        event.preventDefault();
        const registerForm = event.currentTarget;
        const formData = new FormData(registerForm);
        const account = {
            nom: String(formData.get("nom")).trim(),
            telephone: String(formData.get("telephone")).trim(),
            email: String(formData.get("email")).trim(),
            motDePasse: String(formData.get("motDePasse"))
        };
        try {
            await callApi("/clients", { method: "POST", body: JSON.stringify(account) });
            await authenticate(account.email, account.motDePasse);
            registerForm.reset();
            document.querySelector(".register-details").open = false;
            showAccountStatus("Compte créé. Votre inventaire est synchronisé avec ce compte.");
            showMessage("Compte créé et inventaire prêt.");
        } catch (error) {
            storageMode = error.status && error.status < 500 ? "local" : "error";
            render();
            showAccountStatus(error.message, true);
        }
    });

    mergeLocalButton.addEventListener("click", async () => {
        if (storageMode !== "connected") return;
        const knownIds = new Set(devices.map(device => device.id));
        const toAdd = localDevices.filter(device => !knownIds.has(device.id));
        if (!toAdd.length) {
            showAccountStatus("Les appareils de ce navigateur sont déjà dans le compte.");
            return;
        }
        if (devices.length + toAdd.length > MAX_DEVICES) {
            showAccountStatus(`La fusion dépasserait la limite de ${MAX_DEVICES} appareils. Supprimez-en avant de réessayer.`, true);
            return;
        }
        if (!window.confirm(`Ajouter ${toAdd.length} appareil(s) de ce navigateur à l’inventaire du compte ?`)) return;
        const previous = devices;
        devices = [...devices, ...toAdd];
        try {
            await saveDevices();
            render();
            showAccountStatus("Inventaires fusionnés. La copie locale est conservée dans ce navigateur.");
            showMessage("Inventaire du navigateur ajouté au compte.");
        } catch (error) {
            devices = previous;
            render();
            showAccountStatus(`Fusion impossible : ${error.message}`, true);
        }
    });

    document.querySelector("#accountLogoutButton").addEventListener("click", async () => {
        stopLocationSharing(false);
        try {
            await callApi("/client/session", { method: "DELETE" });
            clientSession = null;
            storageMode = "local";
            localDevices = readLocalDevices();
            devices = localDevices;
            render();
            showAccountStatus("Déconnecté. L’inventaire affiché est celui enregistré dans ce navigateur.");
            showMessage("Déconnexion réussie.");
        } catch (error) {
            showAccountStatus(`Déconnexion impossible : ${error.message}`, true);
        }
    });

    document.querySelector("#accountRetryButton").addEventListener("click", initialize);

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") stopLocationSharing();
    });
    window.addEventListener("pagehide", () => stopLocationSharing(false));

    window.setInterval(async () => {
        if (storageMode !== "connected" || !clientSession || activeLocationShare
            || document.visibilityState !== "visible") return;
        try {
            const inventory = await callApi("/client/devices");
            if (!Array.isArray(inventory?.appareils) || inventory.appareils.length > MAX_DEVICES
                || !inventory.appareils.every(isValidDevice)) {
                throw new Error("Le serveur a renvoyé un inventaire invalide.");
            }
            devices = inventory.appareils;
            render();
            await refreshLocationShares();
        } catch (error) {
            if (error.status === 401) {
                stopLocationSharing(false);
                clientSession = null;
                storageMode = "error";
                showAccountStatus("Votre session a expiré. Reconnectez-vous pour synchroniser vos positions.", true);
                render();
                return;
            }
            showAccountStatus(`Synchronisation des positions impossible : ${error.message}`, true);
        }
    }, LOCATION_REFRESH_INTERVAL_MS);

    async function initialize() {
        storageMode = "loading";
        if (passwordResetToken) {
            devices = [];
            localDevices = [];
            storageMode = "local";
            render();
            showAccountStatus("Choisissez un nouveau mot de passe. Le lien ne peut être utilisé qu’une seule fois et expire après 30 minutes.");
            return;
        }
        try {
            localDevices = readLocalDevices();
            devices = localDevices;
            render();
        } catch (error) {
            devices = [];
            storageMode = "error";
            render();
            showMessage(error.message, true);
            showAccountStatus("L’inventaire local ne peut pas être chargé. Utilisez une sauvegarde exportée si vous en avez une.", true);
            return;
        }

        try {
            const client = await callApi("/client/session");
            const inventory = await callApi("/client/devices");
            if (!Array.isArray(inventory?.appareils) || inventory.appareils.length > MAX_DEVICES
                || !inventory.appareils.every(isValidDevice)) {
                throw new Error("L’inventaire du compte n’a pas pu être vérifié. Réessayez avant toute modification.");
            }
            clientSession = client;
            devices = inventory.appareils;
            storageMode = "connected";
            render();
            try {
                await refreshLocationShares();
            } catch (error) {
                showLocationShareStatus(`Impossible de charger les invitations : ${error.message}`, true);
            }
            showAccountStatus("Compte connecté. Votre inventaire est accessible depuis cet appareil.");
            showMessage("Inventaire du compte chargé.");
        } catch (error) {
            clientSession = null;
            devices = localDevices;
            if (error.status === 401) {
                storageMode = "local";
                showAccountStatus("Connectez-vous pour synchroniser votre inventaire et y accéder depuis un autre appareil.");
            } else {
                storageMode = "error";
                showAccountStatus(`Impossible de vérifier le compte en ligne : ${error.message} Réessayez avant de modifier les données.`, true);
            }
            render();
        }
    }

    if (invitationToken) initializeGuestSharePage();
    else initialize();
})();
