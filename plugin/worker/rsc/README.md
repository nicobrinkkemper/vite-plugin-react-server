# RSC Worker

The RSC worker is used by the client plugin to handle React Server Components when the main thread is running without the `react-server` condition. It provides the server-condition capabilities that the client plugin needs but can't access directly.

## Purpose

The RSC worker serves several key functions:

1. **Server Condition Access**: Enables RSC processing in a client-focused environment
2. **Message-Based Communication**: Handles RSC streaming through a message passing interface

## Implementation Details

The worker comes in two variants:

- `rsc-worker.development.ts`: Full implementation with detailed logging and error handling
- `rsc-worker.production.ts`: Optimized implementation for production builds

## Extending the Worker

Users can create their own RSC workers for application-level use. This allows for:

1. Custom RSC processing logic
2. Application-specific message handling
3. Specialized worker architectures

Example of creating a custom RSC worker:

```typescript
import { messageHandler } from 'vite-plugin-react-server/worker/rsc/messageHandler'
import type { RscWorkerMessage } from 'vite-plugin-react-server/worker/types'

// Create your custom message handler
const customMessageHandler = async (msg: RscWorkerMessage) => {
  // Add your custom logic here
  return messageHandler(msg)
}

// Initialize your worker
if (typeof WorkerGlobalScope !== 'undefined') {
  parentPort.on('message', customMessageHandler)
}
```

## Future Possibilities

The RSC worker architecture is designed to be extensible. Future enhancements could include:

- Custom streaming strategies
- Advanced caching mechanisms
- Specialized RSC processing pipelines
- Integration with other build tools

## Notes

- The worker must be initialized with appropriate Node conditions
- Message handling must account for streaming data
- Consider memory usage when processing large RSC payloads 