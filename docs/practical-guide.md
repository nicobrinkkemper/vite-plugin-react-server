# Practical Implementation Guide

For complete examples and production implementations:

1. [bidoof-template](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official) - Playground example with:
   - GitHub Pages deployment workflow
   - API fetching utilities
   - CSS Modules setup
   - Client-side navigation
   - TypeScript configuration

This demo is very simple on purpose. It shows a naive implementation of client-side navigation.
There's nothing that's stopping the user from using ReactRouter or something similar, but this plugin doesn't
assume that you do and neither does this example.

2. [mmcelebration.com](https://github.com/nicobrinkkemper/mmc) - Production implementation with:
   - GitHub Pages deployment workflow
   - Advanced routing patterns
   - Image generation
   - "white-label" front-end using esm modules
   - Type-safe props/page routing

## Plugin Architecture and Naming

The plugin's architecture is based on modern React 19 server architecture, where the terms "client" and "server" refer to the target environment and module system rather than where the code runs. We are able to create three folders using this plugin.

- **Client folder**:

  - Targets ESM (esnext) module system
  - Can run on both modern browser and Node.js
  - Handles client components and ESM bundling
  - Most assets will be hashed except server-only modules.
  - Server function references
    - note: if server entry is `server.ts`, then this simply references `/server.js`

- **Server folder**:

  - Targets Node.js environment
  - All page and prop files
  - Static assets are hashed
  - Client component references
     - note: by default references /../client/manifest-referenced-client-file.js

- **Static folder**
  - Targets static host provider such as github pages
  - A combination between the client and server folder
    where you can imagine all the page and props components
    to be pre-rendered into index.html and index.rsc based
    on your `build.pages` setting

If the data returned from the prop files isn't actually static, then there
isn't much value in the static folder. In such cases, I recommend just not 
providing the build.pages option and work with the server+client folder directly.

If the props are static on a route by route basis, the template examples should offer
enough inspiration. Of course there's no real rule for the props or page files and 
you're free to implement any kind of strategy here.

