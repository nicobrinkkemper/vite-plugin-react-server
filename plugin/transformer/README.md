# Vite React Client Transform plugin

When consuming such a client file, you need to call vite with the react-server condition.

```json
{ 
    "scripts":{
        "build": "NODE_OPTIONS='--conditions react-server' vite build",
        "dev": "NODE_OPTIONS='--conditions react-server' vite",
    }
}
```

## Key Concepts

1. **Environment Separation**
   - The main thread runs with Vite's `react-server` condition
   - HTML rendering must happen in a clean Node environment (worker thread)
   - Worker needs `NODE_OPTIONS=''` to avoid inheriting Vite's conditions

2. **RSC Stream Flow**
   ```
   Main Thread (Vite)     Worker Thread (Clean Node)            Vite Dev Thread (Browser)
   ---------------        ---------------------                 ---------------------
   RSC Stream     →       HTML Rendering                        React Client
   (react-server) →       (react-dom/server.node)               (react-dom/client)
                  →       (react-server-dom-esm/client.node)    (react-server-dom-esm/client.browser)
   ```

3. **Request Handling**
   - Skip Vite's internal requests (`/@vite/client`, etc.)
   - Handle HTML and directory requests
   - Pass through static files

4. **Module Resolution**
   - Client components need proper import maps
   - Use Vite's module resolution for dependencies
   - Bootstrap modules must be properly resolved

5. **Common Pitfalls**
   - Don't try to use `react-dom/server.node` in the main thread
   - Don't mix React server/client conditions in the same environment
   - Be careful with stream handling between threads
   - Watch for proper module resolution in both environments