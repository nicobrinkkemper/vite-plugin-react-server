"use server";
function getServerSideProps() {
  return {
    props: {
      message: "Hello from server"
    }
  };
}
export {
  getServerSideProps
};
