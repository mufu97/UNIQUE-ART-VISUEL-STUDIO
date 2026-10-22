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
                let texte = "";
                for (const element of contenu.items) {
                    if (typeof element.str !== "string") continue;
                    if (dernierePositionY === element.transform[5] || dernierePositionY === undefined) {
                        texte += element.str;
                    } else {
                        texte += `\n${element.str}`;
                    }
                    dernierePositionY = element.transform[5];
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
