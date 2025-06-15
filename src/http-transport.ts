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
                methods: ['GET', 'POST', 'OPTIONS'],
                allowedHeaders: ['Content-Type', 'Authorization'],
            }),
        )
        this.app.use(express.json({ limit: '10mb' }))
        this.app.use(express.urlencoded({ extended: true }))
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

        // Root endpoint with server info
        this.app.get('/', (req: Request, res: Response) => {
            res.json({
                name: 'Todoist MCP Server',
                version: '1.0.2',
                description: 'HTTP-based Model Context Protocol server for Todoist',
                endpoints: {
                    health: '/health',
                    rpc: '/rpc',
                    tools: '/tools',
                },
                usage: {
                    listTools: 'GET /tools',
                    callTool:
                        'POST /rpc with {"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"toolName","arguments":{}}}',
                },
            })
        })

        // List available tools
        this.app.get('/tools', async (req: Request, res: Response) => {
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
                    error: 'Failed to list tools',
                    details: error instanceof Error ? error.message : 'Unknown error',
                })
            }
        })

        // Main RPC endpoint
        this.app.post('/rpc', async (req: Request, res: Response) => {
            try {
                const request: JSONRPCRequest = req.body

                if (!this.isValidJSONRPCRequest(request)) {
                    return res.status(400).json({
                        jsonrpc: '2.0',
                        id: (req.body as { id?: string | number })?.id || null,
                        error: {
                            code: -32600,
                            message: 'Invalid Request',
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

        // Handle tool execution directly
        this.app.post('/tools/:toolName', async (req: Request, res: Response) => {
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
                    error: 'Tool execution failed',
                    details: error instanceof Error ? error.message : 'Unknown error',
                })
            }
        })
    }

    private isValidJSONRPCRequest(request: unknown): request is JSONRPCRequest {
        return (
            request &&
            typeof request === 'object' &&
            (request as { jsonrpc?: string }).jsonrpc === '2.0' &&
            typeof (request as { method?: unknown }).method === 'string' &&
            ((request as { id?: unknown }).id === null ||
                typeof (request as { id?: unknown }).id === 'string' ||
                typeof (request as { id?: unknown }).id === 'number')
        )
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

                case 'initialize':
                    return {
                        jsonrpc: '2.0',
                        id: request.id,
                        result: {
                            protocolVersion: '2024-11-05',
                            capabilities: {
                                tools: {},
                            },
                            serverInfo: {
                                name: 'Todoist MCP Server',
                                version: '1.0.2',
                            },
                        },
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
