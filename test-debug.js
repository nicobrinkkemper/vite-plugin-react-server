import { analyzeModule } from "vite-plugin-react-server/loader";

const nestedSource = `export function outer() {
  function inner() { "use server"; return 1; }
  return inner();
}`;

const classSource = `export class Calculator {
  async add(a, b) { "use server"; return a + b; }
}`;

const config = {
  loader: {
    getDirectiveType: (directive) => directive === "use server" ? "server" : "client"
  },
  verbose: true
};

console.log("=== Testing nested function ===");
const nestedResult = await analyzeModule(nestedSource, config);
console.log("Warnings:", nestedResult.directiveInfo?.warnings);
console.log("Function level:", nestedResult.directiveInfo?.functionLevel);

console.log("\n=== Testing class method ===");
const classResult = await analyzeModule(classSource, config);
console.log("Warnings:", classResult.directiveInfo?.warnings);
console.log("Function level:", classResult.directiveInfo?.functionLevel); 