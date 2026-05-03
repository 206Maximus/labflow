Dim ws, sc, batPath
Set ws = CreateObject("WScript.Shell")
batPath = ws.CurrentDirectory & "\LabFlow 시작.bat"
Set sc = ws.CreateShortcut(ws.SpecialFolders("Desktop") & "\LabFlow.lnk")
sc.TargetPath = batPath
sc.WorkingDirectory = ws.CurrentDirectory
sc.IconLocation = "C:\Windows\System32\shell32.dll,22"
sc.Description = "LabFlow"
sc.Save
WScript.Echo "LabFlow shortcut created on Desktop!"
