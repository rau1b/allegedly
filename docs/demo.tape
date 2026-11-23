# Install GIF for the README. Render from the allegedly/ folder:  vhs docs/demo.tape
# Needs vhs, ttyd, ffmpeg on PATH. Each take spends one small Haiku run (~$0.01).
# Then trim the wait (check when the reply appears; 26.6s in the s13 take):
#   ffmpeg -i raw.gif -filter_complex "[0:v]trim=0:11.5,setpts=PTS-STARTPTS[a];[0:v]trim=11.5:26.6,setpts=(PTS-STARTPTS)/6[b];[0:v]trim=26.6:33,setpts=PTS-STARTPTS[c];[a][b][c]concat=n=3:v=1:a=0,fps=20,split[x][y];[x]palettegen=stats_mode=diff[p];[y][p]paletteuse=dither=none" docs/demo.gif

Output docs/demo.gif
Set Shell "powershell"
Set FontSize 18
Set Width 1200
Set Height 640
Set Padding 20
Set TypingSpeed 40ms
Set Theme "Catppuccin Mocha"

# Setup, not recorded: fresh install state and the planted bug.
Hide
Type "cd ../allegedly-sandbox; claude plugin uninstall allegedly@allegedly | Out-Null; (Get-Content math.js) -replace 'let i = 0;','let i = 1;' | Set-Content math.js; Clear-Host"
Enter
Sleep 6s
Show

Type "claude plugin install allegedly@allegedly"
Enter
Sleep 6s

Type `claude -p "fix the bug in math.js" --model haiku --allowedTools Read Edit "Bash(npm test)"`
Enter
Sleep 35s

Sleep 4s
