#!/bin/sh
# Taninabilir sabitler, `pass` protokolu: -g tam eslesme · -n sozluksel ardil · -s reddedilir.
# awk kullaniliyor, cunku `echo | while read` boru icinde ALT KABUKTA kosuyor ve bayrak
# disari cikmiyordu: ilk yazimda -n hep bos dondu ve walk "No Such Instance" dedi.
B=.1.3.6.1.4.1.8072.9999.9999
LISTE="$B.1.0|integer|1000
$B.2.0|integer|1001
$B.3.0|integer|1002
$B.4.0|string|canli-test-degeri
$B.5.0|gauge|4242
$B.6.0|counter|123456789
$B.7.0|timeticks|360000
$B.10.1.1.1|integer|1
$B.10.1.1.2|integer|2
$B.10.1.1.3|integer|3
$B.10.1.2.1|string|sensor-bir
$B.10.1.2.2|string|sensor-iki
$B.10.1.2.3|string|sensor-uc
$B.10.1.3.1|integer|1000
$B.10.1.3.2|integer|1001
$B.10.1.3.3|integer|1002"

case "$1" in
  -g) printf '%s\n' "$LISTE" | awk -F'|' -v h="$2" '$1==h{print $1; print $2; print $3; exit}' ;;
  -n) printf '%s\n' "$LISTE" | awk -F'|' -v h="$2" '
        function say(o,  n,p,i,s){n=split(substr(o,2),p,"."); s=""; for(i=1;i<=n;i++) s=s sprintf("%010d.",p[i]); return s}
        BEGIN{hk=say(h)}
        say($1) > hk {print $1; print $2; print $3; exit}' ;;
esac
