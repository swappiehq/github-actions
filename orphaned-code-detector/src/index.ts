import * as core from '@actions/core';
import * as github from '@actions/github';
import {OrphanedCodeDetector, AnalysisResult, isCodeEndpoint} from './analyzer';
import { DataDogClient } from './datadog';
import * as path from 'path';
import * as fs from 'fs';

async function run(): Promise<void> {
  try {
    // Get inputs from the action
    const mode = core.getInput('mode') as 'full' | 'pr';
    const workspacePath = core.getInput('workspace-path') || process.env.GITHUB_WORKSPACE || process.cwd();
    const excludePaths = core.getInput('exclude-paths').split(',').map(p => p.trim()).filter(Boolean);
    const outputFile = core.getInput('output-file');
    const confidenceThreshold = parseFloat(core.getInput('confidence-threshold')) || 0.8;

    // DataDog configuration for full mode
    const dataDogApiKey = core.getInput('datadog-api-key');
    const dataDogAppKey = core.getInput('datadog-app-key');
    const dataDogSite = core.getInput('datadog-site') || 'datadoghq.com';
    const serviceName = core.getInput('service-name');
    const timeRange = core.getInput('time-range') || '7d';

    core.info(`Starting orphaned code detection in ${mode} mode`);
    core.info(`Analyzing workspace: ${workspacePath}`);
    core.info(`Confidence threshold: ${confidenceThreshold}`);

    // Initialize analyzer
    const detector = new OrphanedCodeDetector(excludePaths, confidenceThreshold);
    let dataDogClient: DataDogClient | undefined;

    // Setup DataDog client for full mode
    if (mode === 'full') {
      if (!dataDogApiKey || !dataDogAppKey || !serviceName) {
        throw new Error('DataDog API key, application key, and service name are required for full mode');
      }

      dataDogClient = new DataDogClient({
        apiKey: dataDogApiKey,
        appKey: dataDogAppKey,
        site: dataDogSite
      });

      core.info(`DataDog integration enabled for service: ${serviceName}`);
      core.info(`Time range: ${timeRange}`);
    }

    // Run analysis
    const result: AnalysisResult = await detector.analyzeRepository(
      workspacePath,
      mode,
      dataDogClient,
      serviceName,
      timeRange
    );

    // Log results
    core.info(`Analysis complete:`);
    core.info(`- Total endpoints found: ${result.summary.total_endpoints}`);
    core.info(`- Total functions found: ${result.summary.total_functions}`);
    core.info(`- Orphaned endpoints: ${result.orphaned_endpoints.length}`);
    core.info(`- Orphaned functions: ${result.orphaned_functions.length}`);
    core.info(`- Total orphaned items: ${result.summary.orphaned_count}`);

    if (mode === 'full') {
      core.info(`- Active endpoints in DataDog: ${result.active_endpoints.length}`);
    }

    // Set outputs
    core.setOutput('orphaned-endpoints', JSON.stringify(result.orphaned_endpoints));
    core.setOutput('orphaned-functions', JSON.stringify(result.orphaned_functions));
    core.setOutput('orphaned-count', result.summary.orphaned_count.toString());
    core.setOutput('active-endpoints', result.active_endpoints.length.toString());
    core.setOutput('analysis-summary', JSON.stringify(result.summary));

    // Save to file if requested
    if (outputFile) {
      const outputPath = path.resolve(outputFile);
      await fs.promises.writeFile(outputPath, JSON.stringify(result, null, 2));
      core.info(`Detailed results saved to: ${outputPath}`);
    }

    // Create GitHub Actions summary
    await createActionsSummary(result);

    // Check if we should fail the action based on findings
    if (result.summary.orphaned_count > 0) {
      const highConfidenceOrphans = [
        ...result.orphaned_endpoints,
        ...result.orphaned_functions
      ].filter(item => item.confidence >= 0.9);

      if (highConfidenceOrphans.length > 0) {
        core.warning(`Found ${highConfidenceOrphans.length} high-confidence orphaned code items`);

        // Create annotations for high-confidence orphans
        for (const orphan of highConfidenceOrphans.slice(0, 10)) { // Limit to 10 annotations
          const file = path.relative(workspacePath, orphan.item.file);
          core.warning(orphan.reason, {
            file,
            startLine: orphan.item.start_line,
            endLine: orphan.item.end_line,
            title: `Potentially orphaned ${orphan.item.type}`
          });
        }
      }
    }

  } catch (error) {
    core.setFailed(`Orphaned code detection failed: ${error}`);
  }
}

