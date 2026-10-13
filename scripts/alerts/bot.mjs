// Telegram bot commands, polled every minute by Task Scheduler (\LineAuction\Telegram Bot).
//   /start CODE  links the chat to the member who made the 8-character code on /me/notifications
//   /stop        unlinks this chat
// Uses getUpdates (no webhook), so the bot token never leaves this machine.
import {mkdir,readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {writeJson} from '../onbid/atomic.mjs';
import {singleRun} from '../single-run.mjs';
import {SITE} from './core.mjs';
import {getUpdates,sendMessage} from './telegram.mjs';
process.loadEnvFile('.env.local');

const root='data/alerts/bot';await mkdir(root,{recursive:true});
if(!await singleRun(root,'scripts/alerts/bot.mjs'))process.exit(0);
const offsetPath=`${root}/offset.json`;
let offset=0;try{offset=JSON.parse(await readFile(offsetPath,'utf8')).offset;}catch(e){if(e.code!=='ENOENT')throw e;}
const app=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}}).schema('app');

export const parseCommand=text=>{
 const m=String(text??'').trim().match(/^\/(start|stop|help)(?:@\w+)?(?:\s+(\S+))?/i);
 return m?{command:m[1].toLowerCase(),arg:m[2]??null}:null;
};

async function link(chat,username,code){
 const now=new Date().toISOString();
 const {data:row,error}=await app.from('notification_channels').select('user_id').eq('link_code',code.toUpperCase()).gt('link_code_expires_at',now).maybeSingle();
 if(error)throw Error(error.message);
 if(!row)return '코드가 틀렸거나 만료됐습니다. 선자산 사이트의 알림 설정에서 새 코드를 받아 주세요.';
 // One chat belongs to one member: a chat linked elsewhere moves to this member.
 const moved=await app.from('notification_channels').update({telegram_chat_id:null,telegram_username:null,telegram_linked_at:null}).eq('telegram_chat_id',chat).neq('user_id',row.user_id);
 if(moved.error)throw Error(moved.error.message);
 const r=await app.from('notification_channels').update({telegram_chat_id:chat,telegram_username:username,telegram_linked_at:now,link_code:null,link_code_expires_at:null})
  .eq('user_id',row.user_id).eq('link_code',code.toUpperCase()).select('user_id');
 if(r.error)throw Error(r.error.message);
 return r.data.length?'연결됐습니다. 저장한 조건에 맞는 새 물건과 관심 물건 변동을 여기로 알려드립니다.\n알림을 끄려면 /stop 을 보내세요.':'코드가 틀렸거나 만료됐습니다. 새 코드를 받아 주세요.';
}

async function unlink(chat){
 const r=await app.from('notification_channels').update({telegram_chat_id:null,telegram_username:null,telegram_linked_at:null}).eq('telegram_chat_id',chat).select('user_id');
 if(r.error)throw Error(r.error.message);
 return r.data.length?'알림 연결을 해제했습니다. 다시 받으려면 사이트에서 새 코드를 받아 주세요.':'연결된 계정이 없습니다.';
}

const HELP=`선자산 알림 봇입니다.\n사이트 알림 설정(${SITE}/me/notifications)에서 코드를 받아 /start 코드 를 보내면 연결됩니다.\n/stop 알림 해제`;

const res=await getUpdates(offset);
if(!res.ok){console.error(res.description);process.exit(1);}
let handled=0;
for(const u of res.result){
 offset=u.update_id+1;
 const msg=u.message;if(!msg?.chat||msg.chat.type!=='private')continue;
 const cmd=parseCommand(msg.text);
 let reply=HELP;
 try{
  if(cmd?.command==='start'&&cmd.arg)reply=await link(msg.chat.id,msg.from?.username??null,cmd.arg);
  else if(cmd?.command==='stop')reply=await unlink(msg.chat.id);
 }catch(e){console.error(e.message);reply='잠시 후 다시 시도해 주세요.';}
 await sendMessage(msg.chat.id,reply);handled++;
 await writeJson(offsetPath,{offset});
}
if(handled)console.log(JSON.stringify({handled,offset}));
