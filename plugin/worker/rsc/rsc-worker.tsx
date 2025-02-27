await(
  process.env["NODE_ENV"] === "production"
    ? import("./rsc-worker.production.js")
    : import("./rsc-worker.development.js")
);
