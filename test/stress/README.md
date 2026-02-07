# Memory Leak Stress Test Utility

This utility provides comprehensive stress testing for the memory leak fix in the vite-plugin-react-server. It simulates heavy concurrent load to verify that MessagePort cleanup works correctly under stress.

## Files

- `memory-leak-stress.test.ts` - Vitest-based stress tests
- `stress-test-cli.ts` - Standalone CLI utility for manual testing
- `README.md` - This documentation

## Usage

### Running Vitest Stress Tests

```bash
# Run all stress tests
npm run test:stress

# Run with verbose output
npm run test:stress -- --reporter=verbose
```

### Using the CLI Utility

The CLI utility can be used to stress test a running dev server:

```bash
# Basic usage (tests http://localhost:3000)
npm run stress-test

# Test a specific URL
npm run stress-test -- --url http://localhost:3033

# Heavy load test
npm run stress-test -- --concurrent 100 --sequential 50 --iterations 3

# Verbose output
npm run stress-test -- --verbose --concurrent 20

# Custom timing
npm run stress-test -- --delay-between 5 --delay-after 200
```

### CLI Options

- `--url <url>` - Server URL to test (default: http://localhost:3000)
- `--concurrent <number>` - Number of concurrent requests (default: 10)
- `--sequential <number>` - Number of sequential requests (default: 5)
- `--delay-between <ms>` - Delay between sequential requests in ms (default: 10)
- `--delay-after <ms>` - Delay after test completion in ms (default: 100)
- `--iterations <number>` - Number of test iterations (default: 1)
- `--verbose` - Enable verbose logging
- `--help, -h` - Show help message

## Test Scenarios

The stress test utility covers several scenarios:

1. **Concurrent Requests** - Multiple simultaneous RSC requests
2. **Sequential Requests** - Rapid successive requests
3. **Mixed Load** - Combination of concurrent and sequential requests
4. **Different Paths** - Requests to various routes
5. **Server Restart** - Requests during server state changes

## What It Tests

- **MessagePort Cleanup** - Ensures MessagePorts are properly closed
- **Memory Leak Prevention** - Verifies no `MaxListenersExceededWarning` occurs
- **Race Condition Handling** - Tests cleanup under concurrent load
- **Response Consistency** - Ensures all requests return valid RSC streams
- **Performance** - Measures response times under load

## Expected Results

A successful stress test should show:
- ✅ All requests return 200 status
- ✅ All responses have correct `text/x-component` content type
- ✅ No `MaxListenersExceededWarning` messages
- ✅ Consistent response times
- ✅ No memory leaks or resource accumulation

## Troubleshooting

If stress tests fail:

1. **Check server is running** - Ensure the target server is accessible
2. **Verify RSC endpoint** - Make sure the server responds to RSC requests
3. **Check memory usage** - Monitor for memory leaks during tests
4. **Review logs** - Use `--verbose` flag for detailed output
5. **Reduce load** - Try with fewer concurrent requests first

## Integration with CI/CD

The stress tests can be integrated into CI/CD pipelines:

```bash
# In CI pipeline
npm run test:stress

# Or with specific parameters
npm run stress-test -- --concurrent 50 --iterations 2
```

## Performance Benchmarks

Typical performance expectations:
- **Response time**: < 100ms per request
- **Concurrent load**: 50+ simultaneous requests
- **Memory usage**: Stable (no growth over time)
- **Success rate**: 100% under normal conditions

