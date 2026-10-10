' Runs the daily-job watchdog without a console window (Task Scheduler, every 10 minutes).
Option Explicit
Dim shell, fso
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
shell.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
shell.Run "cmd /c node scripts\daily\watch.mjs >> data\daily\watch.log 2>&1", 0, True
