# Todoist MCP

Connect this [Model Context Protocol](https://modelcontextprotocol.io/introduction) server to your LLM to interact with Todoist.

## Functionality

This integration implements all the APIs available from the [Todoist TypeScript Client](https://doist.github.io/todoist-api-typescript/api/classes/TodoistApi/), providing access to:

### Task Management
- Create tasks (with content, descriptions, due dates, priorities, labels, and more)
- Create tasks with natural language (e.g., "Submit report by Friday 5pm #Work")
- Retrieve tasks (individual, filtered, or all tasks)
- Retrieve completed tasks (by completion date or due date)
- Get productivity statistics
- Update tasks
- Move tasks (individually or in batches)
- Close/reopen tasks
- Delete tasks

### Project Management
- Create, retrieve, update, and delete projects

### Section Management
- Create, retrieve, update, and delete sections within projects

### Comment Management
- Add, retrieve, update, and delete comments for tasks or projects

### Label Management
- Create, retrieve, update, and delete labels
- Manage shared labels

### Collaboration
- Get collaborators for projects

## Setup

**Build the server app:**

```
npm install
npm run build
```

**Configure Claude:**

You must install the [Claude](https://claude.ai/) desktop app which supports MCP.

You can get your Todoist API key from [Todoist > Settings > Integrations > Developer](https://app.todoist.com/app/settings/integrations/developer).

Then, in your `claude_desktop_config.json`, add a new MCP server:

```
{
    "mcpServers": {
        "todoist-mcp": {
            "command": "node",
            "args": ["/path/to/repo/build/index.js"],
            "env": {
                "TODOIST_API_KEY": "your_todoist_api_key"
            }
        }
    }
}
```

You can now launch Claude desktop app and ask to update Todoist.

## Distribution

### Smithery

[![smithery badge](https://smithery.ai/badge/@miottid/todoist-mcp)](https://smithery.ai/server/@miottid/todoist-mcp)

Install Todoist MCP on Claude Desktop using [Smithery](https://smithery.ai/server/@miottid/todoist-mcp):

```bash
npx -y @smithery/cli install @miottid/todoist-mcp --client claude
```

### Glama

<a href="https://glama.ai/mcp/servers/2010u29g1w">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/2010u29g1w/badge" alt="Todoist MCP server" />
</a>

## HTTP Deployment

This MCP server can also be deployed as an HTTP service for cloud hosting platforms like Railway, Heroku, or Vercel.

### Railway Deployment

1. **Deploy to Railway:**
   - Fork this repository
   - Connect your GitHub repository to Railway
   - Set the `TODOIST_API_KEY` environment variable in Railway dashboard
   - Deploy using the included Dockerfile

2. **Using the HTTP API:**

   Once deployed, you can interact with the server via HTTP:

   ```bash
   # Health check
   GET https://your-app.railway.app/health

   # List available tools
   GET https://your-app.railway.app/tools

   # Call a tool via JSON-RPC
   POST https://your-app.railway.app/rpc
   Content-Type: application/json
   
   {
     "jsonrpc": "2.0",
     "id": "1",
     "method": "tools/call",
     "params": {
       "name": "add_task",
       "arguments": {
         "content": "Review quarterly reports",
         "due_string": "tomorrow"
       }
     }
   }

   # Direct tool execution
   POST https://your-app.railway.app/tools/add_task
   Content-Type: application/json
   
   {
     "content": "Review quarterly reports",
     "due_string": "tomorrow"
   }
   ```

3. **Local Development:**
   ```bash
   npm install
   npm run build
   TODOIST_API_KEY=your_key npm start
   ```

   The server will run on `http://localhost:3000` or the port specified in `PORT` environment variable.

### Environment Variables

- `TODOIST_API_KEY` (required): Your Todoist API key
- `PORT` (optional): HTTP server port (defaults to 3000)
- `NODE_ENV` (optional): Set to "production" for production deployment