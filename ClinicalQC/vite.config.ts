import {defineConfig} from 'vite';
import vinext from 'vinext';
import {cloudflare} from '@cloudflare/vite-plugin';
process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= 'false';
process.env.WRANGLER_SEND_METRICS ??= 'false';
export default defineConfig({
  server:{host:'0.0.0.0',allowedHosts:['terminal.local']},
  plugins:[vinext(),cloudflare({viteEnvironment:{name:'rsc',childEnvironments:['ssr']},inspectorPort:false})],
});
