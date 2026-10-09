import { build } from 'esbuild';
await build({ entryPoints:['app/src/main/assets/web/app.js'],bundle:true,format:'iife',target:['chrome70'],outfile:'app/src/main/assets/web/app.bundle.js',charset:'utf8',minify:true,legalComments:'none' });
console.log('Android WebView assets built (Chrome 70+).');
