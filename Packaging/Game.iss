[Setup]
AppId={{D4698FB1-8AE4-4598-94BC-F3EC494B6D90}
AppName=Gwent Classic for Windows
AppVersion=1.0.0
AppPublisher=CozyPufna33
AppPublisherURL=https://github.com/CozyPufna33/gwent-classic-windows
DefaultDirName={localappdata}\Programs\Gwent Classic
DefaultGroupName=Gwent Classic
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\Gwent.exe
SetupIconFile=..\Native\Gwent.ico
OutputBaseFilename=Gwent-Classic-1.0.0-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked

[Files]
Source: "{#Payload}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\Gwent Classic"; Filename: "{app}\Gwent.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\Gwent Classic"; Filename: "{app}\Gwent.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\Gwent.exe"; Description: "Launch Gwent Classic"; Flags: nowait postinstall skipifsilent
