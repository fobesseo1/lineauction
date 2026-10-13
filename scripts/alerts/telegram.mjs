// Minimal Telegram Bot API calls. The token lives only in .env.local (never in lineestate).
const api=(method,body)=>fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
 {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
 .then(r=>r.json()).catch(e=>({ok:false,description:e.message}));

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Telegram allows about one message per second per chat; 429 says how long to wait.
export async function sendMessage(chatId,text){
 for(let attempt=0;attempt<3;attempt++){
  const r=await api('sendMessage',{chat_id:chatId,text,parse_mode:'HTML',link_preview_options:{is_disabled:true}});
  if(r.ok||r.error_code!==429){await sleep(1100);return r;}
  await sleep(((r.parameters?.retry_after??5)+1)*1000);
 }
 return {ok:false,description:'rate limited'};
}

export const getUpdates=offset=>api('getUpdates',{offset,timeout:0,allowed_updates:['message']});
