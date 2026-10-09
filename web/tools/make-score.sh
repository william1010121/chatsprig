#!/bin/sh
# Mux the CC0 soundtrack onto the silent render.
# usage: tools/make-score.sh media/chatsprig-demo-silent.mp4 media/chatsprig-demo.mp4
# Music: Komiku — "Chill Out Theme" (CC0), https://commons.wikimedia.org/wiki/File:Komiku_-_02_-_Chill_Out_Theme.ogg
set -e
IN=$1; OUT=$2
MUSIC="$(dirname "$0")/../media/music/komiku-chill-out-theme.ogg"
D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$IN")
ffmpeg -loglevel error -y -i "$IN" -i "$MUSIC" -filter_complex \
  "[1:a]atrim=0:$D,asetpts=N/SR/TB,afade=t=in:d=1.5,afade=t=out:st=$(python3 -c "print($D-4.5)"):d=4.5,loudnorm=I=-20:TP=-2:LRA=7[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "$OUT"
