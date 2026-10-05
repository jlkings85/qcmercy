import {build} from 'esbuild';
await build({entryPoints:['worker.mjs'],outfile:'dist/worker.js',bundle:true,format:'esm',platform:'node',target:'es2022',external:['node:*','cloudflare:*'],loader:{'.html':'text','.css':'text'},minify:true,legalComments:'none'});
for(const name of ['narcs','shifts'])await build({entryPoints:[`clients/${name}.mjs`],outfile:`dist/${name}-sso.js`,bundle:true,format:'esm',platform:'node',target:'es2022',external:['node:*','cloudflare:*'],minify:true,legalComments:'none'});
