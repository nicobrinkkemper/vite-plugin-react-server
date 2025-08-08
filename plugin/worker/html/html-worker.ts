const env = process.env["NODE_ENV"] !== "development" && process.env["NODE_ENV"] !== "test" ? "production" : "development";

await import(`./html-worker.${env}.js`)