import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js'
import cors from 'cors'
import express, { type Request, type Response } from 'express'

interface JSONRPCErrorResponse {
    jsonrpc: '2.0'
    id: string | number | null
    error: {
        code: number
        message: string
        data?: unknown
    }
}

interface MCPMessage {
    jsonrpc: '2.0'
    id?: string | number
    method?: string
    params?: unknown
    result?: unknown
    error?: {
        code: number
        message: string
        data?: unknown
    }
}

export class HttpServerTransport {
    private app: express.Application
    private server: McpServer
    private port: number

    constructor(server: McpServer, port = 3000) {
        this.server = server
        this.port = port
        this.app = express()
        this.setupMiddleware()
        this.setupRoutes()
    }

    private setupMiddleware() {
        this.app.use(
            cors({
                origin: '*',
                methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
                allowedHeaders: [
                    'Content-Type',
                    'Authorization',
                    'MCP-Session-ID',
                    'Last-Event-ID',
                ],
                exposedHeaders: ['MCP-Session-ID'],
            }),
        )
        this.app.use(express.json({ limit: '10mb' }))
        this.app.use(express.urlencoded({ extended: true }))

        // Add content-type validation for JSON-RPC requests
        this.app.use((req, res, next) => {
            if (
                (req.method === 'POST' && req.path === '/') ||
                req.path === '/rpc' ||
                req.path === '/message'
            ) {
                if (!req.is('application/json')) {
                    return res.status(415).json({
                        jsonrpc: '2.0',
                        id: null,
                        error: {
                            code: -32700,
                            message: 'Parse error - Content-Type must be application/json',
                        },
                    })
                }
            }
            next()
        })
    }

