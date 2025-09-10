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
    tags: {
        [key: string]: string;
    };
}
export interface LogEntry {
    timestamp: string;
    message: string;
    service: string;
    source: string;
    tags: {
        [key: string]: string;
    };
    attributes: {
        [key: string]: any;
    };
}
export interface EndpointUsage {
    endpoint: string;
    method: string;
    hitCount: number;
    lastAccessed: string;
    avgResponseTime: number;
}
export declare class DataDogClient {
    private client;
    private config;
    constructor(config: DataDogConfig);
    getLogs(serviceName: string, timeRange: string, query?: string): Promise<LogEntry[]>;
    getEndpointUsage(serviceName: string, timeRange: string): Promise<EndpointUsage[]>;
    private parseTimeRange;
    private normalizeEndpoint;
}
