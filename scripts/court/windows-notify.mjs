import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,unlink} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
const execute=promisify(execFile);
export async function sendWindowsNotification(notification){
 if(process.platform!=='win32')throw new Error('Windows 알림은 Windows PC에서만 지원합니다.');
 const folder=resolve('data/court/standalone/notifications');await mkdir(folder,{recursive:true});
 const id=randomUUID(),payloadPath=resolve(folder,`${id}.json`),receiptPath=resolve(folder,`${id}.receipt.json`);
 await writeFile(payloadPath,JSON.stringify({...notification,receiptPath}),'utf8');
 try{
  // Command mode supports default Restricted policy; do not change machine/user policy.
  // Only our static helper is executable text. Notification data travels in a UTF-8 file.
  const script=await readFile(resolve('scripts/court/windows-notify.ps1'),'utf8');
  const command=script.replace(/^param\([^\n]+\)\r?\n/, '$PayloadPath = $env:LINE_AUCTION_NOTIFICATION_PAYLOAD\n');
  await execute('powershell.exe',['-NoProfile','-STA','-WindowStyle','Hidden','-EncodedCommand',Buffer.from(command,'utf16le').toString('base64')],{windowsHide:true,timeout:35000,env:{...process.env,LINE_AUCTION_NOTIFICATION_PAYLOAD:payloadPath}});
  const receipt=JSON.parse(await readFile(receiptPath,'utf8'));
  return {...receipt,title:notification.title};
 }finally{await unlink(payloadPath).catch(()=>{});await unlink(receiptPath).catch(()=>{});}
}
