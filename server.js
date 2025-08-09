const express = require('express');
const cors = require('cors');
const { realizarScraping } = require('./src/services/scrapingService');

const app = express();
const PORT = 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Ruta para realizar scraping
app.post('/api/scraping', async (req, res) => {
    try {
        const { termino } = req.body;
        
        if (!termino || termino.trim().length < 3) {
            return res.status(400).json({ 
                error: 'El término de búsqueda debe tener al menos 3 caracteres' 
            });
        }

        console.log('Recibida solicitud de scraping para:', termino);
        
        const resultadoScraping = await realizarScraping(termino);
        
        res.json({ 
            success: true, 
            resultados: resultadoScraping.todasLasOfertas,
            total: resultadoScraping.total
        });
        
    } catch (error) {
        console.error('Error en el servidor:', error);
        res.status(500).json({ 
            error: 'Error al realizar el scraping',
            message: error.message 
        });
    }
});

// Ruta de prueba
app.get('/api/test', (req, res) => {
    res.json({ message: 'Servidor funcionando correctamente' });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});