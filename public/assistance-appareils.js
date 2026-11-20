(() => {
    "use strict";

    const form = document.querySelector("#assistanceForm");
    const status = document.querySelector("#formStatus");
    const submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        // La demande est enregistrée dans le tableau de bord du studio (route /api/discussions),
        // sans dépendre de l'e-mail : le studio la voit dès qu'il se connecte à son espace.
        const payload = {
            name: form.elements.nom.value.trim(),
            email: form.elements.email.value.trim(),
            type: `Assistance appareils — ${form.elements.type.value}`,
            message: form.elements.message.value.trim(),
            language: "fr",
            website: form.elements.website.value.trim()
        };
        submitButton.disabled = true;
        status.hidden = false;
        status.classList.remove("error");
        status.textContent = "Envoi de votre demande…";

        try {
            const response = await fetch("/api/discussions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const result = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(result.error || "La demande n’a pas pu être envoyée. Réessayez plus tard ou contactez directement le studio.");
            }
            form.reset();
            status.textContent = "Votre demande a bien été transmise au studio. Nous vous répondrons à l’adresse indiquée.";
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
