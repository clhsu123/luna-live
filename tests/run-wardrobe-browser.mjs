import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
const server=spawn(process.execPath,['server/index.mjs'],{env:{PATH:process.env.PATH,NODE_ENV:'production',PORT:'18788',APP_ORIGIN:'http://localhost:18788',APP_PASSWORD:'local-ui-test'},stdio:['ignore','pipe','pipe']});
try {
 await Promise.race([once(server.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(Error('test server startup timeout')),5000).unref())]);
 for(const file of ['tests/wardrobe-browser.mjs','tests/handsfree-browser.mjs','tests/companion-browser.mjs']) {
 const child=spawn(process.execPath,[file],{stdio:'inherit'});
 const [code]=await once(child,'exit');if(code!==0){process.exitCode=code ?? 1;break;}
 }
} finally {server.kill('SIGTERM');}
