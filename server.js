// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { openai, create_or_get_assistant, create_thread, run_named_assistant } from './workerFunctions.js';
// server.js

const app = express();
const port = 3000;

// Middleware to parse JSON requests
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to create or get an assistant
app.post('/api/assistant', async (req, res) => {
    const { name, instructions } = req.body;
    try {
        const assistant = await create_or_get_assistant(name, instructions);
        res.json({ assistant_id: assistant.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create or get assistant.' });
    }
});

// API endpoint to create a thread
app.post('/api/thread', async (req, res) => {
    try {
        const thread = await create_thread();
        res.json({ thread_id: thread.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create thread.' });
    }
});

// API endpoint to run the assistant
app.post('/api/run', async (req, res) => {
    const { assistantName, instructions } = req.body;
    try {
        const messages = await run_named_assistant(assistantName, instructions);
        res.json({ messages });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to run assistant.' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
