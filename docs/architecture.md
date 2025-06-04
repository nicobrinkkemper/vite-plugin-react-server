# Architecture considerations
The benefits and ease of use of Node.js, the React UI library and vite combined. 

## Who is this for?
This plugin offers a way to bundle esmodules that would enable a custom react-server implementation, for example using NextJS or express.

Aside from that, if you keep your props static and with the right client entry point, it enables you to generate a modern static site using a simple routing function that maps requests to source files. This static site
can be uploaded to any host.

## Server first
Vite is not built with React's server paradigm in mind. This plugin bridges the gap between these two workflows.

### Environment Variables
The plugin treats process.env similar to `import.meta.env`

1. **Server-Side Access**: Environment variables are available in server components through `process.env`, making it consistent with Node.js conventions.

2. **Build-Time Resolution**: During the build process, environment variables are resolved and injected into the bundle, ensuring they're available at runtime.

3. **Mode Handling**: The plugin respects both `NODE_ENV` and `VITE_MODE`, with `NODE_ENV` taking precedence to maintain compatibility with Node.js ecosystem tools.

4. **Default Variables**: Several environment variables are automatically set if not provided:
   - `VITE_MODE`: Set based on build mode or `NODE_ENV`
   - `VITE_DEV`: Boolean indicating development mode
   - `VITE_PROD`: Boolean indicating production mode
   - `VITE_SSR`: Boolean indicating server-side rendering
   - `VITE_PUBLIC_ORIGIN`: Base URL for public assets
   - `VITE_BASE_URL`: Base URL for the application

5. **Cleanup**: Environment variables are properly cleaned up after the build process to prevent leakage between builds.

PUBLIC_ORIGIN is introduced for the server to know in order to render favicons and other head tags. Similar to NextJS SITE_URL.

## Made to be removed

The code tries to organize itself into plugins that are purely based on making the thing work. Things like the preserver plugin, is 
a backwards way to support the use client and use server directives, but, we simply don't care and want to preserve the use client and use server so that our transformer is able to read them.

### HTML Component Support
The plugin treats HTML files as first-class React components, allowing you to use them directly in your React application. This is achieved through:

1. **Development Mode**:
   - Uses Vite's built-in `index.html` for development
   - Leverages Vite's dev server and HMR
   - HTML requests are handled through Vite's middleware
   - No need for custom HTML component during development
   - Headless streams still support link, meta and title changes, just without the head!

2. **Production Mode**:
   - Uses custom `Html` component for static generation
   - Generates proper HTML structure with head and body using React server components
   - Handles CSS collection and injection
   - Creates static HTML files for each route
   - Headless stream is saved to file index.rsc
   - Full Html document to index.html

3. **Stream Types**:
   - **Headless Stream (React.Fragment)**:
     - Used for client-side navigation between pages
     - Saved as `index.rsc` files
     - More efficient as it only updates necessary parts of the DOM
     - Still contains CSS/head information that can bubble up to the head
     - Used in development mode for RSC streaming
   - **Non-Headless Stream (config's Html Component)**:
     - Used for initial page loads
     - Generates complete HTML documents with proper structure
     - Includes `<html>`, `<head>`, and `<body>` tags
     - Creates static HTML files for each route
     - Used in production mode for static generation

4. **MIME Type System**:
   - HTML files are served with `text/html` MIME type
   - RSC (React Server Component) files use `text/x-component` MIME type
   - The system properly handles content types for different file extensions
   - Requests are routed based on MIME types and file extensions
   - Directory requests default to HTML content type

5. **Auto-Discovery System**:
   - Automatically detects and processes HTML files as React components
   - Handles various file patterns (`.html`, `.jsx`, `.tsx`, etc.)
   - Supports CSS modules and other asset types

6. **Module Resolution**:
   - Maintains consistent module IDs across client and server
   - Handles path normalization for different environments
   - Supports both relative and absolute imports

7. **Build Configuration**:
   - Flexible build options for different environments
   - Support for static and server-side rendering
   - Customizable output paths and file naming

The plugins are executed in a specific order to ensure proper transformation and handling of React Server Components. Here's the complete plugin pipeline:

1. **Environment Plugin**
   - Sets up process.env variables from .env files and define config
   - Manages cleanup of environment variables after build
   - Handles mode detection and NODE_ENV compatibility early (on load)

2. **Client/Server Plugin**
   - Preview Server: Configures preview server for static builds
   - Client:
     - Sets up client entry points and boundaries
     - Configures client-specific build options
     - Pipes rsc-worker's React response to dev x-component/index.rsc requests (since no react-server)
   - Server:
     - Sets up server entry points and boundaries
     - Configures server-specific build options
     - Pipes react response to dev x-component/index.rsc requests (already react-server)

3. **Transformer Plugin**
   - Client Transformer:
     - Detects and transforms "use client" directives into client references
     - Maintains module IDs for RSC boundaries using a static manifest
     - Handles server action transformations for client components
     - Processes CSS modules for client components
     - Key transformations:
       - Converts client components into RSC-compatible references
       - Preserves class/function behavior while adding client metadata
       - Ensures proper module resolution in both development and production
   - Server Transformer:
     - Detects and transforms "use server" directives
     - Transforms server components for RSC compatibility
     - Handles RSC boundary transformations
     - Processes CSS modules for server components
     - Key transformations:
       - Converts server components into RSC-compatible format
       - Maintains module IDs for proper RSC streaming
       - Ensures proper server action handling
   - Common Features:
     - Both transformers run in "pre" enforcement to handle transformations before Vite's default transforms
     - Use a static manifest to maintain module IDs across builds
     - Support both development and production builds
     - Handle CSS module transformations consistently
     - Ensure proper RSC boundary handling

4. **Static Plugin**
   - HTML Worker: Handles HTML content generation
   - File Writer: Manages file output for static builds
   - Page Renderer: Exports headless & full html pages, emits events
   - Stream Handler: Manages RSC to HTML stream conversion

5. **Preserver Plugin**
   - Preserves "use client" and "use server" directives in build output
   - Handles file preservation for client/server boundaries
   - Ensures directives are available for the transformer

This modular approach allows for easy maintenance and potential future improvements without affecting the entire system. Each plugin and sub-plugin
can be replaced or modified independently, making it easier to adapt to new requirements or fix issues without touching the entire codebase.

The transformation pipeline ensures that:
1. Environment variables are available early in the process
2. Client and server boundaries are properly set up
3. Components are transformed correctly for their target environment
4. Static generation (if enabled) happens after all transformations
5. Directives are preserved throughout the build process up untill the react transformer

It also gives you the ability to override all the above behavior by either composing
your plugins or developing a entirely new rsc-worker for your application that can then be used during your development process - which gives you full control over the node.js environment including it's loaders, etc.