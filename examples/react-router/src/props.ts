export const props = (url: string) => ({
  url,
  renderedAt: new Date().toISOString(),
  users: [
    { id: "ada", name: "Ada Lovelace", bio: "Wrote the first algorithm." },
    { id: "grace", name: "Grace Hopper", bio: "Coined the term debugging." },
    { id: "hedy", name: "Hedy Lamarr", bio: "Invented frequency hopping." },
  ],
});
