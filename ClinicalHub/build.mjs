import {build} from 'esbuild';
await build({entryPoints:['worker.mjs'],outfile:'dist/worker.js',bundle:true,format:'esm',platform:'node',target:'es2022',external:['node:*','cloudflare:*'],loader:{'.html':'text','.css':'text'},minify:true,legalComments:'none'});
