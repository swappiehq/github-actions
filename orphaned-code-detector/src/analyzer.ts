import * as fs from 'fs';
import * as path from 'path';
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

export const isCodeEndpoint = (item: any): item is CodeEndpoint => {
  return item && item.type === 'endpoint';
}

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

export class OrphanedCodeDetector {
  private excludePaths: Set<string>;
  private confidenceThreshold: number;

  private readonly languageMap: { [key: string]: string } = {
    '.js': 'javascript', '.jsx': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python',
    '.java': 'java',
    '.rb': 'ruby',
    '.php': 'php',
    '.go': 'go',
    '.cs': 'csharp',
    '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp',
    '.c': 'c',
    '.rs': 'rust',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.swift': 'swift'
  };

  constructor(excludePaths: string[] = [], confidenceThreshold: number = 0.8) {
    this.excludePaths = new Set(excludePaths);
    this.confidenceThreshold = confidenceThreshold;
  }

  async analyzeRepository(workspacePath: string, mode: 'full' | 'pr', dataDogClient?: DataDogClient, serviceName?: string, timeRange?: string): Promise<AnalysisResult> {
    const endpoints: CodeEndpoint[] = [];
    const functions: CodeFunction[] = [];

    // Scan repository for endpoints and functions
    await this.scanDirectory(workspacePath, endpoints, functions);

    let orphanedEndpoints: OrphanedCode[] = [];
    let orphanedFunctions: OrphanedCode[] = [];
    let activeEndpoints: EndpointUsage[] = [];

    if (mode === 'full' && dataDogClient && serviceName) {
      // Full mode: Compare with DataDog data
      activeEndpoints = await dataDogClient.getEndpointUsage(serviceName, timeRange || '7d');
      orphanedEndpoints = this.findOrphanedEndpointsWithDataDog(endpoints, activeEndpoints);
      orphanedFunctions = this.findOrphanedFunctionsWithLogs(functions, activeEndpoints);
    } else {
      // PR mode: Static analysis only
      orphanedEndpoints = this.findOrphanedEndpointsStatic(endpoints, functions);
      orphanedFunctions = this.findOrphanedFunctionsStatic(functions, endpoints);
    }

    return {
      orphaned_endpoints: orphanedEndpoints,
      orphaned_functions: orphanedFunctions,
      active_endpoints: activeEndpoints,
      summary: {
        total_endpoints: endpoints.length,
        total_functions: functions.length,
        orphaned_count: orphanedEndpoints.length + orphanedFunctions.length,
        confidence_threshold: this.confidenceThreshold,
        analysis_mode: mode
      }
    };
  }

