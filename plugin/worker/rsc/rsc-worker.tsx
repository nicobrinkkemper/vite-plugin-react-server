const env = process.env["NODE_ENV"] !== "development" && process.env["NODE_ENV"] !== "test" ? "production" : "development";

await import(`./rsc-worker.${env}.js`)
