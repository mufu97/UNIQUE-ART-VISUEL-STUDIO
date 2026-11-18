(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return;
    root.classList.add("motion");

    // Barre de progression de lecture + parallaxe du portrait
    const bar = document.getElementById("progress");
    const portrait = document.querySelector(".portrait");
    let ticking = false;
    const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const max = root.scrollHeight - innerHeight;
            if (bar) bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
            if (portrait && scrollY < innerHeight) portrait.style.transform = `translateY(${scrollY * 0.12}px)`;
            ticking = false;
        });
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Apparition au défilement, avec décalage dans chaque groupe
    const groups = ".block-body > *, .cards > *, .chips > li, .steps > li, .gallery > figure, .contact-list > div";
    document.querySelectorAll(groups).forEach((el) => {
        el.classList.add("reveal");
        const siblings = [...el.parentElement.children];
        el.style.setProperty("--d", `${Math.min(siblings.indexOf(el), 8) * 70}ms`);
    });
    const io = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (!e.isIntersecting) return;
            e.target.classList.add("in");
            io.unobserve(e.target);
        });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    document.querySelectorAll(".reveal, .block .num, .block h2").forEach((el) => io.observe(el));

    // Menu : rubrique active
    const links = new Map([...document.querySelectorAll(".topbar nav a")].map((a) => [a.getAttribute("href").slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
        entries.forEach((e) => {
            if (!e.isIntersecting) return;
            links.forEach((a) => a.classList.remove("active"));
            links.get(e.target.id)?.classList.add("active");
        });
    }, { rootMargin: "-40% 0px -55% 0px" });
    links.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });

    // Inclinaison douce des planches au survol
    document.querySelectorAll(".gallery figure").forEach((fig) => {
        const img = fig.querySelector("img");
        fig.addEventListener("pointermove", (ev) => {
            if (ev.pointerType !== "mouse") return;
            const r = img.getBoundingClientRect();
            const x = (ev.clientX - r.left) / r.width - 0.5;
            const y = (ev.clientY - r.top) / r.height - 0.5;
            img.style.transform = `perspective(700px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) translateY(-3px)`;
        });
        fig.addEventListener("pointerleave", () => { img.style.transform = ""; });
    });
})();
