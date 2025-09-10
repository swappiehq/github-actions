import { DataDogClient, EndpointUsage } from './datadog';
export interface CodeEndpoint {
    type: 'endpoint';
    language: string;
    file: string;
    start_line: number;
    end_line: number;
    snippet: string;
    method: string;
    route: string;
    handler_name: string | null;
    framework_hint: string;
    confidence: number;
}
export declare const isCodeEndpoint: (item: any) => item is CodeEndpoint;
export interface CodeFunction {
    type: 'function';
    language: string;
    file: string;
    start_line: number;
    end_line: number;
    snippet: string;
    function_name: string;
    is_exported: boolean;
    references: string[];
    confidence: number;
}
export interface OrphanedCode {
    item: CodeEndpoint | CodeFunction;
    reason: string;
    confidence: number;
    last_accessed?: string;
    usage_count?: number;
}
export interface AnalysisResult {
    orphaned_endpoints: OrphanedCode[];
    orphaned_functions: OrphanedCode[];
    active_endpoints: EndpointUsage[];
    summary: {
        total_endpoints: number;
        total_functions: number;
        orphaned_count: number;
        confidence_threshold: number;
        analysis_mode: string;
    };
}
export declare class OrphanedCodeDetector {
    private excludePaths;
    private confidenceThreshold;
    private readonly languageMap;
    constructor(excludePaths?: string[], confidenceThreshold?: number);
    analyzeRepository(workspacePath: string, mode: 'full' | 'pr', dataDogClient?: DataDogClient, serviceName?: string, timeRange?: string): Promise<AnalysisResult>;
    private scanDirectory;
    private analyzeFile;
    private extractEndpoint;
    private extractFunction;
    private findFunctionReferences;
    private findOrphanedEndpointsWithDataDog;
    private findOrphanedEndpointsStatic;
    private findOrphanedFunctionsWithLogs;
    private findOrphanedFunctionsStatic;
    private normalizeRoute;
    private detectLanguage;
    private shouldSkipDirectory;
    private shouldProcessFile;
}
