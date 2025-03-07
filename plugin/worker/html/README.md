# HTML Worker

The HTML worker handles HTML generation and transformation as part of the server plugin (which runs under the `react-server` condition). Since the main thread is already in the correct condition for RSC, the HTML worker can work directly with RSC streams without needing a separate RSC worker.

The worker receives RSC streams directly from the main thread (which is running under `react-server` condition) and transforms them into HTML. This is different from the client plugin, which needs a separate RSC worker to handle server-condition tasks.

## Extending the Worker

Users can create their own HTML workers for application-level use. This allows for:

1. Custom HTML processing
2. Specialized asset handling
3. Custom build pipelines

Example of creating a custom HTML worker:

```typescript
import { messageHandler } from 'vite-plugin-react-server/worker/html/messageHandler'
import type { HtmlWorkerMessage } from 'vite-plugin-react-server/worker/types'

// Create your custom message handler
const customMessageHandler = async (msg: HtmlWorkerMessage) => {
  // Add your custom logic here
  return messageHandler(msg)
}

// Initialize your worker
if (typeof WorkerGlobalScope !== 'undefined') {
  parentPort.on('message', customMessageHandler)
}
```

## Messages
You have two options, either directly write the files from the worker or pass them back to the main thread through messages.

```ts

```

## Client Dev Mode Integration

When running in client dev mode, you can use your custom HTML worker as part of your application:

1. The worker runs in the client environment
2. It can handle HTML transformations in real-time
3. Provides immediate feedback during development
4. Can be integrated with other development tools

## Future Possibilities

The HTML worker architecture supports various potential enhancements:

- Custom HTML transformation pipelines
- Advanced asset optimization strategies
- Integration with other build tools
- Real-time HTML processing in development

## Notes

- The worker must handle streaming HTML content
- Asset paths need to be properly resolved
- Consider memory usage when processing large HTML files
- Ensure proper coordination with the RSC worker 