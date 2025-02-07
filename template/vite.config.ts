import { defineConfig } from 'vite';
// @ts-ignore
import { vitePluginReactServer } from 'vite-plugin-react-server';

const createRouter = (file: 'props.ts' | 'Page.tsx') => (url: string) => {
  console.log(url)
  if(url.includes('bidoof')){
    return `src/page/bidoof/${file}`;
  }
  if(url === '/index.rsc'){
    return `src/page/${file}`;
  }
  return `src/page/404/${file}`;
}

const config = {
  moduleBase: 'src',
  Page: createRouter('Page.tsx'),
  props: createRouter('props.ts'),
  build: {
    pages: ['/', '/404', '/bidoof']
  },
}

export default defineConfig({
  mode: 'development',
  plugins: [vitePluginReactServer(config)],
});