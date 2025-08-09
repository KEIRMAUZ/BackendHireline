const axios = require('axios');
const cheerio = require('cheerio');

async function realizarScraping(terminoBusqueda) {
    try {
        console.log('Iniciando scraping con Cheerio para:', terminoBusqueda);

        const urlBase = `https://hireline.io/remoto/empleos-de-${encodeURIComponent(terminoBusqueda)}-en-latam`;
        let todasLasOfertas = [];
        let urlActual = urlBase;

        while (urlActual) {
            console.log('Obteniendo datos de:', urlActual);
            const { data: html } = await axios.get(urlActual);
            const $ = cheerio.load(html);

            const cards = $('a.hl-vacancy-card.vacancy-container');
            if (cards.length === 0) {
                console.log('No se encontraron más ofertas. Deteniendo el scraping.');
                break;
            }

            const urlsPuestos = [];
            cards.each((index, element) => {
                const urlPuesto = $(element).attr('href');
                if (urlPuesto) {
                    urlsPuestos.push({
                        URLPuesto: urlPuesto.startsWith('http') ? urlPuesto : 'https://hireline.io' + urlPuesto
                    });
                }
            });

            // Reemplazar la lógica de paginación de Puppeteer
            const nextButton = $('a.mt-4.md\\:mt-0.transition-all.hover\\:underline');
            urlActual = nextButton.length ? nextButton.attr('href') : null;

            if (urlActual && !urlActual.startsWith('http')) {
                urlActual = 'https://hireline.io' + urlActual;
            }

            todasLasOfertas.push(...urlsPuestos);
        }

        console.log(`Total de URLs encontradas: ${todasLasOfertas.length}`);
        
        const ofertasCompletas = [];
        for (const puesto of todasLasOfertas) {
            try {
                const { data: htmlPuesto } = await axios.get(puesto.URLPuesto);
                const $ = cheerio.load(htmlPuesto);

                const titulo = $('h1.text-cornflower-blue.text-2xl.font-bold.font-outfit').text();
                const sueldo = $('p.text-vivid-sky-blue.text-2xl.font-bold.font-outfit.mb-4').text();
                const ubicacion = $('div > div > p.text-slate-gray.text-sm.font-medium').text().replace(/\n+/g, ' ').trim();
                const tiempo = $('div.flex.items-start.md\\:items-center.justify-start.flex-col.md\\:flex-row.gap-4 > div:nth-child(2) > p').text().trim();
                const ingles = $('div.flex > div:nth-child(3) > p:nth-child(2).text-slate-gray.text-sm.font-medium:nth-child(2)').text();
                const descripcion = $('div.text-sm.text-rich-black.font-normal.ul-disc.overflow-wrap').text().replace(/\n+/g, ' ').trim();

                ofertasCompletas.push({
                    URLPuesto: puesto.URLPuesto,
                    titulo,
                    sueldo,
                    ubicacion,
                    tiempo,
                    ingles,
                    descripcion
                });
            } catch (error) {
                console.error(`Error procesando URL ${puesto.URLPuesto}:`, error.message);
                ofertasCompletas.push({
                    URLPuesto: puesto.URLPuesto,
                    titulo: 'Error al cargar',
                    sueldo: 'No disponible',
                    ubicacion: '',
                    tiempo: '',
                    ingles: '',
                    descripcion: ''
                });
            }
        }
        
        console.log('Scraping completado.');
        return {
            todasLasOfertas: ofertasCompletas,
            total: ofertasCompletas.length
        };
    } catch (error) {
        console.error('Error en el scraping:', error.message);
        return {
            todasLasOfertas: [],
            total: 0
        };
    }
}

module.exports = { realizarScraping };