async function createActionsSummary(result: AnalysisResult): Promise<void> {
  const summary = core.summary
    .addHeading('🔍 Orphaned Code Detection Results')
    .addTable([
      [{ data: 'Metric', header: true }, { data: 'Count', header: true }],
      ['Total Endpoints', result.summary.total_endpoints.toString()],
      ['Total Functions', result.summary.total_functions.toString()],
      ['Orphaned Endpoints', result.orphaned_endpoints.length.toString()],
      ['Orphaned Functions', result.orphaned_functions.length.toString()],
      ['**Total Orphaned**', `**${result.summary.orphaned_count}**`],
      ...(result.summary.analysis_mode === 'full'
        ? [['Active Endpoints (DataDog)', result.active_endpoints.length.toString()]]
        : []
      )
    ])
    .addRaw(`\n**Analysis Mode:** ${result.summary.analysis_mode === 'full' ? 'Full (with DataDog)' : 'PR Changes Only'}`)
    .addRaw(`**Confidence Threshold:** ${result.summary.confidence_threshold}`);

  // Add orphaned endpoints details
  if (result.orphaned_endpoints.length > 0) {
    summary.addHeading('🚫 Orphaned Endpoints', 3);

    const endpointRows = result.orphaned_endpoints.slice(0, 10).map(item => [
      path.basename(item.item.file),
        isCodeEndpoint(item.item) ? `${item.item.method} ${item.item.route}`: '',
      item.reason,
      (item.confidence * 100).toFixed(0) + '%',
      item.usage_count !== undefined ? item.usage_count.toString() : 'N/A'
    ]);

    summary.addTable([
      [
        { data: 'File', header: true },
        { data: 'Endpoint', header: true },
        { data: 'Reason', header: true },
        { data: 'Confidence', header: true },
        { data: 'Usage', header: true }
      ],
      ...endpointRows
    ]);

    if (result.orphaned_endpoints.length > 10) {
      summary.addRaw(`\n*Showing first 10 of ${result.orphaned_endpoints.length} orphaned endpoints*`);
    }
  }

  // Add orphaned functions details
  if (result.orphaned_functions.length > 0) {
    summary.addHeading('🗑️ Orphaned Functions', 3);

    const functionRows = result.orphaned_functions.slice(0, 10).map(item => [
      path.basename(item.item.file),
      'function_name' in item.item ? item.item.function_name : 'Unknown',
      item.reason,
      (item.confidence * 100).toFixed(0) + '%'
    ]);

    summary.addTable([
      [
        { data: 'File', header: true },
        { data: 'Function', header: true },
        { data: 'Reason', header: true },
        { data: 'Confidence', header: true }
      ],
      ...functionRows
    ]);

    if (result.orphaned_functions.length > 10) {
      summary.addRaw(`\n*Showing first 10 of ${result.orphaned_functions.length} orphaned functions*`);
    }
  }

  // Add recommendations
  if (result.summary.orphaned_count > 0) {
    summary.addHeading('💡 Recommendations', 3);
    summary.addList([
      'Review high-confidence orphaned items for potential removal',
      'Consider adding tests or documentation for low-usage endpoints',
      'Use DataDog integration (full mode) for production accuracy',
      'Set up regular orphaned code detection in CI/CD pipeline'
    ]);
  } else {
    summary.addRaw('\n✅ **No orphaned code detected!** Your codebase looks clean.');
  }

  await summary.write();
}

run();
