(() => {
    "use strict";

    const form = document.querySelector("#assistanceForm");
    const status = document.querySelector("#formStatus");
    const emailUnavailable = document.querySelector("#emailUnavailable");
    const submitButton = form.querySelector('button[type="submit"]');

    fetch("/api/health")
        .then(response => {
            if (!response.ok) throw new Error("Impossible de vérifier le service d’e-mail.");
            return response.json();
        })
        .then(health => {
            if (health.providers && health.providers.emailSending === false) {
                submitButton.disabled = true;
                emailUnavailable.hidden = false;
            }
        })
        .catch(error => {
            console.warn("Disponibilité du formulaire d’assistance non vérifiée.", error);
        });

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        const payload = {
            nom: form.elements.nom.value.trim(),
            email: form.elements.email.value.trim(),
            message: `[Demande d’assistance appareils — ${form.elements.type.value}]\n\n${form.elements.message.value.trim()}`,
            website: form.elements.website.value.trim()
        };
        submitButton.disabled = true;
        status.hidden = false;
        status.classList.remove("error");
        status.textContent = "Envoi de votre demande…";

        try {
            const response = await fetch("/api/contact", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || "La demande n’a pas pu être envoyée. Réessayez plus tard ou contactez directement le studio.");
            }
            form.reset();
            status.textContent = "Votre demande a été envoyée au studio. Nous vous répondrons à l’adresse indiquée.";
        } catch (error) {
            status.classList.add("error");
            status.textContent = error instanceof TypeError
                ? "Impossible de joindre le serveur. Ouvrez le site depuis son adresse web habituelle, puis réessayez."
                : error.message;
        } finally {
            submitButton.disabled = false;
        }
    });
})();
