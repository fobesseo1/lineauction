@echo off
rem 선경매 데이터 공장 설치: 이 파일을 더블클릭하세요. (.env.local 을 같은 폴더에 두면 붙여 넣기를 건너뜁니다)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
pause
