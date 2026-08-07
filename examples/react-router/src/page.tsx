import React from "react";
import { AppRouter, type User } from "./AppRouter.client.js";

export const Page = ({
  url,
  renderedAt,
  users,
}: {
  url: string;
  renderedAt: string;
  users: User[];
}) => (
  <main>
    <header>
      <h1>React Router on vite-plugin-react-server</h1>
      <p data-testid="server-stamp">
        Server-rendered at {renderedAt} for {url}
      </p>
    </header>
    <AppRouter path={"/" + url.replace(/^\/+|\/+$/g, "")} users={users} />
  </main>
);
