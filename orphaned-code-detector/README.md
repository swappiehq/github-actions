# Orphaned Code Detector

A GitHub Action that analyzes your codebase to identify potentially orphaned endpoints and functions by comparing your code with DataDog APM traces and logs, or by performing static analysis on pull requests.

## Features

- **Full Repository Scan**: Compare your codebase with DataDog APM data to find unused endpoints
- **Pull Request Analysis**: Static analysis to detect orphaned code in PR changes without external dependencies
- **Multi-language Support**: JavaScript, TypeScript, Python, Java, Ruby, PHP, Go, C#, C++, Rust, Kotlin, Scala, Swift
- **Framework Detection**: Express.js, Flask, Spring Boot, Rails, and more
- **Confidence Scoring**: Each detection includes a confidence score to help prioritize findings

## Usage

### Full Scan with DataDog Integration

For comprehensive analysis using DataDog APM data:

```yaml
name: Orphaned Code Detection
on:
  schedule:
    - cron: '0 2 * * 1'  # Weekly on Monday at 2 AM
  workflow_dispatch:

jobs:
  detect-orphaned-code:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Detect Orphaned Code
        uses: swappiehq/github-actions/orphaned-code-detector@main
        with:
          mode: 'full'
          datadog-api-key: ${{ secrets.DATADOG_API_KEY }}
          datadog-app-key: ${{ secrets.DATADOG_APP_KEY }}
          service-name: 'your-service-name'
          time-range: '7d'
          confidence-threshold: '0.8'
          exclude-paths: 'node_modules,dist,build'
```

### Pull Request Analysis (Static)

For PR-based analysis without external dependencies:

```yaml
name: PR Orphaned Code Check
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  check-orphaned-code:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Check for Orphaned Code
        uses: swappiehq/github-actions/orphaned-code-detector@main
        with:
          mode: 'pr'
          confidence-threshold: '0.7'
          exclude-paths: 'node_modules,dist,build,test'
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `mode` | Analysis mode: `full` (with DataDog) or `pr` (static only) | Yes | - |
| `datadog-api-key` | DataDog API key for APM data access | No* | - |
| `datadog-app-key` | DataDog Application key | No* | - |
| `service-name` | Service name in DataDog APM | No* | - |
| `time-range` | Time range for DataDog data (e.g., '7d', '30d') | No | `7d` |
| `confidence-threshold` | Minimum confidence score (0.0-1.0) | No | `0.8` |
| `exclude-paths` | Comma-separated paths to exclude from analysis | No | `node_modules,dist,build` |

*Required when `mode` is `full`

## Outputs

| Output | Description |
|--------|-------------|
| `orphaned-count` | Total number of orphaned code items found |
| `endpoints-count` | Number of orphaned endpoints detected |
| `functions-count` | Number of orphaned functions detected |
| `results-json` | Full analysis results in JSON format |

## How It Works

### Full Mode (DataDog Integration)
1. Scans your repository for HTTP endpoints and functions
2. Fetches APM trace data from DataDog for the specified service
3. Compares code endpoints with actual usage data
4. Identifies endpoints with zero traffic or missing from APM data

### PR Mode (Static Analysis)
1. Analyzes only the files in the pull request
2. Looks for endpoint handlers without corresponding functions
3. Identifies functions with no references or exports
4. Provides confidence scores based on static analysis

## Supported Languages & Frameworks


## Example Output

The action will create a comment on your PR or issue with findings like:

```
## 🔍 Orphaned Code Detection Results

### Summary
- **Total Items Analyzed**: 45 endpoints, 123 functions  
- **Potentially Orphaned**: 3 items found
- **Confidence Threshold**: 0.8

### 🚨 Orphaned Endpoints
- `GET /api/legacy/users` in `src/routes/users.js:15`
  - **Reason**: No DataDog APM traces found
  - **Confidence**: 0.9

### ⚠️ Orphaned Functions  
- `processLegacyData()` in `src/utils/legacy.js:42`
  - **Reason**: Function has no references
  - **Confidence**: 0.8
```

## DataDog Setup

To use the full scanning mode, you'll need:

1. **DataDog Account** with APM enabled
2. **API Keys**:
   - API Key: Get from DataDog Organization Settings
   - Application Key: Generate from DataDog Personal Settings
3. **Service Configuration**: Ensure your service is properly tagged in DataDog

Store these as GitHub secrets:
- `DATADOG_API_KEY`
- `DATADOG_APP_KEY`

## Configuration Examples

### Basic Setup
```yaml
- uses: your-org/find-orphaned-code@v1
  with:
    mode: 'pr'
```

### Advanced Configuration
```yaml
- uses: your-org/find-orphaned-code@v1
  with:
    mode: 'full'
    datadog-api-key: ${{ secrets.DATADOG_API_KEY }}
    datadog-app-key: ${{ secrets.DATADOG_APP_KEY }}
    service-name: 'my-api-service'
    time-range: '14d'
    confidence-threshold: '0.7'
    exclude-paths: 'node_modules,dist,test,__tests__,spec'
```

## Troubleshooting

### Common Issues

1. **DataDog Connection Failed**
   - Verify API keys are correct
   - Check service name matches DataDog configuration
   - Ensure DataDog APM is enabled for your service

2. **High False Positives**
   - Lower the confidence threshold
   - Add test/build directories to exclude paths
   - Review framework detection patterns

3. **Missing Endpoints**
   - Check if your framework is supported
   - Verify endpoint patterns match expected formats
   - Review language detection logic

## Development

```bash
npm install
npm run build
npm test
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality  
4. Submit a pull request

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support

- 📝 [Issues](https://github.com/your-org/find-orphaned-code/issues)
- 💬 [Discussions](https://github.com/your-org/find-orphaned-code/discussions)
- 📧 Email: support@your-org.com
