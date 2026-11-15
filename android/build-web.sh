#!/usr/bin/env bash
# يجهّز واجهة الجرد داخل التطبيق: نفس ملفات الموقع، لكن مكتبات Firebase وقارئ الباركود
# تُضمَّن محلياً بدل تحميلها من gstatic.com و unpkg.com (قد تُحجب في بعض الشبكات).
# يُشغَّل من جذر المستودع داخل GitHub Actions.
set -euo pipefail

W=android/app/src/main/assets/www
rm -rf "$W"
mkdir -p "$W/vendor"

T=$(mktemp -d)
( cd "$T" && npm init -y >/dev/null && npm install --no-audit --no-fund --loglevel=error \
    firebase@10.14.1 @zxing/library@0.21.3 esbuild@0.24.2 )

# Firebase: fbsdk.js نفسه، مع تحويل روابط gstatic إلى حزم npm ثم تجميعه في ملف محلي واحد
sed -E 's#https://www\.gstatic\.com/firebasejs/10\.14\.1/firebase-([a-z]+)\.js#firebase/\1#g' fbsdk.js > "$T/fbsdk.src.js"
if grep -q 'gstatic' "$T/fbsdk.src.js"; then echo "::error::fbsdk.js still imports from gstatic"; exit 1; fi
( cd "$T" && npx esbuild fbsdk.src.js --bundle --format=esm --minify --target=chrome70 --legal-comments=none \
    --outfile=fbsdk.bundle.js --log-level=warning )
cp "$T/fbsdk.bundle.js" "$W/fbsdk.js"

# قارئ الباركود ZXing محلياً
Z=$(node -e "const p=require('$T/node_modules/@zxing/library/package.json');process.stdout.write(typeof p.unpkg==='string'?p.unpkg:'umd/index.min.js')")
cp "$T/node_modules/@zxing/library/$Z" "$W/vendor/zxing.min.js"

cp config.js boot.js "$W/"
sed 's#https://unpkg.com/@zxing/library@0.21.3#vendor/zxing.min.js#' index.html > "$W/index.html"
grep -q "vendor/zxing.min.js" "$W/index.html" || { echo "::error::ZXing URL was not replaced in index.html"; exit 1; }
if grep -n -E "https://(unpkg\.com|www\.gstatic\.com|cdn\.)" "$W/index.html" "$W/boot.js" "$W/config.js"; then
  echo "::error::an external script URL is still referenced"; exit 1
fi

ls -la "$W" "$W/vendor"
