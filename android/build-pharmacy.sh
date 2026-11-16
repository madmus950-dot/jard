#!/usr/bin/env bash
# يجهّز واجهة «حسابات الصيدلية» داخل التطبيق: ملفات pharmacy/ + Firebase وZXing والخطوط محلياً.
# يُشغَّل من جذر المستودع داخل GitHub Actions.
set -euo pipefail

W=android/app/src/pharmacy/assets/www
rm -rf "$W"
mkdir -p "$W/vendor" "$W/fonts"

T=$(mktemp -d)
( cd "$T" && npm init -y >/dev/null && npm install --no-audit --no-fund --loglevel=error \
    firebase@10.14.1 @zxing/library@0.21.3 esbuild@0.24.2 @fontsource/ibm-plex-sans-arabic@5 @fontsource/noto-naskh-arabic@5 )

# ملفات التطبيق (بلا الاختبارات وبلا الخادم الوهمي)
for f in pharmacy/*.js pharmacy/*.css pharmacy/index.html pharmacy/*.jpg; do
  case "$f" in pharmacy/mock.js) continue ;; esac
  cp "$f" "$W/"
done
cp config.js "$W/config.js"

# Firebase مجمّعاً في ملف محلي واحد
sed -E 's#https://www\.gstatic\.com/firebasejs/10\.14\.1/firebase-([a-z]+)\.js#firebase/\1#g' pharmacy/fb.js > "$T/fb.src.js"
if grep -q 'https://www.gstatic.com' "$T/fb.src.js"; then echo "::error::fb.js still imports from gstatic"; exit 1; fi
( cd "$T" && npx esbuild fb.src.js --bundle --format=esm --minify --target=chrome70 --legal-comments=none --outfile=fb.bundle.js --log-level=warning )
cp "$T/fb.bundle.js" "$W/fb.js"

# قارئ الباركود
Z=$(node -e "const p=require('$T/node_modules/@zxing/library/package.json');process.stdout.write(typeof p.unpkg==='string'?p.unpkg:'umd/index.min.js')")
cp "$T/node_modules/@zxing/library/$Z" "$W/vendor/zxing.min.js"

# الخطوط: IBM Plex Sans Arabic (400/500/600) و Noto Naskh Arabic (500/700)، المقاطع العربية واللاتينية فقط
node - "$T" "$W/fonts" <<'JS'
const fs = require('fs'), path = require('path');
const [T, OUT] = process.argv.slice(2);
const want = [['ibm-plex-sans-arabic', [400, 500, 600]], ['noto-naskh-arabic', [500, 700]]];
let css = '';
for (const [pkg, weights] of want) {
  const dir = path.join(T, 'node_modules/@fontsource', pkg);
  for (const w of weights) {
    const src = fs.readFileSync(path.join(dir, w + '.css'), 'utf8');
    for (const block of src.split('@font-face').slice(1)) {
      const body = block.slice(block.indexOf('{'), block.indexOf('}') + 1);
      const m = body.match(/url\(\.\/files\/([^)]+\.woff2)\)/);
      if (!m || !/-(arabic|latin)-\d+-normal\.woff2$/.test(m[1])) continue;
      fs.copyFileSync(path.join(dir, 'files', m[1]), path.join(OUT, m[1]));
      css += '@font-face' + body.replace(/src:[^;]+;/, "src: url(" + m[1] + ") format('woff2');") + '\n';
    }
  }
}
fs.writeFileSync(path.join(OUT, 'fonts.css'), css);
console.log('fonts:', fs.readdirSync(OUT).length - 1, 'files');
JS

if grep -n -E "https://(unpkg\.com|www\.gstatic\.com|cdn\.)" "$W/index.html" "$W/app.js"; then echo "::error::external URL left"; exit 1; fi
ls -la "$W" "$W/vendor" "$W/fonts" | head -60
