// Сборка: склеивает src/app.html и три скрипта в один самодостаточный файл.
const fs = require('fs'), path = require('path');
const r = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');
const scripts = ['scoring.js', 'data.js', 'app.js'].map(f => '<script>\n' + r(f) + '\n</script>').join('\n');
const fragment = r('app.html').replace('<!--SCRIPTS-->', scripts);
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'),
  '<!doctype html>\n<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' + fragment + '\n</html>\n');
fs.writeFileSync(path.join(__dirname, 'dist', 'artifact.html'), fragment);
console.log('ok');
