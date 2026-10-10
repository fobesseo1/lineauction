' Starts the daily runner without a console window.
' Usage: wscript.exe run-hidden.vbs <onbid|court> <schedule|manual>
Option Explicit
Dim shell, fso, project, job, trigger
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
If WScript.Arguments.Count < 2 Then WScript.Quit 1
job = WScript.Arguments(0)
trigger = WScript.Arguments(1)
If job <> "onbid" And job <> "court" Then WScript.Quit 1
If trigger <> "schedule" And trigger <> "manual" Then WScript.Quit 1
project = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
shell.CurrentDirectory = project
shell.Run "cmd /c node scripts\daily\run.mjs --job=" & job & " --trigger=" & trigger & " >> data\daily\" & job & ".log 2>&1", 0, False
