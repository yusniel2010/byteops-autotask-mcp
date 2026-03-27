// Configuration Utility
// Handles loading configuration from environment variables and MCP client arguments
// Supports gateway mode where credentials come via HTTP headers

import { McpServerConfig } from '../types/mcp.js';
import { LogLevel } from './logger.js';

export type TransportType = 'stdio' | 'http';
export type AuthMode = 'env' | 'gateway';

export interface EnvironmentConfig {
  autotask: {
    username?: string;
    secret?: string;
    integrationCode?: string;
    apiUrl?: string;
  };
  server: {
    name: string;
    version: string;
  };
  transport: {
    type: TransportType;
    port: number;
    host: string;
  };
  logging: {
    level: LogLevel;
    format: 'json' | 'simple';
  };
  auth: {
    mode: AuthMode;
  };
  lazyLoading?: boolean;
}

/**
 * Gateway credentials extracted from HTTP request headers
 * The MCP Gateway injects credentials via these headers:
 * - X-API-Key: Contains the Autotask username
 * - X-API-Secret: Contains the Autotask secret
 * - X-Integration-Code: Contains the Autotask integration code
 */
export interface GatewayCredentials {
  username: string | undefined;
  secret: string | undefined;
  integrationCode: string | undefined;
  apiUrl: string | undefined;
}

/**
 * Extract credentials from gateway-injected environment variables
 * The gateway proxies headers as environment variables:
 * - X-API-Key header -> X_API_KEY env var
 * - X-API-Secret header -> X_API_SECRET env var
 * - X-Integration-Code header -> X_INTEGRATION_CODE env var
 */
export function getCredentialsFromGateway(): GatewayCredentials {
  return {
    username: process.env.X_API_KEY || process.env.AUTOTASK_USERNAME,
    secret: process.env.X_API_SECRET || process.env.AUTOTASK_SECRET,
    integrationCode: process.env.X_INTEGRATION_CODE || process.env.AUTOTASK_INTEGRATION_CODE,
    apiUrl: process.env.X_API_URL || process.env.AUTOTASK_API_URL,
  };
}

/**
 * Parse credentials from HTTP request headers (for per-request credential handling)
 * Header names follow HTTP convention (lowercase with hyphens)
 */
export function parseCredentialsFromHeaders(headers: Record<string, string | string[] | undefined>): GatewayCredentials {
  const getHeader = (name: string): string | undefined => {
    const value = headers[name] || headers[name.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  return {
    username: getHeader('x-api-key'),
    secret: getHeader('x-api-secret'),
    integrationCode: getHeader('x-integration-code'),
    apiUrl: getHeader('x-api-url'),
  };
}

/**
 * Load configuration from environment variables
 */
export function loadEnvironmentConfig(): EnvironmentConfig {
  // Support both direct env vars and gateway-injected vars
  // Gateway vars (X_API_KEY, etc.) take precedence when in gateway mode
  const authMode = (process.env.AUTH_MODE as AuthMode) || 'env';

  // getCredentialsFromGateway falls back to AUTOTASK_* env vars internally,
  // so it works for both modes. In env mode, use AUTOTASK_* vars directly.
  const creds = authMode === 'gateway'
    ? getCredentialsFromGateway()
    : {
        username: process.env.AUTOTASK_USERNAME,
        secret: process.env.AUTOTASK_SECRET,
        integrationCode: process.env.AUTOTASK_INTEGRATION_CODE,
        apiUrl: process.env.AUTOTASK_API_URL,
      };

  // Filter out undefined values to satisfy exactOptionalPropertyTypes
  const autotaskConfig: { username?: string; secret?: string; integrationCode?: string; apiUrl?: string } = {};
  if (creds.username) autotaskConfig.username = creds.username;
  if (creds.secret) autotaskConfig.secret = creds.secret;
  if (creds.integrationCode) autotaskConfig.integrationCode = creds.integrationCode;
  if (creds.apiUrl) autotaskConfig.apiUrl = creds.apiUrl;

  const transportType = (process.env.MCP_TRANSPORT as TransportType) || 'stdio';
  if (transportType !== 'stdio' && transportType !== 'http') {
    throw new Error(`Invalid MCP_TRANSPORT value: "${transportType}". Must be "stdio" or "http".`);
  }

  return {
    autotask: autotaskConfig,
    server: {
      name: process.env.MCP_SERVER_NAME || 'autotask-mcp',
      version: process.env.MCP_SERVER_VERSION || '1.0.0'
    },
    transport: {
      type: transportType,
      port: parseInt(process.env.MCP_HTTP_PORT || '8080', 10),
      host: process.env.MCP_HTTP_HOST || '0.0.0.0'
    },
    logging: {
      level: (process.env.LOG_LEVEL as LogLevel) || 'info',
      format: (process.env.LOG_FORMAT as 'json' | 'simple') || 'simple'
    },
    auth: {
      mode: authMode
    },
    lazyLoading: process.env.LAZY_LOADING === 'true' || process.env.LAZY_LOADING === '1'
  };
}

/**
 * Merge environment config with MCP client configuration
 */
export function mergeWithMcpConfig(envConfig: EnvironmentConfig, mcpArgs?: Record<string, any>): McpServerConfig {
  // MCP client can override server configuration through arguments
  const serverConfig: McpServerConfig = {
    name: mcpArgs?.name || envConfig.server.name,
    version: mcpArgs?.version || envConfig.server.version,
    autotask: {
      username: mcpArgs?.autotask?.username || envConfig.autotask.username,
      secret: mcpArgs?.autotask?.secret || envConfig.autotask.secret,
      integrationCode: mcpArgs?.autotask?.integrationCode || envConfig.autotask.integrationCode,
      apiUrl: mcpArgs?.autotask?.apiUrl || envConfig.autotask.apiUrl
    }
  };

  return serverConfig;
}

 