await (
    process.env['NODE_ENV'] === 'production' 
      ? import('./html-worker.production.js') 
      : import('./html-worker.development.js')
  );