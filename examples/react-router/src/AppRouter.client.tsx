"use client";
import React from "react";
import {
  BrowserRouter,
  Link,
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useParams,
} from "react-router";

export type User = { id: string; name: string; bio: string };

const Layout = () => (
  <>
    <nav>
      <Link to="/">Home</Link> · <Link to="/about">About</Link> ·{" "}
      <Link to="/users/ada">Ada</Link> · <Link to="/users/grace">Grace</Link>
    </nav>
    <Outlet />
  </>
);

const Home = () => (
  <section>
    <h2>Home</h2>
    <p>
      Navigation on this page is React Router, running inside a client
      boundary. The document around it (header, head, this HTML) is
      prerendered RSC.
    </p>
  </section>
);

const About = () => (
  <section>
    <h2>About</h2>
    <p>
      The server passed its props into the client boundary once; every
      client-side navigation reads from them without a network round-trip.
    </p>
  </section>
);

const UserView = ({ users }: { users: User[] }) => {
  const { id } = useParams();
  const user = users.find((u) => u.id === id);
  if (!user) return <p role="alert">No user &quot;{id}&quot;</p>;
  return (
    <section>
      <h2 data-testid="user-name">{user.name}</h2>
      <p>{user.bio}</p>
    </section>
  );
};

const AppRoutes = ({ users }: { users: User[] }) => (
  <Routes>
    <Route path="/" element={<Layout />}>
      <Route index element={<Home />} />
      <Route path="about" element={<About />} />
      <Route path="users/:id" element={<UserView users={users} />} />
    </Route>
  </Routes>
);

export const AppRouter = ({ path, users }: { path: string; users: User[] }) =>
  // The browser router reads the real location; the prerender pass has no
  // window, so it renders the same routes from the server-provided path.
  typeof document === "undefined" ? (
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes users={users} />
    </MemoryRouter>
  ) : (
    <BrowserRouter>
      <AppRoutes users={users} />
    </BrowserRouter>
  );
