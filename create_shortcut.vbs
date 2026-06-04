Option Explicit

Dim fso, ws, scriptDir, launcherPath, shortcutPath, shortcut

Set fso = CreateObject("Scripting.FileSystemObject")
Set ws = CreateObject("WScript.Shell")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
launcherPath = fso.BuildPath(scriptDir, "LabFlow_" & ChrW(&HC2DC) & ChrW(&HC791) & ".bat")
shortcutPath = ws.SpecialFolders("Desktop") & "\LabFlow.lnk"

If Not fso.FileExists(launcherPath) Then
    WScript.Echo "Launcher not found: " & launcherPath
    WScript.Quit 1
End If

Set shortcut = ws.CreateShortcut(shortcutPath)
shortcut.TargetPath = launcherPath
shortcut.WorkingDirectory = scriptDir
shortcut.IconLocation = "C:\Windows\System32\shell32.dll,22"
shortcut.Description = "LabFlow"
shortcut.Save

WScript.Echo "LabFlow shortcut created on Desktop!"
