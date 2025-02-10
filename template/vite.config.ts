import { defineConfig } from 'vite';
// @ts-ignore
import { vitePluginReactServer } from 'vite-plugin-react-server';

const createRouter = (file: 'props.ts' | 'Page.tsx') => (url: string) => {
  switch(url){
    case '/bidoof':
    case '/bidoof/index.rsc':
      return `src/page/bidoof/${file}`;
    case '/404':
    case '/404/index.rsc':
      return `src/page/404/${file}`;
    case '/':
    case '/index.rsc':
      return `src/page/${file}`;
    default:
      throw new Error(`Unknown route: ${url}`);
  }
}
const tap = (fn: (...args: any[]) => any) => {
  return (...args: any[]) => {
    const result = fn(...args)
    console.log(args,'->', result)
    return result
  }
}

const config = {
  moduleBase: 'src',
  Page: tap(createRouter('Page.tsx')),
  props: tap(createRouter('props.ts')),
  build: {
    pages: ['/', '/404', '/bidoof']
  },
}

export default defineConfig({
  plugins: [vitePluginReactServer(config)],
});