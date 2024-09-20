// server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import fs from 'fs';
import { URL } from 'url';

// Load environment variables
dotenv.config();

// Determine __dirname since it's not available in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Middleware to parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to create or get an assistant
app.post('/api/assistant', async (req, res) => {
    state = req.body;
    let instructions = ""
    try {
        const assistant = await create_or_get_assistant(state.assistant_name, state.user_message);
        console.log("Got assistant: " + assistant.id)
        if (assistant != null) {
            state.assistant_id = assistant.id;
            state.assistant_name = assistant.name;
        }

        let message = `got Assistant ${state.assistant_name} : ${JSON.stringify(assistant)}`;
        res.status(200).json({ "message": message, "state": state });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to create or get assistant.', "state": state });
    }
});

// API endpoint to create a thread
app.post('/api/thread', async (req, res) => {
    state = req.body;
    try {
        let response = await create_thread();
        console.log("create_thread response: " + JSON.stringify(response));
        state.thread_id = response.id;

        res.status(200).json({ message: `got thread ${state.thread_id}`, "state": state });
    }
    catch (error) {
        console.log(error);
        res.status(500).json({ message: 'Thread Create failed', "state": state });
    }
});

// API endpoint to run the assistant
app.post('/api/run', async (req, res) => {
    state = req.body;
    try {
        const messages = await run_agent()
        res.json({ message: messages, "state": state });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to run assistant.', "state": state });
    }
});

// API endpoint to list all assistants
app.get('/api/assistants', async (req, res) => {
    state = req.data;
    try {
        const { assistants } = await create_or_get_assistant(); // Adjust based on actual implementation
        res.json({ message: assistants, state: state });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to retrieve assistants.', state: state });
    }
});
let assistants = {}
//let tools = [{ role:"function", type: "code_interpreter" }, { role:"function",type: "retrieval" }]
let tools = [];


const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});
// Define global variables focus to keep track of the assistant, file, thread and run
let state = { assistant_id: "", assistant_name: "", dir_path: "", news_path: "", thread_id: "", user_message: "", run_id: "", run_status: "", vector_store_id: "" };

// requires action is a special case where we need to call a function
async function get_and_run_tool(response) {
    let thread_id = state.thread_id;
    let run_id = state.run_id;
    // extract function to be called from response
    const toolCalls = response.required_action.submit_tool_outputs.tool_calls;
    let toolOutputs = []
    let functions_available = await getFunctions();
    for (let toolCall of toolCalls) {
        console.log("toolCall: " + JSON.stringify(toolCall));
        let functionName = toolCall.function.name;
        // get function from functions_available
        let functionToExecute = functions_available[`${functionName}`];

        if (functionToExecute.execute) {
            let args = JSON.parse(toolCall.function.arguments);
            let argsArray = Object.keys(args).map((key) => args[key]);
            // insert as first argument pointer to memoryDB
            // check if functionToExecute contains match to  store_in_memory   

            let functionResponse = await functionToExecute.execute(...argsArray);
            toolOutputs.push({
                tool_call_id: toolCall.id,
                output: JSON.stringify(functionResponse)
            });
            let text = JSON.stringify({ message: `function ${functionName} called`, state: state });
            await openai.beta.threads.runs.submitToolOutputs(
                thread_id,
                run_id,
                {
                    tool_outputs: toolOutputs
                }
            );
            console.log(`FunctionResponse from ${functionName}:  ${JSON.stringify(functionResponse)}`);
        }
        continue;
    }
}
function extract_assistant_id(data) {
    let assistant_id = "";
    if (data.length > 0) {
        assistant_id = data[0].id;
        tools = data[0].tools
        // loop over assistants and extract all the assistants into a dictionary
        for (let assistant of data) {
            assistants[assistant.name] = assistant;
        }
    }

    console.log("got assistant_id: " + assistant_id);
    return { assistant_id: assistant_id, tools: tools }
}

async function create_or_get_assistant(name, instructions) {
    const response = await openai.beta.assistants.list({
        order: "desc",
        limit: 20,
    })
    // loop over all assistants and find the one with the name name
    let assistant = {};
    for (let obj in response.data) {
        assistant = response.data[obj];
        // change assistant.name to small letters
        if (assistant.name != null) {
            if (assistant.name.toLowerCase() == name.toLowerCase()) {
                state.assistant_id = assistant.id;
                tools = assistant.tools;  // get the tool
                break
            }
        }
    }
    if (state.assistant_id == "") {
        assistant = await openai.beta.assistants.create({
            name: name,
            instructions: instructions,
            tools: tools,
            model: "gpt-4-1106-preview",
        });
        state.assistant_id = assistant.id
        state.assistant_name = name;
    }
    return assistant;
}
// create a new thread

async function create_thread() {
    // do we need an intitial system message on the thread?
    let response = await openai.beta.threads.create(
        /*messages=[
        {
          "role": "user",
          "content": "Create data visualization based on the trends in this file.",
          "file_ids": [state.file_id]
        }
      ]*/
    )
    state.thread_id = response.id;
    return response;
}