  private async scanDirectory(dirPath: string, endpoints: CodeEndpoint[], functions: CodeFunction[]): Promise<void> {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
        await this.scanDirectory(fullPath, endpoints, functions);
      } else if (entry.isFile() && this.shouldProcessFile(entry.name)) {
        try {
          const content = await fs.promises.readFile(fullPath, 'utf8');
          this.analyzeFile(fullPath, content, endpoints, functions);
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }
    }
  }

  private analyzeFile(filePath: string, content: string, endpoints: CodeEndpoint[], functions: CodeFunction[]): void {
    const language = this.detectLanguage(filePath);
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNumber = index + 1;

      // Extract endpoints
      const endpoint = this.extractEndpoint(line, lineNumber, filePath, language);
      if (endpoint) {
        endpoints.push(endpoint);
      }

      // Extract functions
      const func = this.extractFunction(line, lineNumber, filePath, language, content);
      if (func) {
        functions.push(func);
      }
    });
  }

  private extractEndpoint(line: string, lineNumber: number, filePath: string, language: string): CodeEndpoint | null {
    const trimmed = line.trim();

    // Express.js patterns
    const expressPattern = /(?:app|router)\.(get|post|put|delete|patch|options|head|all)\s*\(\s*['"`]([^'"`]+)['"`]\s*,\s*([^)]+)\)/i;
    let match = trimmed.match(expressPattern);
    if (match) {
      return {
        type: 'endpoint',
        language,
        file: filePath,
        start_line: lineNumber,
        end_line: lineNumber,
        snippet: trimmed,
        method: match[1].toUpperCase(),
        route: match[2],
        handler_name: match[3].trim().split(',')[0].trim(),
        framework_hint: 'express',
        confidence: 0.95
      };
    }

    // Flask patterns
    const flaskPattern = /@app\.route\s*\(\s*['"`]([^'"`]+)['"`](?:\s*,\s*methods\s*=\s*\[['"`](\w+)['"`]\])?\s*\)/i;
    match = trimmed.match(flaskPattern);
    if (match) {
      return {
        type: 'endpoint',
        language,
        file: filePath,
        start_line: lineNumber,
        end_line: lineNumber,
        snippet: trimmed,
        method: match[2] ? match[2].toUpperCase() : 'GET',
        route: match[1],
        handler_name: null,
        framework_hint: 'flask',
        confidence: 0.9
      };
    }

    // Spring Boot patterns
    const springPattern = /@(Get|Post|Put|Delete|Patch)Mapping\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/i;
    match = trimmed.match(springPattern);
    if (match) {
      return {
        type: 'endpoint',
        language,
        file: filePath,
        start_line: lineNumber,
        end_line: lineNumber,
        snippet: trimmed,
        method: match[1].toUpperCase(),
        route: match[2],
        handler_name: null,
        framework_hint: 'spring',
        confidence: 0.9
      };
    }

    return null;
  }

  private extractFunction(line: string, lineNumber: number, filePath: string, language: string, content: string): CodeFunction | null {
    const trimmed = line.trim();

    // JavaScript/TypeScript function patterns
    if (language === 'javascript' || language === 'typescript') {
      // Function declarations
      let match = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/);
      if (match) {
        return {
          type: 'function',
          language,
          file: filePath,
          start_line: lineNumber,
          end_line: lineNumber,
          snippet: trimmed,
          function_name: match[1],
          is_exported: trimmed.includes('export'),
          references: this.findFunctionReferences(match[1], content),
          confidence: 0.9
        };
      }

      // Arrow functions
      match = trimmed.match(/(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/);
      if (match) {
        return {
          type: 'function',
          language,
          file: filePath,
          start_line: lineNumber,
          end_line: lineNumber,
          snippet: trimmed,
          function_name: match[1],
          is_exported: trimmed.includes('export'),
          references: this.findFunctionReferences(match[1], content),
          confidence: 0.85
        };
      }
    }

    return null;
  }

  private findFunctionReferences(functionName: string, content: string): string[] {
    const references: string[] = [];
    const regex = new RegExp(`\\b${functionName}\\b`, 'g');
    const matches = content.match(regex);
    return matches ? matches.slice(1) : []; // Exclude the declaration itself
  }

  private findOrphanedEndpointsWithDataDog(codeEndpoints: CodeEndpoint[], activeEndpoints: EndpointUsage[]): OrphanedCode[] {
    const orphaned: OrphanedCode[] = [];

    for (const endpoint of codeEndpoints) {
      const normalizedRoute = this.normalizeRoute(endpoint.route);
      const active = activeEndpoints.find(ae =>
        ae.method === endpoint.method &&
        this.normalizeRoute(ae.endpoint) === normalizedRoute
      );

      if (!active) {
        orphaned.push({
          item: endpoint,
          reason: 'No DataDog APM traces found for this endpoint',
          confidence: 0.9
        });
      } else if (active.hitCount === 0) {
        orphaned.push({
          item: endpoint,
          reason: 'Endpoint exists in APM but has zero hits',
          confidence: 0.8,
          last_accessed: active.lastAccessed,
          usage_count: active.hitCount
        });
      }
    }

    return orphaned.filter(o => o.confidence >= this.confidenceThreshold);
  }

  private findOrphanedEndpointsStatic(endpoints: CodeEndpoint[], functions: CodeFunction[]): OrphanedCode[] {
    const orphaned: OrphanedCode[] = [];

    for (const endpoint of endpoints) {
      if (endpoint.handler_name) {
        const handlerFunction = functions.find(f => f.function_name === endpoint.handler_name);

        if (!handlerFunction) {
          orphaned.push({
            item: endpoint,
            reason: 'Handler function not found in codebase',
            confidence: 0.9
          });
        } else if (handlerFunction.references.length === 0) {
          orphaned.push({
            item: endpoint,
            reason: 'Handler function has no references (potentially unused)',
            confidence: 0.7
          });
        }
      }
    }

    return orphaned.filter(o => o.confidence >= this.confidenceThreshold);
  }

  private findOrphanedFunctionsWithLogs(functions: CodeFunction[], activeEndpoints: EndpointUsage[]): OrphanedCode[] {
    // This would require more sophisticated log analysis
    // For now, return empty array - can be enhanced based on specific requirements
    return [];
  }

  private findOrphanedFunctionsStatic(functions: CodeFunction[], endpoints: CodeEndpoint[]): OrphanedCode[] {
    const orphaned: OrphanedCode[] = [];
    const usedFunctions = new Set(endpoints.map(e => e.handler_name).filter(Boolean));

    for (const func of functions) {
      if (!func.is_exported && !usedFunctions.has(func.function_name) && func.references.length <= 1) {
        orphaned.push({
          item: func,
          reason: 'Function is not exported and has minimal references',
          confidence: 0.6
        });
      }
    }

    return orphaned.filter(o => o.confidence >= this.confidenceThreshold);
  }

  private normalizeRoute(route: string): string {
    return route.replace(/\/:\w+/g, '/:param').replace(/\/\*/g, '/*');
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return this.languageMap[ext] || 'unknown';
  }

  private shouldSkipDirectory(dirName: string): boolean {
    return this.excludePaths.has(dirName) || dirName.startsWith('.');
  }

  private shouldProcessFile(fileName: string): boolean {
    const extensions = Object.keys(this.languageMap);
    return extensions.some(ext => fileName.endsWith(ext));
  }
}
