// filename: server.js
const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    console.error("FATAL: GEMINI_API_KEY environment variable is not set.");
    console.error("Please set the key and restart: export GEMINI_API_KEY=\"YOUR_API_KEY\"");
    process.exit(1);
}

// Initialize the GoogleGenAI client
const ai = new GoogleGenAI({ apiKey: API_KEY });
const app = express();

// --- Middleware ---

// 1. CORS for client-side development
app.use(cors());

// 2. Rate Limiting (100 requests per 15 minutes)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max requests per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later. (Proxy Rate Limit)' },
});

// Apply rate limiting only to the API endpoint
app.use('/api/gemini', apiLimiter);

// 3. JSON body parser
app.use(express.json());

// --- API Endpoint ---

/**
 * Endpoint to proxy calls to the Gemini API.
 * Request body expected: { prompt: string, model: string, isJson: boolean, options: object }
 */
app.post('/api/gemini', async (req, res) => {
    const { prompt, model, isJson, options } = req.body;

    if (!prompt) {
        return res.status(400).json({ error: 'Missing prompt in request body.' });
    }
    
    // Set configuration options, prioritizing client-side options
    const config = {
        temperature: options?.temperature || (isJson ? 0.2 : 0.7),
        maxOutputTokens: options?.maxOutputTokens || 2048,
        responseMimeType: isJson ? "application/json" : "text/plain",
    };
    
    // Default safety settings
    const safetySettings = [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
    ];

    try {
        const response = await ai.models.generateContent({
            model: model || 'gemini-2.5-flash',
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            config: {
                ...config,
                safetySettings: safetySettings,
            },
        });

        const text = response.text;
        
        // Respond with the raw text from the model
        res.json({ text: text });

    } catch (error) {
        console.error('Gemini API Error:', error.message);
        // Extract better error message from the Google API response structure
        const apiErrorMessage = error.message.includes('API_KEY_INVALID') 
            ? 'API Key is invalid or not authorized.' 
            : error.message.split('at GoogleGenAI')[0].trim() || 'Internal Server Error';
        
        // The GoogleGenAI library doesn't expose HTTP status easily, use 500 default
        res.status(500).json({
            error: `Failed to call Gemini API: ${apiErrorMessage}`,
            code: 500
        });
    }
});

// --- Server Start ---
app.listen(PORT, () => {
    console.log(`\n🤖 Interna Proxy Server Running!`);
    console.log(`Access the front-end (index.html) in your browser.`);
    console.log(`Proxy endpoint: http://localhost:${PORT}/api/gemini`);
    console.log(`\n!!! IMPORTANT !!!`);
    console.log(`Set the API Key in your terminal: export GEMINI_API_KEY="YOUR_API_KEY"`);
    console.log(`Then run: node server.js`);
    console.log(`-----------------\n`);
});
