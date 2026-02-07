import React from "react";

function TestPage() {
  return (
    <div>
      <h1>Simple Test Page</h1>
      <p>Hello from the test page component!</p>
    </div>
  );
}

// Export as default and as Page
export default TestPage;
export { TestPage as Page };