const puppeteer = require('puppeteer');

async function realizarScraping(terminoBusqueda) {
    try {
        console.log('Iniciando scraping para:', terminoBusqueda);
        
        const navegador = await puppeteer.launch({
            headless: true, // Cambiar a headless para mejor rendimiento
            slowMo: 100, // Reducir el delay
            args: [
                '--no-sandbox', 
                '--disable-setuid-sandbox', 
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images' // No cargar imágenes para mayor velocidad
            ]
        });

        const pagina = await navegador.newPage();
        
        // Configurar la página para mejor rendimiento
        await pagina.setRequestInterception(true);
        pagina.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort(); // No cargar imágenes, CSS ni fuentes
            } else {
                req.continue();
            }
        });
        
        await pagina.goto(`https://hireline.io/remoto/empleos-de-${encodeURIComponent(terminoBusqueda)}-en-latam`, {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });

        let btnSiguientePagina = true;
        let AllPuestoTrabajo = [];

        // Obtener URLs de todas las páginas
        while (btnSiguientePagina) {
            const datos = await pagina.evaluate(() => {
                const datosArreglo = [];
                const cards = document.querySelectorAll('a.hl-vacancy-card.vacancy-container');
            
                cards.forEach(card => {
                    const URLPuesto = card.getAttribute('href');
                    if (URLPuesto) {
                        datosArreglo.push({
                            URLPuesto: URLPuesto.startsWith('http') ? URLPuesto : 'https://hireline.io/' + URLPuesto
                        });
                    }
                });
            
                return datosArreglo;
            });

            AllPuestoTrabajo = [...AllPuestoTrabajo, ...datos];

            btnSiguientePagina = await pagina.evaluate(() => {
                return !!document.querySelector('a.mt-4.md\\:mt-0.transition-all.hover\\:underline');
            });

            if (btnSiguientePagina) {
                const btnSiguiente = await pagina.$('a.mt-4.md\\:mt-0.transition-all.hover\\:underline');
                if (btnSiguiente) {
                    await btnSiguiente.click();
                    await pagina.waitForSelector('a.hl-vacancy-card.vacancy-container', { timeout: 10000 });
                } else {
                    btnSiguientePagina = false;
                }
            }
        }

        console.log(`Total de URLs encontradas: ${AllPuestoTrabajo.length}`);
        console.log(`Tiempo estimado: ~${Math.ceil(AllPuestoTrabajo.length / 5)} minutos`);

        // Procesar cada URL para obtener detalles
        let ofertasConSueldoVisible = [];
        let ofertasConSueldoOculto = 0;
        let todasLasOfertas = [];

        console.log('Procesando ofertas...');
        
        // Procesar en lotes para mejor rendimiento
        const batchSize = 5; // Procesar 5 ofertas a la vez
        for (let i = 0; i < AllPuestoTrabajo.length; i += batchSize) {
            const batch = AllPuestoTrabajo.slice(i, i + batchSize);
            console.log(`Procesando lote ${Math.floor(i/batchSize) + 1}/${Math.ceil(AllPuestoTrabajo.length/batchSize)} (${batch.length} ofertas)`);
            
            const batchPromises = batch.map(async (puesto) => {
                const url = puesto.URLPuesto;
                const paginaPuesto = await navegador.newPage();
                
                try {
                    await paginaPuesto.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });

                    const datosPuesto = await paginaPuesto.evaluate(() => {
                        const titulo = document.querySelector('h1.text-cornflower-blue.text-2xl.font-bold.font-outfit')?.innerText;
                        const sueldo = document.querySelector('p.text-vivid-sky-blue.text-2xl.font-bold.font-outfit.mb-4')?.innerText;
                        
                        // Corregir la obtención de ubicación
                        const ubicacion = document.querySelector('div>div>p.text-slate-gray.text-sm.font-medium')?.innerText;
                        const ubicacionLimpia = ubicacion ? ubicacion.replace(/\n+/g,' ').trim() : '';
                        
                        let tiempoTexto = '';
                        const tiempo = document.querySelector('div.flex.items-start.md\\:items-center.justify-start.flex-col.md\\:flex-row.gap-4');
                        if(tiempo){
                            const hijos = Array.from(tiempo.querySelectorAll('div'));
                            const segundoDiv = hijos[1];
                            tiempoTexto = segundoDiv?.querySelector('p')?.innerText?.trim() || '';
                        }
                        
                        const ingles = document.querySelector('div.flex>div:nth-child(3)>p:nth-child(2).text-slate-gray.text-sm.font-medium:nth-child(2)')?.innerText;
                        const descripcion = document.querySelector('div.text-sm.text-rich-black.font-normal.ul-disc.overflow-wrap')?.innerText;
                        const descripcionLimpia = descripcion ? descripcion.replace(/\n+/g,' ').trim() : '';

                        return { 
                            titulo,
                            sueldo,
                            ubicacionLimpia,
                            tiempo: tiempoTexto,
                            ingles,
                            descripcionLimpia
                        };
                    });

                    // Agregar todos los puestos a todasLasOfertas
                    const puestoCompleto = {
                        ...puesto,
                        titulo: datosPuesto.titulo,
                        sueldo: datosPuesto.sueldo,
                        ubicacionLimpia: datosPuesto.ubicacionLimpia,
                        tiempo: datosPuesto.tiempo,
                        ingles: datosPuesto.ingles,
                        descripcionLimpia: datosPuesto.descripcionLimpia
                    };

                    // Solo incluir ofertas con sueldo visible (filtro definitivo)
                    let sueldoLimpio = (datosPuesto.sueldo || '').toLowerCase();
                    sueldoLimpio = sueldoLimpio.replace(/\s+/g, ''); // elimina espacios, tabs y saltos de línea
                    if (
                        datosPuesto.sueldo &&
                        sueldoLimpio !== '' &&
                        !sueldoLimpio.includes('oculto')
                    ) {
                        return { tipo: 'visible', puesto: puestoCompleto };
                    } else {
                        return { tipo: 'oculto', puesto: puestoCompleto, titulo: datosPuesto.titulo, sueldo: datosPuesto.sueldo };
                    }
                } catch (error) {
                    console.log(`Error procesando ${url}:`, error.message);
                    return { tipo: 'error', puesto: { ...puesto, titulo: 'Error al cargar', sueldo: 'No disponible' } };
                } finally {
                    await paginaPuesto.close();
                }
            });

            const batchResults = await Promise.all(batchPromises);
            
            batchResults.forEach(result => {
                todasLasOfertas.push(result.puesto);
                
                if (result.tipo === 'visible') {
                    ofertasConSueldoVisible.push(result.puesto);
                } else if (result.tipo === 'oculto') {
                    ofertasConSueldoOculto++;
                    console.log(`Descartando oferta con sueldo oculto: ${result.titulo} | Sueldo detectado: '${result.sueldo}'`);
                }
            });
        }

        await navegador.close();
        
        console.log('Scraping completado.');
        console.log(`Ofertas con sueldo visible: ${ofertasConSueldoVisible.length}`);
        console.log(`Ofertas descartadas (sueldo oculto): ${ofertasConSueldoOculto}`);
        console.log(`Total de ofertas procesadas: ${AllPuestoTrabajo.length}`);
        
        return {
            ofertas: todasLasOfertas, // ahora 'ofertas' incluye todas, visibles y ocultas
            todasLasOfertas: todasLasOfertas,
            conSueldoVisible: ofertasConSueldoVisible.length,
            conSueldoOculto: ofertasConSueldoOculto,
            total: todasLasOfertas.length
        };
        
    } catch (error) {
        console.error('Error en el scraping:', error);
        return {
            ofertas: [],
            conSueldoVisible: 0,
            conSueldoOculto: 0,
            total: 0
        };
    }
}

module.exports = { realizarScraping };