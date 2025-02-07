"use server"

export function getServerSideProps() {
  return {
    props: {
      message: "Hello from server",
    },
  };
}
