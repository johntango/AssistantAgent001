// this is the function that runs the writer assistant




const __dirname = new URL('.', import.meta.url).pathname;


export { openai, __dirname, state, assistants, tools, get_and_run_tool, extract_assistant_id, create_or_get_assistant, create_thread, getFunctions, run_named_assistant, run_agent, write_assistant_function, write_tool_function };