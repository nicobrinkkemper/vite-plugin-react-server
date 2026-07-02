"use client";
// One-line client entry: startClient assembles the router + RouterProvider +
// hydration + HMR. `patterns` lets useParams() resolve for the current url.
import { startClient } from "vite-plugin-react-server/router/client";

startClient({ patterns: ["/", "/greet/$name"] });
