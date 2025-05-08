# Practical Implementation Guide

For complete examples and production implementations:

1. [bidoof-template](https://github.com/nicobrinkkemper/vite-plugin-react-server-demo-official) - Playground example with:
   - GitHub Pages deployment workflow
   - API fetching utilities
   - CSS Modules setup
   - Client-side navigation
   - Error boundary
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
Server side / client boundary

- **Server folder**:
Server side / server boundary

- **Static folder**
Poratable React package for browsers

If the data returned from a prop file or function isn't actually static, then you need to make sure the endpoints are dynamic too.

If the props are static on a route by route basis, the template examples should offer
enough inspiration. Of course there's no real rule for the props or page files and 
you're free to implement any kind of strategy here.


