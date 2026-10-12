; Allow LAN devices (iPad / phones) to reach the local game server on private networks.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfflineJeopardy"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="OfflineJeopardy" dir=in action=allow program="$INSTDIR\OfflineJeopardy.exe" enable=yes profile=private,domain'
!macroend
!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="OfflineJeopardy"'
!macroend
