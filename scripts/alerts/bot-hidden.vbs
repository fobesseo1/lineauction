' Polls Telegram bot commands (/start, /stop) without a console window (Task Scheduler, every minute).
Option Explicit
Dim shell, fso
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
shell.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
shell.Run "cmd /c node scripts\alerts\bot.mjs >> data\alerts\bot.log 2>&1", 0, True