async function getFunctions() {
    const files = fs.readdirSync(path.resolve(__dirname, "./functions"));
    const openAIFunctions = {};

    for (const file of files) {
        if (file.endsWith(".js")) {
            const moduleName = file.slice(0, -3);
            const modulePath = `./functions/${moduleName}.js`;
            const { details, execute } = await import(modulePath);

            openAIFunctions[moduleName] = {
                "details": details,
                "execute": execute
            };
        }
    }
    return openAIFunctions;
}


const run_named_assistant = async (name, instructions) => {
    // this puts a message onto a thread and then runs the assistant on that thread
    let run_id;
    let messages = [];
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
    });
    // check if we have a thread_id
    if (state.thread_id == "") {
        // get a new thread to operate on
        let thread = await openai.beta.threads.create()
        state.thread_id = thread.id;
    }


    if (state.assistant_id == "") {
        // get assistant id
        const response = await openai.beta.assistants.list({
            order: "desc",
            limit: 10,
        })
        // loop over all assistants and find the one with the name name
        for (let obj in response.data) {
            let assistant = response.data[obj];
            // change assistant.name to small letters
            if (assistant.name.toLowerCase() == name) {
                state.assistant_id = assistant.id;
                break
            }
        }
    }



    async function runAssistant() {
        try {
            await openai.beta.threads.messages.create(state.thread_id,
                {
                    role: "user",
                    content: user_instructions,
                })
            let run = await openai.beta.threads.runs.create(state.thread_id, {
                assistant_id: state.assistant_id
            })
            state.run_id = run.id;
            get_run_status(state.thread_id, state.run_id, messages);
            let message = await openai.beta.threads.messages.list(thread_id)
            await addLastMessagetoArray(message, messages)
        }
        catch (error) {
            console.log(error);
            return error;
        }
    }
    async function get_run_status(thread_id, run_id, messages) {
        try {
            let runStatus = await openai.beta.threads.runs.retrieve(thread_id, run_id);
            while (runStatus.status !== 'completed') {
                await new Promise(resolve => setTimeout(resolve, 500)); // Wait for 1 second
                runStatus = await openai.beta.threads.runs.retrieve(thread_id, run_id);
            }

            //await openai.beta.threads.del(thread_id)
        }
        catch (error) {
            console.log(error);
            return error;
        }
    }
    async function addLastMessagetoArray(message, messages) {
        messages.push(message.data[0].content[0].text.value)
        console.log("PRINTING MESSAGES: ");
        console.log(message.data[0].content[0].text.value)
    }

    await runAssistant();
    // delete the thread

    return messages;
}
// runs the assistant assuming thread and assistant exist already
async function run_agent() {
    try {
        let thread_id = state.thread_id;
        let message = state.user_message;
        console.log(`In run_agent state: ${JSON.stringify(state)}`)
        await openai.beta.threads.messages.create(thread_id,
            {
                role: "user",
                content: message,
            })
        // run and poll thread V2 API feature
        let run = await openai.beta.threads.runs.createAndPoll(thread_id, {
            assistant_id: state.assistant_id
        })
        let run_id = run.id;
        state.run_id = run_id;

        // now retrieve the messages
        let messages = await openai.beta.threads.messages.list(thread_id);
        messages = messages.data;
        let message_content = messages[0].content[0].text.value
        return message_content;

    }
    catch (error) {
        console.log(error);
        return error;
    }
}
const write_assistant_function = async (name, instructions) => {

    let text = `
    import OpenAI from 'openai';
    import fs from 'fs';
    import { get } from 'http';
    import { run_named_assistant } from '../write_run_named_assistant.js';

    const execute = async (name, instructions) => {
        let message = await run_named_assistant("${name}", instructions);
        return message;
    }

    const details = {
        "name": "${name}",
        "parameters": {
        "type": "object",
        "properties": {
            "name": {
            "type": "string",
            "description": "The name of the tool. eg writer"
            },
            "instructions": {
            "type": "string",
            "description": "The instructions to the assistant. eg Write a story about a dog"
            }
        },
        "required": [
            "name",
            "instructions"
        ]
        },
        "description": "This is a ${name} assistant that follows instructions"
    }
    export { execute, details }; `

    // write a file with the name of the assistant
    fs.writeFile(`functions/${name}.js`, text, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
    });
    return `The ${name} assistant has been created.`
}
const write_tool_function = async (toolname, thefunc) => {

    let text = `
    ${thefunc}
    const details = {
        "name": "${toolname}",
        "parameters": {
            "type": "object",
            "properties": {
                "input": {
                    "type": "array",
                    "items": {
                        "type": "number"
                    },
                    "description": "An array of numbers to be summed."
                }
            },
        "required": ["input"],
        "description": "This function ${toolname} executes the task spe."
        }
    }

    const details = {
        "name": "${toolname}",
        "parameters": {
            "type": "array",
            "items": {
                "type": "number",
                "description": "Array of numbers to process"
            },
            "description": "An array of numbers for the tool to process"
        },
        "description": "This is a ${toolname} that processes an array of numbers and outputs a result as a string"
    }
    export { execute, details }; `

    // write a file with the name of the assistant
    fs.writeFile(`functions/${toolname}.js`, text, (err) => {
        if (err) throw err;
        console.log('The file has been saved!');
    });
    // load it into the tools 

    console.log(`The ${toolname} tool has been created.`);
}
// Start the server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
