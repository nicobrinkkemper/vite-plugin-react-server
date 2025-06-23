# Custom React Loader

This plugin offers a patched "react-server-dom-esm" version to fallback to for "default behavior". 

`loaderPath: "./my-loader.js"`

This loader can be used during the client-side development phase. Let's
create a simple loader that leans more on the "react-server-dom-esm" node loader,
but, we have to make some hooks for it or it won't work.

