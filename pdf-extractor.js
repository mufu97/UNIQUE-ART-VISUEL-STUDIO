// pdf.js écrit ses avertissements (polices, etc.) avec console.log : ils iraient sur la sortie
// standard et corrompraient le JSON attendu par le serveur. Ils sont redirigés vers stderr.
console.log = (...args) => process.stderr.write(`${args.join(" ")}\n`);
console.warn = console.log;
console.info = console.log;

const pdfParse = require("pdf-parse");

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_BYTES = 3 * 1024 * 1024;
const MAX_PAGES = 1000;
const chunks = [];
let inputSize = 0;

function fail(message) {
    process.stderr.write(message);
    process.exitCode = 1;
}

process.stdin.on("data", (chunk) => {
    inputSize += chunk.length;
    if (inputSize > MAX_INPUT_BYTES) {
        process.stdin.destroy();
        fail("Le PDF dépasse la limite de 16 Mo.");
        return;
    }
    chunks.push(chunk);
});

process.stdin.on("end", async () => {
    if (process.exitCode) return;

    const pages = [];
    let textSize = 0;
    try {
        const resultat = await pdfParse(Buffer.concat(chunks), {
            max: MAX_PAGES,
            pagerender: async (page) => {
                const contenu = await page.getTextContent({ normalizeWhitespace: false, disableCombineTextItems: false });
                let dernierePositionY;
                let finPrecedente;
                let texte = "";
                for (const element of contenu.items) {
                    if (typeof element.str !== "string") continue;
                    const x = element.transform[4];
                    const hauteur = Math.abs(element.transform[3]) || Math.abs(element.transform[0]) || 10;
                    if (dernierePositionY === element.transform[5] || dernierePositionY === undefined) {
                        // Certains PDF placent chaque mot séparément, sans caractère d'espace :
                        // un écart horizontal visible entre deux fragments vaut un espace.
                        const ecart = finPrecedente === undefined ? 0 : x - finPrecedente;
                        if (ecart > hauteur * 0.15 && texte && !/\s$/.test(texte) && !/^\s/.test(element.str)) texte += " ";
                        texte += element.str;
                    } else {
                        texte += `\n${element.str}`;
                    }
                    dernierePositionY = element.transform[5];
                    finPrecedente = x + (element.width || 0);
                }
                texte = texte.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/[ \t]+/g, " ").trim();
                textSize += Buffer.byteLength(texte, "utf8");
                if (textSize > MAX_TEXT_BYTES) throw new Error("Le texte extrait dépasse la limite de 3 Mo.");
                pages.push({ page: page.pageNumber, text: texte });
                return texte;
            }
        });

        if (resultat.numpages > MAX_PAGES) throw new Error("Le PDF dépasse la limite de 1 000 pages.");
        process.stdout.write(JSON.stringify({ pageCount: resultat.numpages, pages }));
    } catch (error) {
        fail(error.message || "Impossible d’extraire le texte du PDF.");
    }
});