    private setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                service: 'todoist-mcp-server',
            })
        })

        // Root endpoint with server info and MCP capabilities
        this.app.get('/', (req: Request, res: Response) => {
            res.setHeader('Content-Type', 'application/json')
            res.json({
                name: 'Todoist MCP Server',
                version: '1.0.2',
                description: 'HTTP-based Model Context Protocol server for Todoist',
                protocol: {
                    version: '2024-11-05',
                    capabilities: {
                        tools: {},
                        logging: {},
                    },
                },
                endpoints: {
                    health: '/health',
                    mcp: '/ (POST for JSON-RPC)',
                    rpc: '/rpc (alias for JSON-RPC)',
                    tools: '/tools (GET for tool list)',
                    sse: '/sse (Server-Sent Events)',
                    message: '/message (POST for MCP messages)',
                },
                usage: {
                    listTools: 'GET /tools',
                    callTool:
                        'POST / with {"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"toolName","arguments":{}}}',
                    initialize:
                        'POST / with {"jsonrpc":"2.0","id":"1","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"YourClient","version":"1.0.0"}}}',
                },
                transport: 'HTTP with JSON-RPC 2.0 and optional SSE streaming',
            })
        })

        // MCP JSON-RPC endpoint - handle POST requests to root path
        this.app.post('/', async (req: Request, res: Response) => {
            res.setHeader('Content-Type', 'application/json')

            try {
                const request: JSONRPCRequest = req.body

                if (!this.isValidJSONRPCRequest(request)) {
                    return res.status(400).json({
                        jsonrpc: '2.0',
                        id: (req.body as JSONRPCRequest)?.id || null,
                        error: {
                            code: -32600,
                            message: 'Invalid Request - must be valid JSON-RPC 2.0',
                        },
                    })
                }

                const response = await this.handleMCPRequest(request)
                res.json(response)
            } catch (error) {
                console.error('Error handling MCP request:', error)
                res.status(500).json({
                    jsonrpc: '2.0',
                    id: null,
                    error: {
                        code: -32603,
                        message: 'Internal error',
                        data: error instanceof Error ? error.message : 'Unknown error',
                    },
                })
            }
        })

        // List available tools - MCP compliant endpoint
        this.app.get('/tools', async (req: Request, res: Response) => {
            res.setHeader('Content-Type', 'application/json')

            try {
                console.log('Tools request - server object keys:', Object.keys(this.server))
                console.log(
                    'Tools request - checking _tools:',
                    (this.server as unknown as { _tools: unknown })._tools,
                )
                console.log(
                    'Tools request - checking _toolHandlers:',
                    (this.server as unknown as { _toolHandlers: unknown })._toolHandlers,
                )
                console.log(
                    'Tools request - all server properties:',
                    Object.getOwnPropertyNames(this.server),
                )

                const response = await this.handleMCPRequest({
                    jsonrpc: '2.0',
                    id: 'tools-list',
                    method: 'tools/list',
                    params: {},
                })
                res.json(response)
            } catch (error) {
                console.error('Error listing tools:', error)
                res.status(500).json({
                    jsonrpc: '2.0',
                    id: 'tools-list',
                    error: {
                        code: -32603,
                        message: 'Failed to list tools',
                        data: error instanceof Error ? error.message : 'Unknown error',
                    },
                })
            }
        })

        // Main RPC endpoint (alias for root POST)
        this.app.post('/rpc', async (req: Request, res: Response) => {
            res.setHeader('Content-Type', 'application/json')

            try {
                const request: JSONRPCRequest = req.body

                if (!this.isValidJSONRPCRequest(request)) {
                    return res.status(400).json({
                        jsonrpc: '2.0',
                        id: (req.body as { id?: string | number })?.id || null,
                        error: {
                            code: -32600,
                            message: 'Invalid Request - must be valid JSON-RPC 2.0',
                        },
                    })
                }

                const response = await this.handleMCPRequest(request)
                res.json(response)
            } catch (error) {
                console.error('RPC Error:', error)
                res.status(500).json({
                    jsonrpc: '2.0',
                    id: req.body?.id || null,
                    error: {
                        code: -32603,
                        message: 'Internal error',
                        data: error instanceof Error ? error.message : 'Unknown error',
                    },
                })
            }
        })

        // Handle tool execution directly (convenience endpoint)
        this.app.post('/tools/:toolName', async (req: Request, res: Response) => {
            res.setHeader('Content-Type', 'application/json')

            try {
                const { toolName } = req.params
                const args = req.body

                const response = await this.handleMCPRequest({
                    jsonrpc: '2.0',
                    id: `tool-${Date.now()}`,
                    method: 'tools/call',
                    params: {
                        name: toolName,
                        arguments: args,
                    },
                })

                res.json(response)
            } catch (error) {
                console.error('Tool execution error:', error)
                res.status(500).json({
                    jsonrpc: '2.0',
                    id: `tool-${Date.now()}`,
                    error: {
                        code: -32603,
                        message: 'Tool execution failed',
                        data: error instanceof Error ? error.message : 'Unknown error',
                    },
                })
            }
        })

        // OAuth authorization server discovery endpoint for MCP
        this.app.get('/.well-known/oauth-authorization-server', (req: Request, res: Response) => {
            res.json({
                issuer: `${req.protocol}://${req.get('host')}`,
                authorization_endpoint: `${req.protocol}://${req.get('host')}/oauth/authorize`,
                token_endpoint: `${req.protocol}://${req.get('host')}/oauth/token`,
                response_types_supported: ['code'],
                grant_types_supported: ['authorization_code'],
                code_challenge_methods_supported: ['S256'],
                scopes_supported: ['mcp:read', 'mcp:write'],
            })
        })

        // OAuth authorization endpoint
        this.app.get('/oauth/authorize', (req: Request, res: Response) => {
            // For now, auto-approve all requests
            const { client_id, redirect_uri, code_challenge, state } = req.query
            const authCode = `mcp_auth_${Date.now()}`

            const redirectUrl = new URL(redirect_uri as string)
            redirectUrl.searchParams.set('code', authCode)
            if (state) redirectUrl.searchParams.set('state', state as string)

            res.redirect(redirectUrl.toString())
        })

        // OAuth token endpoint
        this.app.post('/oauth/token', (req: Request, res: Response) => {
            const { grant_type, code } = req.body

            if (grant_type === 'authorization_code' && code?.startsWith('mcp_auth_')) {
                res.json({
                    access_token: `mcp_token_${Date.now()}`,
                    token_type: 'Bearer',
                    expires_in: 3600,
                    scope: 'mcp:read mcp:write',
                })
            } else {
                res.status(400).json({
                    error: 'invalid_grant',
                    error_description: 'Invalid authorization code',
                })
            }
        })

        // MCP Client registration endpoint
        this.app.post('/register', (req: Request, res: Response) => {
            const { client_id, redirect_uris, client_name } = req.body

            // For simplicity, auto-approve all client registrations
            res.json({
                client_id: client_id || `mcp_client_${Date.now()}`,
                client_secret: `mcp_secret_${Date.now()}`,
                registration_access_token: `mcp_reg_token_${Date.now()}`,
                registration_client_uri: `${req.protocol}://${req.get('host')}/register/${client_id}`,
                client_id_issued_at: Math.floor(Date.now() / 1000),
                client_secret_expires_at: 0, // Never expires
                redirect_uris: redirect_uris || [`${req.protocol}://${req.get('host')}/callback`],
                grant_types: ['authorization_code'],
                response_types: ['code'],
                client_name: client_name || 'MCP Client',
                token_endpoint_auth_method: 'client_secret_post',
            })
        })

        // MCP Server-Sent Events endpoint for streaming responses
        this.app.get('/sse', (req: Request, res: Response) => {
            // Set SSE headers per MCP specification
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Cache-Control, Authorization, MCP-Session-ID',
                'MCP-Session-ID': `mcp-session-${Date.now()}`,
            })

            // Send MCP protocol initialization message
            const sendMessage = (message: MCPMessage) => {
                res.write(`data: ${JSON.stringify(message)}\n\n`)
            }

            // Send MCP initialization response
            sendMessage({
                jsonrpc: '2.0',
                id: 'server-init',
                result: {
                    protocolVersion: '2024-11-05',
                    capabilities: {
                        tools: {},
                        logging: {},
                    },
                    serverInfo: {
                        name: 'Todoist MCP Server',
                        version: '1.0.2',
                    },
                },
            })

            // Send periodic heartbeat to keep connection alive
            const keepAlive = setInterval(() => {
                res.write('event: ping\n')
                res.write(
                    `data: {"type":"heartbeat","timestamp":"${new Date().toISOString()}"}\n\n`,
                )
            }, 30000)

            // Handle client disconnect
            req.on('close', () => {
                clearInterval(keepAlive)
                res.end()
            })

            req.on('error', (error) => {
                console.error('SSE connection error:', error)
                clearInterval(keepAlive)
                res.end()
            })
        })

        // MCP message endpoint for client to send JSON-RPC messages
        this.app.post('/message', async (req: Request, res: Response) => {
            res.setHeader('Content-Type', 'application/json')

            try {
                const request: JSONRPCRequest = req.body

                if (!this.isValidJSONRPCRequest(request)) {
                    return res.status(400).json({
                        jsonrpc: '2.0',
                        id: (req.body as JSONRPCRequest)?.id || null,
                        error: {
                            code: -32600,
                            message: 'Invalid Request - must be valid JSON-RPC 2.0',
                        },
                    })
                }

                const response = await this.handleMCPRequest(request)
                res.json(response)
            } catch (error) {
                console.error('MCP Message Error:', error)
                res.status(500).json({
                    jsonrpc: '2.0',
                    id: req.body?.id || null,
                    error: {
                        code: -32603,
                        message: 'Internal error',
                        data: error instanceof Error ? error.message : 'Unknown error',
                    },
                })
            }
        })
    }

    private isValidJSONRPCRequest(request: unknown): request is JSONRPCRequest {
        if (!request || typeof request !== 'object') {
            return false
        }

        const req = request as {
            jsonrpc?: string
            method?: unknown
            id?: unknown
            params?: unknown
        }

        // Must have jsonrpc: "2.0"
        if (req.jsonrpc !== '2.0') {
            return false
        }

        // Must have a method for requests
        if (typeof req.method !== 'string' || req.method.length === 0) {
            return false
        }

        // ID must be string, number, or null
        if (req.id !== null && typeof req.id !== 'string' && typeof req.id !== 'number') {
            return false
        }

        return true
    }

    private async handleMCPRequest(
        request: JSONRPCRequest,
    ): Promise<JSONRPCResponse | JSONRPCErrorResponse> {
        try {
            switch (request.method) {
                case 'tools/list': {
                    // Access the tools from the server's internal registry
                    const registeredTools = (
                        this.server as unknown as { _registeredTools: unknown }
                    )._registeredTools
                    console.log('=== TOOLS DEBUG ===')
                    console.log('registeredTools type:', typeof registeredTools)
                    console.log('registeredTools:', registeredTools)
                    console.log('registeredTools constructor:', registeredTools?.constructor?.name)
                    console.log(
                        'registeredTools keys:',
                        registeredTools ? Object.keys(registeredTools) : 'null',
                    )

                    let toolsList: Array<{
                        name: string
                        description: string
                        inputSchema: unknown
                    }> = []

                    if (registeredTools) {
                        // Try different ways to access the tools
                        if (Array.isArray(registeredTools)) {
                            console.log('registeredTools is an array')
                            toolsList = registeredTools.map(
                                (tool: {
                                    name: string
                                    description: string
                                    inputSchema?: unknown
                                }) => ({
                                    name: tool.name,
                                    description: tool.description,
                                    inputSchema: tool.inputSchema || {
                                        type: 'object',
                                        properties: {},
                                    },
                                }),
                            )
                        } else if (registeredTools instanceof Map) {
                            console.log('registeredTools is a Map')
                            toolsList = Array.from(registeredTools.values()).map(
                                (tool: {
                                    name: string
                                    description: string
                                    inputSchema?: unknown
                                }) => ({
                                    name: tool.name,
                                    description: tool.description,
                                    inputSchema: tool.inputSchema || {
                                        type: 'object',
                                        properties: {},
                                    },
                                }),
                            )
                        } else if (typeof registeredTools === 'object') {
                            console.log('registeredTools is an object')
                            toolsList = Object.entries(registeredTools).map(
                                ([toolName, tool]: [
                                    string,
                                    { description: string; inputSchema?: { _def?: unknown } },
                                ]) => {
                                    // Convert Zod schema to JSON schema if available
                                    let jsonSchema: {
                                        type: string
                                        properties: Record<string, unknown>
                                        description?: string
                                    } = { type: 'object', properties: {} }
                                    if (
                                        tool.inputSchema &&
                                        typeof tool.inputSchema._def === 'object'
                                    ) {
                                        try {
                                            // For now, use a simple fallback schema
                                            jsonSchema = {
                                                type: 'object',
                                                properties: {},
                                                description: 'Tool parameters',
                                            }
                                        } catch (error) {
                                            console.log(
                                                'Error converting Zod schema for',
                                                toolName,
                                                ':',
                                                error,
                                            )
                                        }
                                    }

                                    return {
                                        name: toolName,
                                        description: tool.description,
                                        inputSchema: jsonSchema,
                                    }
                                },
                            )
                        }
                    }

                    console.log('Final toolsList:', toolsList)
                    console.log('=== END TOOLS DEBUG ===')

                    return {
                        jsonrpc: '2.0',
                        id: request.id,
                        result: { tools: toolsList },
                    }
                }

                case 'tools/call': {
                    const { name, arguments: args } = request.params as {
                        name: string
                        arguments: unknown
                    }
                    const toolsRegistry = (this.server as unknown as { _registeredTools: unknown })
                        ._registeredTools

                    console.log('=== TOOL CALL DEBUG ===')
                    console.log('Calling tool:', name)
                    console.log('With args:', args)
                    console.log('toolsRegistry type:', typeof toolsRegistry)
                    console.log('toolsRegistry:', toolsRegistry)

                    let tool: { callback?: (args: unknown) => Promise<unknown> } | null = null

                    if (toolsRegistry instanceof Map) {
                        tool = toolsRegistry.get(name)
                        console.log('Found tool via Map.get:', tool)
                    } else if (typeof toolsRegistry === 'object' && toolsRegistry) {
                        tool = (toolsRegistry as Record<string, unknown>)[name] as {
                            callback?: (args: unknown) => Promise<unknown>
                        } | null
                        console.log('Found tool via object access:', tool)
                    }

                    console.log('Final tool:', tool)
                    console.log('=== END TOOL CALL DEBUG ===')

                    if (tool?.callback) {
                        try {
                            const result = (await tool.callback(args || {})) as {
                                content?: unknown
                                [key: string]: unknown
                            }
                            return {
                                jsonrpc: '2.0',
                                id: request.id,
                                result,
                            }
                        } catch (toolError) {
                            console.error('Tool execution error:', toolError)
                            return {
                                jsonrpc: '2.0',
                                id: request.id,
                                error: {
                                    code: -32603,
                                    message: `Tool execution failed: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`,
                                },
                            } as JSONRPCErrorResponse
                        }
                    } else {
                        return {
                            jsonrpc: '2.0',
                            id: request.id,
                            error: {
                                code: -32601,
                                message: `Tool not found: ${name}`,
                            },
                        } as JSONRPCErrorResponse
                    }
                }

                case 'initialize': {
                    const params = request.params as {
                        protocolVersion: string
                        capabilities: Record<string, unknown>
                        clientInfo: { name: string; version: string }
                    }

                    // Validate protocol version
                    if (params.protocolVersion !== '2024-11-05') {
                        return {
                            jsonrpc: '2.0',
                            id: request.id,
                            error: {
                                code: -32602,
                                message: `Unsupported protocol version: ${params.protocolVersion}. Expected: 2024-11-05`,
                            },
                        } as JSONRPCErrorResponse
                    }

                    console.log('MCP Client initialized:', params.clientInfo)

                    return {
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: {
                                tools: {},
                                logging: {},
                            },
                            serverInfo: {
                                name: 'Todoist MCP Server',
                                version: '1.0.2',
                            },
                        },
                    }
                }

                case 'ping':
                    return {
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {},
                    }

                case 'notifications/initialized':
                    // Client has finished initialization
                    console.log('MCP Client initialization complete')
                    return {
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {},
                    }

                default:
                    return {
                        jsonrpc: '2.0',
                        id: request.id,
                        error: {
                            code: -32601,
                            message: `Method not found: ${request.method}`,
                        },
                    } as JSONRPCErrorResponse
            }
        } catch (error) {
            console.error('Error handling MCP request:', error)
            return {
                jsonrpc: '2.0',
                id: request.id,
                error: {
                    code: -32603,
                    message: 'Internal error',
                    data: error instanceof Error ? error.message : 'Unknown error',
                },
            } as JSONRPCErrorResponse
        }
    }

    public async start(): Promise<void> {
        return new Promise((resolve) => {
            const httpServer = this.app.listen(this.port, '0.0.0.0', () => {
                console.log(`🚀 Todoist MCP Server running on port ${this.port}`)
                console.log(`📋 Health check: http://localhost:${this.port}/health`)
                console.log(`📖 API docs: http://localhost:${this.port}/`)
                console.log(`🔧 Tools list: http://localhost:${this.port}/tools`)
                resolve()
            })

            // Graceful shutdown
            const shutdown = () => {
                console.log('Shutting down gracefully...')
                httpServer.close(() => {
                    process.exit(0)
                })
            }

            process.on('SIGTERM', shutdown)
            process.on('SIGINT', shutdown)
        })
    }
}
