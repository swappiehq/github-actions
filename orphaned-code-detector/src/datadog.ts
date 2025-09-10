import axios, { AxiosInstance } from 'axios';

export interface DataDogConfig {
  apiKey: string;
  appKey: string;
  site: string;
}

export interface APMTrace {
  trace_id: string;
  span_id: string;
  resource: string;
  service: string;
  operation_name: string;
  start_time: number;
  duration: number;
  tags: { [key: string]: string };
}

export interface LogEntry {
  timestamp: string;
  message: string;
  service: string;
  source: string;
  tags: { [key: string]: string };
  attributes: { [key: string]: any };
}

export interface EndpointUsage {
  endpoint: string;
  method: string;
  hitCount: number;
  lastAccessed: string;
  avgResponseTime: number;
}

export class DataDogClient {
  private client: AxiosInstance;
  private config: DataDogConfig;

  constructor(config: DataDogConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `https://api.${config.site}`,
      headers: {
        'DD-API-KEY': config.apiKey,
        'DD-APPLICATION-KEY': config.appKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
  }

  async getAPMTraces(serviceName: string, timeRange: string): Promise<APMTrace[]> {
    try {
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - this.parseTimeRange(timeRange);

      const response = await this.client.get('/api/v1/traces/search', {
        params: {
          service: serviceName,
          start: startTime,
          end: endTime,
          limit: 1000
        }
      });

      return response.data.traces || [];
    } catch (error) {
      throw new Error(`Failed to fetch APM traces: ${error}`);
    }
  }

  async getLogs(serviceName: string, timeRange: string, query?: string): Promise<LogEntry[]> {
    try {
      const endTime = Math.floor(Date.now() / 1000);
      const startTime = endTime - this.parseTimeRange(timeRange);

      const searchQuery = query
        ? `service:${serviceName} ${query}`
        : `service:${serviceName}`;

      const response = await this.client.post('/api/v1/logs-queries/list', {
        query: searchQuery,
        time: {
          from: `${startTime}000`,
          to: `${endTime}000`
        },
        limit: 1000
      });

      return response.data.logs || [];
    } catch (error) {
      throw new Error(`Failed to fetch logs: ${error}`);
    }
  }

  async getEndpointUsage(serviceName: string, timeRange: string): Promise<EndpointUsage[]> {
    try {
      const traces = await this.getAPMTraces(serviceName, timeRange);
      const endpointMap = new Map<string, {
        hitCount: number;
        lastAccessed: number;
        totalResponseTime: number;
        method: string;
      }>();

      traces.forEach(trace => {
        if (trace.resource && trace.tags) {
          const method = trace.tags['http.method'] || 'UNKNOWN';
          const endpoint = this.normalizeEndpoint(trace.resource, method);
          const key = `${method}:${endpoint}`;

          if (!endpointMap.has(key)) {
            endpointMap.set(key, {
              hitCount: 0,
              lastAccessed: 0,
              totalResponseTime: 0,
              method
            });
          }

          const usage = endpointMap.get(key)!;
          usage.hitCount++;
          usage.lastAccessed = Math.max(usage.lastAccessed, trace.start_time);
          usage.totalResponseTime += trace.duration;
        }
      });

      return Array.from(endpointMap.entries()).map(([key, usage]) => {
        const endpoint = key.split(':')[1];
        return {
          endpoint,
          method: usage.method,
          hitCount: usage.hitCount,
          lastAccessed: new Date(usage.lastAccessed * 1000).toISOString(),
          avgResponseTime: usage.totalResponseTime / usage.hitCount
        };
      });
    } catch (error) {
      throw new Error(`Failed to get endpoint usage: ${error}`);
    }
  }

  private parseTimeRange(timeRange: string): number {
    const match = timeRange.match(/^(\d+)([hdwM])$/);
    if (!match) {
      throw new Error(`Invalid time range format: ${timeRange}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'h': return value * 3600;
      case 'd': return value * 86400;
      case 'w': return value * 604800;
      case 'M': return value * 2592000; // 30 days
      default: throw new Error(`Unsupported time unit: ${unit}`);
    }
  }

  private normalizeEndpoint(resource: string, method: string): string {
    // Remove query parameters and normalize path
    let endpoint = resource.split('?')[0];

    // Replace common ID patterns with placeholders
    endpoint = endpoint.replace(/\/\d+(?=\/|$)/g, '/:id');
    endpoint = endpoint.replace(/\/[a-f0-9-]{36}(?=\/|$)/g, '/:uuid');
    endpoint = endpoint.replace(/\/[a-f0-9]{24}(?=\/|$)/g, '/:objectId');

    return endpoint;
  }
}
