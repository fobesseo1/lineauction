' Starts the complex-detail morning collection without a console window.
Option Explicit
Dim shell, fso
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
shell.CurrentDirectory = fso.GetParentFolderName(fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName)))
shell.Run "cmd /c node scripts\detail\schedule.mjs >> data\detail\schedule.log 2>&1", 0, False
