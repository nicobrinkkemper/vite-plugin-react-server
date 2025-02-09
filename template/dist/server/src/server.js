"use server";
function getServerSideProps() {
  return {
    props: {
      message: "Hello from server"
    }
  };
}
const getServerSidePropsRef = Object.defineProperties(
  function(...args) {
    return getServerSideProps.apply(null, args);
  },
  {
    $$typeof: { value: Symbol.for("react.server.reference") },
    $$id: { value: "/src/server.js#getServerSideProps" },
    $$filepath: { value: "/home/nico/code/vite-react-stream/template/src/server.tsx" },
    $$async: { value: true }
  }
);
export {
  getServerSidePropsRef as getServerSideProps
};
