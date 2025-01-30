import { defineConfig } from 'vite';
import { reactStreamPlugin } from 'vite-plugin-react-server';

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

export default defineConfig({
  plugins: [reactStreamPlugin({
    moduleBase: 'src',
    Page: createRouter('Page.tsx'),
    props: createRouter('props.ts'),
    build: {
      pages: ['/']
    }
  })],
}); 
